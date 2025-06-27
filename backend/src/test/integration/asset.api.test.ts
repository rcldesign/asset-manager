import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type { Application } from 'express';
import type Redis from 'ioredis';

import {
  createTestApp,
  setupTestDatabase,
  cleanupTestDatabase,
  setupTestEnvironment,
  testDataGenerators,
} from './app.setup';
import type { TestDatabaseHelper } from '../helpers';
import { TestAPIHelper } from '../helpers';
import { getRedis } from '../../lib/redis';
import type { Location, AssetTemplate } from '@prisma/client';
import type { TestOrganization, TestUser } from '../helpers';

describe('Asset API Integration Tests', () => {
  let app: Application;
  let api: TestAPIHelper;
  let dbHelper: TestDatabaseHelper;
  let redisClient: Redis;
  let testOrg: TestOrganization;
  let testUser: TestUser;
  let authToken: string;
  let testLocation: Location;
  let testTemplate: AssetTemplate;

  beforeAll(async () => {
    setupTestEnvironment();
    app = createTestApp();
    dbHelper = await setupTestDatabase();
    redisClient = getRedis();
  });

  afterAll(async () => {
    await cleanupTestDatabase(dbHelper);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    api = new TestAPIHelper(app);
    await dbHelper.clearDatabase();
    await redisClient.flushdb();

    // Create test organization and user using existing dbHelper methods
    testOrg = await dbHelper.createTestOrganization();
    testUser = await dbHelper.createTestUser({
      organizationId: testOrg.id,
      role: 'OWNER',
      password: 'password123',
      email: 'test@example.com',
    });

    // Authenticate user
    authToken = await api.authenticateUser(testUser.email, 'password123');

    // Create test location and template using direct database calls
    testLocation = await dbHelper.getPrisma().location.create({
      data: {
        organizationId: testOrg.id,
        name: 'Test Location',
        path: '/test-location',
      },
    });

    testTemplate = await dbHelper.getPrisma().assetTemplate.create({
      data: {
        organizationId: testOrg.id,
        name: 'Test Template',
        category: 'EQUIPMENT',
      },
    });
  });

  describe('GET /api/assets', () => {
    test('should return paginated list of assets', async () => {
      // Create test assets
      await dbHelper.getPrisma().asset.create({
        data: {
          organizationId: testOrg.id,
          locationId: testLocation.id,
          name: 'Test Asset 1',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          path: '/test-asset-1',
          tags: [],
        },
      });

      await dbHelper.getPrisma().asset.create({
        data: {
          organizationId: testOrg.id,
          locationId: testLocation.id,
          name: 'Test Asset 2',
          category: 'SOFTWARE',
          status: 'MAINTENANCE',
          path: '/test-asset-2',
          tags: [],
        },
      });

      const response = await api
        .get('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.assets).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.page).toBe(1);
      expect(response.body.totalPages).toBe(1);

      const assetNames = response.body.assets.map((a: any) => a.name);
      expect(assetNames).toContain('Test Asset 1');
      expect(assetNames).toContain('Test Asset 2');
    });

    test('should filter assets by category', async () => {
      await dbHelper.getPrisma().asset.create({
        data: {
          organizationId: testOrg.id,
          locationId: testLocation.id,
          name: 'Hardware Asset',
          category: 'HARDWARE',
          path: '/hardware-asset',
          tags: [],
        },
      });

      await dbHelper.getPrisma().asset.create({
        data: {
          organizationId: testOrg.id,
          locationId: testLocation.id,
          name: 'Software Asset',
          category: 'SOFTWARE',
          path: '/software-asset',
          tags: [],
        },
      });

      const response = await api
        .get('/api/assets?category=HARDWARE')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.assets).toHaveLength(1);
      expect(response.body.assets[0].name).toBe('Hardware Asset');
      expect(response.body.assets[0].category).toBe('HARDWARE');
    });

    test('should search assets by name', async () => {
      await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Laptop Dell XPS',
        category: 'HARDWARE',
      });

      await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Desktop Computer',
        category: 'HARDWARE',
      });

      const response = await api
        .get('/api/assets?search=Dell')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.assets).toHaveLength(1);
      expect(response.body.assets[0].name).toBe('Laptop Dell XPS');
    });

    test('should require authentication', async () => {
      await api.get('/api/assets').expect(401);
    });
  });

  describe('POST /api/assets', () => {
    test('should create new asset with minimum required fields', async () => {
      const assetData = {
        name: 'New Test Asset',
        category: 'HARDWARE',
        locationId: testLocation.id,
      };

      const response = await api
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(assetData)
        .expect(201);

      expect(response.body.name).toBe('New Test Asset');
      expect(response.body.category).toBe('HARDWARE');
      expect(response.body.locationId).toBe(testLocation.id);
      expect(response.body.organizationId).toBe(testOrg.id);
      expect(response.body.status).toBe('OPERATIONAL'); // default status
      expect(response.body.id).toBeDefined();
      expect(response.body.path).toBeDefined();
    });

    test('should create asset with all optional fields', async () => {
      const assetData = {
        name: 'Comprehensive Asset',
        description: 'A comprehensive test asset',
        category: 'EQUIPMENT',
        status: 'MAINTENANCE',
        serialNumber: 'SN123456',
        modelNumber: 'MOD789',
        manufacturer: 'Test Corp',
        purchaseDate: '2023-01-15T00:00:00.000Z',
        purchasePrice: 1500.0,
        warrantyExpiry: '2025-01-15T00:00:00.000Z',
        locationId: testLocation.id,
        assetTemplateId: testTemplate.id,
        customFields: { color: 'blue', weight: '2kg' },
        tags: ['important', 'new'],
        qrCode: 'QR123456',
        link: 'https://example.com/asset',
      };

      const response = await api
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(assetData)
        .expect(201);

      expect(response.body.name).toBe('Comprehensive Asset');
      expect(response.body.description).toBe('A comprehensive test asset');
      expect(response.body.category).toBe('EQUIPMENT');
      expect(response.body.status).toBe('MAINTENANCE');
      expect(response.body.serialNumber).toBe('SN123456');
      expect(response.body.assetTemplateId).toBe(testTemplate.id);
      expect(response.body.customFields).toEqual({ color: 'blue', weight: '2kg' });
      expect(response.body.tags).toEqual(['important', 'new']);
    });

    test('should validate required fields', async () => {
      const response = await api
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.message.toLowerCase()).toContain('validation');
    });

    test('should validate enum values', async () => {
      const assetData = {
        name: 'Invalid Asset',
        category: 'INVALID_CATEGORY',
      };

      const response = await api
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send(assetData)
        .expect(400);

      expect(response.body.message.toLowerCase()).toContain('validation');
    });

    test('should require authentication', async () => {
      await api.post('/api/assets').send({ name: 'Test' }).expect(401);
    });
  });

  describe('GET /api/assets/:assetId', () => {
    test('should return specific asset by ID', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Specific Asset',
        category: 'HARDWARE',
      });

      const response = await api
        .get(`/api/assets/${asset.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.id).toBe(asset.id);
      expect(response.body.name).toBe('Specific Asset');
      expect(response.body.organizationId).toBe(testOrg.id);
    });

    test('should return 404 for non-existent asset', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';

      await api
        .get(`/api/assets/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should return 400 for invalid UUID', async () => {
      await api
        .get('/api/assets/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    test('should require authentication', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Test Asset',
        category: 'HARDWARE',
      });

      await api.get(`/api/assets/${asset.id}`).expect(401);
    });
  });

  describe('PUT /api/assets/:assetId', () => {
    test('should update asset fields', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Original Asset',
        category: 'HARDWARE',
        status: 'OPERATIONAL',
      });

      const updateData = {
        name: 'Updated Asset',
        description: 'Updated description',
        status: 'MAINTENANCE',
      };

      const response = await api
        .put(`/api/assets/${asset.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe('Updated Asset');
      expect(response.body.description).toBe('Updated description');
      expect(response.body.status).toBe('MAINTENANCE');
      expect(response.body.category).toBe('HARDWARE'); // Unchanged field
    });

    test('should return 404 for non-existent asset', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';

      await api
        .put(`/api/assets/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated' })
        .expect(404);
    });

    test('should require authentication', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Test Asset',
        category: 'HARDWARE',
      });

      await api.put(`/api/assets/${asset.id}`).send({ name: 'Updated' }).expect(401);
    });
  });

  describe('DELETE /api/assets/:assetId', () => {
    test('should delete asset', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset to Delete',
        category: 'HARDWARE',
      });

      await api
        .delete(`/api/assets/${asset.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify asset is deleted
      await api
        .get(`/api/assets/${asset.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should return 404 for non-existent asset', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';

      await api
        .delete(`/api/assets/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should require authentication', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Test Asset',
        category: 'HARDWARE',
      });

      await api.delete(`/api/assets/${asset.id}`).expect(401);
    });
  });

  describe('POST /api/assets/:assetId/files', () => {
    test('should upload file to asset', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset with File',
        category: 'HARDWARE',
      });

      // Create a test file buffer
      const testFileContent = 'test file content';
      const testBuffer = Buffer.from(testFileContent);

      const response = await api
        .post(`/api/assets/${asset.id}/files`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testBuffer, 'test.txt')
        .field('attachmentType', 'manual')
        .field('isPrimary', 'false')
        .expect(201);

      expect(response.body.originalFilename).toBe('test.txt');
      expect(response.body.attachmentType).toBe('manual');
      expect(response.body.isPrimary).toBe(false);
      expect(response.body.assetId).toBe(asset.id);
      expect(response.body.id).toBeDefined();
    });

    test('should require file upload', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset',
        category: 'HARDWARE',
      });

      await api
        .post(`/api/assets/${asset.id}/files`)
        .set('Authorization', `Bearer ${authToken}`)
        .field('attachmentType', 'manual') // Send a field to make it multipart
        .expect(400);
    });

    test('should return 404 for non-existent asset', async () => {
      const fakeId = '123e4567-e89b-12d3-a456-426614174000';
      const testBuffer = Buffer.from('test');

      await api
        .post(`/api/assets/${fakeId}/files`)
        .set('Authorization', `Bearer ${authToken}`)
        .attach('file', testBuffer, 'test.txt')
        .expect(404);
    });

    test('should require authentication', async () => {
      const asset = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset',
        category: 'HARDWARE',
      });

      const testBuffer = Buffer.from('test');

      await api
        .post(`/api/assets/${asset.id}/files`)
        .attach('file', testBuffer, 'test.txt')
        .expect(401);
    });
  });

  describe('GET /api/assets/tree', () => {
    test('should return hierarchical asset tree', async () => {
      // Create parent asset using API
      const parentResponse = await api
        .post('/api/assets')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Parent Asset',
          category: 'EQUIPMENT',
          locationId: testLocation.id,
        });
      const parentAsset = parentResponse.body;

      // Create child asset using API
      await api.post('/api/assets').set('Authorization', `Bearer ${authToken}`).send({
        name: 'Child Asset',
        category: 'HARDWARE',
        locationId: testLocation.id,
        parentId: parentAsset.id,
      });

      const response = await api
        .get('/api/assets/tree')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      // Find the parent asset in the tree
      const parentInTree = response.body.find((asset: any) => asset.id === parentAsset.id);
      expect(parentInTree).toBeDefined();
      expect(parentInTree.name).toBe('Parent Asset');
      expect(parentInTree.children).toBeDefined();
      expect(parentInTree.children).toHaveLength(1);
      expect(parentInTree.children[0].name).toBe('Child Asset');
    });

    test('should require authentication', async () => {
      await api.get('/api/assets/tree').expect(401);
    });
  });

  describe('GET /api/assets/stats', () => {
    test('should return asset statistics', async () => {
      // Create assets with different categories and statuses
      await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        category: 'HARDWARE',
        status: 'OPERATIONAL',
        name: 'Asset 1',
      });

      await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        category: 'HARDWARE',
        status: 'MAINTENANCE',
        name: 'Asset 2',
      });

      await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        category: 'SOFTWARE',
        status: 'OPERATIONAL',
        name: 'Asset 3',
      });

      const response = await api
        .get('/api/assets/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.byCategory).toBeDefined();
      expect(response.body.byCategory.HARDWARE).toBe(2);
      expect(response.body.byCategory.SOFTWARE).toBe(1);
      expect(response.body.byStatus).toBeDefined();
      expect(response.body.byStatus.OPERATIONAL).toBe(2);
      expect(response.body.byStatus.MAINTENANCE).toBe(1);
    });

    test('should require authentication', async () => {
      await api.get('/api/assets/stats').expect(401);
    });
  });

  describe('POST /api/assets/bulk', () => {
    test('should perform bulk delete operation', async () => {
      const asset1 = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset 1',
        category: 'HARDWARE',
      });

      const asset2 = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset 2',
        category: 'HARDWARE',
      });

      const bulkData = {
        assetIds: [asset1.id, asset2.id],
        operation: 'delete',
      };

      const response = await api
        .post('/api/assets/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData)
        .expect(200);

      expect(response.body.success).toBe(2);
      expect(response.body.failed).toBe(0);
      expect(response.body.errors).toHaveLength(0);

      // Verify assets are deleted
      await api
        .get(`/api/assets/${asset1.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      await api
        .get(`/api/assets/${asset2.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should perform bulk status update', async () => {
      const asset1 = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset 1',
        category: 'HARDWARE',
        status: 'OPERATIONAL',
      });

      const asset2 = await testDataGenerators.asset(dbHelper, {
        organizationId: testOrg.id,
        locationId: testLocation.id,
        name: 'Asset 2',
        category: 'HARDWARE',
        status: 'OPERATIONAL',
      });

      const bulkData = {
        assetIds: [asset1.id, asset2.id],
        operation: 'updateStatus',
        data: {
          status: 'MAINTENANCE',
          reason: 'Scheduled maintenance',
        },
      };

      const response = await api
        .post('/api/assets/bulk')
        .set('Authorization', `Bearer ${authToken}`)
        .send(bulkData)
        .expect(200);

      expect(response.body.success).toBe(2);
      expect(response.body.failed).toBe(0);

      // Verify status updates
      const updatedAsset1 = await api
        .get(`/api/assets/${asset1.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedAsset1.body.status).toBe('MAINTENANCE');
    });

    test('should require authentication', async () => {
      await api.post('/api/assets/bulk').send({ assetIds: [], operation: 'delete' }).expect(401);
    });
  });
});
