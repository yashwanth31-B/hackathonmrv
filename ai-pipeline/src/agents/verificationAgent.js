import { SchemaType, getGeminiModel } from '../config/gemini.js';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------
const AGENT_NAME = 'VerificationAgent';

// ---------------------------------------------------------------------------
// Action → complaint status mapping
// ---------------------------------------------------------------------------
const ACTION_TO_COMPLAINT_STATUS = {
  CLOSE_TICKET:              'RESOLVED',
  AUTO_REPLAN:               'VERIFICATION_FAILED',
  ESCALATE_TO_SENIOR_OFFICER: 'ESCALATED'
};

// ---------------------------------------------------------------------------
// Structured-output response schema
// ---------------------------------------------------------------------------
const verificationResponseSchema = {
  type: SchemaType.OBJECT,
  description: 'Verification verdict for a resolved civic complaint',
  properties: {
    isResolved: {
      type: SchemaType.BOOLEAN,
      description:
        'True only if the complaint has been fully and satisfactorily resolved per municipal standards'
    },
    verificationStatus: {
      type: SchemaType.STRING,
      description: 'Categorical outcome of the verification review',
      enum: ['VERIFIED_CLOSED', 'FAILED_REOPEN', 'ESCALATED']
    },
    failureReason: {
      type: SchemaType.STRING,
      description:
        'Specific reason the resolution is considered incomplete or failed. Empty string if isResolved is true.'
    },
    recommendedAction: {
      type: SchemaType.STRING,
      description: 'System action to take based on verification outcome',
      enum: ['CLOSE_TICKET', 'AUTO_REPLAN', 'ESCALATE_TO_SENIOR_OFFICER']
    },
    revisedPlanNotes: {
      type: SchemaType.STRING,
      description:
        'Actionable notes for the replanning or escalation team. Empty string if isResolved is true.'
    }
  },
  required: [
    'isResolved',
    'verificationStatus',
    'failureReason',
    'recommendedAction',
    'revisedPlanNotes'
  ]
};

// ---------------------------------------------------------------------------
// System instruction
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are the Verification Agent for CivicFix, an Autonomous Civic Operations platform used by Indian municipalities.

Your role is to independently verify whether a civic complaint has been genuinely and satisfactorily resolved, based on:
1. The original complaint details and reported issue.
2. The resolution summary submitted by the field crew.
3. The citizen's follow-up feedback text (if provided).
4. A post-resolution photo (if provided).

Resolution standards:
- The specific defect must have been repaired, not just documented or partially addressed.
- The citizen's feedback must not indicate persistent or recurring issues.
- Photo evidence (when present) must visually confirm the repair — look for fresh asphalt, cleaned area, replaced fixtures, etc.
- If the citizen reports the issue still exists, always mark as unresolved.

Verdict rules:
- isResolved = true  → verificationStatus = VERIFIED_CLOSED, recommendedAction = CLOSE_TICKET
- Partial / minor failure → verificationStatus = FAILED_REOPEN, recommendedAction = AUTO_REPLAN
- Serious failure, safety risk, or repeated failure → verificationStatus = ESCALATED, recommendedAction = ESCALATE_TO_SENIOR_OFFICER

Always provide a clear failureReason and actionable revisedPlanNotes when isResolved is false.
Be objective and conservative — when in doubt, do not close.`;

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Runs the Verification Agent to evaluate whether a civic complaint is resolved.
 *
 * @param {Object}      complaint             – Original complaint record from DB.
 *   @param {string}      complaint.id
 *   @param {string}      complaint.title
 *   @param {string}      complaint.description
 *   @param {string}      complaint.category
 *   @param {string}      complaint.priority
 *   @param {string}      [complaint.location_text]
 *
 * @param {string}      resolutionSummary     – Field crew's completion report / notes.
 * @param {string|null} citizenFeedbackText   – Optional feedback submitted by the citizen.
 * @param {string|null} feedbackPhotoBase64   – Optional base64-encoded JPEG photo
 *                                              submitted by the citizen as post-fix evidence.
 *
 * @returns {Promise<{
 *   verdict: Object,       // Gemini structured output (all 5 schema fields)
 *   verification: Object,  // Row inserted into verifications table
 *   complaintUpdated: boolean
 * }>}
 */
export async function runVerificationAgent(
  complaint,
  resolutionSummary,
  citizenFeedbackText = null,
  feedbackPhotoBase64 = null
) {
  // ---- 1. Build model with structured output + optional multimodal ----
  const model = getGeminiModel({
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: verificationResponseSchema,
      temperature: 0.1  // conservative: verification should be deterministic
    }
  });

  // ---- 2. Assemble content parts ----
  const parts = [
    {
      text: `
## Original Complaint
${JSON.stringify(
  {
    id: complaint.id,
    title: complaint.title,
    description: complaint.description,
    category: complaint.category,
    priority: complaint.priority,
    location: complaint.location_text ?? 'Not specified'
  },
  null,
  2
)}

## Field Crew Resolution Summary
${resolutionSummary || 'No resolution summary provided.'}

## Citizen Follow-Up Feedback
${citizenFeedbackText || 'No citizen feedback provided.'}
`.trim()
    }
  ];

  // Attach post-fix photo if provided
  if (feedbackPhotoBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: feedbackPhotoBase64
      }
    });
    parts.push({
      text: 'The image above is a post-resolution photo submitted by the citizen. Use it to visually validate whether the defect has been repaired.'
    });
  }

  // ---- 3. Build input payload for audit ----
  const inputPayload = {
    complaintId: complaint.id,
    complaintTitle: complaint.title,
    category: complaint.category,
    priority: complaint.priority,
    hasResolutionSummary: !!resolutionSummary,
    hasCitizenFeedback: !!citizenFeedbackText,
    hasFeedbackPhoto: !!feedbackPhotoBase64
  };

  let verdict;

  // ---- 4. Call Gemini ----
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }]
    });

    const responseText = result.response.text();
    verdict = JSON.parse(responseText);

    // Enforce consistency: if isResolved, clear failure fields
    if (verdict.isResolved) {
      verdict.verificationStatus = 'VERIFIED_CLOSED';
      verdict.recommendedAction = 'CLOSE_TICKET';
      verdict.failureReason = '';
      verdict.revisedPlanNotes = '';
    } else {
      // Ensure failureReason is non-empty when unresolved
      if (!verdict.failureReason?.trim()) {
        verdict.failureReason = 'Resolution was deemed insufficient based on the available evidence.';
      }
    }
  } catch (error) {
    console.error(`[${AGENT_NAME}] Gemini call failed:`, error.message);

    await logToAudit(complaint.id, inputPayload, {
      error: error.message,
      status: 'FAILED'
    });

    throw error;
  }

  // ---- 5. Write verification record ----
  let savedVerification;

  try {
    const [verificationRecord] = await dbQuery(
      supabaseAdmin
        .from('verifications')
        .insert({
          complaint_id: complaint.id,
          is_resolved: verdict.isResolved,
          citizen_feedback: citizenFeedbackText || null,
          photo_url: null  // upload handled by caller; pass URL post-upload if needed
        })
        .select()
    );

    savedVerification = verificationRecord;
  } catch (dbError) {
    console.error(`[${AGENT_NAME}] Failed to write verifications row:`, dbError.message);

    await logToAudit(complaint.id, inputPayload, {
      verdict,
      dbError: dbError.message,
      status: 'DB_WRITE_FAILED'
    });

    throw dbError;
  }

  // ---- 6. Post-verdict side-effects based on outcome ----
  const newComplaintStatus = ACTION_TO_COMPLAINT_STATUS[verdict.recommendedAction];
  let complaintUpdated = false;

  try {
    await dbQuery(
      supabaseAdmin
        .from('complaints')
        .update({ status: newComplaintStatus })
        .eq('id', complaint.id)
    );
    complaintUpdated = true;
    console.log(
      `[${AGENT_NAME}] Complaint ${complaint.id} status → ${newComplaintStatus}`
    );
  } catch (updateError) {
    // Non-fatal: log and continue — the verification row is already saved
    console.error(
      `[${AGENT_NAME}] Failed to update complaint status:`,
      updateError.message
    );
  }

  // ---- 7. Handle failure side-effects ----
  if (!verdict.isResolved) {
    await handleFailureOutcome(verdict, complaint);
  }

  // ---- 8. Persist audit log ----
  await logToAudit(complaint.id, inputPayload, {
    verificationId: savedVerification.id,
    verdict,
    newComplaintStatus,
    complaintUpdated
  });

  return {
    verdict,
    verification: savedVerification,
    complaintUpdated
  };
}

// ---------------------------------------------------------------------------
// Failure side-effect handler
// ---------------------------------------------------------------------------

/**
 * Handles post-verdict actions when a complaint is NOT resolved:
 * - AUTO_REPLAN   → logs a replanning recommendation to audit logs
 * - ESCALATED     → logs an escalation entry to audit logs
 *
 * In a production system this function would also:
 * - Enqueue a replanning job (e.g., call runPlanningAgent again)
 * - Notify a senior officer via push notification / email
 * - Create an escalation ticket in the external ITSM system
 *
 * @param {Object} verdict    – Verification verdict from Gemini.
 * @param {Object} complaint  – Original complaint record.
 */
async function handleFailureOutcome(verdict, complaint) {
  if (verdict.recommendedAction === 'AUTO_REPLAN') {
    console.log(
      `[${AGENT_NAME}] AUTO_REPLAN triggered for complaint ${complaint.id}. ` +
      `Notes: ${verdict.revisedPlanNotes}`
    );

    // Log replanning recommendation as a separate audit event
    await logToAudit(complaint.id, { trigger: 'AUTO_REPLAN' }, {
      revisedPlanNotes: verdict.revisedPlanNotes,
      failureReason: verdict.failureReason,
      status: 'REPLAN_QUEUED',
      note: 'Call runPlanningAgent(complaint, clusterContext) to generate a new plan.'
    });
  }

  if (verdict.recommendedAction === 'ESCALATE_TO_SENIOR_OFFICER') {
    console.warn(
      `[${AGENT_NAME}] ESCALATION triggered for complaint ${complaint.id}. ` +
      `Reason: ${verdict.failureReason}`
    );

    // Log escalation as a separate audit event
    await logToAudit(complaint.id, { trigger: 'ESCALATION' }, {
      failureReason: verdict.failureReason,
      revisedPlanNotes: verdict.revisedPlanNotes,
      status: 'ESCALATED',
      note: 'Senior officer must manually review this complaint and assign corrective action.'
    });
  }
}

// ---------------------------------------------------------------------------
// Audit logger — non-fatal
// ---------------------------------------------------------------------------
async function logToAudit(complaintId, inputPayload, outputPayload) {
  try {
    await dbQuery(
      supabaseAdmin.from('agent_audit_logs').insert({
        complaint_id: complaintId || null,
        agent_name: AGENT_NAME,
        input_payload: inputPayload,
        output_payload: outputPayload
      })
    );
  } catch (err) {
    console.warn(`[${AGENT_NAME}] Audit log write failed:`, err.message);
  }
}

export default { runVerificationAgent };
