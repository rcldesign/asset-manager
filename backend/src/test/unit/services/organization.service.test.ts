import { describe, test, expect, beforeEach } from '@jest/globals';
import { OrganizationService } from '../../../services/organization.service';
import { UserRole } from '@prisma/client';
import { prismaMock } from '../../prisma-singleton';

describe('OrganizationService', () => {
  let organizationService: OrganizationService;

  beforeEach(() => {
    organizationService = new OrganizationService();
  });

  describe('createOrganization', () => {
    test('should create an organization successfully', async () => {
      const organizationData = {
        name: 'Test Organization',
      };

      const createdOrganization = {
        id: 'org-123',
        name: organizationData.name,
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.create.mockResolvedValue(createdOrganization);

      const result = await organizationService.createOrganization(organizationData);

      expect(result).toEqual(createdOrganization);
      expect(prismaMock.organization.create).toHaveBeenCalledWith({
        data: { name: organizationData.name },
      });
    });
  });

  describe('getOrganizationById', () => {
    test('should return organization if found', async () => {
      const organizationId = 'org-123';
      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerUserId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        owner: {
          id: 'user-123',
          email: 'owner@example.com',
          passwordHash: 'hashed',
          fullName: 'Owner User',
          role: UserRole.OWNER,
          organizationId,
          emailVerified: true,
          isActive: true,
          totpEnabled: false,
          totpSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        _count: {
          users: 5,
          assets: 10,
          tasks: 3,
        },
      };

      prismaMock.organization.findUnique.mockResolvedValue(organization);

      const result = await organizationService.getOrganizationById(organizationId);

      expect(result).toEqual(organization);
      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
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

    test('should return null if organization not found', async () => {
      const organizationId = 'non-existent';
      prismaMock.organization.findUnique.mockResolvedValue(null);

      const result = await organizationService.getOrganizationById(organizationId);

      expect(result).toBeNull();
    });
  });

  describe('updateOrganization', () => {
    test('should update organization successfully', async () => {
      const organizationId = 'org-123';
      const updateData = { name: 'Updated Organization' };

      const existingOrganization = {
        id: organizationId,
        name: 'Old Organization',
        ownerUserId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedOrganization = {
        ...existingOrganization,
        name: updateData.name,
        owner: {
          id: 'user-123',
          email: 'owner@example.com',
          passwordHash: 'hashed',
          fullName: 'Owner User',
          role: UserRole.OWNER,
          organizationId,
          emailVerified: true,
          isActive: true,
          totpEnabled: false,
          totpSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        _count: {
          users: 5,
          assets: 10,
          tasks: 3,
        },
      };

      prismaMock.organization.findUnique.mockResolvedValue(existingOrganization);
      prismaMock.organization.update.mockResolvedValue(updatedOrganization);

      const result = await organizationService.updateOrganization(organizationId, updateData);

      expect(result).toEqual(updatedOrganization);
      expect(prismaMock.organization.update).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: updateData,
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

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';
      const updateData = { name: 'Updated Organization' };

      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(
        organizationService.updateOrganization(organizationId, updateData),
      ).rejects.toThrow('Organization not found');
    });
  });

  describe('setOwner', () => {
    test('should set owner successfully', async () => {
      const organizationId = 'org-123';
      const userId = 'user-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const user = {
        id: userId,
        email: 'user@example.com',
        passwordHash: 'hashed',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId,
        emailVerified: true,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue(organization);
      prismaMock.user.findFirst.mockResolvedValue(user);
      prismaMock.organization.update.mockResolvedValue({
        ...organization,
        ownerUserId: userId,
      });
      prismaMock.user.update.mockResolvedValue({
        ...user,
        role: UserRole.OWNER,
      });

      await organizationService.setOwner(organizationId, userId);

      expect(prismaMock.organization.update).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: { ownerUserId: userId },
      });
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: UserRole.OWNER },
      });
    });

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';
      const userId = 'user-123';

      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.setOwner(organizationId, userId)).rejects.toThrow(
        'Organization not found',
      );
    });

    test('should throw error if user not found in organization', async () => {
      const organizationId = 'org-123';
      const userId = 'non-existent-user';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerUserId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue(organization);
      prismaMock.user.findFirst.mockResolvedValue(null);

      await expect(organizationService.setOwner(organizationId, userId)).rejects.toThrow(
        'User not found in organization',
      );
    });
  });

  describe('getMembers', () => {
    test('should return organization members', async () => {
      const organizationId = 'org-123';
      const members = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          passwordHash: 'hashed',
          fullName: 'User 1',
          role: UserRole.MEMBER,
          organizationId,
          emailVerified: true,
          isActive: true,
          totpEnabled: false,
          totpSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          passwordHash: 'hashed',
          fullName: 'User 2',
          role: UserRole.MANAGER,
          organizationId,
          emailVerified: true,
          isActive: true,
          totpEnabled: false,
          totpSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prismaMock.user.findMany.mockResolvedValue(members);

      const result = await organizationService.getMembers(organizationId);

      expect(result).toEqual(members);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getStatistics', () => {
    test('should return organization statistics', async () => {
      const organizationId = 'org-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerUserId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const tasksByStatus = [
        { status: 'PENDING', _count: 5 },
        { status: 'COMPLETED', _count: 3 },
      ];

      const usersByRole = [
        { role: 'OWNER', _count: 1 },
        { role: 'MEMBER', _count: 4 },
      ];

      prismaMock.organization.findUnique.mockResolvedValue(organization);
      prismaMock.user.count.mockResolvedValue(10);
      prismaMock.asset.count.mockResolvedValue(20);
      prismaMock.task.count.mockResolvedValue(8);
      (prismaMock.task.groupBy as jest.MockedFunction<any>).mockResolvedValue(tasksByStatus);
      (prismaMock.user.groupBy as jest.MockedFunction<any>).mockResolvedValue(usersByRole);

      const result = await organizationService.getStatistics(organizationId);

      expect(result).toEqual({
        totalUsers: 10,
        totalAssets: 20,
        totalTasks: 8,
        tasksByStatus: {
          PENDING: 5,
          COMPLETED: 3,
        },
        usersByRole: {
          OWNER: 1,
          MEMBER: 4,
        },
      });
    });

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';

      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.getStatistics(organizationId)).rejects.toThrow(
        'Organization not found',
      );
    });
  });

  describe('deleteOrganization', () => {
    test('should delete organization successfully', async () => {
      const organizationId = 'org-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerUserId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue(organization);
      prismaMock.organization.delete.mockResolvedValue(organization);

      await organizationService.deleteOrganization(organizationId);

      expect(prismaMock.organization.delete).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
    });

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';

      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.deleteOrganization(organizationId)).rejects.toThrow(
        'Organization not found',
      );
    });
  });
});
