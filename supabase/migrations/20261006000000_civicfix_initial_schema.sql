-- ==============================================================================
-- CivicFix - Autonomous Civic Operations Agent
-- Migration: 20261006000000_civicfix_initial_schema.sql
-- Description: Core Database Schema supporting the Autonomous Agentic Loop:
--              OBSERVE -> PLAN -> EXECUTE -> VERIFY -> ESCALATE
-- Target Engine: Supabase PostgreSQL (PostGIS enabled)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. EXTENSIONS & PREREQUISITES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ENUMS & DOMAINS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('citizen', 'operator', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE department_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    -- Aligned with OBSERVE -> PLAN -> EXECUTE -> VERIFY -> ESCALATE lifecycle
    CREATE TYPE complaint_status AS ENUM (
        'submitted',     -- Citizen submitted (OBSERVE)
        'triaged',       -- Agent classified & validated
        'clustered',     -- Grouped into a root-cause cluster
        'in_progress',   -- Action plan executing (EXECUTE)
        'resolved',      -- Remediation completed by dept/contractor
        'verified',      -- Post-resolution inspection passed (VERIFY)
        'rejected',      -- Invalid / Spam / Duplicate
        'reopened',      -- Verification failed, re-queued for replanning
        'escalated'      -- SLA breach or escalation
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE cluster_status AS ENUM (
        'open',          -- Collecting complaints (OBSERVE)
        'planning',      -- Agent generating action plan (PLAN)
        'in_execution',  -- Dispatched to department (EXECUTE)
        'resolved',      -- Work declared done, awaiting verification
        'verified',      -- Verified resolved (VERIFY)
        'escalated'      -- Critical delay or manual intervention needed (ESCALATE)
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM (
        'not_required',
        'pending',
        'pending_review',
        'approved',
        'rejected',
        'changes_requested'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE verification_status AS ENUM (
        'pending',
        'passed',
        'failed',
        'disputed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ------------------------------------------------------------------------------
-- 2. COMMON TRIGGER FUNCTIONS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. TABLES DEFINITIONS
-- ------------------------------------------------------------------------------

-- Table: departments
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_email TEXT NOT NULL,
    priority_level department_priority NOT NULL DEFAULT 'medium',
    sla_hours_default INTEGER NOT NULL DEFAULT 48,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: users (Citizen, Operator, Admin accounts)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT, -- Retained for external auth compatibility; NULL if using Supabase Auth
    role user_role NOT NULL DEFAULT 'citizen',
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    phone_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: complaint_clusters (Agentic Stage: OBSERVE & PLAN)
CREATE TABLE IF NOT EXISTS public.complaint_clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_cause_title TEXT NOT NULL,
    priority_score NUMERIC(5, 2) NOT NULL DEFAULT 1.00 CHECK (priority_score >= 0),
    summary TEXT,
    status cluster_status NOT NULL DEFAULT 'open',
    geographic_centroid GEOGRAPHY(Point, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: complaints (Agentic Stage: OBSERVE)
CREATE TABLE IF NOT EXISTS public.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    photo_url TEXT,
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    -- Spatial location column automatically generated and synced for PostGIS indexing
    location GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    ) STORED,
    address TEXT,
    status complaint_status NOT NULL DEFAULT 'submitted',
    citizen_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    cluster_id UUID REFERENCES public.complaint_clusters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: action_plans (Agentic Stage: PLAN & EXECUTE)
CREATE TABLE IF NOT EXISTS public.action_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES public.complaint_clusters(id) ON DELETE CASCADE,
    steps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    assigned_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    requires_operator_approval BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status approval_status NOT NULL DEFAULT 'not_required',
    approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approval_notes TEXT,
    estimated_cost NUMERIC(10, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: verification_logs (Agentic Stage: VERIFY)
CREATE TABLE IF NOT EXISTS public.verification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    verification_status verification_status NOT NULL DEFAULT 'pending',
    citizen_feedback TEXT,
    photo_evidence_url TEXT,
    ai_vision_confidence NUMERIC(4, 3) CHECK (ai_vision_confidence BETWEEN 0 AND 1),
    ai_notes TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: audit_logs (Complete Provenance: OBSERVE -> ESCALATE)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL, -- 'complaint', 'cluster', 'action_plan', 'verification'
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,      -- e.g. 'CREATED', 'CLUSTERED', 'DISPATCHED', 'VERIFIED', 'ESCALATED'
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE & SPATIAL INDEXES
-- ------------------------------------------------------------------------------

-- Spatial indexes using GiST for fast radius & geospatial clustering queries
CREATE INDEX IF NOT EXISTS idx_complaints_location_gist 
    ON public.complaints USING GIST (location);

CREATE INDEX IF NOT EXISTS idx_complaint_clusters_centroid_gist 
    ON public.complaint_clusters USING GIST (geographic_centroid);

-- Composite B-Tree index on raw latitude/longitude for bounding-box lookups
CREATE INDEX IF NOT EXISTS idx_complaints_lat_long 
    ON public.complaints (latitude, longitude);

-- Status filter indexes for agent polling and dashboard views
CREATE INDEX IF NOT EXISTS idx_complaints_status 
    ON public.complaints (status);

CREATE INDEX IF NOT EXISTS idx_complaints_category 
    ON public.complaints (category);

CREATE INDEX IF NOT EXISTS idx_complaints_cluster_id 
    ON public.complaints (cluster_id) 
    WHERE cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_citizen_id 
    ON public.complaints (citizen_id);

CREATE INDEX IF NOT EXISTS idx_clusters_status 
    ON public.complaint_clusters (status);

CREATE INDEX IF NOT EXISTS idx_clusters_priority 
    ON public.complaint_clusters (priority_score DESC);

CREATE INDEX IF NOT EXISTS idx_action_plans_cluster_id 
    ON public.action_plans (cluster_id);

CREATE INDEX IF NOT EXISTS idx_action_plans_department 
    ON public.action_plans (assigned_department_id);

CREATE INDEX IF NOT EXISTS idx_action_plans_approval_status 
    ON public.action_plans (approval_status);

CREATE INDEX IF NOT EXISTS idx_verification_logs_complaint_id 
    ON public.verification_logs (complaint_id);

CREATE INDEX IF NOT EXISTS idx_verification_logs_status 
    ON public.verification_logs (verification_status);

-- Provenance & Audit indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity 
    ON public.audit_logs (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp 
    ON public.audit_logs (timestamp DESC);

-- ------------------------------------------------------------------------------
-- 5. AUTOMATIC TIMESTAMP TRIGGERS
-- ------------------------------------------------------------------------------
CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_complaints_updated_at
    BEFORE UPDATE ON public.complaints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_complaint_clusters_updated_at
    BEFORE UPDATE ON public.complaint_clusters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_action_plans_updated_at
    BEFORE UPDATE ON public.action_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ------------------------------------------------------------------------------
-- 6. AGENT HELPER FUNCTIONS
-- ------------------------------------------------------------------------------

-- Spatial query helper: Find nearby complaints within radius (meters) for clustering
CREATE OR REPLACE FUNCTION find_nearby_complaints(
    target_lon DOUBLE PRECISION,
    target_lat DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 200.0,
    target_category TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    category TEXT,
    distance_meters DOUBLE PRECISION,
    status complaint_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.title,
        c.category,
        ST_Distance(c.location, ST_SetSRID(ST_MakePoint(target_lon, target_lat), 4326)::geography) AS distance_meters,
        c.status
    FROM public.complaints c
    WHERE ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(target_lon, target_lat), 4326)::geography, radius_meters)
      AND (target_category IS NULL OR c.category = target_category)
      AND c.status IN ('submitted', 'triaged')
    ORDER BY distance_meters ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Centroid calculator: Recalculate and update cluster centroid
CREATE OR REPLACE FUNCTION recalculate_cluster_centroid(p_cluster_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.complaint_clusters
    SET geographic_centroid = (
        SELECT ST_Centroid(ST_Collect(location::geometry))::geography
        FROM public.complaints
        WHERE cluster_id = p_cluster_id
    )
    WHERE id = p_cluster_id;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper security functions
CREATE OR REPLACE FUNCTION is_operator_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role IN ('operator', 'admin')
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ------------------------------
-- RLS: departments
-- ------------------------------
CREATE POLICY "Public and authenticated users can view departments"
    ON public.departments FOR SELECT
    USING (true);

CREATE POLICY "Only admins can manage departments"
    ON public.departments FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ------------------------------
-- RLS: users
-- ------------------------------
CREATE POLICY "Users can view their own profile"
    ON public.users FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR is_operator_or_admin());

CREATE POLICY "Users can update their own profile"
    ON public.users FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE POLICY "Allow user registration profile creation"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

-- ------------------------------
-- RLS: complaints
-- ------------------------------
-- 1. Public read for all citizens & operators
CREATE POLICY "Public read on complaints"
    ON public.complaints FOR SELECT
    USING (true);

-- 2. Authenticated users can insert complaints
CREATE POLICY "Authenticated users can create complaints"
    ON public.complaints FOR INSERT
    TO authenticated
    WITH CHECK (
        citizen_id IS NULL OR citizen_id = auth.uid()
    );

-- 3. Citizens can update only their own complaints before they are in execution
CREATE POLICY "Citizens can update their own pending complaints"
    ON public.complaints FOR UPDATE
    TO authenticated
    USING (
        citizen_id = auth.uid() AND status IN ('submitted', 'triaged')
    )
    WITH CHECK (
        citizen_id = auth.uid() AND status IN ('submitted', 'triaged')
    );

-- 4. Operators and Admins can update any complaint status
CREATE POLICY "Operators and admins have full update access to complaints"
    ON public.complaints FOR UPDATE
    TO authenticated
    USING (is_operator_or_admin())
    WITH CHECK (is_operator_or_admin());

-- ------------------------------
-- RLS: complaint_clusters
-- ------------------------------
CREATE POLICY "Public read on complaint clusters"
    ON public.complaint_clusters FOR SELECT
    USING (true);

CREATE POLICY "Operators and service role can manage clusters"
    ON public.complaint_clusters FOR ALL
    TO authenticated
    USING (is_operator_or_admin())
    WITH CHECK (is_operator_or_admin());

-- ------------------------------
-- RLS: action_plans
-- ------------------------------
CREATE POLICY "Operators and assigned depts can view action plans"
    ON public.action_plans FOR SELECT
    TO authenticated
    USING (
        is_operator_or_admin()
        OR EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND department_id = action_plans.assigned_department_id
        )
    );

CREATE POLICY "Operators and admins can modify action plans"
    ON public.action_plans FOR ALL
    TO authenticated
    USING (is_operator_or_admin())
    WITH CHECK (is_operator_or_admin());

-- ------------------------------
-- RLS: verification_logs
-- ------------------------------
CREATE POLICY "Public read verification logs"
    ON public.verification_logs FOR SELECT
    USING (true);

CREATE POLICY "Citizens can submit verification feedback on their complaint"
    ON public.verification_logs FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.complaints
            WHERE complaints.id = verification_logs.complaint_id
              AND complaints.citizen_id = auth.uid()
        )
        OR is_operator_or_admin()
    );

CREATE POLICY "Operators and admins can update verification logs"
    ON public.verification_logs FOR UPDATE
    TO authenticated
    USING (is_operator_or_admin())
    WITH CHECK (is_operator_or_admin());

-- ------------------------------
-- RLS: audit_logs
-- ------------------------------
CREATE POLICY "Only operators and admins can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (is_operator_or_admin());

CREATE POLICY "Authenticated users and agents can append audit logs"
    ON public.audit_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);
