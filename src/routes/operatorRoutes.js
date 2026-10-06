import { Router } from 'express';
import {
  getPendingActionPlans,
  approveActionPlan,
  rejectActionPlan,
} from '../controllers/operatorController.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import {
  approveActionPlanSchema,
  rejectActionPlanSchema,
} from '../validators/operatorValidator.js';

const router = Router();

// Protect all operator routes with authentication and operator/admin role check
router.use(authenticateToken);
router.use(authorizeRoles('operator', 'admin'));

/**
 * @route   GET /api/v1/operator/action-plans/pending
 * @desc    List all action plans awaiting operator sign-off (EXECUTE gatekeeper)
 * @access  Private (Operator / Admin)
 */
router.get('/action-plans/pending', getPendingActionPlans);

/**
 * @route   POST /api/v1/operator/action-plans/:id/approve
 * @desc    Approve action plan, confirm department, and trigger EXECUTE phase
 * @access  Private (Operator / Admin)
 */
router.post(
  '/action-plans/:id/approve',
  validate(approveActionPlanSchema),
  approveActionPlan
);

/**
 * @route   POST /api/v1/operator/action-plans/:id/reject
 * @desc    Reject action plan with reason and reset cluster for AI replanning
 * @access  Private (Operator / Admin)
 */
router.post(
  '/action-plans/:id/reject',
  validate(rejectActionPlanSchema),
  rejectActionPlan
);

export default router;
