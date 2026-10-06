import { Router } from 'express';
import { verifyComplaintResolution } from '../controllers/verificationController.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { verifyComplaintSchema } from '../validators/verificationValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/verification/complaints/:id/verify
 * @desc    Submit citizen/operator verification of a resolved complaint (VERIFY phase)
 *          If verified is false, reopens complaint and triggers autonomous replanning
 * @access  Private (Authenticated Citizen, Operator, or Admin)
 */
router.post(
  '/complaints/:id/verify',
  authenticateToken,
  validate(verifyComplaintSchema),
  verifyComplaintResolution
);

export default router;
