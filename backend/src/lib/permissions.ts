/**
 * Role-Based Access Control (RBAC) System
 *
 * This module defines permissions and access control logic for the DumbAssets Enhanced application.
 * It implements a flexible permission system based on roles, resources, and actions.
 */

export type UserRole = 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';

export type Resource =
  | 'organization'
  | 'user'
  | 'asset'
  | 'component'
  | 'task'
  | 'api-token'
  | 'file'
  | 'report'
  | 'location'
  | 'asset-template'
  | 'schedule'
  | 'notification'
  | 'audit'
  | 'dashboard'
  | 'backup';

export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage'; // Special action that includes all CRUD operations

export type Permission =
  | `${Action}:${Resource}`
  | `${Action}:${Resource}:own`
  | `${Action}:${Resource}:any`;

/**
 * Permission definition with optional attributes
 */
export interface PermissionDefinition {
  permission: Permission;
  attributes?: string[]; // Allowed attributes, '*' means all, '!field' means exclude field
  conditions?: Record<string, unknown>; // Additional conditions for permission
}

/**
 * Permission check result
 */
export interface PermissionResult {
  granted: boolean;
  attributes: string[];
  message?: string;
}

/**
 * Context for permission checking
 */
export interface PermissionContext {
  userId: string;
  userRole: UserRole;
  organizationId: string;
  resourceOwnerId?: string; // ID of the user who owns the resource
  resourceOrganizationId?: string; // Organization ID of the resource
}

/**
 * Role hierarchy and permissions configuration
 */
export class PermissionManager {
  private static instance: PermissionManager;
  private rolePermissions: Map<UserRole, PermissionDefinition[]> = new Map();
  private roleHierarchy: Map<UserRole, UserRole[]> = new Map();

  private constructor() {
    this.initializePermissions();
  }

  public static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Initialize role permissions and hierarchy
   */
  private initializePermissions(): void {
    // Define role hierarchy (roles inherit permissions from lower roles)
    this.roleHierarchy.set('VIEWER', []);
    this.roleHierarchy.set('MEMBER', ['VIEWER']);
    this.roleHierarchy.set('MANAGER', ['MEMBER', 'VIEWER']);
    this.roleHierarchy.set('OWNER', ['MANAGER', 'MEMBER', 'VIEWER']);

    // VIEWER permissions - read-only access to basic resources
    this.rolePermissions.set('VIEWER', [
      { permission: 'read:asset:any', attributes: ['*', '!purchasePrice', '!receiptPath'] },
      { permission: 'read:component:any', attributes: ['*', '!purchasePrice', '!receiptPath'] },
      { permission: 'read:task:any', attributes: ['*', '!estimatedCost', '!actualCost'] },
      { permission: 'read:organization', attributes: ['id', 'name', 'createdAt'] },
      { permission: 'read:user:any', attributes: ['id', 'email', 'fullName', 'role'] },
      { permission: 'read:file:any', attributes: ['originalFilename', 'mimeType', 'uploadDate'] },
      { permission: 'read:location:any' },
      { permission: 'read:asset-template:any' },
      { permission: 'read:schedule:any' },
      { permission: 'read:notification:own' },
      { permission: 'read:dashboard:any' }, // Viewers can see dashboard
    ]);

    // MEMBER permissions - can manage own resources and create new ones
    this.rolePermissions.set('MEMBER', [
      { permission: 'create:asset:any' },
      { permission: 'update:asset:own' },
      { permission: 'delete:asset:own' },
      { permission: 'create:component:any' },
      { permission: 'update:component:own' },
      { permission: 'delete:component:own' },
      { permission: 'create:task:any' },
      { permission: 'update:task:own' },
      { permission: 'delete:task:own' },
      { permission: 'create:file:any' },
      { permission: 'delete:file:own' },
      { permission: 'read:api-token:own' },
      { permission: 'create:api-token:own' },
      { permission: 'delete:api-token:own' },
      { permission: 'update:user:own', attributes: ['fullName', 'totpEnabled'] },
      { permission: 'create:location:any' },
      { permission: 'update:notification:own', attributes: ['isRead', 'readAt'] },
    ]);

    // MANAGER permissions - can manage most resources for the organization
    this.rolePermissions.set('MANAGER', [
      { permission: 'read:asset:any' },
      { permission: 'update:asset:any' },
      { permission: 'delete:asset:any' },
      { permission: 'read:component:any' },
      { permission: 'update:component:any' },
      { permission: 'delete:component:any' },
      { permission: 'read:task:any' },
      { permission: 'update:task:any' },
      { permission: 'delete:task:any' },
      { permission: 'read:file:any' },
      { permission: 'delete:file:any' },
      { permission: 'update:user:any', attributes: ['fullName', 'role', 'isActive'] },
      { permission: 'read:api-token:any' },
      { permission: 'delete:api-token:any' },
      { permission: 'read:report:any' },
      { permission: 'manage:location:any' },
      { permission: 'manage:asset-template:any' },
      { permission: 'create:schedule:any' },
      { permission: 'update:schedule:any' },
      { permission: 'delete:schedule:any' },
      { permission: 'read:notification:any' },
      { permission: 'create:notification:any' },
      { permission: 'read:audit:any' }, // Managers can view audit trail
    ]);

    // OWNER permissions - full access to all resources
    this.rolePermissions.set('OWNER', [
      { permission: 'manage:organization' },
      { permission: 'create:user:any' },
      { permission: 'delete:user:any' },
      { permission: 'manage:user:any' },
      { permission: 'manage:asset:any' },
      { permission: 'manage:component:any' },
      { permission: 'manage:task:any' },
      { permission: 'manage:file:any' },
      { permission: 'manage:api-token:any' },
      { permission: 'manage:report:any' },
      { permission: 'manage:location:any' },
      { permission: 'manage:asset-template:any' },
      { permission: 'manage:schedule:any' },
      { permission: 'manage:notification:any' },
      { permission: 'manage:audit:any' }, // Owners have full audit access
      { permission: 'manage:dashboard:any' }, // Owners have full dashboard access
      { permission: 'manage:backup:any' }, // Owners have full backup access
    ]);
  }

  /**
   * Check if a user has a specific permission
   */
  public can(
    context: PermissionContext,
    action: Action,
    resource: Resource,
    scope: 'own' | 'any' = 'any',
  ): PermissionResult {
    const permission = `${action}:${resource}:${scope}` as Permission;
    return this.hasPermission(context, permission);
  }

  /**
   * Check if a user has a specific permission string
   */
  public hasPermission(context: PermissionContext, permission: Permission): PermissionResult {
    // Get all permissions for the user's role including inherited ones
    const userPermissions = this.getAllPermissionsForRole(context.userRole);

    // Check for exact permission match
    const exactMatch = userPermissions.find((p) => p.permission === permission);
    if (exactMatch) {
      return this.evaluatePermission(context, exactMatch);
    }

    // Parse permission string
    const [action, resource, scope] = permission.split(':');

    // Check for manage permission (manage:resource includes all CRUD operations)
    const manageScopedPermission = scope
      ? (`manage:${resource}:${scope}` as Permission)
      : (`manage:${resource}` as Permission);
    const manageAnyPermission = `manage:${resource}:any` as Permission;
    const manageBasePermission = `manage:${resource}` as Permission;

    const manageMatch = userPermissions.find(
      (p) =>
        p.permission === manageScopedPermission ||
        p.permission === manageAnyPermission ||
        p.permission === manageBasePermission,
    );
    if (manageMatch) {
      return this.evaluatePermission(context, manageMatch);
    }

    // Check for 'any' scope when 'own' was requested (any includes own)
    if (scope === 'own') {
      const anyPermission = `${action}:${resource}:any` as Permission;
      const anyMatch = userPermissions.find((p) => p.permission === anyPermission);
      if (anyMatch) {
        return this.evaluatePermission(context, anyMatch);
      }
    }

    // Check for base permission when scope is 'any' but only base permission exists
    if (scope === 'any') {
      const basePermission = `${action}:${resource}` as Permission;
      const baseMatch = userPermissions.find((p) => p.permission === basePermission);
      if (baseMatch) {
        return this.evaluatePermission(context, baseMatch);
      }
    }

    return {
      granted: false,
      attributes: [],
      message: `Permission denied: ${permission}`,
    };
  }

  /**
   * Get all permissions for a role including inherited permissions
   */
  public getAllPermissionsForRole(role: UserRole): PermissionDefinition[] {
    const permissions: PermissionDefinition[] = [];
    const visited = new Set<UserRole>();

    const collectPermissions = (currentRole: UserRole): void => {
      if (visited.has(currentRole)) return;
      visited.add(currentRole);

      // Add permissions for current role
      const rolePerms = this.rolePermissions.get(currentRole) || [];
      permissions.push(...rolePerms);

      // Add permissions from inherited roles
      const inheritedRoles = this.roleHierarchy.get(currentRole) || [];
      inheritedRoles.forEach((inheritedRole) => collectPermissions(inheritedRole));
    };

    collectPermissions(role);
    return permissions;
  }

  /**
   * Evaluate a permission definition against the context
   */
  private evaluatePermission(
    context: PermissionContext,
    permissionDef: PermissionDefinition,
  ): PermissionResult {
    const { permission } = permissionDef;
    const [, , scope] = permission.split(':');

    // Check ownership constraints for 'own' scope
    if (scope === 'own') {
      // If resourceOwnerId is provided, check if user owns the resource
      if (context.resourceOwnerId && context.resourceOwnerId !== context.userId) {
        return {
          granted: false,
          attributes: [],
          message: 'Access denied: resource not owned by user',
        };
      }
    }

    // Check organization constraints
    if (
      context.resourceOrganizationId &&
      context.resourceOrganizationId !== context.organizationId
    ) {
      return {
        granted: false,
        attributes: [],
        message: 'Access denied: resource belongs to different organization',
      };
    }

    // Permission granted, return allowed attributes
    return {
      granted: true,
      attributes: permissionDef.attributes || ['*'],
      message: undefined,
    };
  }

  /**
   * Filter object properties based on allowed attributes
   */
  public filterAttributes<T extends Record<string, unknown>>(
    data: T,
    attributes: string[],
  ): Partial<T> {
    if (attributes.includes('*')) {
      // Include all attributes except explicitly excluded ones
      const excluded = attributes
        .filter((attr) => attr.startsWith('!'))
        .map((attr) => attr.substring(1));
      const result: Partial<T> = {};

      Object.keys(data).forEach((key) => {
        if (!excluded.includes(key)) {
          result[key as keyof T] = data[key] as T[keyof T];
        }
      });

      return result;
    } else {
      // Include only explicitly allowed attributes
      const result: Partial<T> = {};

      attributes.forEach((attr) => {
        if (attr in data) {
          result[attr as keyof T] = data[attr] as T[keyof T];
        }
      });

      return result;
    }
  }

  /**
   * Check if a role can assume another role (for role switching)
   */
  public canAssumeRole(currentRole: UserRole, targetRole: UserRole): boolean {
    // Only owners can assume any role
    if (currentRole === 'OWNER') return true;

    // Managers can assume member or viewer roles
    if (currentRole === 'MANAGER' && ['MEMBER', 'VIEWER'].includes(targetRole)) return true;

    // Members can assume viewer role
    if (currentRole === 'MEMBER' && targetRole === 'VIEWER') return true;

    // Users can always assume their own role or lower
    const hierarchy = ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'];
    const currentIndex = hierarchy.indexOf(currentRole);
    const targetIndex = hierarchy.indexOf(targetRole);

    return targetIndex >= currentIndex;
  }

  /**
   * Get available actions for a role on a resource
   */
  public getAvailableActions(role: UserRole, resource: Resource): Action[] {
    const permissions = this.getAllPermissionsForRole(role);
    const actions = new Set<Action>();

    permissions.forEach((perm) => {
      const [action, res] = perm.permission.split(':');
      if (res === resource || perm.permission.startsWith('manage:')) {
        actions.add(action as Action);
      }
    });

    return Array.from(actions);
  }

  /**
   * Get role capabilities summary
   */
  public getRoleCapabilities(role: UserRole): {
    role: UserRole;
    inherits: UserRole[];
    permissions: string[];
    canManage: Resource[];
  } {
    const inherits = this.roleHierarchy.get(role) || [];
    const permissions = this.getAllPermissionsForRole(role);
    const canManage: Resource[] = [];

    permissions.forEach((perm) => {
      if (perm.permission.startsWith('manage:')) {
        const resource = perm.permission.split(':')[1] as Resource;
        canManage.push(resource);
      }
    });

    return {
      role,
      inherits,
      permissions: permissions.map((p) => p.permission),
      canManage,
    };
  }
}

// Export singleton instance
export const permissionManager = PermissionManager.getInstance();

// Convenience functions
export const can = (
  context: PermissionContext,
  action: Action,
  resource: Resource,
  scope: 'own' | 'any' = 'any',
): PermissionResult => permissionManager.can(context, action, resource, scope);

export const hasPermission = (
  context: PermissionContext,
  permission: Permission,
): PermissionResult => permissionManager.hasPermission(context, permission);

export const filterAttributes = <T extends Record<string, unknown>>(
  data: T,
  attributes: string[],
): Partial<T> => permissionManager.filterAttributes(data, attributes);
