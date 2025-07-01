import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, getAuthToken } from '../helpers';
import { conditionalDescribe } from './conditionalDescribe';

conditionalDescribe('PWA Sync API Integration Tests', () => {
  let testUser: any;
  let testOrganization: any;
  let authToken: string;

  beforeAll(async () => {
    testOrganization = await createTestOrganization('PWA Sync Test Org');
    testUser = await createTestUser({
      email: 'pwa.sync.test@example.com',
      fullName: 'PWA Sync Test User',
      role: 'OWNER',
      organizationId: testOrganization.id,
    });
    authToken = await getAuthToken(testUser.id);
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.organization.delete({ where: { id: testOrganization.id } });
  });

  beforeEach(async () => {
    // Clean up existing test data
    await prisma.syncConflict.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.offlineAction.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.clientSyncState.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.task.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.asset.deleteMany({ where: { organizationId: testOrganization.id } });
  });

  describe('POST /api/pwa/sync/register', () => {
    it('should register a new client for sync', async () => {
      const registrationData = {
        clientId: 'test-client-123',
        clientType: 'web-browser',
        deviceInfo: {
          userAgent: 'Mozilla/5.0 Test Browser',
          platform: 'Web',
          appVersion: '1.0.0',
        },
        capabilities: {
          backgroundSync: true,
          push: true,
          persistence: true,
        },
      };

      const response = await request(app)
        .post('/api/pwa/sync/register')
        .send(registrationData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toMatchObject({
        clientId: 'test-client-123',
        syncToken: expect.any(String),
        lastSyncTimestamp: expect.any(String),
        capabilities: registrationData.capabilities,
      });

      // Verify client state was created
      const clientState = await prisma.clientSyncState.findUnique({
        where: { 
          clientId_organizationId: {
            clientId: 'test-client-123',
            organizationId: testOrganization.id,
          }
        },
      });
      expect(clientState).toBeTruthy();
    });

    it('should update existing client registration', async () => {
      // First registration
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId: 'existing-client',
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Old Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Update registration
      const updateData = {
        clientId: 'existing-client',
        clientType: 'web-browser',
        deviceInfo: { userAgent: 'Updated Browser' },
        capabilities: { backgroundSync: false },
      };

      const response = await request(app)
        .post('/api/pwa/sync/register')
        .send(updateData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.clientId).toBe('existing-client');
      
      const updatedClient = await prisma.clientSyncState.findUnique({
        where: { 
          clientId_organizationId: {
            clientId: 'existing-client',
            organizationId: testOrganization.id,
          }
        },
      });
      expect(updatedClient!.deviceInfo).toMatchObject({ userAgent: 'Updated Browser' });
    });

    it('should validate registration data', async () => {
      const invalidData = {
        // Missing clientId
        clientType: 'web-browser',
      };

      await request(app)
        .post('/api/pwa/sync/register')
        .send(invalidData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/pwa/sync/register')
        .send({ clientId: 'test', clientType: 'web-browser' })
        .expect(401);
    });
  });

  describe('POST /api/pwa/sync/changes', () => {
    let testAsset: any;
    let testTask: any;
    let clientId: string;

    beforeEach(async () => {
      clientId = 'sync-test-client';
      
      // Register client
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Create test entities
      testAsset = await prisma.asset.create({
        data: {
          name: 'Sync Test Asset',
          category: 'Computer',
          status: 'OPERATIONAL',
          organizationId: testOrganization.id,
        },
      });

      testTask = await prisma.task.create({
        data: {
          title: 'Sync Test Task',
          status: 'TODO',
          priority: 'MEDIUM',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });
    });

    it('should upload offline changes for sync', async () => {
      const offlineChanges = {
        clientId,
        changes: [
          {
            id: 'offline-1',
            entityType: 'Asset',
            entityId: testAsset.id,
            action: 'UPDATE',
            data: { status: 'MAINTENANCE' },
            timestamp: new Date().toISOString(),
            clientTimestamp: Date.now(),
          },
          {
            id: 'offline-2',
            entityType: 'Task',
            entityId: testTask.id,
            action: 'UPDATE',
            data: { status: 'IN_PROGRESS' },
            timestamp: new Date().toISOString(),
            clientTimestamp: Date.now(),
          },
        ],
      };

      const response = await request(app)
        .post('/api/pwa/sync/changes')
        .send(offlineChanges)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toMatchObject({
        accepted: 2,
        conflicts: [],
        processed: expect.any(Array),
      });

      // Verify offline actions were created
      const offlineActions = await prisma.offlineAction.findMany({
        where: { clientId, organizationId: testOrganization.id },
      });
      expect(offlineActions).toHaveLength(2);
    });

    it('should detect and handle sync conflicts', async () => {
      // First, update the asset directly (simulating server-side change)
      await prisma.asset.update({
        where: { id: testAsset.id },
        data: { 
          status: 'RETIRED',
          updatedAt: new Date(),
        },
      });

      // Now try to sync conflicting offline change
      const conflictingChanges = {
        clientId,
        changes: [
          {
            id: 'conflict-1',
            entityType: 'Asset',
            entityId: testAsset.id,
            action: 'UPDATE',
            data: { status: 'MAINTENANCE' },
            timestamp: new Date(Date.now() - 60000).toISOString(), // Older timestamp
            clientTimestamp: Date.now() - 60000,
          },
        ],
      };

      const response = await request(app)
        .post('/api/pwa/sync/changes')
        .send(conflictingChanges)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body.conflicts).toHaveLength(1);
      expect(response.body.conflicts[0]).toMatchObject({
        entityType: 'Asset',
        entityId: testAsset.id,
        conflictType: 'UPDATE_CONFLICT',
      });

      // Verify conflict was recorded
      const conflicts = await prisma.syncConflict.findMany({
        where: { entityId: testAsset.id },
      });
      expect(conflicts).toHaveLength(1);
    });

    it('should handle create operations', async () => {
      const createChanges = {
        clientId,
        changes: [
          {
            id: 'create-1',
            entityType: 'Asset',
            entityId: 'temp-asset-id',
            action: 'CREATE',
            data: {
              name: 'New Offline Asset',
              category: 'Equipment',
              status: 'OPERATIONAL',
            },
            timestamp: new Date().toISOString(),
            clientTimestamp: Date.now(),
          },
        ],
      };

      const response = await request(app)
        .post('/api/pwa/sync/changes')
        .send(createChanges)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body.accepted).toBe(1);
      expect(response.body.processed[0]).toHaveProperty('serverEntityId');
      expect(response.body.processed[0].serverEntityId).not.toBe('temp-asset-id');

      // Verify asset was created
      const createdAsset = await prisma.asset.findUnique({
        where: { id: response.body.processed[0].serverEntityId },
      });
      expect(createdAsset).toBeTruthy();
      expect(createdAsset!.name).toBe('New Offline Asset');
    });

    it('should handle delete operations', async () => {
      const deleteChanges = {
        clientId,
        changes: [
          {
            id: 'delete-1',
            entityType: 'Asset',
            entityId: testAsset.id,
            action: 'DELETE',
            data: {},
            timestamp: new Date().toISOString(),
            clientTimestamp: Date.now(),
          },
        ],
      };

      const response = await request(app)
        .post('/api/pwa/sync/changes')
        .send(deleteChanges)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body.accepted).toBe(1);

      // Verify asset was deleted (or marked as deleted)
      const deletedAsset = await prisma.asset.findUnique({
        where: { id: testAsset.id },
      });
      expect(deletedAsset).toBeNull();
    });

    it('should validate change data structure', async () => {
      const invalidChanges = {
        clientId,
        changes: [
          {
            // Missing required fields
            entityType: 'Asset',
            action: 'UPDATE',
          },
        ],
      };

      await request(app)
        .post('/api/pwa/sync/changes')
        .send(invalidChanges)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should reject changes from unregistered clients', async () => {
      const changesFromUnregisteredClient = {
        clientId: 'unregistered-client',
        changes: [
          {
            id: 'test-1',
            entityType: 'Asset',
            entityId: testAsset.id,
            action: 'UPDATE',
            data: { status: 'MAINTENANCE' },
            timestamp: new Date().toISOString(),
            clientTimestamp: Date.now(),
          },
        ],
      };

      await request(app)
        .post('/api/pwa/sync/changes')
        .send(changesFromUnregisteredClient)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('GET /api/pwa/sync/pull', () => {
    let clientId: string;
    let testAsset: any;

    beforeEach(async () => {
      clientId = 'pull-test-client';
      
      // Register client
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Create test asset
      testAsset = await prisma.asset.create({
        data: {
          name: 'Pull Test Asset',
          category: 'Computer',
          status: 'OPERATIONAL',
          organizationId: testOrganization.id,
        },
      });
    });

    it('should pull server changes since last sync', async () => {
      const response = await request(app)
        .get('/api/pwa/sync/pull')
        .query({ clientId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('changes');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('hasMore');

      expect(response.body.changes).toBeInstanceOf(Array);
      expect(response.body.changes.length).toBeGreaterThan(0);

      const assetChange = response.body.changes.find((c: any) => c.entityId === testAsset.id);
      expect(assetChange).toBeTruthy();
      expect(assetChange.action).toBe('CREATE');
    });

    it('should respect since parameter for incremental sync', async () => {
      const firstSync = await request(app)
        .get('/api/pwa/sync/pull')
        .query({ clientId })
        .set('Authorization', `Bearer ${authToken}`);

      const firstSyncTime = firstSync.body.timestamp;

      // Create new asset after first sync
      const newAsset = await prisma.asset.create({
        data: {
          name: 'New Asset After Sync',
          category: 'Equipment',
          status: 'OPERATIONAL',
          organizationId: testOrganization.id,
        },
      });

      // Second sync should only return new changes
      const response = await request(app)
        .get('/api/pwa/sync/pull')
        .query({ 
          clientId,
          since: firstSyncTime
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.changes).toHaveLength(1);
      expect(response.body.changes[0].entityId).toBe(newAsset.id);
    });

    it('should paginate large change sets', async () => {
      // Create many assets
      const manyAssets = Array.from({ length: 50 }, (_, i) => ({
        name: `Bulk Asset ${i}`,
        category: 'Computer',
        status: 'OPERATIONAL',
        organizationId: testOrganization.id,
      }));

      await prisma.asset.createMany({ data: manyAssets });

      const response = await request(app)
        .get('/api/pwa/sync/pull')
        .query({ 
          clientId,
          limit: 20
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.changes).toHaveLength(20);
      expect(response.body.hasMore).toBe(true);
      expect(response.body).toHaveProperty('nextCursor');
    });

    it('should filter changes by entity types', async () => {
      // Create task
      await prisma.task.create({
        data: {
          title: 'Filter Test Task',
          status: 'TODO',
          priority: 'MEDIUM',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });

      const response = await request(app)
        .get('/api/pwa/sync/pull')
        .query({ 
          clientId,
          entityTypes: 'Asset'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      response.body.changes.forEach((change: any) => {
        expect(change.entityType).toBe('Asset');
      });
    });

    it('should handle client not found', async () => {
      await request(app)
        .get('/api/pwa/sync/pull')
        .query({ clientId: 'non-existent-client' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /api/pwa/sync/conflicts', () => {
    let clientId: string;
    let testConflict: any;

    beforeEach(async () => {
      clientId = 'conflict-test-client';
      
      // Register client
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Create test conflict
      testConflict = await prisma.syncConflict.create({
        data: {
          entityType: 'Asset',
          entityId: 'conflict-asset-id',
          clientId,
          conflictType: 'UPDATE_CONFLICT',
          serverVersion: { status: 'RETIRED' },
          clientVersion: { status: 'MAINTENANCE' },
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });
    });

    it('should return list of sync conflicts', async () => {
      const response = await request(app)
        .get('/api/pwa/sync/conflicts')
        .query({ clientId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('conflicts');
      expect(response.body.conflicts).toHaveLength(1);
      
      const conflict = response.body.conflicts[0];
      expect(conflict).toMatchObject({
        id: testConflict.id,
        entityType: 'Asset',
        entityId: 'conflict-asset-id',
        conflictType: 'UPDATE_CONFLICT',
        serverVersion: { status: 'RETIRED' },
        clientVersion: { status: 'MAINTENANCE' },
      });
    });

    it('should filter conflicts by resolution status', async () => {
      // Create resolved conflict
      await prisma.syncConflict.create({
        data: {
          entityType: 'Task',
          entityId: 'resolved-task-id',
          clientId,
          conflictType: 'DELETE_CONFLICT',
          serverVersion: {},
          clientVersion: {},
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          resolvedAt: new Date(),
          resolution: 'SERVER_WINS',
        },
      });

      const response = await request(app)
        .get('/api/pwa/sync/conflicts')
        .query({ 
          clientId,
          status: 'unresolved'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.conflicts).toHaveLength(1);
      expect(response.body.conflicts[0].resolvedAt).toBeNull();
    });
  });

  describe('POST /api/pwa/sync/conflicts/:id/resolve', () => {
    let clientId: string;
    let testConflict: any;
    let testAsset: any;

    beforeEach(async () => {
      clientId = 'resolve-test-client';
      
      // Register client
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Create test asset
      testAsset = await prisma.asset.create({
        data: {
          name: 'Conflict Resolution Asset',
          category: 'Computer',
          status: 'RETIRED',
          organizationId: testOrganization.id,
        },
      });

      // Create test conflict
      testConflict = await prisma.syncConflict.create({
        data: {
          entityType: 'Asset',
          entityId: testAsset.id,
          clientId,
          conflictType: 'UPDATE_CONFLICT',
          serverVersion: { status: 'RETIRED' },
          clientVersion: { status: 'MAINTENANCE' },
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });
    });

    it('should resolve conflict with server version', async () => {
      const resolution = {
        resolution: 'SERVER_WINS',
        resolvedBy: testUser.id,
      };

      const response = await request(app)
        .post(`/api/pwa/sync/conflicts/${testConflict.id}/resolve`)
        .send(resolution)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testConflict.id,
        resolution: 'SERVER_WINS',
        resolvedAt: expect.any(String),
        resolvedBy: testUser.id,
      });

      // Verify asset keeps server version
      const updatedAsset = await prisma.asset.findUnique({
        where: { id: testAsset.id },
      });
      expect(updatedAsset!.status).toBe('RETIRED');
    });

    it('should resolve conflict with client version', async () => {
      const resolution = {
        resolution: 'CLIENT_WINS',
        resolvedBy: testUser.id,
      };

      const response = await request(app)
        .post(`/api/pwa/sync/conflicts/${testConflict.id}/resolve`)
        .send(resolution)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.resolution).toBe('CLIENT_WINS');

      // Verify asset gets client version
      const updatedAsset = await prisma.asset.findUnique({
        where: { id: testAsset.id },
      });
      expect(updatedAsset!.status).toBe('MAINTENANCE');
    });

    it('should resolve conflict with manual merge', async () => {
      const resolution = {
        resolution: 'MANUAL_MERGE',
        mergedData: { 
          status: 'OPERATIONAL',
          notes: 'Manually resolved conflict'
        },
        resolvedBy: testUser.id,
      };

      const response = await request(app)
        .post(`/api/pwa/sync/conflicts/${testConflict.id}/resolve`)
        .send(resolution)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.resolution).toBe('MANUAL_MERGE');

      // Verify asset gets merged data
      const updatedAsset = await prisma.asset.findUnique({
        where: { id: testAsset.id },
      });
      expect(updatedAsset!.status).toBe('OPERATIONAL');
    });

    it('should return 404 for non-existent conflict', async () => {
      await request(app)
        .post('/api/pwa/sync/conflicts/non-existent-id/resolve')
        .send({ resolution: 'SERVER_WINS' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should not resolve already resolved conflicts', async () => {
      // First resolution
      await request(app)
        .post(`/api/pwa/sync/conflicts/${testConflict.id}/resolve`)
        .send({ resolution: 'SERVER_WINS' })
        .set('Authorization', `Bearer ${authToken}`);

      // Attempt second resolution
      await request(app)
        .post(`/api/pwa/sync/conflicts/${testConflict.id}/resolve`)
        .send({ resolution: 'CLIENT_WINS' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('DELETE /api/pwa/sync/clients/:clientId', () => {
    let clientId: string;

    beforeEach(async () => {
      clientId = 'cleanup-test-client';
      
      // Register client
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Create some offline actions
      await prisma.offlineAction.createMany({
        data: [
          {
            id: 'action-1',
            clientId,
            entityType: 'Asset',
            entityId: 'test-asset',
            action: 'UPDATE',
            data: {},
            organizationId: testOrganization.id,
            userId: testUser.id,
          },
          {
            id: 'action-2', 
            clientId,
            entityType: 'Task',
            entityId: 'test-task',
            action: 'CREATE',
            data: {},
            organizationId: testOrganization.id,
            userId: testUser.id,
          },
        ],
      });
    });

    it('should unregister client and clean up data', async () => {
      await request(app)
        .delete(`/api/pwa/sync/clients/${clientId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify client state was deleted
      const clientState = await prisma.clientSyncState.findUnique({
        where: { 
          clientId_organizationId: {
            clientId,
            organizationId: testOrganization.id,
          }
        },
      });
      expect(clientState).toBeNull();

      // Verify offline actions were deleted
      const offlineActions = await prisma.offlineAction.findMany({
        where: { clientId },
      });
      expect(offlineActions).toHaveLength(0);
    });

    it('should return 404 for non-existent client', async () => {
      await request(app)
        .delete('/api/pwa/sync/clients/non-existent-client')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /api/pwa/sync/status', () => {
    let clientId: string;

    beforeEach(async () => {
      clientId = 'status-test-client';
      
      // Register client
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should return sync status for client', async () => {
      const response = await request(app)
        .get('/api/pwa/sync/status')
        .query({ clientId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        clientId,
        lastSyncTimestamp: expect.any(String),
        pendingActions: 0,
        unreadConflicts: 0,
        syncHealth: 'healthy',
      });
    });

    it('should include pending actions count', async () => {
      // Create pending offline action
      await prisma.offlineAction.create({
        data: {
          id: 'pending-action',
          clientId,
          entityType: 'Asset',
          entityId: 'test-asset',
          action: 'UPDATE',
          data: {},
          status: 'PENDING',
          organizationId: testOrganization.id,
          userId: testUser.id,
        },
      });

      const response = await request(app)
        .get('/api/pwa/sync/status')
        .query({ clientId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.pendingActions).toBe(1);
    });

    it('should include unresolved conflicts count', async () => {
      // Create unresolved conflict
      await prisma.syncConflict.create({
        data: {
          entityType: 'Asset',
          entityId: 'conflict-asset',
          clientId,
          conflictType: 'UPDATE_CONFLICT',
          serverVersion: {},
          clientVersion: {},
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });

      const response = await request(app)
        .get('/api/pwa/sync/status')
        .query({ clientId })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.unreadConflicts).toBe(1);
    });
  });

  describe('Performance and error handling', () => {
    it('should handle large sync payloads efficiently', async () => {
      const clientId = 'performance-test-client';
      
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Create large change set
      const largeChanges = {
        clientId,
        changes: Array.from({ length: 100 }, (_, i) => ({
          id: `large-change-${i}`,
          entityType: 'Asset',
          entityId: `temp-asset-${i}`,
          action: 'CREATE',
          data: {
            name: `Large Dataset Asset ${i}`,
            category: 'Computer',
            status: 'OPERATIONAL',
          },
          timestamp: new Date().toISOString(),
          clientTimestamp: Date.now(),
        })),
      };

      const start = Date.now();
      const response = await request(app)
        .post('/api/pwa/sync/changes')
        .send(largeChanges)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);
      const duration = Date.now() - start;

      expect(response.body.accepted).toBe(100);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should handle malformed sync requests gracefully', async () => {
      await request(app)
        .post('/api/pwa/sync/changes')
        .send('invalid-json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle database errors during sync', async () => {
      const clientId = 'error-test-client';
      
      await request(app)
        .post('/api/pwa/sync/register')
        .send({
          clientId,
          clientType: 'web-browser',
          deviceInfo: { userAgent: 'Test Browser' },
        })
        .set('Authorization', `Bearer ${authToken}`);

      // Mock database error
      const originalCreate = prisma.offlineAction.create;
      jest.spyOn(prisma.offlineAction, 'create').mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/pwa/sync/changes')
        .send({
          clientId,
          changes: [{
            id: 'error-change',
            entityType: 'Asset',
            entityId: 'test-asset',
            action: 'UPDATE',
            data: { status: 'MAINTENANCE' },
            timestamp: new Date().toISOString(),
            clientTimestamp: Date.now(),
          }],
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');

      prisma.offlineAction.create = originalCreate;
    });
  });
});