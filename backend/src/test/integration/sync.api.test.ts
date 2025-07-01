import { describe, beforeEach, afterEach, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import app from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, createJWTToken } from '../helpers';

describe('Sync API Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let organizationId: string;
  let deviceId: string;

  beforeAll(async () => {
    // Create test organization and user
    const organization = await createTestOrganization();
    organizationId = organization.id;

    const user = await createTestUser({ organizationId });
    userId = user.id;

    authToken = createJWTToken(user);
    deviceId = 'test-device-123';
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.syncQueue.deleteMany({
      where: {
        client: {
          userId
        }
      }
    });
    await prisma.syncClient.deleteMany({
      where: { userId }
    });
    await prisma.syncMetadata.deleteMany({
      where: {
        lastModifiedBy: userId
      }
    });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  });

  beforeEach(async () => {
    // Clean up sync data before each test
    await prisma.syncQueue.deleteMany({
      where: {
        client: {
          userId
        }
      }
    });
    await prisma.syncClient.deleteMany({
      where: { userId }
    });
  });

  describe('POST /api/sync', () => {
    it('should register new client and process empty sync', async () => {
      const syncRequest = {
        deviceId,
        deviceName: 'Test Device',
        changes: []
      };

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncRequest)
        .expect(200);

      expect(response.body).toHaveProperty('syncToken');
      expect(response.body).toHaveProperty('changes');
      expect(response.body).toHaveProperty('conflicts');
      expect(response.body).toHaveProperty('serverTime');
      expect(response.body.changes).toBeInstanceOf(Array);
      expect(response.body.conflicts).toBeInstanceOf(Array);

      // Verify client was registered
      const client = await prisma.syncClient.findFirst({
        where: { userId, deviceId }
      });
      expect(client).not.toBeNull();
      expect(client?.deviceName).toBe('Test Device');
    });

    it('should process asset creation sync', async () => {
      // First create an asset template for the test
      const assetTemplate = await prisma.assetTemplate.create({
        data: {
          id: 'template-123',
          organizationId,
          name: 'Test Template',
          category: 'HARDWARE',
          description: 'Test template',
          defaultFields: {},
          customFields: {}
        }
      });

      const syncRequest = {
        deviceId,
        deviceName: 'Test Device',
        changes: [
          {
            entityType: 'asset',
            entityId: 'asset-123',
            operation: 'CREATE',
            payload: {
              id: 'asset-123',
              organizationId,
              name: 'Test Asset',
              category: 'HARDWARE',
              status: 'OPERATIONAL',
              assetTemplateId: assetTemplate.id,
              path: '/asset-123',
              tags: [],
              customFields: {}
            },
            clientVersion: 1,
            timestamp: new Date().toISOString()
          }
        ]
      };

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncRequest)
        .expect(200);

      expect(response.body.conflicts).toHaveLength(0);

      // Verify asset was created
      const asset = await prisma.asset.findUnique({
        where: { id: 'asset-123' }
      });
      expect(asset).not.toBeNull();
      expect(asset?.name).toBe('Test Asset');
      expect(asset?.organizationId).toBe(organizationId);

      // Verify sync metadata was created
      const metadata = await prisma.syncMetadata.findUnique({
        where: {
          entityType_entityId: {
            entityType: 'asset',
            entityId: 'asset-123'
          }
        }
      });
      expect(metadata).not.toBeNull();
      expect(metadata?.version).toBe(1);
    });

    it('should detect and report conflicts', async () => {
      // Create an asset directly
      const asset = await prisma.asset.create({
        data: {
          id: 'asset-conflict',
          organizationId,
          name: 'Server Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          path: '/asset-conflict',
          tags: [],
          customFields: {}
        }
      });

      // Create sync metadata for the asset
      await prisma.syncMetadata.create({
        data: {
          entityType: 'asset',
          entityId: asset.id,
          version: 2,
          lastModifiedBy: 'other-user',
          lastModifiedAt: new Date(),
          checksum: 'server-checksum'
        }
      });

      const syncRequest = {
        deviceId,
        changes: [
          {
            entityType: 'asset',
            entityId: 'asset-conflict',
            operation: 'UPDATE',
            payload: {
              name: 'Client Asset',
              category: 'SOFTWARE'
            },
            clientVersion: 1, // Lower than server version
            timestamp: new Date().toISOString()
          }
        ]
      };

      const response = await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(syncRequest)
        .expect(200);

      expect(response.body.conflicts).toHaveLength(1);
      expect(response.body.conflicts[0]).toMatchObject({
        entityType: 'asset',
        entityId: 'asset-conflict',
        clientVersion: 1,
        serverVersion: 2,
        suggestedResolution: expect.any(String)
      });
    });

    it('should reject sync request with invalid data', async () => {
      const invalidSyncRequest = {
        deviceId: '', // Invalid empty device ID
        changes: [
          {
            entityType: 'invalid-type',
            entityId: 'not-a-uuid',
            operation: 'INVALID_OP',
            payload: {},
            clientVersion: -1,
            timestamp: 'invalid-date'
          }
        ]
      };

      await request(app)
        .post('/api/sync')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidSyncRequest)
        .expect(400);
    });

    it('should require authentication', async () => {
      const syncRequest = {
        deviceId,
        changes: []
      };

      await request(app)
        .post('/api/sync')
        .send(syncRequest)
        .expect(401);
    });
  });

  describe('POST /api/sync/delta', () => {
    beforeEach(async () => {
      // Register a sync client
      await prisma.syncClient.create({
        data: {
          userId,
          deviceId,
          deviceName: 'Test Device'
        }
      });
    });

    it('should return delta changes', async () => {
      // Create some test data with sync metadata
      const asset = await prisma.asset.create({
        data: {
          id: 'delta-asset',
          organizationId,
          name: 'Delta Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          path: '/delta-asset',
          tags: [],
          customFields: {}
        }
      });

      await prisma.syncMetadata.create({
        data: {
          entityType: 'asset',
          entityId: asset.id,
          version: 1,
          lastModifiedBy: userId,
          lastModifiedAt: new Date(),
          checksum: 'test-checksum'
        }
      });

      const deltaRequest = {
        deviceId,
        entityTypes: ['asset'],
        pageSize: 10
      };

      const response = await request(app)
        .post('/api/sync/delta')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deltaRequest)
        .expect(200);

      expect(response.body).toHaveProperty('changes');
      expect(response.body).toHaveProperty('hasMore');
      expect(response.body.changes).toBeInstanceOf(Array);
      expect(response.body.changes.length).toBeGreaterThan(0);
    });

    it('should handle pagination', async () => {
      const deltaRequest = {
        deviceId,
        pageSize: 1,
        pageToken: '0'
      };

      const response = await request(app)
        .post('/api/sync/delta')
        .set('Authorization', `Bearer ${authToken}`)
        .send(deltaRequest)
        .expect(200);

      expect(response.body).toHaveProperty('changes');
      expect(response.body).toHaveProperty('hasMore');
      expect(typeof response.body.hasMore).toBe('boolean');
    });
  });

  describe('GET /api/sync/status', () => {
    it('should return user sync status', async () => {
      // Register a sync client
      await prisma.syncClient.create({
        data: {
          userId,
          deviceId,
          deviceName: 'Test Device'
        }
      });

      const response = await request(app)
        .get('/api/sync/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('devices');
      expect(response.body).toHaveProperty('unresolvedConflicts');
      expect(response.body.devices).toBeInstanceOf(Array);
      expect(typeof response.body.unresolvedConflicts).toBe('number');
    });
  });

  describe('GET /api/sync/devices', () => {
    it('should return user devices', async () => {
      // Register a sync client
      await prisma.syncClient.create({
        data: {
          userId,
          deviceId,
          deviceName: 'Test Device'
        }
      });

      const response = await request(app)
        .get('/api/sync/devices')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toBe(1);
      expect(response.body[0]).toMatchObject({
        deviceId,
        deviceName: 'Test Device',
        userId
      });
    });
  });

  describe('DELETE /api/sync/devices/:deviceId', () => {
    it('should unregister a device', async () => {
      // Register a sync client
      const client = await prisma.syncClient.create({
        data: {
          userId,
          deviceId,
          deviceName: 'Test Device'
        }
      });

      await request(app)
        .delete(`/api/sync/devices/${deviceId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify device was deactivated
      const updatedClient = await prisma.syncClient.findUnique({
        where: { id: client.id }
      });
      expect(updatedClient?.isActive).toBe(false);
    });

    it('should return 404 for non-existent device', async () => {
      await request(app)
        .delete('/api/sync/devices/non-existent-device')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /api/sync/conflicts', () => {
    it('should return unresolved conflicts', async () => {
      // Create a test conflict
      await prisma.syncConflict.create({
        data: {
          entityType: 'asset',
          entityId: 'conflict-asset',
          clientVersion: 1,
          serverVersion: 2,
          clientData: { name: 'Client Data' },
          serverData: { name: 'Server Data' },
          resolution: 'MANUAL'
        }
      });

      const response = await request(app)
        .get('/api/sync/conflicts')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('conflicts');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('pageSize');
      expect(response.body.conflicts).toBeInstanceOf(Array);
    });

    it('should filter conflicts by entity type', async () => {
      const response = await request(app)
        .get('/api/sync/conflicts?entityType=asset&page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('conflicts');
    });
  });

  describe('POST /api/sync/conflicts/resolve', () => {
    it('should resolve a conflict', async () => {
      // Create a test asset and conflict
      const asset = await prisma.asset.create({
        data: {
          id: 'resolve-asset',
          organizationId,
          name: 'Conflict Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          path: '/resolve-asset',
          tags: [],
          customFields: {}
        }
      });

      const conflict = await prisma.syncConflict.create({
        data: {
          entityType: 'asset',
          entityId: asset.id,
          clientVersion: 1,
          serverVersion: 2,
          clientData: { name: 'Client Name' },
          serverData: { name: 'Server Name' },
          resolution: 'CLIENT_WINS'
        }
      });

      const resolveRequest = {
        conflictId: conflict.id,
        resolution: 'CLIENT_WINS'
      };

      await request(app)
        .post('/api/sync/conflicts/resolve')
        .set('Authorization', `Bearer ${authToken}`)
        .send(resolveRequest)
        .expect(200);

      // Verify conflict was resolved
      const resolvedConflict = await prisma.syncConflict.findUnique({
        where: { id: conflict.id }
      });
      expect(resolvedConflict?.resolvedBy).toBe(userId);
      expect(resolvedConflict?.resolvedAt).not.toBeNull();
    });

    it('should reject invalid conflict resolution', async () => {
      const invalidRequest = {
        conflictId: 'invalid-uuid',
        resolution: 'INVALID_RESOLUTION'
      };

      await request(app)
        .post('/api/sync/conflicts/resolve')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidRequest)
        .expect(400);
    });
  });

  describe('POST /api/sync/queue/retry', () => {
    it('should retry failed sync operations', async () => {
      // Register a sync client
      const client = await prisma.syncClient.create({
        data: {
          userId,
          deviceId,
          deviceName: 'Test Device'
        }
      });

      // Create a failed sync item
      await prisma.syncQueue.create({
        data: {
          clientId: client.id,
          entityType: 'asset',
          entityId: 'retry-asset',
          operation: 'CREATE',
          payload: { name: 'Test Asset' },
          clientVersion: 1,
          status: 'FAILED',
          retryCount: 1,
          errorMessage: 'Test error'
        }
      });

      const retryRequest = {
        deviceId
      };

      const response = await request(app)
        .post('/api/sync/queue/retry')
        .set('Authorization', `Bearer ${authToken}`)
        .send(retryRequest)
        .expect(200);

      expect(response.body).toHaveProperty('processed');
      expect(response.body).toHaveProperty('succeeded');
      expect(response.body).toHaveProperty('failed');
      expect(typeof response.body.processed).toBe('number');
    });
  });

  describe('POST /api/sync/cache/invalidate', () => {
    it('should invalidate cache', async () => {
      const invalidateRequest = {
        entityType: 'asset',
        entityIds: ['asset-123', 'asset-456']
      };

      await request(app)
        .post('/api/sync/cache/invalidate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidateRequest)
        .expect(200);
    });

    it('should invalidate all cache when no specific entities provided', async () => {
      const invalidateRequest = {};

      await request(app)
        .post('/api/sync/cache/invalidate')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidateRequest)
        .expect(200);
    });
  });
});