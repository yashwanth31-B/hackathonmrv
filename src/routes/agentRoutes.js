import { Router } from 'express';
import {
  syncCluster,
  createActionPlan,
  getPendingComplaints,
  getClusterContext,
} from '../controllers/agentController.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import {
  syncClusterSchema,
  createActionPlanSchema,
} from '../validators/agentValidator.js';

const router = Router();

/**
 * Flexible Agent Security Middleware:
 * Allows automated agent jobs passing an X-Agent-Key header matching
 * AGENT_API_KEY or SUPABASE_SERVICE_ROLE_KEY, or authenticated operators/admins.
 */
const requireAgentOrOperator = (req, res, next) => {
  const agentKey = req.headers['x-agent-key'];
  const validAgentKey = process.env.AGENT_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (agentKey && validAgentKey && agentKey === validAgentKey) {
    req.agent = { isAutomatedWorker: true };
    return next();
  }

  // Fallback to standard Bearer token authentication (operator/admin)
  authenticateToken(req, res, () => {
    authorizeRoles('operator', 'admin')(req, res, next);
  });
};

/**
 * @route   POST /api/v1/agent/clusters/sync
 * @desc    Receive clustered complaints from Gemini Clustering Agent (OBSERVE -> PLAN)
 * @access  Agent Worker / Operator / Admin
 */
router.post(
  '/clusters/sync',
  requireAgentOrOperator,
  validate(syncClusterSchema),
  syncCluster
);

/**
 * @route   POST /api/v1/agent/action-plans
 * @desc    Receive structured resolution plan from Gemini Action Planner (PLAN -> EXECUTE)
 * @access  Agent Worker / Operator / Admin
 */
router.post(
  '/action-plans',
  requireAgentOrOperator,
  validate(createActionPlanSchema),
  createActionPlan
);

/**
 * @route   GET /api/v1/agent/pending-complaints
 * @desc    Retrieve unclustered, pending complaints formatted for Gemini prompt context
 * @access  Agent Worker / Operator / Admin
 */
router.get(
  '/pending-complaints',
  requireAgentOrOperator,
  getPendingComplaints
);

/**
 * @route   GET /api/v1/agent/clusters/:clusterId/context
 * @desc    Retrieve cluster details and municipal departments for action plan generation
 * @access  Agent Worker / Operator / Admin
 */
router.get(
  '/clusters/:clusterId/context',
  requireAgentOrOperator,
  getClusterContext
);

export default router;
