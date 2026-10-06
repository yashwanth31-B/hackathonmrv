import { SchemaType, getGeminiModel } from '../config/gemini.js';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------
const AGENT_NAME = 'ClusterAgent';

// ---------------------------------------------------------------------------
// Structured-output response schema
// ---------------------------------------------------------------------------
const clusterResponseSchema = {
  type: SchemaType.OBJECT,
  description: 'Clustering decision for a new civic complaint against active nearby complaints',
  properties: {
    isDuplicateOrRelated: {
      type: SchemaType.BOOLEAN,
      description:
        'True if the new complaint is a duplicate of, or causally related to, one or more nearby active complaints'
    },
    matchedClusterId: {
      type: SchemaType.STRING,
      description:
        'The cluster UUID the new complaint should be merged into. Return an empty string if isDuplicateOrRelated is false or no cluster match was found.'
    },
    confidenceScore: {
      type: SchemaType.NUMBER,
      description:
        'Confidence level of the clustering decision, from 0.0 (no confidence) to 1.0 (certain)'
    },
    rootCauseSummary: {
      type: SchemaType.STRING,
      description:
        'A concise description of the shared root cause connecting the complaints, or a summary of the new complaint if it stands alone'
    },
    reasoning: {
      type: SchemaType.STRING,
      description:
        'A one-to-two sentence explanation of the clustering decision, suitable for operator audit'
    }
  },
  required: [
    'isDuplicateOrRelated',
    'matchedClusterId',
    'confidenceScore',
    'rootCauseSummary',
    'reasoning'
  ]
};

// ---------------------------------------------------------------------------
// System instruction
// ---------------------------------------------------------------------------
const SYSTEM_INSTRUCTION = `You are the Cluster Agent for CivicFix, an Autonomous Civic Operations platform.

Your task is to determine whether a newly submitted civic complaint is a **duplicate of** or **causally related to** any of the provided nearby active complaints.

Two complaints are considered related if they:
- Describe the same physical defect or infrastructure failure at or near the same location
- Share a likely common root cause (e.g., multiple potholes from the same road section, recurring garbage overflow from the same bin)
- Belong to the same category and are within close geographic proximity

Rules:
1. Compare the new complaint against ALL provided nearby active complaints.
2. If a match exists, return the cluster_id of the best-matching complaint's cluster as matchedClusterId.
3. If no match exists, set isDuplicateOrRelated to false and matchedClusterId to an empty string "".
4. Assign a confidenceScore between 0.0 and 1.0 reflecting certainty.
5. Summarise the shared root cause concisely. If no match, summarise the new complaint alone.
6. Never fabricate cluster IDs. Only use IDs explicitly present in the nearby complaints data.
7. Be conservative: prefer false when evidence of duplication is weak (confidenceScore < 0.5).`;

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

/**
 * Runs the Cluster Agent to determine if a new complaint belongs to an
 * existing cluster of active nearby complaints.
 *
 * @param {Object}   newComplaint            – The newly submitted complaint object.
 *   @param {string}   newComplaint.id         – Complaint UUID.
 *   @param {string}   newComplaint.title      – Complaint title.
 *   @param {string}   newComplaint.description
 *   @param {string}   newComplaint.category
 *   @param {number}   [newComplaint.latitude]
 *   @param {number}   [newComplaint.longitude]
 *   @param {string}   [newComplaint.location_text]
 *
 * @param {Object[]} nearbyActiveComplaints   – Array of nearby active complaint records.
 *   Each element should include: id, cluster_id, title, description, category,
 *   latitude, longitude, location_text, status.
 *
 * @returns {Promise<{
 *   isDuplicateOrRelated: boolean,
 *   matchedClusterId: string|null,
 *   confidenceScore: number,
 *   rootCauseSummary: string,
 *   reasoning: string
 * }>}
 */
export async function runClusterAgent(newComplaint, nearbyActiveComplaints = []) {
  // ---- 1. Build model with structured output ----
  const model = getGeminiModel({
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: clusterResponseSchema,
      temperature: 0.1  // very deterministic — clustering is a factual comparison
    }
  });

  // ---- 2. Compose the user prompt ----
  const userPrompt = `
## New Complaint (just submitted)
${JSON.stringify(newComplaint, null, 2)}

## Nearby Active Complaints (already in the system)
${
  nearbyActiveComplaints.length > 0
    ? JSON.stringify(nearbyActiveComplaints, null, 2)
    : 'None — this is the first complaint in this area.'
}

Analyse whether the new complaint is a duplicate or causally related to any of the nearby active complaints.
Return your decision as structured JSON.
`.trim();

  // ---- 3. Build input payload for audit ----
  const inputPayload = {
    newComplaint: {
      id: newComplaint.id,
      title: newComplaint.title,
      category: newComplaint.category,
      latitude: newComplaint.latitude ?? null,
      longitude: newComplaint.longitude ?? null
    },
    nearbyCount: nearbyActiveComplaints.length,
    nearbyComplaintIds: nearbyActiveComplaints.map((c) => c.id)
  };

  let parsedOutput;

  // ---- 4. Call Gemini ----
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
    });

    const responseText = result.response.text();
    parsedOutput = JSON.parse(responseText);

    // Normalise: clamp confidence to [0, 1]
    parsedOutput.confidenceScore = Math.max(
      0,
      Math.min(1, parsedOutput.confidenceScore)
    );

    // Normalise: if not related, ensure matchedClusterId is null
    if (!parsedOutput.isDuplicateOrRelated || parsedOutput.matchedClusterId === '') {
      parsedOutput.matchedClusterId = null;
    }

    // Safety guard: confirm the returned cluster ID actually exists in our data
    if (parsedOutput.matchedClusterId) {
      const validClusterIds = new Set(
        nearbyActiveComplaints
          .map((c) => c.cluster_id)
          .filter(Boolean)
      );
      if (!validClusterIds.has(parsedOutput.matchedClusterId)) {
        console.warn(
          `[${AGENT_NAME}] Gemini returned an unrecognised cluster ID "${parsedOutput.matchedClusterId}" — clearing.`
        );
        parsedOutput.matchedClusterId = null;
        parsedOutput.isDuplicateOrRelated = false;
        parsedOutput.confidenceScore = 0;
      }
    }
  } catch (error) {
    console.error(`[${AGENT_NAME}] Gemini call failed:`, error.message);

    await logToAudit(newComplaint.id, inputPayload, {
      error: error.message,
      status: 'FAILED'
    });

    throw error;
  }

  // ---- 5. Persist audit log ----
  await logToAudit(newComplaint.id, inputPayload, parsedOutput);

  return parsedOutput;
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

export default { runClusterAgent };
