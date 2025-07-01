import { GDPRComplianceService, DataExportRequest, DataDeletionRequest } from '../../../services/gdpr-compliance.service';
import { IRequestContext } from '../../../interfaces/context.interface';
import { prisma } from '../../../lib/prisma';
import { AuditService } from '../../../services/audit.service';
import { DataExportService } from '../../../services/data-export.service';
import { ActionType } from '@prisma/client';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    gdprRequest: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    asset: {
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    task: {
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    taskAssignment: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    taskComment: {
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    activityLog: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    session: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    apiToken: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    calendarIntegration: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    attachment: {
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../../services/audit.service');
jest.mock('../../../services/data-export.service');

describe('GDPRComplianceService - Comprehensive Tests', () => {
  let service: GDPRComplianceService;
  let mockContext: IRequestContext;
  let mockAuditService: jest.Mocked<AuditService>;
  let mockDataExportService: jest.Mocked<DataExportService>;

  beforeEach(() => {
    service = new GDPRComplianceService();
    mockContext = {
      userId: 'user-123',
      userRole: 'OWNER',
      organizationId: 'org-123',
      requestId: 'req-123',
    };

    mockAuditService = new AuditService() as jest.Mocked<AuditService>;
    mockDataExportService = new DataExportService() as jest.Mocked<DataExportService>;
    
    (service as any).auditService = mockAuditService;
    (service as any).dataExportService = mockDataExportService;

    jest.clearAllMocks();
  });

  describe('requestDataExport', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      organizationId: 'org-123',
    };

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.gdprRequest.create as jest.Mock).mockResolvedValue({
        id: 'request-123',
        type: 'EXPORT',
        status: 'PENDING',
      });
    });

    it('should create data export request successfully', async () => {
      const request: DataExportRequest = {
        userEmail: 'test@example.com',
        requestReason: 'Personal data review',
        includeDeletedData: false,
      };

      const result = await service.requestDataExport(mockContext, request);

      expect(result.requestId).toBe('request-123');
      expect(result.status).toBe('PENDING');
      expect(result.estimatedCompletionTime).toBeInstanceOf(Date);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });

      expect(prisma.gdprRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'EXPORT',
          status: 'PENDING',
          targetUserId: 'user-123',
          requestedBy: 'user-123',
          requestReason: 'Personal data review',
          includeDeletedData: false,
        }),
      });

      expect(mockAuditService.log).toHaveBeenCalledWith(prisma, {
        context: mockContext,
        model: 'User',
        recordId: 'user-123',
        action: ActionType.READ,
        newValue: { gdprExportRequested: true },
      });
    });

    it('should throw error when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const request: DataExportRequest = {
        userEmail: 'nonexistent@example.com',
        requestReason: 'Test',
      };

      await expect(service.requestDataExport(mockContext, request)).rejects.toThrow(
        'User not found'
      );
    });

    it('should verify organization access', async () => {
      const differentOrgUser = {
        ...mockUser,
        organizationId: 'different-org',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(differentOrgUser);

      const request: DataExportRequest = {
        userEmail: 'test@example.com',
        requestReason: 'Test',
      };

      await expect(service.requestDataExport(mockContext, request)).rejects.toThrow(
        'Access denied: User belongs to different organization'
      );
    });

    it('should handle duplicate export requests', async () => {
      (prisma.gdprRequest.create as jest.Mock).mockRejectedValue({
        code: 'P2002', // Unique constraint violation
        meta: { target: ['targetUserId', 'type'] },
      });

      const request: DataExportRequest = {
        userEmail: 'test@example.com',
        requestReason: 'Test',
      };

      await expect(service.requestDataExport(mockContext, request)).rejects.toThrow(
        'Data export request already exists for this user'
      );
    });
  });

  describe('processDataExport', () => {
    const mockRequest = {
      id: 'request-123',
      type: 'EXPORT',
      status: 'PENDING',
      targetUserId: 'user-123',
      includeDeletedData: false,
    };

    const mockUserDataExport = {
      userData: { id: 'user-123', email: 'test@example.com' },
      assets: [],
      tasks: [],
      taskAssignments: [],
      taskComments: [],
      activities: [],
      notifications: [],
      sessions: [],
      apiTokens: [],
      calendarIntegrations: [],
      exportedAt: new Date(),
    };

    beforeEach(() => {
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);
      (mockDataExportService.exportUserData as jest.Mock).mockResolvedValue(mockUserDataExport);
      (prisma.gdprRequest.update as jest.Mock).mockResolvedValue({
        ...mockRequest,
        status: 'COMPLETED',
      });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));
    });

    it('should process data export successfully', async () => {
      const result = await service.processDataExport('request-123');

      expect(result.status).toBe('COMPLETED');
      expect(result.exportData).toBeDefined();

      expect(mockDataExportService.exportUserData).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        }),
        'user-123'
      );

      expect(prisma.gdprRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          exportData: expect.any(String),
        }),
      });
    });

    it('should handle export processing errors', async () => {
      (mockDataExportService.exportUserData as jest.Mock).mockRejectedValue(
        new Error('Export failed')
      );

      await expect(service.processDataExport('request-123')).rejects.toThrow('Export failed');

      expect(prisma.gdprRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Export failed',
        }),
      });
    });

    it('should throw error for non-existent request', async () => {
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.processDataExport('nonexistent-request')).rejects.toThrow(
        'GDPR request not found'
      );
    });

    it('should throw error for non-export request type', async () => {
      const deletionRequest = {
        ...mockRequest,
        type: 'DELETION',
      };
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(deletionRequest);

      await expect(service.processDataExport('request-123')).rejects.toThrow(
        'Request is not a data export request'
      );
    });
  });

  describe('requestDataDeletion', () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      organizationId: 'org-123',
    };

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      (prisma.gdprRequest.create as jest.Mock).mockResolvedValue({
        id: 'request-456',
        type: 'DELETION',
        status: 'PENDING',
      });
    });

    it('should create data deletion request successfully', async () => {
      const request: DataDeletionRequest = {
        userEmail: 'test@example.com',
        deletionReason: 'Account closure',
        confirmationCode: 'DELETE123',
        retainAuditLogs: true,
        immediateExecution: false,
      };

      const result = await service.requestDataDeletion(mockContext, request);

      expect(result.requestId).toBe('request-456');
      expect(result.status).toBe('PENDING');
      expect(result.gracePeriodEnd).toBeInstanceOf(Date);

      expect(prisma.gdprRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'DELETION',
          status: 'PENDING',
          targetUserId: 'user-123',
          deletionReason: 'Account closure',
          confirmationCode: 'DELETE123',
          retainAuditLogs: true,
          gracePeriodEnd: expect.any(Date),
        }),
      });
    });

    it('should handle immediate execution requests', async () => {
      const request: DataDeletionRequest = {
        userEmail: 'test@example.com',
        deletionReason: 'Immediate deletion',
        confirmationCode: 'DELETE456',
        immediateExecution: true,
      };

      await service.requestDataDeletion(mockContext, request);

      expect(prisma.gdprRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          gracePeriodEnd: expect.any(Date), // Should be very close to now
        }),
      });
    });

    it('should require confirmation code for deletion', async () => {
      const request: DataDeletionRequest = {
        userEmail: 'test@example.com',
        deletionReason: 'Test',
        confirmationCode: '',
      };

      await expect(service.requestDataDeletion(mockContext, request)).rejects.toThrow(
        'Confirmation code is required for data deletion'
      );
    });

    it('should prevent self-deletion for admin users', async () => {
      const adminUser = {
        ...mockUser,
        role: 'OWNER',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(adminUser);

      const request: DataDeletionRequest = {
        userEmail: 'test@example.com',
        deletionReason: 'Test',
        confirmationCode: 'DELETE123',
      };

      const adminContext = { ...mockContext, userRole: 'OWNER' };

      await expect(service.requestDataDeletion(adminContext, request)).rejects.toThrow(
        'Organization owners cannot delete their own data. Transfer ownership first.'
      );
    });
  });

  describe('processDataDeletion', () => {
    const mockRequest = {
      id: 'request-456',
      type: 'DELETION',
      status: 'PENDING',
      targetUserId: 'user-123',
      retainAuditLogs: false,
      gracePeriodEnd: new Date(Date.now() - 1000), // Past grace period
    };

    const mockCountResults = {
      assets: 5,
      tasks: 10,
      taskAssignments: 15,
      taskComments: 8,
      activities: 50,
      notifications: 25,
      sessions: 12,
      apiTokens: 3,
      calendarIntegrations: 2,
      attachments: 7,
    };

    beforeEach(() => {
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);
      
      // Mock count queries
      Object.entries(mockCountResults).forEach(([entity, count]) => {
        (prisma[entity as keyof typeof prisma].count as jest.Mock).mockResolvedValue(count);
      });

      // Mock deletion operations
      Object.keys(mockCountResults).forEach(entity => {
        if (entity === 'assets' || entity === 'tasks' || entity === 'taskComments') {
          (prisma[entity as keyof typeof prisma].updateMany as jest.Mock).mockResolvedValue({ count: mockCountResults[entity] });
        } else {
          (prisma[entity as keyof typeof prisma].deleteMany as jest.Mock).mockResolvedValue({ count: mockCountResults[entity] });
        }
      });

      (prisma.user.update as jest.Mock).mockResolvedValue({});
      (prisma.gdprRequest.update as jest.Mock).mockResolvedValue({
        ...mockRequest,
        status: 'COMPLETED',
      });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));
    });

    it('should process data deletion successfully', async () => {
      const result = await service.processDataDeletion('request-456');

      expect(result.status).toBe('COMPLETED');
      expect(result.deletionSummary).toBeDefined();
      expect(result.deletionSummary!.totalRecordsDeleted).toBeGreaterThan(0);

      // Verify anonymization of assets and tasks
      expect(prisma.asset.updateMany).toHaveBeenCalledWith({
        where: { createdBy: 'user-123' },
        data: expect.objectContaining({
          createdBy: null,
        }),
      });

      expect(prisma.task.updateMany).toHaveBeenCalledWith({
        where: { createdBy: 'user-123' },
        data: expect.objectContaining({
          createdBy: null,
        }),
      });

      // Verify deletion of user-specific data
      expect(prisma.taskAssignment.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });

      // Verify user record anonymization
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          email: expect.stringMatching(/^deleted-user-\w+@deleted\.local$/),
          fullName: 'Deleted User',
          isActive: false,
          deletedAt: expect.any(Date),
        }),
      });
    });

    it('should retain audit logs when specified', async () => {
      const requestWithAuditRetention = {
        ...mockRequest,
        retainAuditLogs: true,
      };
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(requestWithAuditRetention);

      await service.processDataDeletion('request-456');

      // Activities should be anonymized instead of deleted
      expect(prisma.activityLog.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        data: expect.objectContaining({
          userId: null,
          userEmail: 'anonymized@deleted.local',
        }),
      });

      expect(prisma.activityLog.deleteMany).not.toHaveBeenCalled();
    });

    it('should enforce grace period', async () => {
      const requestInGracePeriod = {
        ...mockRequest,
        gracePeriodEnd: new Date(Date.now() + 86400000), // Future grace period
      };
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(requestInGracePeriod);

      await expect(service.processDataDeletion('request-456')).rejects.toThrow(
        'Cannot process deletion: Grace period has not ended'
      );
    });

    it('should handle deletion processing errors', async () => {
      (prisma.asset.updateMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.processDataDeletion('request-456')).rejects.toThrow('Database error');

      expect(prisma.gdprRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-456' },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Database error',
        }),
      });
    });

    it('should completely delete user when hard deletion is requested', async () => {
      const hardDeletionRequest = {
        ...mockRequest,
        hardDelete: true,
      };
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(hardDeletionRequest);
      (prisma.user.delete as jest.Mock).mockResolvedValue({});

      await service.processDataDeletion('request-456');

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-123' },
      });

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('getGDPRRequestStatus', () => {
    it('should return request status for valid request', async () => {
      const mockRequest = {
        id: 'request-123',
        type: 'EXPORT',
        status: 'COMPLETED',
        requestedAt: new Date(),
        completedAt: new Date(),
        targetUser: {
          email: 'test@example.com',
        },
      };

      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      const status = await service.getGDPRRequestStatus(mockContext, 'request-123');

      expect(status).toEqual({
        requestId: 'request-123',
        type: 'EXPORT',
        status: 'COMPLETED',
        requestedAt: mockRequest.requestedAt,
        completedAt: mockRequest.completedAt,
        userEmail: 'test@example.com',
      });
    });

    it('should throw error for non-existent request', async () => {
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getGDPRRequestStatus(mockContext, 'nonexistent')).rejects.toThrow(
        'GDPR request not found'
      );
    });

    it('should verify organization access for request', async () => {
      const mockRequest = {
        id: 'request-123',
        targetUser: {
          organizationId: 'different-org',
          email: 'test@example.com',
        },
      };

      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      await expect(service.getGDPRRequestStatus(mockContext, 'request-123')).rejects.toThrow(
        'Access denied'
      );
    });
  });

  describe('cancelGDPRRequest', () => {
    const mockRequest = {
      id: 'request-123',
      status: 'PENDING',
      targetUser: {
        organizationId: 'org-123',
      },
    };

    it('should cancel pending request successfully', async () => {
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);
      (prisma.gdprRequest.update as jest.Mock).mockResolvedValue({
        ...mockRequest,
        status: 'CANCELLED',
      });

      const result = await service.cancelGDPRRequest(mockContext, 'request-123', 'User changed mind');

      expect(result.status).toBe('CANCELLED');

      expect(prisma.gdprRequest.update).toHaveBeenCalledWith({
        where: { id: 'request-123' },
        data: expect.objectContaining({
          status: 'CANCELLED',
          cancelledAt: expect.any(Date),
          cancellationReason: 'User changed mind',
        }),
      });
    });

    it('should prevent cancellation of completed requests', async () => {
      const completedRequest = {
        ...mockRequest,
        status: 'COMPLETED',
      };
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(completedRequest);

      await expect(
        service.cancelGDPRRequest(mockContext, 'request-123', 'Test')
      ).rejects.toThrow('Cannot cancel a completed request');
    });

    it('should prevent cancellation of failed requests', async () => {
      const failedRequest = {
        ...mockRequest,
        status: 'FAILED',
      };
      (prisma.gdprRequest.findUnique as jest.Mock).mockResolvedValue(failedRequest);

      await expect(
        service.cancelGDPRRequest(mockContext, 'request-123', 'Test')
      ).rejects.toThrow('Cannot cancel a failed request');
    });
  });

  describe('listGDPRRequests', () => {
    it('should list all GDPR requests for organization', async () => {
      const mockRequests = [
        {
          id: 'request-1',
          type: 'EXPORT',
          status: 'COMPLETED',
          requestedAt: new Date(),
          targetUser: { email: 'user1@example.com' },
        },
        {
          id: 'request-2',
          type: 'DELETION',
          status: 'PENDING',
          requestedAt: new Date(),
          targetUser: { email: 'user2@example.com' },
        },
      ];

      (prisma.gdprRequest.findMany as jest.Mock).mockResolvedValue(mockRequests);

      const result = await service.listGDPRRequests(mockContext, {
        page: 1,
        limit: 10,
      });

      expect(result.requests).toHaveLength(2);
      expect(result.requests[0]).toMatchObject({
        requestId: 'request-1',
        type: 'EXPORT',
        status: 'COMPLETED',
        userEmail: 'user1@example.com',
      });

      expect(prisma.gdprRequest.findMany).toHaveBeenCalledWith({
        where: {
          targetUser: {
            organizationId: 'org-123',
          },
        },
        include: expect.objectContaining({
          targetUser: { select: { email: true } },
        }),
        orderBy: { requestedAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter requests by type', async () => {
      (prisma.gdprRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.listGDPRRequests(mockContext, {
        page: 1,
        limit: 10,
        type: 'EXPORT',
      });

      expect(prisma.gdprRequest.findMany).toHaveBeenCalledWith({
        where: {
          targetUser: {
            organizationId: 'org-123',
          },
          type: 'EXPORT',
        },
        include: expect.any(Object),
        orderBy: { requestedAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });

    it('should filter requests by status', async () => {
      (prisma.gdprRequest.findMany as jest.Mock).mockResolvedValue([]);

      await service.listGDPRRequests(mockContext, {
        page: 1,
        limit: 10,
        status: 'PENDING',
      });

      expect(prisma.gdprRequest.findMany).toHaveBeenCalledWith({
        where: {
          targetUser: {
            organizationId: 'org-123',
          },
          status: 'PENDING',
        },
        include: expect.any(Object),
        orderBy: { requestedAt: 'desc' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('generateComplianceReport', () => {
    it('should generate comprehensive compliance report', async () => {
      const mockRequestStats = [
        { type: 'EXPORT', status: 'COMPLETED', _count: 5 },
        { type: 'EXPORT', status: 'PENDING', _count: 2 },
        { type: 'DELETION', status: 'COMPLETED', _count: 3 },
        { type: 'DELETION', status: 'FAILED', _count: 1 },
      ];

      (prisma.gdprRequest.groupBy as jest.Mock) = jest.fn().mockResolvedValue(mockRequestStats);
      (prisma.gdprRequest.findFirst as jest.Mock) = jest.fn()
        .mockResolvedValueOnce({ requestedAt: new Date('2024-01-01') }) // Oldest export
        .mockResolvedValueOnce({ requestedAt: new Date('2024-01-15') }); // Oldest deletion

      const report = await service.generateComplianceReport(mockContext, {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(report).toMatchObject({
        reportPeriod: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-12-31'),
        },
        requestStatistics: {
          totalRequests: 11,
          exportRequests: 7,
          deletionRequests: 4,
          completedRequests: 8,
          pendingRequests: 2,
          failedRequests: 1,
        },
        responseTimeMetrics: {
          averageResponseTime: expect.any(Number),
          oldestPendingExport: expect.any(Date),
          oldestPendingDeletion: expect.any(Date),
        },
        complianceScore: expect.any(Number),
        recommendations: expect.any(Array),
      });
    });

    it('should include recommendations based on compliance metrics', async () => {
      // Mock high failure rate scenario
      const mockRequestStats = [
        { type: 'EXPORT', status: 'FAILED', _count: 5 },
        { type: 'EXPORT', status: 'COMPLETED', _count: 2 },
      ];

      (prisma.gdprRequest.groupBy as jest.Mock) = jest.fn().mockResolvedValue(mockRequestStats);
      (prisma.gdprRequest.findFirst as jest.Mock) = jest.fn().mockResolvedValue(null);

      const report = await service.generateComplianceReport(mockContext, {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      });

      expect(report.recommendations).toContain(
        'High failure rate detected. Review data export processes.'
      );
    });
  });
});