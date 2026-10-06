import { z } from 'zod';

/**
 * Schema for creating a new complaint
 */
export const createComplaintBodySchema = z.object({
  title: z
    .string({ required_error: 'Complaint title is required' })
    .trim()
    .min(3, { message: 'Title must be at least 3 characters long' })
    .max(150, { message: 'Title cannot exceed 150 characters' }),
  description: z
    .string({ required_error: 'Complaint description is required' })
    .trim()
    .min(10, { message: 'Description must be at least 10 characters long' })
    .max(2000, { message: 'Description cannot exceed 2000 characters' }),
  category: z
    .string({ required_error: 'Category is required' })
    .trim()
    .min(2, { message: 'Category must be at least 2 characters long' })
    .max(50, { message: 'Category cannot exceed 50 characters' }),
  latitude: z.coerce
    .number({ required_error: 'Latitude is required' })
    .min(-90, { message: 'Latitude must be between -90 and 90' })
    .max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z.coerce
    .number({ required_error: 'Longitude is required' })
    .min(-180, { message: 'Longitude must be between -180 and 180' })
    .max(180, { message: 'Longitude must be between -180 and 180' }),
  photo_url: z
    .string()
    .trim()
    .url({ message: 'photo_url must be a valid URL' })
    .optional()
    .nullable(),
  address: z
    .string()
    .trim()
    .max(255, { message: 'Address cannot exceed 255 characters' })
    .optional()
    .nullable(),
});

export const createComplaintSchema = {
  body: createComplaintBodySchema,
};

/**
 * Schema for validating complaint ID route parameter
 */
export const complaintIdParamSchema = {
  params: z.object({
    id: z.string().uuid({ message: 'Complaint ID must be a valid UUID' }),
  }),
};

export default {
  createComplaintSchema,
  createComplaintBodySchema,
  complaintIdParamSchema,
};
