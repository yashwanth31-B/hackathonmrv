import { ZodError } from 'zod';

/**
 * Zod request validation wrapper middleware.
 * Supports validating req.body, req.query, and req.params simultaneously or independently.
 *
 * @param {import('zod').ZodSchema | { body?: import('zod').ZodSchema, query?: import('zod').ZodSchema, params?: import('zod').ZodSchema }} schema
 */
export const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Check if schema is a composite schema object containing body, query, or params
      if (schema && (schema.body || schema.query || schema.params)) {
        if (schema.body) {
          req.body = await schema.body.parseAsync(req.body);
        }
        if (schema.query) {
          req.query = await schema.query.parseAsync(req.query);
        }
        if (schema.params) {
          req.params = await schema.params.parseAsync(req.params);
        }
      } else if (schema && typeof schema.parseAsync === 'function') {
        // Fallback: direct schema validates req.body
        req.body = await schema.parseAsync(req.body);
      }

      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          rule: err.code,
        }));

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request payload or query parameters.',
            details: formattedErrors,
          },
        });
      }

      return next(error);
    }
  };
};

export default validate;
