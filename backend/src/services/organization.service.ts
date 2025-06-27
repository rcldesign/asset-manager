import type { Organization, User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/errors';
import { UserService } from './user.service';
import bcrypt from 'bcrypt';

export interface CreateOrganizationData {
  name: string;
  ownerEmail: string;
  ownerPassword?: string;
  ownerFullName?: string;
}

export interface UpdateOrganizationData {
  name?: string;
}

/**
 * Service for managing organizations and their relationships with users.
 * Handles organization lifecycle, ownership transfers, and member management.
 * Organizations are the top-level entity for multi-tenancy.
 *
 * @class OrganizationService
 */
export class OrganizationService {
  /**
   * Create a new organization without an owner.
   * Used for system-level organization creation.
   *
   * @param {Object} data - Organization creation data
   * @param {string} data.name - Organization name
   * @returns {Promise<Organization>} The created organization
   *
   * @example
   * const org = await organizationService.createOrganization({
   *   name: 'Acme Corporation'
   * });
   */
  async createOrganization(data: { name: string }): Promise<Organization> {
    return prisma.organization.create({
      data: { name: data.name },
    });
  }

  /**
   * Create a new organization with an owner user in a single transaction.
   * This is the primary method for organization creation in the application.
   *
   * @param {CreateOrganizationData} data - Organization and owner creation data
   * @returns {Promise<Object>} Object containing created organization and owner user
   * @throws {AppError} When email is already in use (409)
   *
   * @example
   * const { organization, owner } = await organizationService.create({
   *   name: 'Tech Startup Inc',
   *   ownerEmail: 'founder@techstartup.com',
   *   ownerPassword: 'SecurePass123!',
   *   ownerFullName: 'Jane Smith'
   * });
   */
  async create(data: CreateOrganizationData): Promise<{
    organization: Organization;
    owner: User;
  }> {
    const { name, ownerEmail, ownerPassword, ownerFullName } = data;

    // Check if email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: ownerEmail.toLowerCase() },
    });

    if (existingUser) {
      throw new AppError('Email is already in use', 409);
    }

    // Create organization and owner in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create organization without owner first
      const organization = await tx.organization.create({
        data: { name },
      });

      // Create owner user
      const owner = await tx.user.create({
        data: {
          email: ownerEmail.toLowerCase(),
          passwordHash: ownerPassword ? await hashPassword(ownerPassword) : null,
          fullName: ownerFullName,
          role: UserRole.OWNER,
          organizationId: organization.id,
          emailVerified: false,
          isActive: true,
        },
      });

      // Update organization with owner reference
      const updatedOrganization = await tx.organization.update({
        where: { id: organization.id },
        data: { ownerUserId: owner.id },
      });

      return { organization: updatedOrganization, owner };
    });

    return result;
  }

  /**
   * Find an organization by its ID with related data.
   * Includes owner information and entity counts.
   *
   * @param {string} id - Organization ID to search for
   * @returns {Promise<Organization | null>} Organization with owner and counts, or null if not found
   *
   * @example
   * const org = await organizationService.getOrganizationById('org-123');
   * if (org) {
   *   console.log(`${org.name} has ${org._count.users} users`);
   * }
   */
  async getOrganizationById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({
      where: { id },
      include: {
        owner: true,
        _count: {
          select: {
            users: true,
            assets: true,
            tasks: true,
          },
        },
      },
    });
  }

  /**
   * Find all organizations with pagination and search (admin only).
   * Searches in organization name and owner email.
   *
   * @param {Object} [options] - Query options
   * @param {number} [options.skip] - Number of records to skip for pagination
   * @param {number} [options.take] - Number of records to take for pagination
   * @param {string} [options.search] - Search term to filter by name or owner email
   * @returns {Promise<Object>} Organizations array and total count
   *
   * @example
   * const { organizations, total } = await organizationService.findAll({
   *   skip: 0,
   *   take: 20,
   *   search: 'tech'
   * });
   * console.log(`Found ${total} organizations`);
   */
  async findAll(options?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<{ organizations: Organization[]; total: number }> {
    const where = options?.search
      ? {
          OR: [
            { name: { contains: options.search, mode: 'insensitive' as const } },
            { owner: { email: { contains: options.search, mode: 'insensitive' as const } } },
          ],
        }
      : {};

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip: options?.skip,
        take: options?.take,
        include: {
          owner: true,
          _count: {
            select: {
              users: true,
              assets: true,
              tasks: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organization.count({ where }),
    ]);

    return { organizations, total };
  }

  /**
   * Update an organization's data.
   * Currently only supports name updates.
   *
   * @param {string} id - Organization ID to update
   * @param {UpdateOrganizationData} data - Update data
   * @returns {Promise<Organization>} The updated organization with counts
   * @throws {AppError} When organization is not found (404)
   *
   * @example
   * const updated = await organizationService.updateOrganization(
   *   'org-123',
   *   { name: 'New Company Name' }
   * );
   */
  async updateOrganization(id: string, data: UpdateOrganizationData): Promise<Organization> {
    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    return prisma.organization.update({
      where: { id },
      data,
      include: {
        owner: true,
        _count: {
          select: {
            users: true,
            assets: true,
            tasks: true,
          },
        },
      },
    });
  }

  /**
   * Delete an organization and all its related data (cascade delete).
   * This is a destructive operation that removes all users, assets, tasks, etc.
   *
   * @param {string} id - Organization ID to delete
   * @returns {Promise<void>}
   * @throws {AppError} When organization is not found (404)
   *
   * @example
   * await organizationService.deleteOrganization('org-123');
   * // All related data is permanently deleted
   */
  async deleteOrganization(id: string): Promise<void> {
    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    // Delete organization (cascade will handle related data)
    await prisma.organization.delete({
      where: { id },
    });
  }

  /**
   * Get comprehensive statistics for an organization.
   * Provides aggregated data for dashboards and reporting.
   *
   * @param {string} id - Organization ID
   * @returns {Promise<Object>} Statistics object with:
   *   - totalUsers: Total user count
   *   - activeUsers: Active user count
   *   - totalAssets: Total asset count
   *   - totalTasks: Total task count
   *   - tasksByStatus: Task counts grouped by status
   *   - usersByRole: User counts grouped by role
   *   - organizationAge: Age in days since creation
   * @throws {AppError} When organization is not found (404)
   *
   * @example
   * const stats = await organizationService.getStatistics('org-123');
   * console.log(`Organization is ${stats.organizationAge} days old`);
   * console.log(`Active users: ${stats.activeUsers}/${stats.totalUsers}`);
   */
  async getStatistics(id: string): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalAssets: number;
    totalTasks: number;
    tasksByStatus: Record<string, number>;
    usersByRole: Record<string, number>;
    organizationAge: number;
  }> {
    const organization = await prisma.organization.findUnique({
      where: { id },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    const [totalUsers, activeUsers, totalAssets, totalTasks, tasksByStatus, usersByRole] =
      await Promise.all([
        prisma.user.count({ where: { organizationId: id } }),
        prisma.user.count({ where: { organizationId: id, isActive: true } }),
        prisma.asset.count({ where: { organizationId: id } }),
        prisma.task.count({ where: { organizationId: id } }),
        prisma.task.groupBy({
          by: ['status'],
          where: { organizationId: id },
          _count: true,
        }),
        prisma.user.groupBy({
          by: ['role'],
          where: { organizationId: id },
          _count: true,
        }),
      ]);

    // Calculate organization age in days
    const organizationAge = Math.floor(
      (Date.now() - organization.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      totalUsers,
      activeUsers,
      totalAssets,
      totalTasks,
      tasksByStatus: tasksByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      usersByRole: usersByRole.reduce(
        (acc, item) => {
          acc[item.role] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      organizationAge,
    };
  }

  /**
   * Transfer organization ownership from current owner to another user.
   * Old owner becomes a manager, new owner gets owner role.
   *
   * @param {string} organizationId - ID of the organization
   * @param {string} newOwnerId - ID of the user to become the new owner
   * @param {string} currentOwnerId - ID of the current owner (for verification)
   * @returns {Promise<Organization>} The updated organization
   * @throws {AppError} When organization not found (404), not current owner (403), or new owner not found (404)
   *
   * @example
   * const updated = await organizationService.transferOwnership(
   *   'org-123',
   *   'user-456',  // new owner
   *   'user-789'   // current owner
   * );
   */
  async transferOwnership(
    organizationId: string,
    newOwnerId: string,
    currentOwnerId: string,
  ): Promise<Organization> {
    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { owner: true },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    // Verify current owner
    if (organization.ownerUserId !== currentOwnerId) {
      throw new AppError('Only the current owner can transfer ownership', 403);
    }

    // Verify new owner exists and belongs to the organization
    const newOwner = await prisma.user.findFirst({
      where: {
        id: newOwnerId,
        organizationId: organizationId,
      },
    });

    if (!newOwner) {
      throw new AppError('New owner not found in organization', 404);
    }

    // Transfer ownership in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update new owner role to OWNER
      await tx.user.update({
        where: { id: newOwnerId },
        data: { role: UserRole.OWNER },
      });

      // Update old owner role to MANAGER
      await tx.user.update({
        where: { id: currentOwnerId },
        data: { role: UserRole.MANAGER },
      });

      // Update organization owner
      return tx.organization.update({
        where: { id: organizationId },
        data: { ownerUserId: newOwnerId },
        include: {
          owner: true,
          _count: {
            select: {
              users: true,
              assets: true,
              tasks: true,
            },
          },
        },
      });
    });

    return result;
  }

  /**
   * Set a user as the organization owner (internal use).
   * Used for administrative operations or data migrations.
   *
   * @param {string} organizationId - ID of the organization
   * @param {string} userId - ID of the user to set as owner
   * @returns {Promise<void>}
   * @throws {AppError} When organization not found (404) or user not found (404)
   * @private
   */
  async setOwner(organizationId: string, userId: string): Promise<void> {
    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    // Verify user exists
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: organizationId,
      },
    });

    if (!user) {
      throw new AppError('User not found in organization', 404);
    }

    // Update organization owner
    await prisma.organization.update({
      where: { id: organizationId },
      data: { ownerUserId: userId },
    });

    // Update user role to OWNER
    await prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.OWNER },
    });
  }

  /**
   * Get all members of an organization.
   * Returns users sorted by creation date (newest first).
   *
   * @param {string} organizationId - ID of the organization
   * @returns {Promise<User[]>} Array of organization members
   *
   * @example
   * const members = await organizationService.getMembers('org-123');
   * console.log(`Organization has ${members.length} members`);
   */
  async getMembers(organizationId: string): Promise<User[]> {
    return prisma.user.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Add a new user to an organization.
   * Prevents creating multiple owners per organization.
   *
   * @param {string} organizationId - ID of the organization
   * @param {Object} userData - User creation data
   * @param {string} userData.email - User email address
   * @param {string} [userData.password] - Optional password
   * @param {string} [userData.fullName] - Optional full name
   * @param {UserRole} [userData.role='MEMBER'] - User role (cannot be OWNER)
   * @returns {Promise<User>} The created user
   * @throws {AppError} When organization not found (404) or trying to create another owner (400)
   *
   * @example
   * const user = await organizationService.addUser('org-123', {
   *   email: 'newuser@example.com',
   *   password: 'TempPass123!',
   *   fullName: 'New User',
   *   role: 'MANAGER'
   * });
   */
  async addUser(
    organizationId: string,
    userData: {
      email: string;
      password?: string;
      fullName?: string;
      role?: UserRole;
    },
  ): Promise<User> {
    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new AppError('Organization not found', 404);
    }

    // Prevent creating another owner
    if (userData.role === UserRole.OWNER) {
      throw new AppError('Organization can only have one owner', 400);
    }

    // Create user
    const userService = new UserService();
    return userService.createUser({
      ...userData,
      organizationId,
      role: userData.role || UserRole.MEMBER,
    });
  }

  /**
   * Remove a user from an organization (soft delete).
   * Cannot remove the organization owner.
   *
   * @param {string} organizationId - ID of the organization
   * @param {string} userId - ID of the user to remove
   * @returns {Promise<void>}
   * @throws {AppError} When user not found in organization (404) or attempting to remove owner (400)
   *
   * @example
   * await organizationService.removeUser('org-123', 'user-456');
   * // User is deactivated but data is retained
   */
  async removeUser(organizationId: string, userId: string): Promise<void> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: organizationId,
      },
    });

    if (!user) {
      throw new AppError('User not found in organization', 404);
    }

    // Prevent removing the owner
    if (user.role === UserRole.OWNER) {
      throw new AppError('Cannot remove organization owner', 400);
    }

    // Soft delete the user
    const userService = new UserService();
    await userService.deleteUser(userId);
  }
}

/**
 * Helper function to hash passwords using bcrypt.
 * Uses 12 rounds for optimal security/performance balance.
 *
 * @param {string} password - Plain text password to hash
 * @returns {Promise<string>} Hashed password
 * @private
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
