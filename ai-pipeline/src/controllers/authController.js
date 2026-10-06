import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { supabaseAdmin, dbQuery } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'civicfix_insecure_default_secret';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Validation schemas (Zod)
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password too long'),
  role: z
    .enum(['CITIZEN', 'OPERATOR', 'FIELD_TEAM', 'ADMIN'])
    .optional()
    .default('CITIZEN')
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

// ---------------------------------------------------------------------------
// Token helper
// ---------------------------------------------------------------------------
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
export const register = async (req, res, next) => {
  try {
    // 1. Validate input
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parsed.error.errors
      });
    }

    const { name, email, password, role } = parsed.data;

    // 2. Check for duplicate email
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.'
      });
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // 4. Insert user
    const [newUser] = await dbQuery(
      supabaseAdmin
        .from('users')
        .insert({ name, email, password_hash, role })
        .select('id, name, email, role, created_at')
    );

    // 5. Issue JWT
    const token = signToken(newUser);

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: newUser
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
export const login = async (req, res, next) => {
  try {
    // 1. Validate input
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: parsed.error.errors
      });
    }

    const { email, password } = parsed.data;

    // 2. Fetch user — include password_hash for comparison
    const { data: user, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, password_hash, created_at')
      .eq('email', email)
      .maybeSingle();

    if (fetchError || !user) {
      // Same message for missing user & wrong password — prevents user enumeration
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 3. Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // 4. Issue JWT (never return password_hash)
    const token = signToken(user);
    const { password_hash: _omit, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: safeUser
    });
  } catch (error) {
    next(error);
  }
};

export default { register, login };
