import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface CreateOrganizationData {
  name: string;
}

export interface UpdateOrganizationData {
  name?: string;
}

export class OrganizationService {
  /**
   * Create a new organization
   */
  async createOrganization(data: CreateOrganizationData): Promise<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }> {
    try {
      // Validate organization name
      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationError('Organization name is required');
      }

      if (data.name.length > 255) {
        throw new ValidationError('Organization name must be less than 255 characters');
      }

      const organization = await prisma.organization.create({
        data: {
          name: data.name.trim(),
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info('Organization created', {
        organizationId: organization.id,
        name: organization.name,
      });

      return organization;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictError('Organization name already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganizationById(id: string): Promise<{
    id: string;
    name: string;
    ownerUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      users: number;
      assets: number;
      tasks: number;
    };
  }> {
    const organization = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        ownerUserId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            users: true,
            assets: true,
            tasks: true,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundError('Organization', id);
    }

    return organization;
  }

  /**
   * Update organization
   */
  async updateOrganization(
    id: string,
    data: UpdateOrganizationData,
  ): Promise<{
    id: string;
    name: string;
    updatedAt: Date;
  }> {
    try {
      // Validate input
      if (data.name !== undefined) {
        if (!data.name || data.name.trim().length === 0) {
          throw new ValidationError('Organization name cannot be empty');
        }
        if (data.name.length > 255) {
          throw new ValidationError('Organization name must be less than 255 characters');
        }
      }

      const updateData: Prisma.OrganizationUpdateInput = {};
      if (data.name !== undefined) {
        updateData.name = data.name.trim();
      }

      const organization = await prisma.organization.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          updatedAt: true,
        },
      });

      logger.info('Organization updated', { organizationId: id, changes: Object.keys(data) });

      return organization;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('Organization', id);
        }
        if (error.code === 'P2002') {
          throw new ConflictError('Organization name already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Delete organization (and cascade to users, assets, tasks)
   */
  async deleteOrganization(id: string): Promise<void> {
    try {
      await prisma.organization.delete({
        where: { id },
      });

      logger.info('Organization deleted', { organizationId: id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('Organization', id);
        }
      }
      throw error;
    }
  }

  /**
   * Set organization owner
   */
  async setOwner(organizationId: string, userId: string): Promise<void> {
    try {
      // Verify the user exists and belongs to this organization
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          organizationId,
        },
      });

      if (!user) {
        throw new NotFoundError('User not found in organization', userId);
      }

      await prisma.organization.update({
        where: { id: organizationId },
        data: { ownerUserId: userId },
      });

      logger.info('Organization owner updated', { organizationId, newOwnerId: userId });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('Organization', organizationId);
        }
      }
      throw error;
    }
  }

  /**
   * Get organization members
   */
  async getMembers(organizationId: string): Promise<
    Array<{
      id: string;
      email: string;
      fullName: string | null;
      role: string;
      isActive: boolean;
      emailVerified: boolean;
      createdAt: Date;
    }>
  > {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Organization', organizationId);
    }

    const members = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    return members;
  }

  /**
   * Get organization statistics
   */
  async getStatistics(organizationId: string): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalAssets: number;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
  }> {
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Organization', organizationId);
    }

    const [userStats, assetCount, taskStats] = await Promise.all([
      prisma.user.groupBy({
        where: { organizationId },
        by: ['isActive'],
        _count: true,
      }),
      prisma.asset.count({
        where: { organizationId },
      }),
      prisma.task.groupBy({
        where: { organizationId },
        by: ['status'],
        _count: true,
      }),
    ]);

    const totalUsers = userStats.reduce(
      (sum: number, stat: { _count: number }) => sum + stat._count,
      0,
    );
    const activeUsers =
      userStats.find((stat: { isActive: boolean; _count: number }) => stat.isActive)?._count ?? 0;

    const totalTasks = taskStats.reduce(
      (sum: number, stat: { _count: number }) => sum + stat._count,
      0,
    );
    const completedTasks =
      taskStats.find((stat: { status: string; _count: number }) => stat.status === 'DONE')
        ?._count ?? 0;

    // Get overdue tasks count
    const overdueTasks = await prisma.task.count({
      where: {
        organizationId,
        status: { in: ['PLANNED', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
      },
    });

    return {
      totalUsers,
      activeUsers,
      totalAssets: assetCount,
      totalTasks,
      completedTasks,
      overdueTasks,
    };
  }
}
