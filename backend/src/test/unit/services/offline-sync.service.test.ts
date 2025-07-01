import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { OfflineSyncService } from '../../../services/offline-sync.service';
import { prisma } from '../../../lib/prisma';
import { AppError } from '../../../utils/errors';
import type { SyncRequest, SyncChange } from '../../../services/offline-sync.service';

// Mock prisma
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    syncClient: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    syncQueue: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    syncMetadata: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    syncConflict: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    asset: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    task: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('OfflineSyncService', () => {
  let syncService: OfflineSyncService;
  const userId = 'user-123';
  const deviceId = 'device-456';
  const clientId = 'client-789';

  beforeEach(() => {
    syncService = new OfflineSyncService();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('registerClient', () => {
    it('should register a new sync client', async () => {
      const mockClient = {
        id: clientId,
        userId,
        deviceId,
        deviceName: 'Test Device',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSyncAt: null,
        syncToken: null,
      };

      mockPrisma.syncClient.upsert.mockResolvedValue(mockClient);

      const result = await syncService.registerClient(userId, deviceId, 'Test Device');

      expect(result).toEqual(mockClient);
      expect(mockPrisma.syncClient.upsert).toHaveBeenCalledWith({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
        update: {
          deviceName: 'Test Device',
          isActive: true,
          updatedAt: expect.any(Date),
        },
        create: {
          userId,
          deviceId,
          deviceName: 'Test Device',
          isActive: true,
        },
      });
    });
  });

  describe('processSync', () => {
    const mockClient = {
      id: clientId,
      userId,
      deviceId,
      deviceName: 'Test Device',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSyncAt: new Date(Date.now() - 3600000), // 1 hour ago
      syncToken: 'old-token',
    };

    const mockSyncRequest: SyncRequest = {
      deviceId,
      deviceName: 'Test Device',
      syncToken: 'old-token',
      changes: [
        {
          entityType: 'asset',
          entityId: 'asset-123',
          operation: 'CREATE',
          payload: {
            name: 'Test Asset',
            category: 'HARDWARE',
            organizationId: 'org-123',
          },
          clientVersion: 1,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    beforeEach(() => {
      mockPrisma.syncClient.upsert.mockResolvedValue(mockClient);
      mockPrisma.syncClient.update.mockResolvedValue({
        ...mockClient,
        syncToken: expect.any(String),
      });
      mockPrisma.syncMetadata.findMany.mockResolvedValue([]);
    });

    it('should process sync request successfully', async () => {
      mockPrisma.syncQueue.create.mockResolvedValue({
        id: 'queue-123',
        clientId,
        entityType: 'asset',
        entityId: 'asset-123',
        operation: 'CREATE',
        payload: mockSyncRequest.changes[0].payload,
        clientVersion: 1,
        status: 'SYNCING',
        conflictData: null,
        resolution: null,
        retryCount: 0,
        errorMessage: null,
        createdAt: new Date(),
        processedAt: null,
      });

      mockPrisma.syncMetadata.findUnique.mockResolvedValue(null);
      mockPrisma.asset.create.mockResolvedValue({
        id: 'asset-123',
        name: 'Test Asset',
        category: 'HARDWARE',
        organizationId: 'org-123',
      } as any);

      mockPrisma.syncMetadata.upsert.mockResolvedValue({} as any);
      mockPrisma.syncQueue.update.mockResolvedValue({} as any);

      const result = await syncService.processSync(userId, mockSyncRequest);

      expect(result).toHaveProperty('syncToken');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('serverTime');
      expect(result.conflicts).toHaveLength(0);
    });

    it('should handle conflicts during sync', async () => {
      // Mock existing metadata to trigger conflict
      mockPrisma.syncMetadata.findUnique.mockResolvedValue({
        id: 'meta-123',
        entityType: 'asset',
        entityId: 'asset-123',
        version: 2, // Higher than client version
        lastModifiedBy: 'other-user',
        lastModifiedAt: new Date(),
        checksum: 'different-checksum',
        deletedAt: null,
        clientId: 'other-client',
      });

      mockPrisma.asset.findUnique.mockResolvedValue({
        id: 'asset-123',
        name: 'Different Asset Name',
        category: 'SOFTWARE',
        organizationId: 'org-123',
      } as any);

      mockPrisma.syncQueue.create.mockResolvedValue({
        id: 'queue-123',
        clientId,
        entityType: 'asset',
        entityId: 'asset-123',
        operation: 'UPDATE',
        payload: mockSyncRequest.changes[0].payload,
        clientVersion: 1,
        status: 'CONFLICT',
        conflictData: null,
        resolution: null,
        retryCount: 0,
        errorMessage: null,
        createdAt: new Date(),
        processedAt: null,
      });

      mockPrisma.syncConflict.create.mockResolvedValue({} as any);

      const result = await syncService.processSync(userId, mockSyncRequest);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]).toMatchObject({
        entityType: 'asset',
        entityId: 'asset-123',
        clientVersion: 1,
        serverVersion: 2,
      });
    });
  });

  describe('conflict resolution', () => {
    it('should resolve conflict with client wins strategy', async () => {
      const conflictId = 'conflict-123';
      const resolvedBy = 'user-123';

      mockPrisma.syncConflict.findUnique.mockResolvedValue({
        id: conflictId,
        entityType: 'asset',
        entityId: 'asset-123',
        clientVersion: 1,
        serverVersion: 2,
        clientData: { name: 'Client Asset' },
        serverData: { name: 'Server Asset' },
        resolution: 'CLIENT_WINS',
        resolvedBy: null,
        resolvedAt: null,
        createdAt: new Date(),
      });

      mockPrisma.asset.update.mockResolvedValue({} as any);
      mockPrisma.syncConflict.update.mockResolvedValue({} as any);

      await syncService.resolveConflict(conflictId, 'CLIENT_WINS', resolvedBy);

      expect(mockPrisma.asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-123' },
        data: { name: 'Client Asset' },
      });

      expect(mockPrisma.syncConflict.update).toHaveBeenCalledWith({
        where: { id: conflictId },
        data: {
          resolution: 'CLIENT_WINS',
          resolvedBy,
          resolvedAt: expect.any(Date),
        },
      });
    });

    it('should resolve conflict with server wins strategy', async () => {
      const conflictId = 'conflict-123';
      const resolvedBy = 'user-123';

      mockPrisma.syncConflict.findUnique.mockResolvedValue({
        id: conflictId,
        entityType: 'asset',
        entityId: 'asset-123',
        clientVersion: 1,
        serverVersion: 2,
        clientData: { name: 'Client Asset' },
        serverData: { name: 'Server Asset' },
        resolution: 'SERVER_WINS',
        resolvedBy: null,
        resolvedAt: null,
        createdAt: new Date(),
      });

      mockPrisma.syncConflict.update.mockResolvedValue({} as any);

      await syncService.resolveConflict(conflictId, 'SERVER_WINS', resolvedBy);

      // Should not update the asset (server data remains)
      expect(mockPrisma.asset.update).not.toHaveBeenCalled();

      expect(mockPrisma.syncConflict.update).toHaveBeenCalledWith({
        where: { id: conflictId },
        data: {
          resolution: 'SERVER_WINS',
          resolvedBy,
          resolvedAt: expect.any(Date),
        },
      });
    });

    it('should throw error for non-existent conflict', async () => {
      mockPrisma.syncConflict.findUnique.mockResolvedValue(null);

      await expect(
        syncService.resolveConflict('non-existent', 'CLIENT_WINS', 'user-123')
      ).rejects.toThrow(AppError);
    });
  });

  describe('delta sync', () => {
    it('should return paginated delta changes', async () => {
      const options = {
        entityTypes: ['asset'],
        since: new Date(Date.now() - 3600000),
        pageSize: 10,
        pageToken: undefined,
      };

      const mockMetadata = [
        {
          id: 'meta-1',
          entityType: 'asset',
          entityId: 'asset-1',
          version: 2,
          lastModifiedBy: 'user-123',
          lastModifiedAt: new Date(),
          checksum: 'checksum-1',
          deletedAt: null,
          clientId: null,
        },
      ];

      mockPrisma.syncMetadata.findMany.mockResolvedValue(mockMetadata);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        organizationId: 'org-123',
      } as any);
      mockPrisma.asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        organizationId: 'org-123',
      } as any);

      const result = await syncService.getDeltaChanges(clientId, userId, options);

      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('hasMore');
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        entityType: 'asset',
        entityId: 'asset-1',
        operation: 'UPDATE',
      });
    });

    it('should handle pagination correctly', async () => {
      const options = {
        entityTypes: undefined,
        since: undefined,
        pageSize: 1,
        pageToken: '0',
      };

      // Mock 2 items to test pagination
      const mockMetadata = [
        {
          id: 'meta-1',
          entityType: 'asset',
          entityId: 'asset-1',
          version: 1,
          lastModifiedBy: 'user-123',
          lastModifiedAt: new Date(),
          checksum: 'checksum-1',
          deletedAt: null,
          clientId: null,
        },
        {
          id: 'meta-2',
          entityType: 'asset',
          entityId: 'asset-2',
          version: 1,
          lastModifiedBy: 'user-123',
          lastModifiedAt: new Date(),
          checksum: 'checksum-2',
          deletedAt: null,
          clientId: null,
        },
      ];

      mockPrisma.syncMetadata.findMany.mockResolvedValue(mockMetadata);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        organizationId: 'org-123',
      } as any);
      mockPrisma.asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        organizationId: 'org-123',
      } as any);

      const result = await syncService.getDeltaChanges(clientId, userId, options);

      expect(result.hasMore).toBe(true);
      expect(result.nextPageToken).toBe('1');
      expect(result.changes).toHaveLength(1);
    });
  });

  describe('permission checking', () => {
    it('should allow access to assets in same organization', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        organizationId: 'org-123',
      } as any);

      mockPrisma.asset.findUnique.mockResolvedValue({
        id: 'asset-123',
        organizationId: 'org-123',
      } as any);

      const hasPermission = await (syncService as any).checkPermission(
        userId,
        'asset',
        'asset-123',
        'READ'
      );

      expect(hasPermission).toBe(true);
    });

    it('should deny access to assets in different organization', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        organizationId: 'org-123',
      } as any);

      mockPrisma.asset.findUnique.mockResolvedValue({
        id: 'asset-123',
        organizationId: 'org-456', // Different organization
      } as any);

      const hasPermission = await (syncService as any).checkPermission(
        userId,
        'asset',
        'asset-123',
        'READ'
      );

      expect(hasPermission).toBe(false);
    });

    it('should deny access for non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const hasPermission = await (syncService as any).checkPermission(
        'non-existent-user',
        'asset',
        'asset-123',
        'READ'
      );

      expect(hasPermission).toBe(false);
    });
  });

  describe('sync statistics', () => {
    it('should return sync stats for organization', async () => {
      const organizationId = 'org-123';
      
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ] as any);

      mockPrisma.$transaction.mockResolvedValue([
        2, // active clients count
        [
          { status: 'PENDING', _count: 5 },
          { status: 'FAILED', _count: 2 },
          { status: 'COMPLETED', _count: 10 },
        ],
        1, // unresolved conflicts count
      ]);

      const stats = await syncService.getSyncStats(organizationId);

      expect(stats).toEqual({
        activeClients: 2,
        queueStatus: [
          { status: 'PENDING', _count: 5 },
          { status: 'FAILED', _count: 2 },
          { status: 'COMPLETED', _count: 10 },
        ],
        unresolvedConflicts: 1,
      });
    });
  });

  describe('cleanup operations', () => {
    it('should clean up old sync data', async () => {
      const daysToKeep = 30;
      
      mockPrisma.syncQueue.deleteMany.mockResolvedValue({ count: 10 });
      mockPrisma.syncConflict.deleteMany.mockResolvedValue({ count: 5 });

      await syncService.cleanupOldSyncData(daysToKeep);

      expect(mockPrisma.syncQueue.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'COMPLETED',
          processedAt: {
            lt: expect.any(Date),
          },
        },
      });

      expect(mockPrisma.syncConflict.deleteMany).toHaveBeenCalledWith({
        where: {
          resolvedAt: {
            lt: expect.any(Date),
          },
        },
      });
    });
  });
});