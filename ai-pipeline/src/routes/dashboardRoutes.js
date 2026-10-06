import { Router } from 'express';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

// Mapping complaint categories to municipal departments
const CATEGORY_TO_DEPARTMENT = {
  POTHOLE: 'Roads & Infrastructure',
  ROADS: 'Roads & Infrastructure',
  INFRASTRUCTURE: 'Roads & Infrastructure',
  GARBAGE: 'Sanitation & Waste Management',
  SANITATION: 'Sanitation & Waste Management',
  WASTE: 'Sanitation & Waste Management',
  STREETLIGHT: 'Electrical & Public Lighting',
  LIGHTING: 'Electrical & Public Lighting',
  ELECTRICAL: 'Electrical & Public Lighting',
  WATER_LEAKAGE: 'Water Supply & Sewerage Board',
  DRAINAGE: 'Water Supply & Sewerage Board',
  SEWERAGE: 'Water Supply & Sewerage Board',
  WATER: 'Water Supply & Sewerage Board',
  OTHER: 'General Municipal Services'
};

/**
 * GET /api/dashboard/stats
 * Returns operational metrics:
 * - Active Complaints
 * - Critical Cases
 * - Clustered Complaints
 * - Approved Plans
 * - SLA Breaches (open > 48h)
 * - Department Load
 * - Category and Status breakdowns
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    // SLA breach threshold: older than 48 hours and still unresolved
    const slaCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // 1. Parallel counts and aggregate queries
    const [
      activeCountResult,
      criticalCountResult,
      totalCountResult,
      resolvedCountResult,
      clusteredCountResult,
      approvedPlansResult,
      slaBreachesResult,
      allActiveComplaintsResult,
      clustersCountResult,
      activeTasksResult
    ] = await Promise.all([
      // Active complaints (not resolved)
      supabaseAdmin
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'RESOLVED'),

      // Critical active complaints
      supabaseAdmin
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .eq('priority', 'CRITICAL')
        .neq('status', 'RESOLVED'),

      // Total all-time complaints
      supabaseAdmin
        .from('complaints')
        .select('*', { count: 'exact', head: true }),

      // Resolved complaints
      supabaseAdmin
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'RESOLVED'),

      // Clustered complaints (linked in complaint_clusters)
      supabaseAdmin
        .from('complaint_clusters')
        .select('*', { count: 'exact', head: true }),

      // Approved plans
      supabaseAdmin
        .from('plans')
        .select('*', { count: 'exact', head: true })
        .in('status', ['APPROVED', 'EXECUTING', 'COMPLETED']),

      // SLA Breaches (>48h unresolved)
      supabaseAdmin
        .from('complaints')
        .select('*', { count: 'exact', head: true })
        .neq('status', 'RESOLVED')
        .lt('created_at', slaCutoff),

      // Fetch categories & statuses of all active complaints for Department Load calculation
      supabaseAdmin
        .from('complaints')
        .select('category, priority, status')
        .neq('status', 'RESOLVED'),

      // Total clusters created
      supabaseAdmin
        .from('clusters')
        .select('*', { count: 'exact', head: true }),

      // Active in-progress tasks
      supabaseAdmin
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'IN_PROGRESS')
    ]);

    // Handle any query errors safely
    const activeComplaints = activeCountResult.count ?? 0;
    const criticalCases = criticalCountResult.count ?? 0;
    const totalComplaints = totalCountResult.count ?? 0;
    const resolvedComplaints = resolvedCountResult.count ?? 0;
    const clusteredComplaints = clusteredCountResult.count ?? 0;
    const approvedPlans = approvedPlansResult.count ?? 0;
    const slaBreaches = slaBreachesResult.count ?? 0;
    const totalClusters = clustersCountResult.count ?? 0;
    const activeTasks = activeTasksResult.count ?? 0;

    // 2. Compute Department Load and Category Breakdown
    const departmentLoad = {
      'Roads & Infrastructure': 0,
      'Sanitation & Waste Management': 0,
      'Electrical & Public Lighting': 0,
      'Water Supply & Sewerage Board': 0,
      'General Municipal Services': 0
    };

    const categoryBreakdown = {};
    const statusBreakdown = {};

    const activeRows = allActiveComplaintsResult.data || [];

    for (const item of activeRows) {
      const cat = (item.category || 'OTHER').toUpperCase();
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;

      const dept = CATEGORY_TO_DEPARTMENT[cat] || 'General Municipal Services';
      departmentLoad[dept] = (departmentLoad[dept] || 0) + 1;

      const st = item.status || 'UNKNOWN';
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    }

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      stats: {
        activeComplaints,
        criticalCases,
        clusteredComplaints,
        approvedPlans,
        slaBreaches,
        departmentLoad,
        categoryBreakdown,
        statusBreakdown,
        totalComplaints,
        resolvedComplaints,
        totalClusters,
        activeTasks
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
