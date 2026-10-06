import { supabaseAdmin } from '../config/supabase.js';

/**
 * Log an event into the audit_logs table for end-to-end provenance.
 * Supports the entire agentic loop: OBSERVE -> PLAN -> EXECUTE -> VERIFY -> ESCALATE
 *
 * @param {Object} params
 * @param {string} params.entityType - 'complaint', 'cluster', 'action_plan', 'verification'
 * @param {string} params.entityId   - Target UUID of the affected entity
 * @param {string} params.action     - Event name (e.g., 'COMPLAINT_CREATED', 'CLUSTERED', 'DISPATCHED')
 * @param {string|null} [params.performedBy=null] - User UUID or null for autonomous agent worker
 * @param {Object} [params.metadata={}] - Relevant contextual payload or AI reasoning parameters
 * @returns {Promise<Object>} Inserted audit log record
 */
export const logAuditAction = async ({
  entityType,
  entityId,
  action,
  performedBy = null,
  metadata = {},
}) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        performed_by: performedBy,
        metadata_json: metadata,
      })
      .select()
      .single();

    if (error) {
      console.error(`⚠️ [AuditService Error] Failed to log action "${action}":`, error.message);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error(`⚠️ [AuditService Exception] Unexpected error logging action "${action}":`, err);
    return { success: false, error: err };
  }
};

/**
 * Fetch chronological audit trail for a specific entity
 *
 * @param {string} entityType - e.g. 'complaint', 'cluster'
 * @param {string} entityId   - Entity UUID
 * @returns {Promise<Array>} Chronological list of audit records
 */
export const getAuditTrailForEntity = async (entityType, entityId) => {
  const { data, error } = await supabaseAdmin
    .from('audit_logs')
    .select('id, action, performed_by, metadata_json, timestamp, users(name, role)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('timestamp', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
};

export default {
  logAuditAction,
  getAuditTrailForEntity,
};
