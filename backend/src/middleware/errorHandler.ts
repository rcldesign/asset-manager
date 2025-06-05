import type { Request, Response, NextFunction } from 'express';
import { ValidationError, AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Global error handling middleware
 * Handles all errors thrown in the application and returns appropriate responses
 */
export function errorHandler(error: Error, req: Request, res: Response, _next: NextFunction): void {
  // Log the error
  logger.error('Error in request', error, {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers,
  });

  // Handle specific error types
  if (error instanceof ValidationError) {
    res.status(400).json({
      error: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof AuthenticationError) {
    res.status(401).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof AuthorizationError) {
    res.status(403).json({
      error: error.message,
    });
    return;
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;

    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      res.status(400).json({
        error: 'A record with this information already exists',
      });
      return;
    }

    if (prismaError.code === 'P2025') {
      // Record not found
      res.status(404).json({
        error: 'Record not found',
      });
      return;
    }

    // Other Prisma errors
    res.status(400).json({
      error: 'Database operation failed',
    });
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: 'Invalid token',
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      error: 'Token expired',
    });
    return;
  }

  // Handle rate limiting errors
  if (error.message?.includes('Too many requests')) {
    res.status(429).json({
      error: error.message,
    });
    return;
  }

  // Handle validation errors from express-validator or similar
  if (error.name === 'ValidationError' && 'errors' in error) {
    res.status(400).json({
      error: 'Validation failed',
      details: (error as any).errors,
    });
    return;
  }

  // Default error response
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
  });
}

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.url} not found`,
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass them to error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
