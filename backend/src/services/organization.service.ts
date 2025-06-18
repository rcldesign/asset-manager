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
 * Service for managing organizations and their relationships with users
 */
export class OrganizationService {
  /**
   * Create a new organization without an owner
   * @param data - Organization creation data containing name
   * @returns Promise resolving to the created organization
   */
  async createOrganization(data: { name: string }): Promise<Organization> {
    return prisma.organization.create({
      data: { name: data.name },
    });
  }

  /**
   * Create a new organization with an owner user in a single transaction
   * @param data - Organization and owner creation data
   * @returns Promise resolving to organization and owner user objects
   * @throws {AppError} When email is already in use
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
   * Find an organization by its ID with related data
   * @param id - Organization ID to search for
   * @returns Promise resolving to organization with owner and counts, or null if not found
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
   * Find all organizations with pagination and search (admin only)
   * @param options - Query options for pagination and search
   * @param options.skip - Number of records to skip for pagination
   * @param options.take - Number of records to take for pagination
   * @param options.search - Search term to filter by name or owner email
   * @returns Promise resolving to organizations array and total count
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
   * Update an organization's data
   * @param id - Organization ID to update
   * @param data - Update data for the organization
   * @returns Promise resolving to the updated organization
   * @throws {AppError} When organization is not found
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
   * Delete an organization and all its related data (cascade delete)
   * @param id - Organization ID to delete
   * @throws {AppError} When organization is not found
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
   * Get comprehensive statistics for an organization
   * @param id - Organization ID to get statistics for
   * @returns Promise resolving to statistics object with counts and breakdowns
   * @throws {AppError} When organization is not found
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
   * Transfer organization ownership from current owner to another user
   * @param organizationId - ID of the organization
   * @param newOwnerId - ID of the user to become the new owner
   * @param currentOwnerId - ID of the current owner (for verification)
   * @returns Promise resolving to the updated organization
   * @throws {AppError} When organization not found, current owner verification fails, or new owner not found
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
   * Set a user as the organization owner (internal use)
   * @param organizationId - ID of the organization
   * @param userId - ID of the user to set as owner
   * @throws {AppError} When organization or user is not found
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
   * Get all members of an organization
   * @param organizationId - ID of the organization to get members for
   * @returns Promise resolving to array of user objects
   */
  async getMembers(organizationId: string): Promise<User[]> {
    return prisma.user.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Add a new user to an organization
   * @param organizationId - ID of the organization to add user to
   * @param userData - User data including email, optional password, name, and role
   * @returns Promise resolving to the created user
   * @throws {AppError} When organization not found or attempting to create another owner
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
   * Remove a user from an organization (soft delete)
   * @param organizationId - ID of the organization
   * @param userId - ID of the user to remove
   * @throws {AppError} When user not found in organization or attempting to remove owner
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
 * Helper function to hash passwords using bcrypt
 * @param password - Plain text password to hash
 * @returns Promise resolving to hashed password
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
