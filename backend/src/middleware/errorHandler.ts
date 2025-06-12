import type { Request, Response, NextFunction } from 'express';
import { ValidationError, AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

// Interface for Prisma errors
interface PrismaError extends Error {
  code: string;
  meta?: {
    target?: string[];
  };
}

// Interface for Zod validation errors
interface ZodError extends Error {
  issues: Array<{
    path: (string | number)[];
    message: string;
    code: string;
  }>;
}

// Type guard for Prisma errors
function isPrismaError(error: unknown): error is PrismaError {
  return error instanceof Error && error.name === 'PrismaClientKnownRequestError';
}

// Type guard for Zod errors
function isZodError(error: unknown): error is ZodError {
  return error instanceof Error && error.name === 'ZodError' && 'issues' in error;
}

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
  if (isPrismaError(error)) {
    if (error.code === 'P2002') {
      // Unique constraint violation
      res.status(400).json({
        error: 'A record with this information already exists',
      });
      return;
    }

    if (error.code === 'P2025') {
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

  // Handle Zod validation errors
  if (isZodError(error)) {
    res.status(400).json({
      error: 'Validation failed',
      details: error.issues,
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
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
