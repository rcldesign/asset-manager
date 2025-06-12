import { permissionManager, type PermissionContext } from '../../../lib/permissions';

describe('PermissionManager', () => {
  const baseContext: PermissionContext = {
    userId: 'user-123',
    userRole: 'MEMBER',
    organizationId: 'org-123',
  };

  describe('Basic Permission Checks', () => {
    it('should grant VIEWER read permissions for assets', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'VIEWER' };
      const result = permissionManager.can(context, 'read', 'asset', 'any');

      expect(result.granted).toBe(true);
      expect(result.attributes).toEqual(['*', '!purchasePrice', '!receiptPath']);
    });

    it('should deny VIEWER write permissions for assets', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'VIEWER' };
      const result = permissionManager.can(context, 'create', 'asset', 'any');

      expect(result.granted).toBe(false);
    });

    it('should grant MEMBER create permissions for assets', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'MEMBER' };
      const result = permissionManager.can(context, 'create', 'asset', 'any');

      expect(result.granted).toBe(true);
    });

    it('should grant MANAGER read permissions for all assets', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'MANAGER' };
      const result = permissionManager.can(context, 'read', 'asset', 'any');

      expect(result.granted).toBe(true);
      expect(result.attributes).toEqual(['*']);
    });

    it('should grant OWNER manage permissions for all resources', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'OWNER' };
      const result = permissionManager.can(context, 'manage', 'organization');

      expect(result.granted).toBe(true);
    });
  });

  describe('Scope-based Permissions', () => {
    it('should allow MEMBER to update own assets', () => {
      const context: PermissionContext = {
        ...baseContext,
        userRole: 'MEMBER',
        resourceOwnerId: 'user-123', // Same as userId
      };
      const result = permissionManager.can(context, 'update', 'asset', 'own');

      expect(result.granted).toBe(true);
    });

    it('should deny MEMBER to update others assets', () => {
      const context: PermissionContext = {
        ...baseContext,
        userRole: 'MEMBER',
        resourceOwnerId: 'other-user', // Different from userId
      };
      const result = permissionManager.can(context, 'update', 'asset', 'own');

      expect(result.granted).toBe(false);
      expect(result.message).toContain('not owned by user');
    });

    it('should allow MANAGER to update any assets', () => {
      const context: PermissionContext = {
        ...baseContext,
        userRole: 'MANAGER',
        resourceOwnerId: 'other-user',
      };
      const result = permissionManager.can(context, 'update', 'asset', 'any');

      expect(result.granted).toBe(true);
    });
  });

  describe('Organization Constraints', () => {
    it('should deny access to resources from different organization', () => {
      const context: PermissionContext = {
        ...baseContext,
        userRole: 'MANAGER',
        resourceOrganizationId: 'other-org',
      };
      const result = permissionManager.can(context, 'read', 'asset', 'any');

      expect(result.granted).toBe(false);
      expect(result.message).toContain('different organization');
    });

    it('should allow access to resources from same organization', () => {
      const context: PermissionContext = {
        ...baseContext,
        userRole: 'MANAGER',
        resourceOrganizationId: 'org-123', // Same as organizationId
      };
      const result = permissionManager.can(context, 'read', 'asset', 'any');

      expect(result.granted).toBe(true);
    });
  });

  describe('Role Hierarchy', () => {
    it('should inherit permissions from lower roles', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'MANAGER' };

      // MANAGER should have VIEWER permissions
      const viewerResult = permissionManager.can(context, 'read', 'asset', 'any');
      expect(viewerResult.granted).toBe(true);

      // MANAGER should have MEMBER permissions
      const memberResult = permissionManager.can(context, 'create', 'asset', 'any');
      expect(memberResult.granted).toBe(true);
    });

    it('should allow role assumption down the hierarchy', () => {
      expect(permissionManager.canAssumeRole('OWNER', 'MANAGER')).toBe(true);
      expect(permissionManager.canAssumeRole('OWNER', 'VIEWER')).toBe(true);
      expect(permissionManager.canAssumeRole('MANAGER', 'MEMBER')).toBe(true);
      expect(permissionManager.canAssumeRole('MEMBER', 'VIEWER')).toBe(true);
    });

    it('should deny role assumption up the hierarchy', () => {
      expect(permissionManager.canAssumeRole('VIEWER', 'MEMBER')).toBe(false);
      expect(permissionManager.canAssumeRole('MEMBER', 'MANAGER')).toBe(false);
      expect(permissionManager.canAssumeRole('MANAGER', 'OWNER')).toBe(false);
    });
  });

  describe('Manage Permissions', () => {
    it('should treat manage as including all CRUD operations', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'OWNER' };

      // OWNER has manage:asset, so should be able to do any action
      expect(permissionManager.can(context, 'create', 'asset').granted).toBe(true);
      expect(permissionManager.can(context, 'read', 'asset').granted).toBe(true);
      expect(permissionManager.can(context, 'update', 'asset').granted).toBe(true);
      expect(permissionManager.can(context, 'delete', 'asset').granted).toBe(true);
    });
  });

  describe('Attribute Filtering', () => {
    it('should filter attributes with wildcard and exclusions', () => {
      const data = {
        id: '123',
        name: 'Test Asset',
        purchasePrice: 100.0,
        description: 'Test description',
        receiptPath: '/path/to/receipt',
      };

      const attributes = ['*', '!purchasePrice', '!receiptPath'];
      const filtered = permissionManager.filterAttributes(data, attributes);

      expect(filtered).toEqual({
        id: '123',
        name: 'Test Asset',
        description: 'Test description',
      });
    });

    it('should filter attributes with explicit inclusion', () => {
      const data = {
        id: '123',
        name: 'Test Asset',
        purchasePrice: 100.0,
        description: 'Test description',
        receiptPath: '/path/to/receipt',
      };

      const attributes = ['id', 'name'];
      const filtered = permissionManager.filterAttributes(data, attributes);

      expect(filtered).toEqual({
        id: '123',
        name: 'Test Asset',
      });
    });
  });

  describe('Role Capabilities', () => {
    it('should return correct capabilities for VIEWER', () => {
      const capabilities = permissionManager.getRoleCapabilities('VIEWER');

      expect(capabilities.role).toBe('VIEWER');
      expect(capabilities.inherits).toEqual([]);
      expect(capabilities.canManage).toEqual([]);
      expect(capabilities.permissions).toContain('read:asset:any');
    });

    it('should return correct capabilities for OWNER', () => {
      const capabilities = permissionManager.getRoleCapabilities('OWNER');

      expect(capabilities.role).toBe('OWNER');
      expect(capabilities.inherits).toEqual(['MANAGER', 'MEMBER', 'VIEWER']);
      expect(capabilities.canManage).toContain('organization');
      expect(capabilities.canManage).toContain('user');
    });

    it('should return available actions for role on resource', () => {
      const viewerActions = permissionManager.getAvailableActions('VIEWER', 'asset');
      expect(viewerActions).toContain('read');
      expect(viewerActions).not.toContain('create');

      const ownerActions = permissionManager.getAvailableActions('OWNER', 'asset');
      expect(ownerActions).toContain('manage');
    });
  });

  describe('Permission String Validation', () => {
    it('should handle permission strings with scope', () => {
      const result = permissionManager.hasPermission(baseContext, 'read:asset:any');
      expect(result.granted).toBe(true);
    });

    it('should handle permission strings without scope', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'OWNER' };
      const result = permissionManager.hasPermission(context, 'manage:organization');
      expect(result.granted).toBe(true);
    });

    it('should fall back from own to any scope', () => {
      const context: PermissionContext = { ...baseContext, userRole: 'MANAGER' };
      const result = permissionManager.hasPermission(context, 'read:asset:own');

      // MANAGER has read:asset:any, which should satisfy read:asset:own
      expect(result.granted).toBe(true);
    });
  });
});
