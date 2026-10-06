import { Router } from 'express';
import {
  createComplaint,
  getMyComplaints,
  getComplaintById,
} from '../controllers/complaintController.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  createComplaintSchema,
  complaintIdParamSchema,
} from '../validators/complaintValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/complaints
 * @desc    Submit a new citizen complaint (OBSERVE)
 * @access  Private (Requires Bearer token)
 */
router.post('/', authenticateToken, validate(createComplaintSchema), createComplaint);

/**
 * @route   GET /api/v1/complaints/my
 * @desc    Get all complaints created by the logged-in citizen
 * @access  Private (Requires Bearer token)
 */
router.get('/my', authenticateToken, getMyComplaints);

/**
 * @route   GET /api/v1/complaints/:id
 * @desc    Get comprehensive details of a single complaint with clusters and timeline
 * @access  Public (Open civic transparency)
 */
router.get('/:id', validate(complaintIdParamSchema), getComplaintById);

export default router;
