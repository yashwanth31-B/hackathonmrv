import { z } from 'zod';

/**
 * Validation schema for approving an action plan
 * POST /api/v1/operator/action-plans/:id/approve
 */
export const approveActionPlanSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Action plan ID must be a valid UUID' }),
  }),
  body: z.object({
    assigned_department_id: z
      .string()
      .uuid({ message: 'assigned_department_id must be a valid UUID' })
      .optional()
      .nullable(),
    approval_notes: z
      .string()
      .trim()
      .max(1000, { message: 'approval_notes cannot exceed 1000 characters' })
      .optional()
      .nullable(),
    estimated_cost: z
      .number()
      .nonnegative({ message: 'estimated_cost cannot be negative' })
      .optional()
      .nullable(),
  }),
};

/**
 * Validation schema for rejecting an action plan
 * POST /api/v1/operator/action-plans/:id/reject
 */
export const rejectActionPlanSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Action plan ID must be a valid UUID' }),
  }),
  body: z.object({
    rejection_reason: z
      .string({ required_error: 'Rejection reason is required to guide AI replanning' })
      .trim()
      .min(5, { message: 'Rejection reason must be at least 5 characters long' })
      .max(1000, { message: 'Rejection reason cannot exceed 1000 characters' }),
  }),
};

export default {
  approveActionPlanSchema,
  rejectActionPlanSchema,
};
