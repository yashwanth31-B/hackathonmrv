import { supabaseAdmin } from '../config/supabase.js';
import { logAuditAction } from '../services/auditService.js';

/**
 * Record citizen or AI verification of a resolved complaint
 * (VERIFY phase -> auto-escalation or closure)
 * POST /api/v1/verification/complaints/:id/verify
 */
export const verifyComplaintResolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      verified,
      evidence_photo = null,
      feedback = null,
      ai_vision_confidence = null,
      ai_notes = null,
    } = req.body;

    const performedBy = req.user?.id || null;

    // 1. Fetch complaint and cluster reference
    const { data: complaint, error: complaintError } = await supabaseAdmin
      .from('complaints')
      .select('id, title, status, cluster_id, citizen_id')
      .eq('id', id)
      .maybeSingle();

    if (complaintError) {
      return next(complaintError);
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

    // 2. Insert into verification_logs table
    const verificationStatus = verified ? 'passed' : 'failed';

    const { data: verificationLog, error: vLogError } = await supabaseAdmin
      .from('verification_logs')
      .insert({
        complaint_id: id,
        verification_status: verificationStatus,
        citizen_feedback: feedback,
        photo_evidence_url: evidence_photo,
        ai_vision_confidence,
        ai_notes,
      })
      .select()
      .single();

    if (vLogError) {
      return next(vLogError);
    }

    // 3. Handle Passed vs Failed Verification
    let newComplaintStatus = 'verified';

    if (verified) {
      // --- VERIFICATION PASSED ---
      newComplaintStatus = 'verified';

      await supabaseAdmin
        .from('complaints')
        .update({ status: 'verified' })
        .eq('id', id);

      // Audit Log for passed resolution
      await logAuditAction({
        entityType: 'complaint',
        entityId: id,
        action: 'COMPLAINT_VERIFIED_RESOLVED',
        performedBy,
        metadata: {
          verification_log_id: verificationLog.id,
          citizen_feedback: feedback,
          evidence_photo,
          ai_vision_confidence,
        },
      });

      // If all complaints in this cluster are verified, mark cluster as 'verified'
      if (complaint.cluster_id) {
        const { data: remainingUnverified } = await supabaseAdmin
          .from('complaints')
          .select('id')
          .eq('cluster_id', complaint.cluster_id)
          .neq('status', 'verified');

        if (!remainingUnverified || remainingUnverified.length === 0) {
          await supabaseAdmin
            .from('complaint_clusters')
            .update({ status: 'verified' })
            .eq('id', complaint.cluster_id);

          await logAuditAction({
            entityType: 'cluster',
            entityId: complaint.cluster_id,
            action: 'CLUSTER_FULLY_VERIFIED',
            performedBy,
            metadata: { message: 'All constituent complaints verified by citizens/AI' },
          });
        }
      }
    } else {
      // --- VERIFICATION FAILED (TRIGGER REPLANNING) ---
      newComplaintStatus = 'reopened';

      // Reopen complaint so it re-enters active agent triage
      await supabaseAdmin
        .from('complaints')
        .update({ status: 'reopened' })
        .eq('id', id);

      // Set cluster status back to 'planning' for autonomous Gemini replanning
      if (complaint.cluster_id) {
        await supabaseAdmin
          .from('complaint_clusters')
          .update({ status: 'planning' })
          .eq('id', complaint.cluster_id);
      }

      // Record audit provenance event explicitly triggering replanning
      await logAuditAction({
        entityType: 'complaint',
        entityId: id,
        action: 'VERIFICATION_FAILED_REOPENED_FOR_REPLAN',
        performedBy,
        metadata: {
          cluster_id: complaint.cluster_id,
          verification_log_id: verificationLog.id,
          failure_reason: feedback,
          evidence_photo,
          replan_triggered: true,
          reopened_at: new Date().toISOString(),
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: verified
        ? 'Resolution verified successfully. Complaint marked as resolved.'
        : 'Verification rejected. Complaint reopened and queued for autonomous replanning.',
      data: {
        verification_log: verificationLog,
        complaint_status: newComplaintStatus,
        cluster_id: complaint.cluster_id,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  verifyComplaintResolution,
};
