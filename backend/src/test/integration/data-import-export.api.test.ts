import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, getAuthToken } from '../helpers';
import { conditionalDescribe } from './conditionalDescribe';
import path from 'path';
import fs from 'fs';

conditionalDescribe('Data Import/Export API Integration Tests', () => {
  let testUser: any;
  let testOrganization: any;
  let authToken: string;

  beforeAll(async () => {
    testOrganization = await createTestOrganization('Import Export Test Org');
    testUser = await createTestUser({
      email: 'import.export.test@example.com',
      fullName: 'Import Export Test User',
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
    await prisma.task.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.asset.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.dataImportJob.deleteMany({ where: { organizationId: testOrganization.id } });
  });

  describe('POST /api/export/data', () => {
    beforeEach(async () => {
      // Create test data for export
      await prisma.asset.createMany({
        data: [
          {
            name: 'Export Asset 1',
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            purchasePrice: 1500,
            serialNumber: 'EXP001',
            location: 'Office A',
          },
          {
            name: 'Export Asset 2',
            category: 'Furniture',
            status: 'MAINTENANCE',
            organizationId: testOrganization.id,
            purchasePrice: 800,
            serialNumber: 'EXP002',
            location: 'Office B',
          },
        ],
      });

      await prisma.task.createMany({
        data: [
          {
            title: 'Export Task 1',
            description: 'Task for export testing',
            status: 'TODO',
            priority: 'HIGH',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            estimatedCost: 200,
          },
          {
            title: 'Export Task 2',
            description: 'Another export task',
            status: 'COMPLETED',
            priority: 'MEDIUM',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            actualCost: 150,
            completedAt: new Date(),
          },
        ],
      });
    });

    it('should export assets as CSV', async () => {
      const exportData = {
        entityType: 'assets',
        format: 'csv',
        fields: ['name', 'category', 'status', 'purchasePrice', 'serialNumber'],
        filters: { status: 'OPERATIONAL' },
      };

      const response = await request(app)
        .post('/api/export/data')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('assets-export');
      
      const csvContent = response.text;
      expect(csvContent).toContain('name,category,status,purchasePrice,serialNumber');
      expect(csvContent).toContain('Export Asset 1');
      expect(csvContent).not.toContain('Export Asset 2'); // Filtered out
    });

    it('should export tasks as JSON', async () => {
      const exportData = {
        entityType: 'tasks',
        format: 'json',
        fields: ['title', 'status', 'priority', 'estimatedCost'],
        includeMetadata: true,
      };

      const response = await request(app)
        .post('/api/export/data')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('tasks-export');
      
      const jsonData = response.body;
      expect(jsonData).toHaveProperty('metadata');
      expect(jsonData).toHaveProperty('data');
      expect(jsonData.data).toHaveLength(2);
      expect(jsonData.data[0]).toHaveProperty('title');
      expect(jsonData.data[0]).toHaveProperty('status');
    });

    it('should export assets as Excel', async () => {
      const exportData = {
        entityType: 'assets',
        format: 'xlsx',
        fields: ['name', 'category', 'status', 'purchasePrice'],
        includeCharts: true,
      };

      const response = await request(app)
        .post('/api/export/data')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(response.headers['content-disposition']).toContain('assets-export.xlsx');
    });

    it('should apply filters during export', async () => {
      const exportData = {
        entityType: 'assets',
        format: 'csv',
        fields: ['name', 'category'],
        filters: {
          category: 'Computer',
          status: 'OPERATIONAL',
        },
      };

      const response = await request(app)
        .post('/api/export/data')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const csvContent = response.text;
      const lines = csvContent.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(2); // Header + 1 filtered row
    });

    it('should validate export parameters', async () => {
      const invalidData = {
        entityType: 'invalid-type',
        format: 'csv',
        fields: [],
      };

      await request(app)
        .post('/api/export/data')
        .send(invalidData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle empty datasets', async () => {
      // Delete all assets
      await prisma.asset.deleteMany({ where: { organizationId: testOrganization.id } });

      const exportData = {
        entityType: 'assets',
        format: 'csv',
        fields: ['name', 'category'],
      };

      const response = await request(app)
        .post('/api/export/data')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const csvContent = response.text;
      const lines = csvContent.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(1); // Only header
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/export/data')
        .send({ entityType: 'assets', format: 'csv' })
        .expect(401);
    });
  });

  describe('POST /api/import/data', () => {
    it('should import assets from CSV file', async () => {
      const csvContent = `name,category,status,purchasePrice,serialNumber,location
Import Asset 1,Computer,OPERATIONAL,1200,IMP001,Office A
Import Asset 2,Furniture,MAINTENANCE,600,IMP002,Office B
Import Asset 3,Equipment,OPERATIONAL,2000,IMP003,Warehouse`;

      const response = await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'csv')
        .field('mappingStrategy', 'header-match')
        .attach('file', Buffer.from(csvContent), 'assets-import.csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('status', 'PENDING');
      expect(response.body).toHaveProperty('estimatedRecords', 3);

      // Check that import job was created
      const importJob = await prisma.dataImportJob.findUnique({
        where: { id: response.body.jobId },
      });
      expect(importJob).toBeTruthy();
      expect(importJob!.entityType).toBe('assets');
    });

    it('should import tasks from JSON file', async () => {
      const jsonContent = {
        data: [
          {
            title: 'Import Task 1',
            description: 'Imported maintenance task',
            status: 'TODO',
            priority: 'HIGH',
            estimatedCost: 300,
          },
          {
            title: 'Import Task 2',
            description: 'Another imported task',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            estimatedCost: 200,
          },
        ],
      };

      const response = await request(app)
        .post('/api/import/data')
        .field('entityType', 'tasks')
        .field('format', 'json')
        .field('validateBeforeImport', 'true')
        .attach('file', Buffer.from(JSON.stringify(jsonContent)), 'tasks-import.json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('status', 'PENDING');
    });

    it('should import assets from Excel file', async () => {
      // Mock Excel file content (in reality would be actual Excel binary)
      const mockExcelBuffer = Buffer.from('mock-excel-content');

      const response = await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'xlsx')
        .field('sheetName', 'Assets')
        .field('startRow', '2')
        .attach('file', mockExcelBuffer, 'assets-import.xlsx')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
    });

    it('should validate file format and size', async () => {
      const oversizedContent = 'x'.repeat(50 * 1024 * 1024); // 50MB

      await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'csv')
        .attach('file', Buffer.from(oversizedContent), 'large-file.csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle missing required fields', async () => {
      await request(app)
        .post('/api/import/data')
        .field('format', 'csv') // Missing entityType
        .attach('file', Buffer.from('test'), 'test.csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should reject unsupported file formats', async () => {
      await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'txt')
        .attach('file', Buffer.from('test'), 'test.txt')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('GET /api/import/jobs', () => {
    let testImportJob: any;

    beforeEach(async () => {
      testImportJob = await prisma.dataImportJob.create({
        data: {
          entityType: 'assets',
          format: 'csv',
          status: 'COMPLETED',
          fileName: 'test-import.csv',
          fileSize: 1024,
          totalRecords: 10,
          processedRecords: 10,
          successfulRecords: 8,
          failedRecords: 2,
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          completedAt: new Date(),
        },
      });
    });

    it('should return list of import jobs', async () => {
      const response = await request(app)
        .get('/api/import/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('jobs');
      expect(response.body.jobs).toHaveLength(1);
      expect(response.body.jobs[0]).toMatchObject({
        id: testImportJob.id,
        entityType: 'assets',
        status: 'COMPLETED',
        fileName: 'test-import.csv',
      });
    });

    it('should filter jobs by status', async () => {
      const response = await request(app)
        .get('/api/import/jobs')
        .query({ status: 'COMPLETED' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.jobs).toHaveLength(1);
      expect(response.body.jobs[0].status).toBe('COMPLETED');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/import/jobs')
        .query({ page: 1, limit: 5 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(1);
    });
  });

  describe('GET /api/import/jobs/:id', () => {
    let testImportJob: any;

    beforeEach(async () => {
      testImportJob = await prisma.dataImportJob.create({
        data: {
          entityType: 'assets',
          format: 'csv',
          status: 'COMPLETED',
          fileName: 'detailed-import.csv',
          fileSize: 2048,
          totalRecords: 5,
          processedRecords: 5,
          successfulRecords: 4,
          failedRecords: 1,
          errorLog: ['Row 3: Invalid status value'],
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          completedAt: new Date(),
        },
      });
    });

    it('should return detailed import job information', async () => {
      const response = await request(app)
        .get(`/api/import/jobs/${testImportJob.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testImportJob.id,
        entityType: 'assets',
        status: 'COMPLETED',
        fileName: 'detailed-import.csv',
        totalRecords: 5,
        successfulRecords: 4,
        failedRecords: 1,
        errorLog: ['Row 3: Invalid status value'],
      });
    });

    it('should return 404 for non-existent job', async () => {
      await request(app)
        .get('/api/import/jobs/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should deny access to jobs from other organizations', async () => {
      const otherOrg = await createTestOrganization('Other Import Org');
      const otherUser = await createTestUser({
        email: 'other.import@example.com',
        fullName: 'Other Import User',
        role: 'OWNER',
        organizationId: otherOrg.id,
      });
      const otherToken = await getAuthToken(otherUser.id);

      await request(app)
        .get(`/api/import/jobs/${testImportJob.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('POST /api/import/jobs/:id/retry', () => {
    let failedImportJob: any;

    beforeEach(async () => {
      failedImportJob = await prisma.dataImportJob.create({
        data: {
          entityType: 'assets',
          format: 'csv',
          status: 'FAILED',
          fileName: 'failed-import.csv',
          fileSize: 1024,
          totalRecords: 5,
          processedRecords: 2,
          successfulRecords: 1,
          failedRecords: 1,
          errorLog: ['Database connection error'],
          filePath: '/tmp/failed-import.csv',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });
    });

    it('should retry failed import job', async () => {
      const response = await request(app)
        .post(`/api/import/jobs/${failedImportJob.id}/retry`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toMatchObject({
        id: failedImportJob.id,
        status: 'PENDING',
      });
    });

    it('should not retry completed jobs', async () => {
      const completedJob = await prisma.dataImportJob.create({
        data: {
          entityType: 'assets',
          format: 'csv',
          status: 'COMPLETED',
          fileName: 'completed-import.csv',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });

      await request(app)
        .post(`/api/import/jobs/${completedJob.id}/retry`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('DELETE /api/import/jobs/:id', () => {
    let deletableJob: any;

    beforeEach(async () => {
      deletableJob = await prisma.dataImportJob.create({
        data: {
          entityType: 'assets',
          format: 'csv',
          status: 'FAILED',
          fileName: 'deletable-import.csv',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });
    });

    it('should delete import job', async () => {
      await request(app)
        .delete(`/api/import/jobs/${deletableJob.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const deletedJob = await prisma.dataImportJob.findUnique({
        where: { id: deletableJob.id },
      });
      expect(deletedJob).toBeNull();
    });

    it('should not delete running jobs', async () => {
      const runningJob = await prisma.dataImportJob.create({
        data: {
          entityType: 'assets',
          format: 'csv',
          status: 'PROCESSING',
          fileName: 'running-import.csv',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });

      await request(app)
        .delete(`/api/import/jobs/${runningJob.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('GET /api/export/templates', () => {
    it('should return available export templates', async () => {
      const response = await request(app)
        .get('/api/export/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body.templates).toBeInstanceOf(Array);
      
      const assetTemplate = response.body.templates.find((t: any) => t.entityType === 'assets');
      expect(assetTemplate).toBeTruthy();
      expect(assetTemplate).toHaveProperty('fields');
      expect(assetTemplate).toHaveProperty('requiredFields');
    });

    it('should filter templates by entity type', async () => {
      const response = await request(app)
        .get('/api/export/templates')
        .query({ entityType: 'assets' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = response.body.templates;
      templates.forEach((template: any) => {
        expect(template.entityType).toBe('assets');
      });
    });
  });

  describe('Field mapping and validation', () => {
    it('should validate field mappings during import', async () => {
      const csvContent = `asset_name,asset_category,asset_status
Test Asset,Computer,Active`; // Different column names

      const fieldMapping = {
        'asset_name': 'name',
        'asset_category': 'category',
        'asset_status': 'status',
      };

      const response = await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'csv')
        .field('fieldMapping', JSON.stringify(fieldMapping))
        .attach('file', Buffer.from(csvContent), 'mapped-import.csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
    });

    it('should handle hierarchical data import', async () => {
      const jsonContent = {
        data: [
          {
            name: 'Parent Asset',
            category: 'Computer',
            children: [
              {
                name: 'Child Asset 1',
                category: 'Component',
              },
              {
                name: 'Child Asset 2',
                category: 'Component',
              },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'json')
        .field('supportHierarchy', 'true')
        .attach('file', Buffer.from(JSON.stringify(jsonContent)), 'hierarchy-import.json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
    });
  });

  describe('Performance and error handling', () => {
    it('should handle large file imports efficiently', async () => {
      const largeContent = 'name,category,status\n' + 
        Array.from({ length: 1000 }, (_, i) => `Asset ${i},Computer,OPERATIONAL`).join('\n');

      const response = await request(app)
        .post('/api/import/data')
        .field('entityType', 'assets')
        .field('format', 'csv')
        .field('batchSize', '100')
        .attach('file', Buffer.from(largeContent), 'large-import.csv')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body.estimatedRecords).toBe(1000);
    });

    it('should handle export of large datasets with streaming', async () => {
      // Create large dataset
      const largeAssetData = Array.from({ length: 500 }, (_, i) => ({
        name: `Large Export Asset ${i}`,
        category: 'Computer',
        status: 'OPERATIONAL',
        organizationId: testOrganization.id,
        purchasePrice: 1000 + i,
      }));

      await prisma.asset.createMany({ data: largeAssetData });

      const exportData = {
        entityType: 'assets',
        format: 'csv',
        fields: ['name', 'category', 'status', 'purchasePrice'],
        streaming: true,
      };

      const start = Date.now();
      const response = await request(app)
        .post('/api/export/data')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration = Date.now() - start;

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(duration).toBeLessThan(5000); // Should stream efficiently
    });
  });
});