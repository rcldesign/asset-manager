import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { OrganizationService } from '../../../services/organization.service';
import { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../utils/errors';

// Mock Prisma Client
jest.mock('@prisma/client');

const mockPrisma = {
  organization: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
} as any;

describe('OrganizationService', () => {
  let organizationService: OrganizationService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create new instance with mocked prisma
    organizationService = new OrganizationService();
    (organizationService as any).prisma = mockPrisma;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createOrganization', () => {
    test('should create an organization successfully', async () => {
      const organizationData = {
        name: 'Test Organization',
      };

      const createdOrganization = {
        id: 'org-123',
        name: organizationData.name,
        ownerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.organization.create.mockResolvedValue(createdOrganization);

      const result = await organizationService.createOrganization(organizationData);

      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: {
          name: organizationData.name,
        },
      });
      expect(result).toEqual(createdOrganization);
    });

    test('should throw validation error for invalid name', async () => {
      const organizationData = {
        name: '', // Empty name
      };

      await expect(organizationService.createOrganization(organizationData)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for name with invalid characters', async () => {
      const organizationData = {
        name: 'Test<script>alert("xss")</script>Organization',
      };

      await expect(organizationService.createOrganization(organizationData)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for duplicate organization name', async () => {
      const organizationData = {
        name: 'Existing Organization',
      };

      const error = new Error('Unique constraint failed');
      (error as any).code = 'P2002';
      mockPrisma.organization.create.mockRejectedValue(error);

      await expect(organizationService.createOrganization(organizationData)).rejects.toThrow(ValidationError);
    });
  });

  describe('getOrganizationById', () => {
    test('should return organization by ID', async () => {
      const organizationId = 'org-123';
      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.organization.findUnique.mockResolvedValue(organization);

      const result = await organizationService.getOrganizationById(organizationId);

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
      expect(result).toEqual(organization);
    });

    test('should throw validation error for invalid UUID', async () => {
      const invalidId = 'invalid-uuid';

      await expect(organizationService.getOrganizationById(invalidId)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error if organization not found', async () => {
      const organizationId = 'non-existent-org';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.getOrganizationById(organizationId)).rejects.toThrow(ValidationError);
    });
  });

  describe('updateOrganization', () => {
    test('should update organization successfully', async () => {
      const organizationId = 'org-123';
      const updateData = {
        name: 'Updated Organization Name',
      };

      const existingOrganization = {
        id: organizationId,
        name: 'Old Name',
        ownerId: 'user-123',
      };

      const updatedOrganization = {
        ...existingOrganization,
        name: updateData.name,
        updatedAt: new Date(),
      };

      mockPrisma.organization.findUnique.mockResolvedValue(existingOrganization);
      mockPrisma.organization.update.mockResolvedValue(updatedOrganization);

      const result = await organizationService.updateOrganization(organizationId, updateData);

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: updateData,
      });
      expect(result).toEqual(updatedOrganization);
    });

    test('should throw validation error if organization not found', async () => {
      const organizationId = 'non-existent-org';
      const updateData = { name: 'New Name' };

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.updateOrganization(organizationId, updateData)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for invalid name', async () => {
      const organizationId = 'org-123';
      const updateData = {
        name: '', // Empty name
      };

      await expect(organizationService.updateOrganization(organizationId, updateData)).rejects.toThrow(ValidationError);
    });
  });

  describe('setOwner', () => {
    test('should set organization owner successfully', async () => {
      const organizationId = 'org-123';
      const userId = 'user-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerId: null,
      };

      const updatedOrganization = {
        ...organization,
        ownerId: userId,
      };

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.organization.update.mockResolvedValue(updatedOrganization);

      await organizationService.setOwner(organizationId, userId);

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
      expect(mockPrisma.organization.update).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: { ownerId: userId },
      });
    });

    test('should throw validation error if organization not found', async () => {
      const organizationId = 'non-existent-org';
      const userId = 'user-123';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.setOwner(organizationId, userId)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for invalid user ID', async () => {
      const organizationId = 'org-123';
      const invalidUserId = 'invalid-uuid';

      await expect(organizationService.setOwner(organizationId, invalidUserId)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for invalid organization ID', async () => {
      const invalidOrgId = 'invalid-uuid';
      const userId = 'user-123';

      await expect(organizationService.setOwner(invalidOrgId, userId)).rejects.toThrow(ValidationError);
    });
  });

  describe('getMembers', () => {
    test('should return organization members', async () => {
      const organizationId = 'org-123';
      const members = [
        {
          id: 'user-123',
          email: 'user1@example.com',
          fullName: 'User One',
          role: 'OWNER',
          organizationId,
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: 'user-456',
          email: 'user2@example.com',
          fullName: 'User Two',
          role: 'MEMBER',
          organizationId,
          isActive: true,
          createdAt: new Date(),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(members);

      const result = await organizationService.getMembers(organizationId);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      });
      expect(result).toEqual(members);
    });

    test('should throw validation error for invalid organization ID', async () => {
      const invalidOrgId = 'invalid-uuid';

      await expect(organizationService.getMembers(invalidOrgId)).rejects.toThrow(ValidationError);
    });

    test('should return empty array for organization with no members', async () => {
      const organizationId = 'org-123';

      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await organizationService.getMembers(organizationId);

      expect(result).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    test('should return organization statistics', async () => {
      const organizationId = 'org-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerId: 'user-123',
        createdAt: new Date('2023-01-01'),
      };

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.user.count
        .mockResolvedValueOnce(5) // totalUsers
        .mockResolvedValueOnce(4) // activeUsers
        .mockResolvedValueOnce(1) // ownersCount
        .mockResolvedValueOnce(1) // managersCount
        .mockResolvedValueOnce(2) // membersCount
        .mockResolvedValueOnce(1); // viewersCount

      const result = await organizationService.getStatistics(organizationId);

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
      });

      expect(mockPrisma.user.count).toHaveBeenCalledTimes(6);
      
      expect(result).toEqual({
        totalUsers: 5,
        activeUsers: 4,
        usersByRole: {
          OWNER: 1,
          MANAGER: 1,
          MEMBER: 2,
          VIEWER: 1,
        },
        organizationAge: expect.any(Number),
      });

      // Check that organizationAge is calculated correctly (approximately)
      const expectedAge = Math.floor((Date.now() - organization.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      expect(result.organizationAge).toBeCloseTo(expectedAge, -1); // Within 10 days
    });

    test('should throw validation error if organization not found', async () => {
      const organizationId = 'non-existent-org';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.getStatistics(organizationId)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for invalid organization ID', async () => {
      const invalidOrgId = 'invalid-uuid';

      await expect(organizationService.getStatistics(invalidOrgId)).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteOrganization', () => {
    test('should delete organization successfully', async () => {
      const organizationId = 'org-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerId: 'user-123',
      };

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.user.count.mockResolvedValue(1); // Only owner exists
      mockPrisma.organization.delete.mockResolvedValue(organization);

      await organizationService.deleteOrganization(organizationId);

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
      expect(mockPrisma.user.count).toHaveBeenCalledWith({
        where: { organizationId },
      });
      expect(mockPrisma.organization.delete).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
    });

    test('should throw validation error if organization not found', async () => {
      const organizationId = 'non-existent-org';

      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(organizationService.deleteOrganization(organizationId)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error if organization has multiple users', async () => {
      const organizationId = 'org-123';

      const organization = {
        id: organizationId,
        name: 'Test Organization',
        ownerId: 'user-123',
      };

      mockPrisma.organization.findUnique.mockResolvedValue(organization);
      mockPrisma.user.count.mockResolvedValue(3); // Multiple users exist

      await expect(organizationService.deleteOrganization(organizationId)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for invalid organization ID', async () => {
      const invalidOrgId = 'invalid-uuid';

      await expect(organizationService.deleteOrganization(invalidOrgId)).rejects.toThrow(ValidationError);
    });
  });
});