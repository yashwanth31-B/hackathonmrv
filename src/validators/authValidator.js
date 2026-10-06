import { z } from 'zod';

/**
 * Registration validation schema
 */
export const registerBodySchema = z.object({
  name: z
    .string({ required_error: 'Full name is required' })
    .trim()
    .min(2, { message: 'Name must be at least 2 characters long' })
    .max(100, { message: 'Name cannot exceed 100 characters' }),
  email: z
    .string({ required_error: 'Email address is required' })
    .trim()
    .email({ message: 'Invalid email address format' })
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(6, { message: 'Password must be at least 6 characters long' })
    .max(128, { message: 'Password cannot exceed 128 characters' }),
  role: z
    .enum(['citizen', 'operator', 'admin'], {
      invalid_type_error: 'Role must be one of: citizen, operator, admin',
    })
    .default('citizen'),
  department_id: z
    .string()
    .uuid({ message: 'department_id must be a valid UUID' })
    .optional()
    .nullable(),
  phone_number: z
    .string()
    .regex(/^[+0-9\s\-()]{7,20}$/, { message: 'Invalid phone number format' })
    .optional()
    .nullable(),
});

export const registerSchema = {
  body: registerBodySchema,
};

/**
 * Login validation schema
 */
export const loginBodySchema = z.object({
  email: z
    .string({ required_error: 'Email address is required' })
    .trim()
    .email({ message: 'Invalid email address format' })
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, { message: 'Password cannot be empty' }),
});

export const loginSchema = {
  body: loginBodySchema,
};

export default {
  registerSchema,
  registerBodySchema,
  loginSchema,
  loginBodySchema,
};
