import { z } from 'zod';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';
import { runIntakeAndTriageAgent } from '../agents/intakeAgent.js';
import { runClusterAgent } from '../agents/clusterAgent.js';
import { runPlanningAgent } from '../agents/planningAgent.js';
import { runVerificationAgent } from '../agents/verificationAgent.js';

// ---------------------------------------------------------------------------
// 1. POST /api/complaints/:id/cluster
// ---------------------------------------------------------------------------
/**
 * Triggers ClusterAgent for a specific complaint against active nearby complaints.
 * Updates cluster records and complaint status in Supabase.
 */
export const clusterComplaint = async (req, res, next) => {
  try {
    const { id: complaintId } = req.params;

    // 1. Fetch target complaint
    const [complaint] = await dbQuery(
      supabaseAdmin.from('complaints').select('*').eq('id', complaintId)
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint not found with ID: ${complaintId}`
      });
    }

    // 2. Fetch nearby active complaints from Supabase
    let nearbyQuery = supabaseAdmin
      .from('complaints')
      .select(`
        id,
        title,
        description,
        category,
        status,
        latitude,
        longitude,
        location_text,
        complaint_clusters (
          cluster_id
        )
      `)
      .neq('id', complaintId)
      .neq('status', 'RESOLVED')
      .order('created_at', { ascending: false })
      .limit(25);

    if (complaint.latitude && complaint.longitude) {
      const delta = 0.05; // ~5km bounding box
      nearbyQuery = nearbyQuery
        .gte('latitude', complaint.latitude - delta)
        .lte('latitude', complaint.latitude + delta)
        .gte('longitude', complaint.longitude - delta)
        .lte('longitude', complaint.longitude + delta);
    }

    let nearbyList = await dbQuery(nearbyQuery);

    // Fallback: If no nearby geo matches, search by same category
    if ((!nearbyList || nearbyList.length === 0) && complaint.category) {
      nearbyList = await dbQuery(
        supabaseAdmin
          .from('complaints')
          .select(`
            id,
            title,
            description,
            category,
            status,
            latitude,
            longitude,
            location_text,
            complaint_clusters (
              cluster_id
            )
          `)
          .neq('id', complaintId)
          .neq('status', 'RESOLVED')
          .eq('category', complaint.category)
          .order('created_at', { ascending: false })
          .limit(20)
      );
    }

    // Format active complaints for agent
    const nearbyActiveComplaints = (nearbyList || []).map((c) => ({
      id: c.id,
      cluster_id: c.complaint_clusters?.[0]?.cluster_id || null,
      title: c.title,
      description: c.description,
      category: c.category,
      latitude: c.latitude,
      longitude: c.longitude,
      location_text: c.location_text,
      status: c.status
    }));

    // 3. Run ClusterAgent
    const clusterResult = await runClusterAgent(complaint, nearbyActiveComplaints);

    let linkedClusterId = clusterResult.matchedClusterId;

    // 4. Update database cluster references accordingly
    if (clusterResult.isDuplicateOrRelated) {
      if (linkedClusterId) {
        // Link to existing matched cluster
        await dbQuery(
          supabaseAdmin.from('complaint_clusters').upsert(
            {
              complaint_id: complaint.id,
              cluster_id: linkedClusterId
            },
            { onConflict: 'complaint_id,cluster_id' }
          )
        );

        // Increment complaint count
        const [currentCluster] = await dbQuery(
          supabaseAdmin.from('clusters').select('complaint_count').eq('id', linkedClusterId)
        );
        if (currentCluster) {
          await dbQuery(
            supabaseAdmin
              .from('clusters')
              .update({ complaint_count: (currentCluster.complaint_count || 1) + 1 })
              .eq('id', linkedClusterId)
          );
        }
      } else {
        // New cluster formed from related incidents
        const [createdCluster] = await dbQuery(
          supabaseAdmin
            .from('clusters')
            .insert({
              root_cause_title: clusterResult.rootCauseSummary || complaint.title,
              category: complaint.category,
              summary: clusterResult.reasoning,
              complaint_count: 2,
              location_summary: complaint.location_text || 'Co-located incident area'
            })
            .select()
        );

        linkedClusterId = createdCluster.id;

        await dbQuery(
          supabaseAdmin.from('complaint_clusters').insert({
            complaint_id: complaint.id,
            cluster_id: linkedClusterId
          })
        );
      }

      // Update complaint status to CLUSTERED
      await dbQuery(
        supabaseAdmin
          .from('complaints')
          .update({ status: 'CLUSTERED' })
          .eq('id', complaint.id)
      );
    }

    return res.status(200).json({
      success: true,
      message: clusterResult.isDuplicateOrRelated
        ? `Complaint successfully clustered into cluster ${linkedClusterId}`
        : 'Complaint analyzed: stands alone as an independent issue',
      clusterResult,
      clusterId: linkedClusterId || null
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// 2. POST /api/complaints/:id/plan
// ---------------------------------------------------------------------------
/**
 * Triggers PlanningAgent for a specific complaint.
 * Creates operational work-orders in plans and tasks tables.
 */
export const planComplaint = async (req, res, next) => {
  try {
    const { id: complaintId } = req.params;

    // 1. Fetch complaint
    const [complaint] = await dbQuery(
      supabaseAdmin.from('complaints').select('*').eq('id', complaintId)
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint not found with ID: ${complaintId}`
      });
    }

    // 2. Retrieve linked cluster context if present
    const clusterLinks = await dbQuery(
      supabaseAdmin
        .from('complaint_clusters')
        .select('cluster_id, clusters(*)')
        .eq('complaint_id', complaintId)
    );
    const clusterContext = clusterLinks?.[0]?.clusters || null;

    // 3. Run PlanningAgent (persists to plans and tasks tables internally)
    const planningResult = await runPlanningAgent(complaint, clusterContext);

    // 4. Update complaint status to PLANNED
    await dbQuery(
      supabaseAdmin
        .from('complaints')
        .update({ status: 'PLANNED' })
        .eq('id', complaintId)
    );

    return res.status(200).json({
      success: true,
      message: 'Operational work-order plan formulated successfully',
      plan: planningResult.plan,
      tasks: planningResult.tasks,
      geminiOutput: planningResult.geminiOutput
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// 3. POST /api/plans/:planId/approve
// ---------------------------------------------------------------------------
/**
 * Human-in-the-Loop approval endpoint for municipal operators.
 * Sets plan status to APPROVED, tasks to IN_PROGRESS, and complaint to IN_PROGRESS.
 */
export const approvePlan = async (req, res, next) => {
  try {
    const { planId } = req.params;

    // 1. Fetch plan
    const [plan] = await dbQuery(
      supabaseAdmin.from('plans').select('*').eq('id', planId)
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: `Plan not found with ID: ${planId}`
      });
    }

    // 2. Update plan status to APPROVED
    const [updatedPlan] = await dbQuery(
      supabaseAdmin
        .from('plans')
        .update({ status: 'APPROVED' })
        .eq('id', planId)
        .select()
    );

    // 3. Update all linked tasks to IN_PROGRESS
    const updatedTasks = await dbQuery(
      supabaseAdmin
        .from('tasks')
        .update({ status: 'IN_PROGRESS' })
        .eq('plan_id', planId)
        .select()
    );

    // 4. Update parent complaint status to IN_PROGRESS
    if (plan.complaint_id) {
      await dbQuery(
        supabaseAdmin
          .from('complaints')
          .update({ status: 'IN_PROGRESS' })
          .eq('id', plan.complaint_id)
      );
    }

    // 5. Record human approval in audit logs
    await dbQuery(
      supabaseAdmin.from('agent_audit_logs').insert({
        complaint_id: plan.complaint_id || null,
        agent_name: 'HumanOperator',
        input_payload: {
          action: 'PLAN_APPROVAL',
          planId,
          approvedBy: req.user?.id || 'OPERATOR',
          operatorEmail: req.user?.email || null
        },
        output_payload: {
          previousStatus: plan.status,
          newStatus: 'APPROVED',
          activatedTaskCount: updatedTasks?.length || 0
        }
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Plan approved. Work order dispatched to field team.',
      plan: updatedPlan,
      tasks: updatedTasks
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// 4. POST /api/complaints/:id/verify
// ---------------------------------------------------------------------------
/**
 * Accepts citizen feedback + optional post-resolution photo.
 * Runs VerificationAgent and triggers closed-loop resolution or reopening/escalation.
 */
export const verifyComplaint = async (req, res, next) => {
  try {
    const { id: complaintId } = req.params;

    // 1. Fetch complaint
    const [complaint] = await dbQuery(
      supabaseAdmin.from('complaints').select('*').eq('id', complaintId)
    );

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: `Complaint not found with ID: ${complaintId}`
      });
    }

    // 2. Extract feedback inputs
    const citizenFeedbackText =
      req.body.citizenFeedbackText || req.body.feedback || req.body.comments || null;
    const feedbackPhotoBase64 =
      req.body.feedbackPhotoBase64 || req.body.photoBase64 || req.body.image || null;

    // Fetch or construct resolution summary from existing plans
    let resolutionSummary = req.body.resolutionSummary;
    if (!resolutionSummary) {
      const plans = await dbQuery(
        supabaseAdmin
          .from('plans')
          .select('plan_title, tasks(task_name, description, status)')
          .eq('complaint_id', complaintId)
      );

      if (plans?.length > 0) {
        resolutionSummary = `Plan "${plans[0].plan_title}" executed. Tasks: ${
          plans[0].tasks?.map((t) => `${t.task_name} (${t.status})`).join(', ') || 'Completed'
        }`;
      } else {
        resolutionSummary = 'Field crew reported completion of required repairs.';
      }
    }

    // 3. Run VerificationAgent
    const verificationResult = await runVerificationAgent(
      complaint,
      resolutionSummary,
      citizenFeedbackText,
      feedbackPhotoBase64
    );

    return res.status(200).json({
      success: true,
      message: verificationResult.verdict.isResolved
        ? 'Complaint resolution verified successfully. Ticket closed.'
        : `Verification unsuccessful: ${verificationResult.verdict.verificationStatus}`,
      verdict: verificationResult.verdict,
      verification: verificationResult.verification,
      complaintUpdated: verificationResult.complaintUpdated
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// Standalone Direct Agent Runners (for testing / manual invocations)
// ---------------------------------------------------------------------------
export const triggerIntake = async (req, res, next) => {
  try {
    const result = await runIntakeAndTriageAgent(
      req.body.description,
      req.body.imageBase64 || req.body.photoBase64
    );
    return res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

export const triggerClustering = async (req, res, next) => {
  try {
    const result = await runClusterAgent(
      req.body.newComplaint || req.body.complaint,
      req.body.nearbyComplaints || []
    );
    return res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

export const triggerPlanning = async (req, res, next) => {
  try {
    const result = await runPlanningAgent(
      req.body.complaintData || req.body.complaint,
      req.body.clusterContext || null
    );
    return res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

export const triggerVerification = async (req, res, next) => {
  try {
    const result = await runVerificationAgent(
      req.body.complaint,
      req.body.resolutionSummary,
      req.body.citizenFeedbackText,
      req.body.feedbackPhotoBase64
    );
    return res.status(200).json({ success: true, result });
  } catch (error) {
    next(error);
  }
};

export default {
  clusterComplaint,
  planComplaint,
  approvePlan,
  verifyComplaint,
  triggerIntake,
  triggerClustering,
  triggerPlanning,
  triggerVerification
};
