import type { Request, Response, NextFunction } from 'express';

/**
 * Wraps async route handlers to properly catch errors and pass them to Express error handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
