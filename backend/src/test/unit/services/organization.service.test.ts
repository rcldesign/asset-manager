import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { UserRole } from '@prisma/client';

// Enable automatic mocking for Prisma
jest.mock('../../../lib/prisma');

// Import modules after mocking
import { OrganizationService } from '../../../services/organization.service';
import { prisma } from '../../../lib/prisma';

// Type the mocked module
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper function to create a mock user with all required fields
const createMockUser = (overrides: Partial<any> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  fullName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  lastActiveAt: null,
  role: UserRole.MEMBER,
  organizationId: 'org-123',
  emailVerified: true,
  isActive: true,
  totpEnabled: false,
  totpSecret: null,
  notificationPreferences: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('OrganizationService', () => {
  let organizationService: OrganizationService;

  beforeEach(() => {
    jest.clearAllMocks();
    organizationService = new OrganizationService(mockPrisma);
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

      mockPrisma.organization.create.mockResolvedValue(createdOrganization);

      const result = await organizationService.createOrganization(organizationData);

      expect(result).toEqual(createdOrganization);
      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
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
        owner: createMockUser({
          id: 'user-123',
          email: 'owner@example.com',
          fullName: 'Owner User',
          role: UserRole.OWNER,
          organizationId,
        }),
        _count: {
          users: 5,
          assets: 10,
          tasks: 3,
        },
      };

      mockPrisma.organization.findUnique.mockResolvedValue(organization);

      const result = await organizationService.getOrganizationById(organizationId);

      expect(result).toEqual(organization);
      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
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
      mockPrisma.organization.findUnique.mockResolvedValue(null);

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
        owner: createMockUser({
          id: 'user-123',
          email: 'owner@example.com',
          fullName: 'Owner User',
          role: UserRole.OWNER,
          organizationId,
        }),
        _count: {
          users: 5,
          assets: 10,
          tasks: 3,
        },
      };

      mockPrisma.organization.findUnique.mockResolvedValue(existingOrganization);
      mockPrisma.organization.update.mockResolvedValue(updatedOrganization);

      const result = await organizationService.updateOrganization(organizationId, updateData);

      expect(result).toEqual(updatedOrganization);
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
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

      mockPrisma.organization.findUnique.mockResolvedValue(null);

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

      const user = createMockUser({
        id: userId,
        email: 'user@example.com',
        organizationId,
      });

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.user.findFirst.mockResolvedValue(user);
      mockPrisma.organization.update.mockResolvedValue({
        ...organization,
        ownerUserId: userId,
      });
      mockPrisma.user.update.mockResolvedValue({
        ...user,
        role: UserRole.OWNER,
      });

      await organizationService.setOwner(organizationId, userId);

      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: { ownerUserId: userId },
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: UserRole.OWNER },
      });
    });

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';
      const userId = 'user-123';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

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

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(organizationService.setOwner(organizationId, userId)).rejects.toThrow(
        'User not found in organization',
      );
    });
  });

  describe('getMembers', () => {
    test('should return organization members', async () => {
      const organizationId = 'org-123';
      const members = [
        createMockUser({
          id: 'user-1',
          email: 'user1@example.com',
          fullName: 'User 1',
          role: UserRole.MEMBER,
          organizationId,
        }),
        createMockUser({
          id: 'user-2',
          email: 'user2@example.com',
          fullName: 'User 2',
          role: UserRole.MANAGER,
          organizationId,
        }),
      ];

      mockPrisma.user.findMany.mockResolvedValue(members);

      const result = await organizationService.getMembers(organizationId);

      expect(result).toEqual(members);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
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

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.user.count
        .mockResolvedValueOnce(10) // totalUsers
        .mockResolvedValueOnce(8); // activeUsers
      mockPrisma.asset.count.mockResolvedValue(20);
      mockPrisma.task.count.mockResolvedValue(8);
      (mockPrisma.task.groupBy as jest.MockedFunction<any>).mockResolvedValue(tasksByStatus);
      (mockPrisma.user.groupBy as jest.MockedFunction<any>).mockResolvedValue(usersByRole);

      const result = await organizationService.getStatistics(organizationId);

      expect(result).toEqual({
        totalUsers: 10,
        activeUsers: 8,
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
        organizationAge: 0, // Since organization was created recently in test
      });
    });

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

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

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.organization.delete.mockResolvedValue(organization);

      await organizationService.deleteOrganization(organizationId);

      expect(mockPrisma.organization.delete).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
    });

    test('should throw error if organization not found', async () => {
      const organizationId = 'non-existent';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.deleteOrganization(organizationId)).rejects.toThrow(
        'Organization not found',
      );
    });
  });
});
