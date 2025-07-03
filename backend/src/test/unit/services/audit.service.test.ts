import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ActionType } from '@prisma/client';
import type { IRequestContext } from '../../../interfaces/context.interface';

// Enable automatic mocking for Prisma
jest.mock('../../../lib/prisma');

// Mock webhook service
jest.mock('../../../services/webhook.service', () => ({
  webhookService: {
    createEnhancedEvent: jest.fn(),
    emitEvent: jest.fn(),
  },
}));

// Import modules after mocking
import { AuditService, BULK_OPERATION_RECORD_ID } from '../../../services/audit.service';
import { prisma } from '../../../lib/prisma';

// Type the mocked modules
const mockPrisma = prisma as jest.Mocked<typeof prisma>;


describe('AuditService', () => {
  let auditService: AuditService;
  let mockContext: IRequestContext;

  beforeEach(() => {
    auditService = new AuditService();
    mockContext = {
      userId: 'user123',
      userRole: 'MEMBER' as any,
      organizationId: 'org123',
      requestId: 'request123',
    };

    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    mockPrisma.auditTrail.create.mockResolvedValue({
      id: 'audit-123',
      model: 'Asset',
      recordId: 'asset123',
      action: ActionType.CREATE,
      oldValue: null,
      newValue: { name: 'Test Asset' },
      userId: 'user123',
      createdAt: new Date(),
    } as any);
    
    // Mock webhook service
    const { webhookService } = require('../../../services/webhook.service');
    webhookService.createEnhancedEvent.mockResolvedValue({ id: 'event-123' });
    webhookService.emitEvent.mockResolvedValue(undefined);
  });

  describe('log', () => {
    it('should log a single record change', async () => {
      const logData = {
        context: mockContext,
        model: 'Asset',
        recordId: 'asset123',
        action: ActionType.CREATE,
        newValue: { name: 'Test Asset' },
      };

      await auditService.log(mockPrisma as any, logData);

      expect(mockPrisma.auditTrail.create).toHaveBeenCalledWith({
        data: {
          model: 'Asset',
          recordId: 'asset123',
          action: ActionType.CREATE,
          oldValue: expect.any(Object), // JsonNull object
          newValue: { name: 'Test Asset' },
          userId: 'user123',
        },
      });
    });

    it('should log an update with both old and new values', async () => {
      const logData = {
        context: mockContext,
        model: 'Task',
        recordId: 'task123',
        action: ActionType.UPDATE,
        oldValue: { status: 'PLANNED' },
        newValue: { status: 'IN_PROGRESS' },
      };

      await auditService.log(mockPrisma as any, logData);

      expect(mockPrisma.auditTrail.create).toHaveBeenCalledWith({
        data: {
          model: 'Task',
          recordId: 'task123',
          action: ActionType.UPDATE,
          oldValue: { status: 'PLANNED' },
          newValue: { status: 'IN_PROGRESS' },
          userId: 'user123',
        },
      });
    });

    it('should handle null values properly', async () => {
      const logData = {
        context: mockContext,
        model: 'Asset',
        recordId: 'asset123',
        action: ActionType.DELETE,
        oldValue: { name: 'Old Asset' },
      };

      await auditService.log(mockPrisma as any, logData);

      expect(mockPrisma.auditTrail.create).toHaveBeenCalledWith({
        data: {
          model: 'Asset',
          recordId: 'asset123',
          action: ActionType.DELETE,
          oldValue: { name: 'Old Asset' },
          newValue: expect.any(Object), // JsonNull object
          userId: 'user123',
        },
      });
    });
  });

  describe('logBulk', () => {
    it('should log bulk update operations', async () => {
      const logData = {
        context: mockContext,
        action: ActionType.UPDATE_MANY,
        model: 'Task',
        details: {
          where: { status: 'PLANNED' },
          data: { status: 'IN_PROGRESS' },
          count: 5,
        },
      };

      await auditService.logBulk(mockPrisma as any, logData);

      expect(mockPrisma.auditTrail.create).toHaveBeenCalledWith({
        data: {
          model: 'Task',
          recordId: BULK_OPERATION_RECORD_ID,
          action: ActionType.UPDATE_MANY,
          oldValue: expect.any(Object), // JsonNull object
          newValue: {
            details: {
              where: { status: 'PLANNED' },
              data: { status: 'IN_PROGRESS' },
              count: 5,
            },
          },
          userId: 'user123',
        },
      });
    });

    it('should log bulk delete operations', async () => {
      const logData = {
        context: mockContext,
        action: ActionType.DELETE_MANY,
        model: 'Asset',
        details: {
          where: { status: 'DISPOSED' },
          count: 10,
        },
      };

      await auditService.logBulk(mockPrisma as any, logData);

      expect(mockPrisma.auditTrail.create).toHaveBeenCalledWith({
        data: {
          model: 'Asset',
          recordId: BULK_OPERATION_RECORD_ID,
          action: ActionType.DELETE_MANY,
          oldValue: expect.any(Object), // JsonNull object
          newValue: {
            details: {
              where: { status: 'DISPOSED' },
              count: 10,
            },
          },
          userId: 'user123',
        },
      });
    });
  });

  describe('queryAuditTrail', () => {
    const mockAuditEntries = [
      {
        id: 'audit1',
        model: 'Asset',
        recordId: 'asset123',
        action: ActionType.CREATE,
        oldValue: null,
        newValue: { name: 'Test Asset' },
        userId: 'user123',
        user: {
          id: 'user123',
          email: 'test@example.com',
          fullName: 'Test User',
        },
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'audit2',
        model: 'Task',
        recordId: 'task123',
        action: ActionType.UPDATE,
        oldValue: { status: 'PLANNED' },
        newValue: { status: 'IN_PROGRESS' },
        userId: 'user123',
        user: {
          id: 'user123',
          email: 'test@example.com',
          fullName: 'Test User',
        },
        createdAt: new Date('2024-01-02'),
      },
    ];

    beforeEach(() => {
      mockPrisma.auditTrail.findMany.mockResolvedValue(mockAuditEntries as any);
      mockPrisma.auditTrail.count.mockResolvedValue(2);
    });

    it('should query audit trail without filters', async () => {
      const result = await auditService.queryAuditTrail(mockPrisma as any, {});

      expect(mockPrisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 50,
      });

      expect(mockPrisma.auditTrail.count).toHaveBeenCalledWith({
        where: {},
      });

      expect(result).toEqual({
        entries: mockAuditEntries,
        pagination: {
          page: 1,
          limit: 50,
          total: 2,
          totalPages: 1,
        },
      });
    });

    it('should query audit trail with model filter', async () => {
      await auditService.queryAuditTrail(mockPrisma as any, {
        model: 'Asset',
      });

      expect(mockPrisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: { model: 'Asset' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 50,
      });
    });

    it('should query audit trail with date range filter', async () => {
      const fromDate = new Date('2024-01-01');
      const toDate = new Date('2024-01-31');

      await auditService.queryAuditTrail(mockPrisma as any, {
        fromDate,
        toDate,
      });

      expect(mockPrisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: fromDate,
            lte: toDate,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 50,
      });
    });

    it('should handle pagination correctly', async () => {
      mockPrisma.auditTrail.count.mockResolvedValue(150);

      const result = await auditService.queryAuditTrail(
        mockPrisma as any,
        {},
        { page: 3, limit: 20 },
      );

      expect(mockPrisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 40, // (page - 1) * limit = (3 - 1) * 20
        take: 20,
      });

      expect(result.pagination).toEqual({
        page: 3,
        limit: 20,
        total: 150,
        totalPages: 8, // Math.ceil(150 / 20)
      });
    });

    it('should apply all filters together', async () => {
      const filters = {
        model: 'Task',
        recordId: 'task123',
        userId: 'user456',
        action: ActionType.UPDATE,
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-01-31'),
      };

      await auditService.queryAuditTrail(mockPrisma as any, filters);

      expect(mockPrisma.auditTrail.findMany).toHaveBeenCalledWith({
        where: {
          model: 'Task',
          recordId: 'task123',
          userId: 'user456',
          action: ActionType.UPDATE,
          createdAt: {
            gte: filters.fromDate,
            lte: filters.toDate,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: 0,
        take: 50,
      });
    });
  });
});
