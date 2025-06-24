import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { UserService } from '../services/user.service';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import {
  permissionManager,
  type UserRole,
  type Action,
  type Resource,
  type PermissionContext,
} from '../lib/permissions';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
    organizationId: string;
    sessionId?: string;
    tokenId?: string;
  };
  permissionContext?: PermissionContext;
}

// Track failed authentication attempts
const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();

// Clean up old failed attempt records
let cleanupInterval: NodeJS.Timeout | undefined;

// Only start cleanup interval if not in test environment
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(
    () => {
      const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
      for (const [key, attempt] of failedAttempts.entries()) {
        if (attempt.lastAttempt < cutoff) {
          failedAttempts.delete(key);
        }
      }
    },
    10 * 60 * 1000,
  ); // Run every 10 minutes
}

// Export for testing purposes to reset state between tests
export const _test_only_resetFailedAttempts = (): void => {
  failedAttempts.clear();
};

// Export for testing purposes to stop the interval timer
export const _test_only_stopCleanupInterval = (): void => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = undefined;
  }
};

const userService = new UserService();

/**
 * JWT authentication middleware
 * Validates Bearer token from Authorization header and sets user context
 * @param req - Express request object
 * @param _res - Express response object (unused)
 * @param next - Express next function
 * @throws {AuthenticationError} When token is missing, invalid, or user is inactive
 */
export async function authenticateJWT(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const clientId = req.ip || 'unknown';

  try {
    // Check for too many failed attempts
    const attempts = failedAttempts.get(clientId);
    if (attempts && attempts.count >= 10 && Date.now() - attempts.lastAttempt < 60 * 60 * 1000) {
      throw new AuthenticationError('Too many failed authentication attempts');
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    // Additional token format validation
    if (token.length < 10 || token.length > 2048) {
      throw new AuthenticationError('Invalid token format');
    }

    const payload = verifyAccessToken(token);

    // Verify user still exists and is active
    const user = await userService.getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Verify organization consistency
    if (user.organizationId !== payload.organizationId) {
      throw new AuthenticationError('Organization mismatch');
    }

    // Reset failed attempts on successful authentication
    failedAttempts.delete(clientId);

    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      organizationId: user.organizationId,
      tokenId: payload.jti,
    };

    // Set up permission context for easy access
    authenticatedReq.permissionContext = {
      userId: user.id,
      userRole: user.role as UserRole,
      organizationId: user.organizationId,
    };

    next();
  } catch (error) {
    // Track failed attempts
    const attempts = failedAttempts.get(clientId) || { count: 0, lastAttempt: 0 };
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    failedAttempts.set(clientId, attempts);

    next(error);
  }
}

/**
 * API token authentication middleware
 * Validates API token from Authorization header and sets user context
 * @param req - Express request object
 * @param _res - Express response object (unused)
 * @param next - Express next function
 * @throws {AuthenticationError} When token is missing, invalid, or user is inactive
 */
export async function authenticateApiToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const clientId = req.ip || 'unknown';

  try {
    // Check for too many failed attempts
    const attempts = failedAttempts.get(clientId);
    if (attempts && attempts.count >= 10 && Date.now() - attempts.lastAttempt < 60 * 60 * 1000) {
      throw new AuthenticationError('Too many failed authentication attempts');
    }

    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);

    // Additional token format validation for API tokens
    if (token.length < 32 || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
      throw new AuthenticationError('Invalid API token format');
    }

    const user = await userService.validateApiToken(token);

    if (!user) {
      throw new AuthenticationError('Invalid API token');
    }

    // Reset failed attempts on successful authentication
    failedAttempts.delete(clientId);

    const authenticatedReq = req as AuthenticatedRequest;
    authenticatedReq.user = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      organizationId: user.organizationId,
    };

    // Set up permission context for easy access
    authenticatedReq.permissionContext = {
      userId: user.id,
      userRole: user.role as UserRole,
      organizationId: user.organizationId,
    };

    next();
  } catch (error) {
    // Track failed attempts
    const attempts = failedAttempts.get(clientId) || { count: 0, lastAttempt: 0 };
    attempts.count += 1;
    attempts.lastAttempt = Date.now();
    failedAttempts.set(clientId, attempts);

    next(error);
  }
}

/**
 * Role-based authorization middleware factory
 * Creates middleware that requires user to have one of the specified roles
 * @param allowedRoles - Array of roles that are allowed to access the resource
 * @returns Express middleware function
 * @throws {AuthenticationError} When user is not authenticated
 * @throws {AuthorizationError} When user doesn't have required role
 */
export function requireRole(...allowedRoles: UserRole[]) {
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

/**
 * Combined authentication middleware that supports both JWT and API tokens
 * Inspects the token format to decide which authentication strategy to use
 * @param req - Express request object
 * @param res - Express response object (unused)
 * @param next - Express next function
 * @throws {AuthenticationError} When token is missing, invalid, or user is inactive
 */
export function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  // If no header, default to JWT logic which will produce the correct error
  if (!authHeader?.startsWith('Bearer ')) {
    void authenticateJWT(req, res, next);
    return;
  }

  const token = authHeader.substring(7);

  // Heuristic: JWTs contain dots. API tokens in this system are pure hex
  if (token.includes('.')) {
    void authenticateJWT(req, res, next);
  } else {
    void authenticateApiToken(req, res, next);
  }
}

/**
 * Enhanced permission-based authorization middleware
 */
/**
 * Permission-based authorization middleware factory
 * Creates middleware that checks if user has permission to perform action on resource
 * @param action - The action being performed (create, read, update, delete, manage)
 * @param resource - The resource type being accessed
 * @param options - Configuration options for permission checking
 * @param options.scope - Whether to check 'own' or 'any' scope permissions
 * @param options.resourceOwnerField - Field in req.params containing resource owner ID
 * @param options.resourceOrgField - Field in req.params containing resource organization ID
 * @param options.includeAttributes - Whether to include allowed attributes in response
 * @returns Express middleware function
 * @throws {AuthenticationError} When user is not authenticated
 * @throws {AuthorizationError} When user doesn't have required permission
 */
export function requirePermission(
  action: Action,
  resource: Resource,
  options: {
    scope?: 'own' | 'any';
    resourceOwnerField?: string; // Field in req.params that contains resource owner ID
    resourceOrgField?: string; // Field in req.params that contains resource organization ID
    includeAttributes?: boolean; // Whether to include allowed attributes in response
  } = {},
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.user || !authenticatedReq.permissionContext) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    // Create permission context with resource ownership info
    const context: PermissionContext = {
      ...authenticatedReq.permissionContext,
    };

    // Add resource ownership information if provided
    if (options.resourceOwnerField && req.params[options.resourceOwnerField]) {
      context.resourceOwnerId = req.params[options.resourceOwnerField];
    }

    if (options.resourceOrgField && req.params[options.resourceOrgField]) {
      context.resourceOrganizationId = req.params[options.resourceOrgField];
    }

    // Check permission
    const result = permissionManager.can(context, action, resource, options.scope);

    if (!result.granted) {
      next(new AuthorizationError(result.message || 'Insufficient permissions'));
      return;
    }

    // Store allowed attributes for use in route handlers
    if (options.includeAttributes) {
      (req as AuthenticatedRequest & { allowedAttributes?: string[] }).allowedAttributes =
        result.attributes;
    }

    next();
  };
}

/**
 * Middleware to check if user can manage a specific resource type
 */
/**
 * Middleware factory for requiring manage permissions on a resource
 * Shorthand for requirePermission('manage', resource, { scope: 'any' })
 * @param resource - The resource type that requires manage permissions
 * @returns Express middleware function
 */
export function requireManagePermission(
  resource: Resource,
): (req: Request, res: Response, next: NextFunction) => void {
  return requirePermission('manage', resource, { scope: 'any' });
}

/**
 * Middleware to check ownership of a resource
 */
/**
 * Ownership-based authorization middleware factory
 * Creates middleware that ensures user owns the resource or has OWNER role
 * @param resourceOwnerField - Field name in req.params containing the resource owner ID (defaults to 'userId')
 * @returns Express middleware function
 * @throws {AuthenticationError} When user is not authenticated
 * @throws {AuthorizationError} When user doesn't own the resource and isn't an OWNER
 */
export function requireOwnership(resourceOwnerField: string = 'userId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const authenticatedReq = req as AuthenticatedRequest;

    if (!authenticatedReq.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    const resourceOwnerId = req.params[resourceOwnerField];
    if (!resourceOwnerId) {
      next(new AuthorizationError('Resource owner not specified'));
      return;
    }

    if (resourceOwnerId !== authenticatedReq.user.id && authenticatedReq.user.role !== 'OWNER') {
      next(new AuthorizationError('Access denied: resource not owned by user'));
      return;
    }

    next();
  };
}

/**
 * Organization access control middleware
 * Ensures user can only access resources within their organization
 * @param req - Express request object (should contain organizationId in params)
 * @param _res - Express response object (unused)
 * @param next - Express next function
 * @throws {AuthenticationError} When user is not authenticated
 * @throws {AuthorizationError} When user tries to access different organization
 */
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
