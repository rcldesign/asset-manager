import type {
  ServiceWorkerSyncEvent,
  BackgroundSyncRegistration,
} from '../../../services/service-worker-sync.service';
import { ServiceWorkerSyncService } from '../../../services/service-worker-sync.service';
import { prisma } from '../../../lib/prisma';
import { addSyncJob } from '../../../lib/queue';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    syncClient: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    syncQueue: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../../lib/queue', () => ({
  addSyncJob: jest.fn(),
}));

describe('ServiceWorkerSyncService', () => {
  let service: ServiceWorkerSyncService;
  const mockUserId = 'user-123';
  const mockDeviceId = 'device-456';
  const mockClientId = 'client-789';

  beforeEach(() => {
    service = new ServiceWorkerSyncService();
    jest.clearAllMocks();
  });

  describe('registerBackgroundSync', () => {
    const mockRegistration: BackgroundSyncRegistration = {
      tag: 'sync-all',
      minInterval: 300000,
      maxRetries: 3,
      requiresNetwork: true,
      requiresCharging: false,
    };

    it('should register background sync successfully', async () => {
      const mockClient = {
        id: mockClientId,
        userId: mockUserId,
        deviceId: mockDeviceId,
        syncToken: '{}',
      };

      (prisma.syncClient.findFirst as jest.Mock).mockResolvedValue(mockClient);
      (prisma.syncClient.update as jest.Mock).mockResolvedValue({});

      await service.registerBackgroundSync(mockUserId, mockDeviceId, mockRegistration);

      expect(prisma.syncClient.findFirst).toHaveBeenCalledWith({
        where: { userId: mockUserId, deviceId: mockDeviceId },
      });

      expect(prisma.syncClient.update).toHaveBeenCalledWith({
        where: { id: mockClientId },
        data: {
          syncToken: expect.stringContaining('backgroundSync'),
        },
      });
    });

    it('should throw error when sync client not found', async () => {
      (prisma.syncClient.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.registerBackgroundSync(mockUserId, mockDeviceId, mockRegistration),
      ).rejects.toThrow('Sync client not found');
    });

    it('should handle existing syncToken data', async () => {
      const mockClient = {
        id: mockClientId,
        userId: mockUserId,
        deviceId: mockDeviceId,
        syncToken: JSON.stringify({ existingData: 'test' }),
      };

      (prisma.syncClient.findFirst as jest.Mock).mockResolvedValue(mockClient);
      (prisma.syncClient.update as jest.Mock).mockResolvedValue({});

      await service.registerBackgroundSync(mockUserId, mockDeviceId, mockRegistration);

      const updateCall = (prisma.syncClient.update as jest.Mock).mock.calls[0][0];
      const parsedToken = JSON.parse(updateCall.data.syncToken);

      expect(parsedToken.existingData).toBe('test');
      expect(parsedToken.backgroundSync).toBeDefined();
    });
  });

  describe('processSyncEvent', () => {
    const mockSyncEvent: ServiceWorkerSyncEvent = {
      tag: 'sync-all',
      lastChance: false,
      clientId: mockClientId,
      data: { test: 'data' },
    };

    const mockSyncItems = [
      {
        id: 'item-1',
        clientId: mockClientId,
        entityType: 'asset',
        operation: 'CREATE',
        status: 'PENDING',
        payload: { name: 'Test Asset' },
        retryCount: 0,
        createdAt: new Date(),
      },
      {
        id: 'item-2',
        clientId: mockClientId,
        entityType: 'task',
        operation: 'UPDATE',
        status: 'PENDING',
        payload: { status: 'COMPLETED' },
        retryCount: 1,
        createdAt: new Date(),
      },
    ];

    beforeEach(() => {
      (prisma.syncQueue.findMany as jest.Mock).mockResolvedValue(mockSyncItems);
    });

    it('should process sync-all tag correctly', async () => {
      await service.processSyncEvent(mockSyncEvent);

      expect(addSyncJob).toHaveBeenCalledWith({
        type: 'batch-sync',
        clientId: mockClientId,
        itemIds: ['item-1', 'item-2'],
      });
    });

    it('should process sync-critical tag correctly', async () => {
      const criticalEvent = { ...mockSyncEvent, tag: 'sync-critical' };

      await service.processSyncEvent(criticalEvent);

      expect(addSyncJob).toHaveBeenCalledWith({
        type: 'critical-sync',
        clientId: mockClientId,
        itemIds: ['item-2'], // Only item with status update
        priority: 10,
      });
    });

    it('should process sync-assets tag correctly', async () => {
      const assetsEvent = { ...mockSyncEvent, tag: 'sync-assets' };

      await service.processSyncEvent(assetsEvent);

      expect(addSyncJob).toHaveBeenCalledWith({
        type: 'type-sync',
        clientId: mockClientId,
        entityType: 'asset',
        itemIds: ['item-1'],
      });
    });

    it('should process sync-tasks tag correctly', async () => {
      const tasksEvent = { ...mockSyncEvent, tag: 'sync-tasks' };

      await service.processSyncEvent(tasksEvent);

      expect(addSyncJob).toHaveBeenCalledWith({
        type: 'type-sync',
        clientId: mockClientId,
        entityType: 'task',
        itemIds: ['item-2'],
      });
    });

    it('should handle custom sync tags', async () => {
      const customEvent = { ...mockSyncEvent, tag: 'custom-tag' };

      await service.processSyncEvent(customEvent);

      expect(addSyncJob).toHaveBeenCalledWith({
        type: 'custom-sync',
        clientId: mockClientId,
        tag: 'custom-tag',
        itemIds: ['item-1', 'item-2'],
      });
    });

    it('should handle no pending items gracefully', async () => {
      (prisma.syncQueue.findMany as jest.Mock).mockResolvedValue([]);

      await service.processSyncEvent(mockSyncEvent);

      expect(addSyncJob).not.toHaveBeenCalled();
    });

    it('should handle last chance scenario', async () => {
      const lastChanceEvent = { ...mockSyncEvent, lastChance: true };
      const failedItems = [
        {
          ...mockSyncItems[0],
          retryCount: 3, // Exceeds default max retries
        },
      ];

      (prisma.syncQueue.findMany as jest.Mock).mockResolvedValue(failedItems);
      (prisma.syncQueue.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.syncClient.findUnique as jest.Mock).mockResolvedValue({
        id: mockClientId,
        userId: mockUserId,
        user: { organizationId: 'org-123' },
      });
      (prisma.notification.create as jest.Mock).mockResolvedValue({});

      await service.processSyncEvent(lastChanceEvent);

      expect(prisma.syncQueue.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [failedItems[0].id] } },
        data: {
          status: 'FAILED',
          errorMessage: 'Max retries exceeded - sync abandoned',
        },
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          type: 'sync_failed',
          title: 'Sync Failed',
        }),
      });
    });

    it('should handle errors during sync processing', async () => {
      (prisma.syncQueue.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(service.processSyncEvent(mockSyncEvent)).rejects.toThrow('Database error');
    });
  });

  describe('getSyncQueueStats', () => {
    it('should return sync queue statistics', async () => {
      const mockStats = [
        { status: 'PENDING', entityType: 'asset', _count: 5 },
        { status: 'PENDING', entityType: 'task', _count: 3 },
        { status: 'FAILED', entityType: 'asset', _count: 2 },
        { status: 'COMPLETED', entityType: 'task', _count: 10 },
      ];

      const mockOldestPending = { createdAt: new Date('2024-01-01') };

      (prisma.syncQueue.groupBy as jest.Mock).mockResolvedValue(mockStats);
      (prisma.syncQueue.findFirst as jest.Mock).mockResolvedValue(mockOldestPending);

      const result = await service.getSyncQueueStats(mockClientId);

      expect(result).toEqual({
        pending: 8,
        failed: 2,
        completed: 10,
        byEntityType: {
          asset: 5,
          task: 3,
        },
        oldestPending: mockOldestPending.createdAt,
      });
    });

    it('should handle no oldest pending item', async () => {
      (prisma.syncQueue.groupBy as jest.Mock).mockResolvedValue([]);
      (prisma.syncQueue.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getSyncQueueStats(mockClientId);

      expect(result.oldestPending).toBeUndefined();
    });
  });

  describe('cleanupSyncQueue', () => {
    it('should clean up old completed sync items', async () => {
      const mockResult = { count: 15 };
      (prisma.syncQueue.deleteMany as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.cleanupSyncQueue(7);

      expect(result).toBe(15);
      expect(prisma.syncQueue.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'COMPLETED',
          processedAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should use default days to keep if not specified', async () => {
      const mockResult = { count: 5 };
      (prisma.syncQueue.deleteMany as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.cleanupSyncQueue();

      expect(result).toBe(5);
      expect(prisma.syncQueue.deleteMany).toHaveBeenCalled();
    });
  });

  describe('retryFailedItems', () => {
    it('should retry failed items within retry limit', async () => {
      const mockFailedItems = [
        { id: 'item-1', retryCount: 1 },
        { id: 'item-2', retryCount: 2 },
      ];

      (prisma.syncQueue.findMany as jest.Mock).mockResolvedValue(mockFailedItems);
      (prisma.syncQueue.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await service.retryFailedItems(mockClientId);

      expect(result).toBe(2);
      expect(prisma.syncQueue.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['item-1', 'item-2'] } },
        data: { status: 'PENDING' },
      });

      expect(addSyncJob).toHaveBeenCalledWith({
        type: 'retry-sync',
        clientId: mockClientId,
        itemIds: ['item-1', 'item-2'],
      });
    });

    it('should handle no failed items to retry', async () => {
      (prisma.syncQueue.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.retryFailedItems(mockClientId);

      expect(result).toBe(0);
      expect(prisma.syncQueue.updateMany).not.toHaveBeenCalled();
      expect(addSyncJob).not.toHaveBeenCalled();
    });

    it('should respect custom max retries limit', async () => {
      const mockFailedItems = [{ id: 'item-1', retryCount: 4 }];
      (prisma.syncQueue.findMany as jest.Mock).mockResolvedValue(mockFailedItems);

      await service.retryFailedItems(mockClientId, 5);

      expect(prisma.syncQueue.findMany).toHaveBeenCalledWith({
        where: {
          clientId: mockClientId,
          status: 'FAILED',
          retryCount: { lt: 5 },
        },
      });
    });
  });

  describe('getSyncHealth', () => {
    it('should calculate sync health metrics', async () => {
      const mockClients = [
        { id: 'client-1', _count: { syncQueues: 50 } },
        { id: 'client-2', _count: { syncQueues: 25 } },
      ];

      (prisma.syncClient.findMany as jest.Mock).mockResolvedValue(mockClients);
      (prisma.$transaction as jest.Mock).mockResolvedValue([200, 20]); // totalItems, failedItems

      const result = await service.getSyncHealth('org-123');

      expect(result).toEqual({
        healthScore: 80, // 100 - 20 (backlog penalty)
        activeClients: 2,
        syncBacklog: 75,
        failureRate: 0.1,
        recommendations: expect.arrayContaining([
          'High sync backlog detected. Consider increasing sync frequency.',
        ]),
      });
    });

    it('should handle organizations with no active clients', async () => {
      (prisma.syncClient.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.$transaction as jest.Mock).mockResolvedValue([0, 0]);

      const result = await service.getSyncHealth('org-123');

      expect(result.activeClients).toBe(0);
      expect(result.recommendations).toContain(
        'No active sync clients. Ensure PWA is properly configured.',
      );
    });

    it('should penalize high failure rates', async () => {
      const mockClients = [{ id: 'client-1', _count: { syncQueues: 10 } }];

      (prisma.syncClient.findMany as jest.Mock).mockResolvedValue(mockClients);
      (prisma.$transaction as jest.Mock).mockResolvedValue([100, 30]); // 30% failure rate

      const result = await service.getSyncHealth('org-123');

      expect(result.failureRate).toBe(0.3);
      expect(result.healthScore).toBeLessThan(80); // Penalized for high failure rate
      expect(result.recommendations).toContain(
        'High failure rate. Check network connectivity and conflict resolution.',
      );
    });

    it('should ensure health score does not go below 0', async () => {
      const mockClients = [{ id: 'client-1', _count: { syncQueues: 1000 } }];

      (prisma.syncClient.findMany as jest.Mock).mockResolvedValue(mockClients);
      (prisma.$transaction as jest.Mock).mockResolvedValue([100, 50]); // 50% failure rate

      const result = await service.getSyncHealth('org-123');

      expect(result.healthScore).toBeGreaterThanOrEqual(0);
    });
  });
});
