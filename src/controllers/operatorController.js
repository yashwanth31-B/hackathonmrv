import { supabaseAdmin } from '../config/supabase.js';
import { logAuditAction } from '../services/auditService.js';

/**
 * Fetch all action plans currently awaiting operator approval
 * GET /api/v1/operator/action-plans/pending
 */
export const getPendingActionPlans = async (req, res, next) => {
  try {
    const { data: pendingPlans, error } = await supabaseAdmin
      .from('action_plans')
      .select(`
        id,
        cluster_id,
        steps_json,
        assigned_department_id,
        requires_operator_approval,
        approval_status,
        approval_notes,
        estimated_cost,
        created_at,
        updated_at,
        departments:assigned_department_id (
          id,
          name,
          contact_email,
          priority_level,
          sla_hours_default
        ),
        complaint_clusters:cluster_id (
          id,
          root_cause_title,
          priority_score,
          summary,
          status,
          created_at,
          complaints (
            id,
            title,
            description,
            category,
            photo_url,
            latitude,
            longitude,
            address,
            status
          )
        )
      `)
      .in('approval_status', ['pending', 'pending_review'])
      .eq('requires_operator_approval', true)
      .order('created_at', { ascending: false });

    if (error) {
      return next(error);
    }

    return res.status(200).json({
      success: true,
      count: pendingPlans?.length || 0,
      data: {
        pending_action_plans: pendingPlans || [],
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Approve an action plan, assign municipal department, and trigger EXECUTE phase
 * POST /api/v1/operator/action-plans/:id/approve
 */
export const approveActionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { assigned_department_id = null, approval_notes = null, estimated_cost = null } = req.body;
    const operatorId = req.user?.id;

    // 1. Fetch target action plan
    const { data: existingPlan, error: findError } = await supabaseAdmin
      .from('action_plans')
      .select('id, cluster_id, assigned_department_id, approval_status')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      return next(findError);
    }

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ACTION_PLAN_NOT_FOUND',
          message: `Action plan with ID "${id}" does not exist.`,
        },
      });
    }

    const finalDeptId = assigned_department_id || existingPlan.assigned_department_id;

    // 2. Update action_plans table
    const updatePayload = {
      approval_status: 'approved',
      approved_by: operatorId,
      approval_notes: approval_notes || 'Approved by operator',
      assigned_department_id: finalDeptId,
    };

    if (estimated_cost !== null && estimated_cost !== undefined) {
      updatePayload.estimated_cost = estimated_cost;
    }

    const { data: updatedPlan, error: updateError } = await supabaseAdmin
      .from('action_plans')
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        departments:assigned_department_id (
          id,
          name,
          contact_email,
          priority_level
        )
      `)
      .single();

    if (updateError) {
      return next(updateError);
    }

    // 3. Advance linked cluster status to 'in_execution' (EXECUTE phase)
    await supabaseAdmin
      .from('complaint_clusters')
      .update({ status: 'in_execution' })
      .eq('id', existingPlan.cluster_id);

    // 4. Update member complaints to 'in_progress'
    await supabaseAdmin
      .from('complaints')
      .update({ status: 'in_progress' })
      .eq('cluster_id', existingPlan.cluster_id)
      .in('status', ['submitted', 'triaged', 'clustered']);

    // 5. Record audit provenance log
    await logAuditAction({
      entityType: 'action_plan',
      entityId: id,
      action: 'ACTION_PLAN_APPROVED',
      performedBy: operatorId,
      metadata: {
        cluster_id: existingPlan.cluster_id,
        assigned_department_id: finalDeptId,
        approval_notes,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Action plan approved. Workflow advanced to EXECUTE phase.',
      data: {
        action_plan: updatedPlan,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Reject an action plan with feedback reason, triggering autonomous replanning
 * POST /api/v1/operator/action-plans/:id/reject
 */
export const rejectActionPlan = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;
    const operatorId = req.user?.id;

    // 1. Fetch target action plan
    const { data: existingPlan, error: findError } = await supabaseAdmin
      .from('action_plans')
      .select('id, cluster_id, approval_status')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      return next(findError);
    }

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ACTION_PLAN_NOT_FOUND',
          message: `Action plan with ID "${id}" does not exist.`,
        },
      });
    }

    // 2. Mark action plan as rejected with notes
    const { data: updatedPlan, error: updateError } = await supabaseAdmin
      .from('action_plans')
      .update({
        approval_status: 'rejected',
        approved_by: operatorId,
        approval_notes: rejection_reason,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return next(updateError);
    }

    // 3. Reset cluster status to 'planning' to trigger AI replanning
    await supabaseAdmin
      .from('complaint_clusters')
      .update({ status: 'planning' })
      .eq('id', existingPlan.cluster_id);

    // 4. Record audit provenance log
    await logAuditAction({
      entityType: 'action_plan',
      entityId: id,
      action: 'ACTION_PLAN_REJECTED_FOR_REPLAN',
      performedBy: operatorId,
      metadata: {
        cluster_id: existingPlan.cluster_id,
        rejection_reason,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Action plan rejected. Cluster reset to PLANNING phase for AI revision.',
      data: {
        action_plan: updatedPlan,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  getPendingActionPlans,
  approveActionPlan,
  rejectActionPlan,
};
