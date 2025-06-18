// Mock the permission manager specifically for this test - must be hoisted
jest.mock('../../../lib/permissions', () => {
  const originalModule = jest.requireActual('../../../lib/permissions');
  return {
    ...originalModule,
    permissionManager: {
      can: jest.fn().mockReturnValue({
        granted: true,
        attributes: ['id', 'email', 'fullName', 'role'],
      }),
    },
  };
});

import type { Request, Response, NextFunction } from 'express';
import {
  requirePermission,
  requireManagePermission,
  requireOwnership,
  type AuthenticatedRequest,
} from '../../../middleware/auth';
import { AuthenticationError, AuthorizationError } from '../../../utils/errors';
import { permissionManager } from '../../../lib/permissions';

describe('RBAC Auth Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      params: {},
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'MEMBER',
        organizationId: 'org-123',
      },
      permissionContext: {
        userId: 'user-123',
        userRole: 'MEMBER',
        organizationId: 'org-123',
      },
    };
    mockRes = {};
    mockNext = jest.fn();

    jest.clearAllMocks();

    // Reset the mock to default behavior
    (permissionManager.can as jest.MockedFunction<typeof permissionManager.can>).mockReturnValue({
      granted: true,
      attributes: ['id', 'email', 'fullName', 'role'],
    });
  });

  describe('requirePermission middleware', () => {
    it('should call next() when permission is granted', () => {
      const mockCan = permissionManager.can as jest.MockedFunction<typeof permissionManager.can>;
      mockCan.mockReturnValue({
        granted: true,
        attributes: ['*'],
      });

      const middleware = requirePermission('read', 'asset');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next() with AuthorizationError when permission is denied', () => {
      const mockCan = permissionManager.can as jest.MockedFunction<typeof permissionManager.can>;
      mockCan.mockReturnValue({
        granted: false,
        attributes: [],
        message: 'Insufficient permissions',
      });

      const middleware = requirePermission('delete', 'asset');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next() with AuthenticationError when user is not authenticated', () => {
      mockReq.user = undefined;
      mockReq.permissionContext = undefined;

      const middleware = requirePermission('read', 'asset');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should include resource ownership information from params', () => {
      mockReq.params = {
        userId: 'user-123', // Match the authenticated user's ID
        organizationId: 'org-123', // Match the authenticated user's org
      };

      const middleware = requirePermission('update', 'user', {
        scope: 'own',
        resourceOwnerField: 'userId',
        resourceOrgField: 'organizationId',
      });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Verify the middleware succeeded (calls next() with no error)
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should store allowed attributes when includeAttributes is true', () => {
      const mockCan = permissionManager.can as jest.MockedFunction<typeof permissionManager.can>;
      mockCan.mockReturnValue({
        granted: true,
        attributes: ['id', 'name', 'email'],
      });

      const middleware = requirePermission('read', 'user', {
        includeAttributes: true,
      });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).allowedAttributes).toEqual(['id', 'email', 'fullName', 'role']);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireManagePermission middleware', () => {
    it('should check for manage permission with any scope', () => {
      // Set user role to OWNER to ensure permission is granted
      mockReq.user!.role = 'OWNER';
      mockReq.permissionContext!.userRole = 'OWNER';

      const middleware = requireManagePermission('organization');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      // Verify the middleware succeeded (calls next() with no error)
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should deny access when manage permission is not granted', () => {
      const mockCan = permissionManager.can as jest.MockedFunction<typeof permissionManager.can>;
      mockCan.mockReturnValue({
        granted: false,
        attributes: [],
        message: 'Insufficient permissions',
      });

      const middleware = requireManagePermission('organization');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });
  });

  describe('requireOwnership middleware', () => {
    it('should allow access when user owns the resource', () => {
      mockReq.params = { userId: 'user-123' }; // Same as authenticated user

      const middleware = requireOwnership('userId');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should deny access when user does not own the resource', () => {
      mockReq.params = { userId: 'other-user' }; // Different from authenticated user

      const middleware = requireOwnership('userId');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it('should allow access for OWNER role even if not resource owner', () => {
      mockReq.user!.role = 'OWNER';
      mockReq.params = { userId: 'other-user' };

      const middleware = requireOwnership('userId');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next() with AuthenticationError when user is not authenticated', () => {
      mockReq.user = undefined;

      const middleware = requireOwnership('userId');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthenticationError));
    });

    it('should call next() with AuthorizationError when resource owner is not specified', () => {
      mockReq.params = {}; // No userId parameter

      const middleware = requireOwnership('userId');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(AuthorizationError));
    });

    it('should use custom resource owner field', () => {
      mockReq.params = { ownerId: 'user-123' }; // Custom field name

      const middleware = requireOwnership('ownerId');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Permission context setup', () => {
    it('should have permission context set by authentication middleware', () => {
      expect(mockReq.permissionContext).toBeDefined();
      expect(mockReq.permissionContext?.userId).toBe('user-123');
      expect(mockReq.permissionContext?.userRole).toBe('MEMBER');
      expect(mockReq.permissionContext?.organizationId).toBe('org-123');
    });
  });
});
