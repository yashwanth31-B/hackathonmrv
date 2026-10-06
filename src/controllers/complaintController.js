import { supabaseAdmin } from '../config/supabase.js';
import { logAuditAction, getAuditTrailForEntity } from '../services/auditService.js';

/**
 * Register a new citizen complaint (OBSERVE phase entrypoint)
 * POST /api/v1/complaints
 */
export const createComplaint = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      latitude,
      longitude,
      photo_url = null,
      address = null,
    } = req.body;

    const citizenId = req.user?.id;

    // 1. Insert complaint into Supabase public.complaints
    // Note: The 'location' geography column is automatically computed by PostGIS
    const { data: complaint, error: insertError } = await supabaseAdmin
      .from('complaints')
      .insert({
        title,
        description,
        category,
        latitude,
        longitude,
        photo_url,
        address,
        citizen_id: citizenId || null,
        status: 'submitted',
      })
      .select('*')
      .single();

    if (insertError) {
      return next(insertError);
    }

    // 2. Record provenance event in audit_logs
    await logAuditAction({
      entityType: 'complaint',
      entityId: complaint.id,
      action: 'COMPLAINT_SUBMITTED',
      performedBy: citizenId,
      metadata: {
        category,
        latitude,
        longitude,
        has_photo: Boolean(photo_url),
        address,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully and queued for agent triage.',
      data: {
        complaint,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieve all complaints submitted by the authenticated citizen
 * GET /api/v1/complaints/my
 */
export const getMyComplaints = async (req, res, next) => {
  try {
    const citizenId = req.user?.id;

    if (!citizenId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required.',
        },
      });
    }

    const { data: complaints, error: fetchError } = await supabaseAdmin
      .from('complaints')
      .select(`
        id,
        title,
        description,
        category,
        photo_url,
        latitude,
        longitude,
        address,
        status,
        cluster_id,
        created_at,
        updated_at,
        complaint_clusters (
          id,
          root_cause_title,
          status,
          priority_score
        ),
        verification_logs (
          id,
          verification_status,
          citizen_feedback,
          checked_at
        )
      `)
      .eq('citizen_id', citizenId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      return next(fetchError);
    }

    return res.status(200).json({
      success: true,
      count: complaints?.length || 0,
      data: {
        complaints: complaints || [],
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieve complete details of a single complaint, including:
 * - Cluster information
 * - Assigned action plan & municipal department
 * - Verification history
 * - Chronological audit timeline
 * GET /api/v1/complaints/:id
 */
export const getComplaintById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Fetch comprehensive complaint hierarchy
    const { data: complaint, error: fetchError } = await supabaseAdmin
      .from('complaints')
      .select(`
        id,
        title,
        description,
        category,
        photo_url,
        latitude,
        longitude,
        address,
        status,
        citizen_id,
        cluster_id,
        created_at,
        updated_at,
        users:citizen_id (
          id,
          name,
          email
        ),
        complaint_clusters (
          id,
          root_cause_title,
          priority_score,
          summary,
          status,
          created_at,
          action_plans (
            id,
            steps_json,
            approval_status,
            requires_operator_approval,
            estimated_cost,
            assigned_department_id,
            departments:assigned_department_id (
              id,
              name,
              contact_email,
              priority_level
            )
          )
        ),
        verification_logs (
          id,
          verification_status,
          citizen_feedback,
          photo_evidence_url,
          ai_vision_confidence,
          ai_notes,
          checked_at
        )
      `)
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return next(fetchError);
    }

    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'COMPLAINT_NOT_FOUND',
          message: `Complaint with ID "${id}" was not found.`,
        },
      });
    }

    // 2. Fetch chronological audit timeline for transparency
    const timeline = await getAuditTrailForEntity('complaint', id);

    return res.status(200).json({
      success: true,
      data: {
        complaint,
        timeline,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  createComplaint,
  getMyComplaints,
  getComplaintById,
};
