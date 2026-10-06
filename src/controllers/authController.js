import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/supabase.js';

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Generate a signed JWT token containing user identity and role
 */
const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is missing.');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      department_id: user.department_id || null,
      name: user.name,
    },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    }
  );
};

/**
 * Register a new user (Citizen, Operator, or Admin)
 * POST /api/v1/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'citizen', department_id = null, phone_number = null } = req.body;

    // 1. Verify if user already exists
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (checkError) {
      return next(checkError);
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists.',
        },
      });
    }

    // 2. If operator or admin specifies department_id, verify existence
    if (department_id) {
      const { data: dept, error: deptError } = await supabaseAdmin
        .from('departments')
        .select('id')
        .eq('id', department_id)
        .maybeSingle();

      if (deptError || !dept) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_DEPARTMENT',
            message: `Department with ID "${department_id}" does not exist.`,
          },
        });
      }
    }

    // 3. Hash password using bcrypt
    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // 4. Insert user into Supabase public.users
    const { data: newUser, error: insertError } = await supabaseAdmin
      .from('users')
      .insert({
        name,
        email,
        password_hash,
        role,
        department_id: role === 'citizen' ? null : department_id,
        phone_number,
      })
      .select('id, name, email, role, department_id, phone_number, created_at')
      .single();

    if (insertError) {
      return next(insertError);
    }

    // 5. Issue JWT
    const token = generateToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        user: newUser,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Authenticate existing user and return JWT
 * POST /api/v1/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Fetch user credentials from Supabase
    const { data: user, error: findError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, password_hash, role, department_id, phone_number, created_at, departments(id, name, priority_level)')
      .eq('email', email)
      .maybeSingle();

    if (findError) {
      return next(findError);
    }

    if (!user || !user.password_hash) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email address or password.',
        },
      });
    }

    // 2. Validate password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email address or password.',
        },
      });
    }

    // 3. Issue JWT
    const token = generateToken(user);

    // 4. Strip sensitive password_hash from response
    const { password_hash, ...safeUserProfile } = user;

    return res.status(200).json({
      success: true,
      message: 'Authentication successful.',
      data: {
        user: safeUserProfile,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Retrieve profile of currently authenticated user
 * GET /api/v1/auth/me
 */
export const me = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'User authentication required.',
        },
      });
    }

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, department_id, phone_number, created_at, updated_at, departments(id, name, contact_email, priority_level)')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      return next(profileError);
    }

    if (!userProfile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User profile not found in database.',
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user: userProfile,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  register,
  login,
  me,
};
