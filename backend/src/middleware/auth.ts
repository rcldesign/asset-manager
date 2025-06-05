import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { UserService } from '../services/user.service';
import { AuthenticationError, AuthorizationError } from '../utils/errors';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
  };
}

const userService = new UserService();

export async function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    // Verify user still exists and is active
    const user = await userService.getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export async function authenticateApiToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const user = await userService.verifyApiToken(token);

    if (!user) {
      throw new AuthenticationError('Invalid API token');
    }

    (req as AuthenticatedRequest).user = {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    if (!allowedRoles.includes(authenticatedReq.user.role)) {
      next(new AuthorizationError('Insufficient permissions'));
      return;
    }

    next();
  };
}

export function requireOrganizationAccess(req: Request, _res: Response, next: NextFunction): void {
  const authenticatedReq = req as AuthenticatedRequest;
  const organizationId = req.params.organizationId;

  if (!authenticatedReq.user) {
    next(new AuthenticationError('Authentication required'));
    return;
  }

  if (organizationId && authenticatedReq.user.organizationId !== organizationId) {
    next(new AuthorizationError('Access denied to this organization'));
    return;
  }

  next();
}
