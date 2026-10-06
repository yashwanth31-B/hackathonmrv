import { SchemaType, getGeminiModel } from '../config/gemini.js';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------
const AGENT_NAME = 'IntakeAndTriageAgent';

// ---------------------------------------------------------------------------
// Structured-output schema (OpenAPI 3.0 subset accepted by Gemini SDK)
// ---------------------------------------------------------------------------
const intakeResponseSchema = {
  type: SchemaType.OBJECT,
  description: 'Structured intake classification of a civic complaint',
  properties: {
    category: {
      type: SchemaType.STRING,
      description: 'Primary complaint category',
      enum: [
        'POTHOLE',
        'GARBAGE',
        'STREETLIGHT',
        'WATER_LEAKAGE',
        'DRAINAGE',
        'OTHER'
      ]
    },
    summary: {
      type: SchemaType.STRING,
      description: 'Short title-style summary of the complaint (max 120 chars)'
    },
    priority: {
      type: SchemaType.STRING,
      description: 'Urgency level derived from impact, safety risk, and population affected',
      enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    },
    severityScore: {
      type: SchemaType.INTEGER,
      description: 'Numeric severity from 1 (minor) to 10 (life-threatening)'
    },
    suggestedDepartment: {
      type: SchemaType.STRING,
      description: 'Municipal department best suited to resolve this complaint',
      enum: [
        'Roads & Infrastructure',
        'Sanitation & Waste Management',
        'Electrical & Public Lighting',
        'Water Supply & Sewerage Board'
      ]
    },
    reasoning: {
      type: SchemaType.STRING,
      description: 'Concise explanation of why this category and priority were assigned'
    }
  },
  required: [
    'category',
    'summary',
    'priority',
    'severityScore',
    'suggestedDepartment',
    'reasoning'
  ]
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are the Intake & Triage Agent for CivicFix, an Autonomous Civic Operations platform deployed across Indian municipalities.

Your job:
1. Read the citizen's complaint description (and an optional photo if provided).
2. Classify it into exactly ONE category.
3. Assign a priority level and a severity score (1–10) based on:
   - Safety risk to pedestrians/motorists
   - Number of people potentially affected
   - Urgency of infrastructure failure
4. Map it to the single most relevant municipal department.
5. Write a short, professional summary suitable for a dashboard title.
6. Provide a one-sentence reasoning string that explains your classification so operators can audit your decision.

Be precise. Never hallucinate locations or details not present in the complaint.`;

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Runs the Intake & Triage Agent.
 *
 * @param {string}      description  – Free-text complaint from the citizen.
 * @param {string|null} imageBase64  – Optional base64-encoded photo of the issue.
 * @param {string|null} complaintId  – Optional complaint UUID for audit linkage.
 * @returns {Promise<Object>}        – Parsed structured output from Gemini.
 */
export async function runIntakeAndTriageAgent(
  description,
  imageBase64 = null,
  complaintId = null
) {
  // ---- 1. Build the model with structured output ----
  const model = getGeminiModel('gemini-2.5-flash', {
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: intakeResponseSchema,
      temperature: 0.2  // deterministic classification
    }
  });

  // ---- 2. Assemble content parts (text + optional image) ----
  const parts = [
    { text: `Citizen Complaint:\n${description}` }
  ];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBase64
      }
    });
    parts.push({
      text: 'An image of the reported issue is attached above. Use visual cues to improve classification accuracy.'
    });
  }

  // ---- 3. Call Gemini ----
  const inputPayload = {
    description,
    hasImage: !!imageBase64,
    complaintId
  };

  let parsedOutput;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts }]
    });

    const responseText = result.response.text();
    parsedOutput = JSON.parse(responseText);

    // Clamp severityScore to 1–10
    parsedOutput.severityScore = Math.max(
      1,
      Math.min(10, parsedOutput.severityScore)
    );
  } catch (error) {
    console.error(`[${AGENT_NAME}] Gemini call failed:`, error.message);

    // Log the failure to audit table before re-throwing
    await logToAudit(complaintId, inputPayload, {
      error: error.message,
      status: 'FAILED'
    });

    throw error;
  }

  // ---- 4. Persist audit log ----
  await logToAudit(complaintId, inputPayload, parsedOutput);

  return parsedOutput;
}

// ---------------------------------------------------------------------------
// Audit logger
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
    // Audit failures should never crash the pipeline – warn and continue
    console.warn(`[${AGENT_NAME}] Audit log write failed:`, err.message);
  }
}

export default { runIntakeAndTriageAgent };
