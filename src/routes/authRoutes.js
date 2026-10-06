import { Router } from 'express';
import { register, login, me } from '../controllers/authController.js';
import { validate } from '../middleware/validate.js';
import { authenticateToken } from '../middleware/auth.js';
import { registerSchema, loginSchema } from '../validators/authValidator.js';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new citizen or operator
 * @access  Public
 */
router.post('/register', validate(registerSchema), register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate user credentials and receive JWT
 * @access  Public
 */
router.post('/login', validate(loginSchema), login);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get profile for currently authenticated user
 * @access  Private (Requires Bearer token)
 */
router.get('/me', authenticateToken, me);

export default router;
