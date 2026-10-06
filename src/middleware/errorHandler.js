/**
 * Custom application error class with HTTP status code and error metadata
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Route Not Found middleware
 */
export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`,
    },
  });
};

/**
 * Centralized error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected internal server error occurred.';
  let details = err.details || null;

  // Handle specific Supabase / PostgreSQL error codes
  if (err.code === '23505') {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'A resource with these unique attributes already exists.';
  } else if (err.code === '23503') {
    statusCode = 400;
    code = 'FOREIGN_KEY_VIOLATION';
    message = 'Referenced entity does not exist.';
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Malformed or invalid JSON Web Token.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired.';
  }

  // Prevent leaking internal stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      ...(isDev && err.stack ? { stack: err.stack } : {}),
    },
  });
};

export default {
  AppError,
  notFoundHandler,
  errorHandler,
};
