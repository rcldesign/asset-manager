import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { config } from '../config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ZodError } from 'zod';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Log error
  console.error('Error:', err);

  // Handle known error types
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }

  // Handle Prisma errors
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      // Unique constraint violation
      const target = err.meta?.target as string[] | undefined;
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: `Duplicate value for ${target?.join(', ') || 'field'}`,
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      // Record not found
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Record not found',
          timestamp: new Date().toISOString(),
        },
      });
      return;
    }
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors,
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Token expired',
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  // Default error response
  const statusCode =
    'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;

  res.status(statusCode).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'Internal server error' : err.message,
      ...(config.isDevelopment && { stack: err.stack }),
      timestamp: new Date().toISOString(),
    },
  });
}

// Async error wrapper
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
