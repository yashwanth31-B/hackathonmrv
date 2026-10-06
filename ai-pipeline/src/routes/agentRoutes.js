import { Router } from 'express';
import {
  clusterComplaint,
  planComplaint,
  approvePlan,
  verifyComplaint,
  triggerIntake,
  triggerClustering,
  triggerPlanning,
  triggerVerification
} from '../controllers/agentController.js';
import { authenticate, authorise } from '../middlewares/authMiddleware.js';

const router = Router();

// ===========================================================================
// Autonomous Civic Operations Agent Routes
// ===========================================================================

// 1. Cluster Agent Trigger
// POST /api/complaints/:id/cluster (also matches /api/agents/complaints/:id/cluster)
router.post('/complaints/:id/cluster', authenticate, clusterComplaint);
router.post('/:id/cluster', authenticate, clusterComplaint);

// 2. Planning Agent Trigger
// POST /api/complaints/:id/plan (also matches /api/agents/complaints/:id/plan)
router.post('/complaints/:id/plan', authenticate, planComplaint);
router.post('/:id/plan', authenticate, planComplaint);

// 3. Human-in-the-Loop Operator Plan Approval
// POST /api/plans/:planId/approve (also matches /api/agents/plans/:planId/approve)
router.post('/plans/:planId/approve', authenticate, authorise('OPERATOR', 'ADMIN'), approvePlan);
router.post('/approve-plan/:planId', authenticate, authorise('OPERATOR', 'ADMIN'), approvePlan);

// 4. Closed-Loop Verification Agent Trigger
// POST /api/complaints/:id/verify (also matches /api/agents/complaints/:id/verify)
router.post('/complaints/:id/verify', authenticate, verifyComplaint);
router.post('/:id/verify', authenticate, verifyComplaint);

// ===========================================================================
// Direct Agent Execution (Test & Operator Utility Endpoints)
// ===========================================================================
router.post('/intake', authenticate, triggerIntake);
router.post('/cluster', authenticate, triggerClustering);
router.post('/plan', authenticate, triggerPlanning);
router.post('/verify', authenticate, triggerVerification);

export default router;
