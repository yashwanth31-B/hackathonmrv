import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';

/**
 * Middleware: Verifies Bearer JWT token and attaches user details to req.user
 * Compatible with custom application JWTs and Supabase Auth JWTs.
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token missing or invalid format. Expected "Bearer <token>".',
        },
      });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    let decoded = null;

    // 1. Attempt verification with custom JWT_SECRET
    if (jwtSecret) {
      try {
        decoded = jwt.verify(token, jwtSecret);
      } catch (err) {
        // If expired or malformed, will fall through to check Supabase auth
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: {
              code: 'TOKEN_EXPIRED',
              message: 'Authentication token has expired. Please log in again.',
            },
          });
        }
      }
    }

    // 2. Fallback: If not verified by custom secret, verify via Supabase Auth
    if (!decoded) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !authData?.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or unverifiable authentication token.',
          },
        });
      }

      // Fetch user profile attributes (role, department_id) from public.users
      const { data: userProfile } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, department_id')
        .eq('id', authData.user.id)
        .single();

      req.user = {
        id: authData.user.id,
        email: authData.user.email,
        role: userProfile?.role || 'citizen',
        department_id: userProfile?.department_id || null,
        name: userProfile?.name || authData.user.user_metadata?.name || 'User',
      };

      return next();
    }

    // 3. User payload extracted from verified custom JWT
    req.user = {
      id: decoded.id || decoded.sub,
      email: decoded.email,
      role: decoded.role || 'citizen',
      department_id: decoded.department_id || decoded.department || null,
      name: decoded.name || null,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};

/**
 * Role-Based Access Control (RBAC) middleware factory
 * @param  {...string} allowedRoles - 'citizen', 'operator', 'admin'
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required prior to role verification.',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Role "${req.user.role}" does not have required permissions: [${allowedRoles.join(', ')}].`,
        },
      });
    }

    next();
  };
};

export default {
  authenticateToken,
  authorizeRoles,
};
