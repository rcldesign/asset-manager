import type { Request, Response, NextFunction } from 'express';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
} from '../utils/errors';
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

// Add a simple utility to redact sensitive keys
function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body;
  }
  const sanitized = { ...body } as Record<string, unknown>;
  const sensitiveKeys = [
    'password',
    'currentPassword',
    'newPassword',
    'token',
    'refreshToken',
    'totpToken',
  ];
  for (const key of sensitiveKeys) {
    if (sanitized[key]) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}

// Create a helper function for Zod errors
function handleZodError(res: Response, error: ZodError): void {
  const fieldErrors = error.issues.map((issue) => {
    const fieldName = issue.path.join('.') || 'field';
    return `${fieldName}: ${issue.message}`;
  });

  res.status(400).json({
    error: `Validation failed: ${fieldErrors.join(', ')}`,
    details: error.issues,
  });
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
    body: sanitizeBody(req.body), // Use the sanitizer here
    headers: req.headers,
  });

  // Handle specific error types - check specific types first, then general AppError
  if (error instanceof ValidationError) {
    // Check if we have detailed issues from Zod validation
    if (error.details && typeof error.details === 'object' && 'issues' in error.details) {
      const details = error.details as { issues: Array<{ path: string; message: string }> };
      if (Array.isArray(details.issues) && details.issues.length > 0) {
        // Create a more descriptive error message that includes field names
        const fieldErrors = details.issues.map((issue) => {
          const fieldName = issue.path || 'field';
          return `${fieldName}: ${issue.message}`;
        });

        res.status(400).json({
          error: `Validation failed: ${fieldErrors.join(', ')}`,
          details: details.issues,
        });
        return;
      }
    }
    // Fallback for non-Zod validation errors
    res.status(400).json({ error: error.message, details: error.details });
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

  // Handle general AppError (must be after specific error types)
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: error.message,
    });
    return;
  }

  // Handle NotFoundError from 404 middleware
  if (
    error.name === 'NotFoundError' &&
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    (error as { statusCode: unknown }).statusCode === 404
  ) {
    res.status(404).json({
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
    return handleZodError(res, error);
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
