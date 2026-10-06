-- ==============================================================================
-- CivicFix - Seed Data for Local Development & Testing
-- File: supabase/seed.sql
-- ==============================================================================

-- 1. Insert Standard Departments
INSERT INTO public.departments (id, name, contact_email, priority_level, sla_hours_default)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'Roads & Infrastructure', 'roads@civicfix.city.gov', 'high', 24),
    ('22222222-2222-2222-2222-222222222222', 'Sanitation & Solid Waste', 'sanitation@civicfix.city.gov', 'medium', 48),
    ('33333333-3333-3333-3333-333333333333', 'Public Lighting & Electrical', 'lighting@civicfix.city.gov', 'medium', 36),
    ('44444444-4444-4444-4444-444444444444', 'Water Supply & Sewage', 'water@civicfix.city.gov', 'critical', 12)
ON CONFLICT (id) DO NOTHING;

-- 2. Insert Sample Complaint Cluster (Stage: PLAN)
INSERT INTO public.complaint_clusters (
    id, root_cause_title, priority_score, summary, status, geographic_centroid
)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Main Street Water Main Leak Causing Structural Potholes',
    8.75,
    'Cluster of 4 citizen complaints within 45m radius indicating deep water pooling and pavement subsidence.',
    'planning',
    ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography
)
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Sample Complaints (Stage: OBSERVE)
INSERT INTO public.complaints (
    id, title, description, category, photo_url, latitude, longitude, address, status, cluster_id
)
VALUES
    (
        'c1111111-1111-1111-1111-111111111111',
        'Large pothole expanding rapidly after rain',
        'Deep water-filled pothole near junction. Damaging two-wheeler rims.',
        'Pothole',
        'https://storage.civicfix.city/complaints/pothole_main_st_1.jpg',
        12.9716, 77.5946,
        'MG Road Junction, Ward 112',
        'clustered',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ),
    (
        'c2222222-2222-2222-2222-222222222222',
        'Continuous fresh water bubbling from beneath asphalt',
        'Looks like underground pipeline rupture beneath the road.',
        'Water Leak',
        'https://storage.civicfix.city/complaints/leak_main_st_2.jpg',
        12.9718, 77.5948,
        'MG Road, Opposite Metro Station Gate 2',
        'clustered',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Action Plan (Stage: PLAN -> EXECUTE)
INSERT INTO public.action_plans (
    id, cluster_id, steps_json, assigned_department_id, requires_operator_approval, approval_status, estimated_cost
)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '[
        {"order": 1, "action": "Dispatch emergency water pipe repair squad", "department": "Water Supply & Sewage", "sla_hours": 6},
        {"order": 2, "action": "Road surface milling and hot-mix asphalt patching", "department": "Roads & Infrastructure", "sla_hours": 18},
        {"order": 3, "action": "Automated vision drone pass for quality verification", "automated": true, "sla_hours": 24}
    ]'::jsonb,
    '44444444-4444-4444-4444-444444444444',
    true,
    'approved',
    4500.00
)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Verification Log (Stage: VERIFY)
INSERT INTO public.verification_logs (
    id, complaint_id, verification_status, citizen_feedback, photo_evidence_url, ai_vision_confidence, ai_notes
)
VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'c1111111-1111-1111-1111-111111111111',
    'passed',
    'Road has been leveled and repaved cleanly. Water leak also stopped.',
    'https://storage.civicfix.city/verifications/resolved_mg_road.jpg',
    0.962,
    'AI vision confirms pothole filled, surface leveled, zero visible pooling.'
)
ON CONFLICT (id) DO NOTHING;

-- 6. Insert Audit Log (Stage: ESCALATE / PROVENANCE)
INSERT INTO public.audit_logs (
    entity_type, entity_id, action, metadata_json
)
VALUES 
    ('complaint', 'c1111111-1111-1111-1111-111111111111', 'CLUSTERED', '{"cluster_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "reason": "Spatial proximity < 50m and concurrent root-cause"}'::jsonb),
    ('action_plan', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'OPERATOR_APPROVED', '{"approved_by": "AutonomousAgentSupervisor", "priority": "high"}'::jsonb);
