import { supabaseAdmin } from '../config/supabase.js';

/**
 * Agent Bridge Service:
 * Interfaces between database records and the Autonomous Civic Operations AI Agents (Gemini API).
 * Formats raw Postgres rows into prompt-ready, token-efficient JSON inputs.
 */

/**
 * Fetch pending complaints that have not yet been assigned to a cluster.
 * OBSERVE Stage: Feeds into the Gemini Clustering & Root Cause Identification Agent.
 *
 * @param {Object} [options={}]
 * @param {number} [options.limit=50] - Batch size for the clustering window
 * @param {string} [options.category] - Optional category filter (e.g. 'Pothole', 'Water Leak')
 * @param {number} [options.sinceHours] - Only fetch complaints within the last N hours
 * @returns {Promise<Array<Object>>} Formatted JSON payload ready for Gemini prompt context
 */
export const getPendingUnclusteredComplaints = async (options = {}) => {
  const { limit = 50, category = null, sinceHours = null } = options;

  let query = supabaseAdmin
    .from('complaints')
    .select(`
      id,
      title,
      description,
      category,
      latitude,
      longitude,
      address,
      photo_url,
      status,
      created_at
    `)
    .is('cluster_id', null)
    .in('status', ['submitted', 'triaged'])
    .order('created_at', { ascending: true })
    .limit(limit);

  if (category) {
    query = query.eq('category', category);
  }

  if (sinceHours && typeof sinceHours === 'number') {
    const thresholdDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
    query = query.gte('created_at', thresholdDate);
  }

  const { data: complaints, error } = await query;

  if (error) {
    console.error('⚠️ [AgentBridge Error] Failed to fetch unclustered complaints:', error.message);
    throw error;
  }

  // Format into compact, AI-friendly JSON schema
  return (complaints || []).map((item) => ({
    complaint_id: item.id,
    title: item.title,
    description: item.description,
    category: item.category,
    coordinates: {
      latitude: item.latitude,
      longitude: item.longitude,
    },
    location_address: item.address || 'Unspecified location',
    evidence_photo_url: item.photo_url || null,
    status: item.status,
    reported_at: item.created_at,
  }));
};

/**
 * Fetch complete cluster context for Action Planning.
 * PLAN Stage: Feeds into the Gemini Autonomous Action Planner Agent.
 *
 * @param {string} clusterId - Target cluster UUID
 * @returns {Promise<Object>} Clustered context with municipal departments for action generation
 */
export const getClusterContextForPlanning = async (clusterId) => {
  // 1. Fetch cluster and all associated complaints
  const { data: cluster, error: clusterError } = await supabaseAdmin
    .from('complaint_clusters')
    .select(`
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
        latitude,
        longitude,
        address,
        photo_url,
        created_at
      )
    `)
    .eq('id', clusterId)
    .single();

  if (clusterError) {
    throw clusterError;
  }

  // 2. Fetch available municipal departments for routing recommendations
  const { data: departments, error: deptError } = await supabaseAdmin
    .from('departments')
    .select('id, name, contact_email, priority_level, sla_hours_default')
    .order('name', { ascending: true });

  if (deptError) {
    throw deptError;
  }

  return {
    cluster: {
      id: cluster.id,
      root_cause_title: cluster.root_cause_title,
      priority_score: cluster.priority_score,
      summary: cluster.summary,
      status: cluster.status,
      complaint_count: cluster.complaints?.length || 0,
      complaints: (cluster.complaints || []).map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        location: { latitude: c.latitude, longitude: c.longitude, address: c.address },
        photo_url: c.photo_url,
      })),
    },
    available_departments: (departments || []).map((d) => ({
      department_id: d.id,
      name: d.name,
      sla_hours: d.sla_hours_default,
      priority: d.priority_level,
    })),
  };
};

export default {
  getPendingUnclusteredComplaints,
  getClusterContextForPlanning,
};
