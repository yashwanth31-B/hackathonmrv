import { Router } from 'express';
import {
  createComplaint,
  getComplaints,
  getComplaintById
} from '../controllers/complaintController.js';
import {
  clusterComplaint,
  planComplaint,
  verifyComplaint
} from '../controllers/agentController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

// POST /api/complaints — citizen submits a complaint (auth required)
router.post('/', authenticate, createComplaint);

// GET /api/complaints — list complaints; role-based filtering applied in controller
router.get('/', authenticate, getComplaints);

// GET /api/complaints/:id — full complaint detail view
router.get('/:id', authenticate, getComplaintById);

// Agent Orchestration Endpoints on complaints
// POST /api/complaints/:id/cluster — run Cluster Agent & update DB
router.post('/:id/cluster', authenticate, clusterComplaint);

// POST /api/complaints/:id/plan — run Planning Agent & generate work orders
router.post('/:id/plan', authenticate, planComplaint);

// POST /api/complaints/:id/verify — post-fix citizen verification
router.post('/:id/verify', authenticate, verifyComplaint);

export default router;
