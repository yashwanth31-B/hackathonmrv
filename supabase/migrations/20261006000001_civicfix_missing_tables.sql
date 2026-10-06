-- ==============================================================================
-- CivicFix - PARTIAL MIGRATION: Missing Tables & ENUM Casing Fix
-- ==============================================================================

-- 1. Ensure user_role ENUM handles both uppercase and lowercase inputs safely
DO $$ BEGIN     CREATE TYPE user_role AS ENUM ('CITIZEN', 'OPERATOR', 'ADMIN', 'citizen', 'operator', 'admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'citizen';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operator';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'CITIZEN';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'OPERATOR';

DO $$ BEGIN     CREATE TYPE department_priority AS ENUM ('low', 'medium', 'high', 'critical'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN     CREATE TYPE complaint_status AS ENUM (         'submitted', 'triaged', 'clustered', 'in_progress',         'resolved', 'verified', 'rejected', 'reopened', 'escalated'     ); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN     CREATE TYPE cluster_status AS ENUM (         'open', 'planning', 'in_execution', 'resolved', 'verified', 'escalated'     ); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN     CREATE TYPE approval_status AS ENUM (         'not_required', 'pending', 'pending_review', 'approved', 'rejected', 'changes_requested'     ); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN     CREATE TYPE verification_status AS ENUM ('pending', 'passed', 'failed', 'disputed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- 3. Departments Table
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    contact_email TEXT NOT NULL,
    priority_level department_priority NOT NULL DEFAULT 'medium',
    sla_hours_default INTEGER NOT NULL DEFAULT 48,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Action Plans Table
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

-- 5. Verification Logs Table
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

-- 6. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_action_plans_cluster_id ON public.action_plans (cluster_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_department ON public.action_plans (assigned_department_id);
CREATE INDEX IF NOT EXISTS idx_action_plans_approval_status ON public.action_plans (approval_status);
CREATE INDEX IF NOT EXISTS idx_verification_logs_complaint_id ON public.verification_logs (complaint_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_status ON public.verification_logs (verification_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs (timestamp DESC);

-- 8. Triggers
DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_action_plans_updated_at ON public.action_plans;
CREATE TRIGGER trg_action_plans_updated_at
    BEFORE UPDATE ON public.action_plans
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. Security Helper with Flexible Case Check
CREATE OR REPLACE FUNCTION is_operator_or_admin()
RETURNS BOOLEAN AS $$ BEGIN     RETURN EXISTS (         SELECT 1 FROM public.users          WHERE id = auth.uid()          AND role::text IN ('operator', 'admin', 'OPERATOR', 'ADMIN')     ); END; $$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 10. Enable RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 11. Policies
DROP POLICY IF EXISTS "Public read departments" ON public.departments;
CREATE POLICY "Public read departments" ON public.departments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin manage departments" ON public.departments;
CREATE POLICY "Admin manage departments" ON public.departments FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role::text IN ('admin', 'ADMIN')));

DROP POLICY IF EXISTS "Operators view action plans" ON public.action_plans;
CREATE POLICY "Operators view action plans" ON public.action_plans FOR SELECT TO authenticated
    USING (is_operator_or_admin() OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND department_id = action_plans.assigned_department_id
    ));

DROP POLICY IF EXISTS "Operators manage action plans" ON public.action_plans;
CREATE POLICY "Operators manage action plans" ON public.action_plans FOR ALL TO authenticated
    USING (is_operator_or_admin()) WITH CHECK (is_operator_or_admin());

DROP POLICY IF EXISTS "Public read verification logs" ON public.verification_logs;
CREATE POLICY "Public read verification logs" ON public.verification_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Citizens submit verification" ON public.verification_logs;
CREATE POLICY "Citizens submit verification" ON public.verification_logs FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.complaints WHERE complaints.id = verification_logs.complaint_id AND complaints.citizen_id = auth.uid()
    ) OR is_operator_or_admin());

DROP POLICY IF EXISTS "Operators view audit logs" ON public.audit_logs;
CREATE POLICY "Operators view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (is_operator_or_admin());

DROP POLICY IF EXISTS "Authenticated append audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated append audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

SELECT 'CivicFix missing tables created successfully! ✅' as result;
