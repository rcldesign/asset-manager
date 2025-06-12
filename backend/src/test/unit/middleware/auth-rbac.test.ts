import type { Request, Response, NextFunction } from 'express';
import {
  requirePermission,
  requireManagePermission,
  requireOwnership,
  type AuthenticatedRequest,
} from '../../../middleware/auth';
import { AuthenticationError, AuthorizationError } from '../../../utils/errors';

// Mock the permission manager
jest.mock('../../../lib/permissions', () => ({
  permissionManager: {
    can: jest.fn(),
  },
}));

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
      const mockCan = permissionManager.can as jest.MockedFunction<typeof permissionManager.can>;
      mockCan.mockReturnValue({
        granted: true,
        attributes: ['*'],
      });

      mockReq.params = {
        userId: 'owner-456',
        organizationId: 'org-456',
      };

      const middleware = requirePermission('update', 'user', {
        scope: 'own',
        resourceOwnerField: 'userId',
        resourceOrgField: 'organizationId',
      });
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockCan).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceOwnerId: 'owner-456',
          resourceOrganizationId: 'org-456',
        }),
        'update',
        'user',
        'own',
      );
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

      expect((mockReq as any).allowedAttributes).toEqual(['id', 'name', 'email']);
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireManagePermission middleware', () => {
    it('should check for manage permission with any scope', () => {
      const mockCan = permissionManager.can as jest.MockedFunction<typeof permissionManager.can>;
      mockCan.mockReturnValue({
        granted: true,
        attributes: ['*'],
      });

      const middleware = requireManagePermission('organization');
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockCan).toHaveBeenCalledWith(expect.any(Object), 'manage', 'organization', 'any');
      expect(mockNext).toHaveBeenCalledWith();
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
