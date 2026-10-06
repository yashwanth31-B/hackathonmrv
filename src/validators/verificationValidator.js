import { z } from 'zod';

/**
 * Validation schema for citizen resolution verification
 * POST /api/v1/verification/complaints/:id/verify
 */
export const verifyComplaintSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Complaint ID must be a valid UUID' }),
  }),
  body: z.object({
    verified: z.boolean({ required_error: 'Verification status (verified: true/false) is required' }),
    evidence_photo: z
      .string()
      .trim()
      .url({ message: 'evidence_photo must be a valid URL' })
      .optional()
      .nullable(),
    feedback: z
      .string()
      .trim()
      .max(1000, { message: 'feedback cannot exceed 1000 characters' })
      .optional()
      .nullable(),
    ai_vision_confidence: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .nullable(),
    ai_notes: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .nullable(),
  }),
};

export default {
  verifyComplaintSchema,
};
