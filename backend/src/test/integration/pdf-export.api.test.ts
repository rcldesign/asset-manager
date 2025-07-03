import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, getAuthToken } from '../helpers';
import { conditionalDescribe } from './conditionalDescribe';

conditionalDescribe('PDF Export API Integration Tests', () => {
  let testUser: any;
  let testOrganization: any;
  let authToken: string;

  beforeAll(async () => {
    testOrganization = await createTestOrganization('PDF Export Test Org');
    testUser = await createTestUser({
      email: 'pdf.export.test@example.com',
      fullName: 'PDF Export Test User',
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
  });

  describe('POST /api/export/pdf/dashboard', () => {
    beforeEach(async () => {
      // Create test data for dashboard export
      await prisma.asset.createMany({
        data: [
          {
            name: 'PDF Export Asset 1',
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            purchasePrice: 2000,
            currentValue: 1800,
          },
          {
            name: 'PDF Export Asset 2',
            category: 'Furniture',
            status: 'MAINTENANCE',
            organizationId: testOrganization.id,
            purchasePrice: 500,
            currentValue: 400,
          },
        ],
      });

      await prisma.task.createMany({
        data: [
          {
            title: 'PDF Export Task 1',
            status: 'TODO',
            priority: 'HIGH',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            estimatedCost: 200,
          },
          {
            title: 'PDF Export Task 2',
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

    it('should export overview dashboard as PDF', async () => {
      const exportData = {
        dashboardType: 'overview',
        title: 'Organization Overview Dashboard',
        timeRange: 'Last 30 days',
        includeCharts: true,
        includeMetrics: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/dashboard')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('overview-dashboard');
      expect(response.body).toBeInstanceOf(Buffer);
    });

    it('should export asset dashboard as PDF', async () => {
      const exportData = {
        dashboardType: 'asset',
        title: 'Asset Management Dashboard',
        filters: {
          category: 'Computer',
          status: 'OPERATIONAL',
        },
        includeCharts: true,
        includeTables: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/dashboard')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('asset-dashboard');
    });

    it('should export task dashboard as PDF', async () => {
      const exportData = {
        dashboardType: 'task',
        title: 'Task Management Dashboard',
        filters: {
          priority: 'HIGH',
          assignee: testUser.id,
        },
        includeGantt: true,
        includeMetrics: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/dashboard')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('task-dashboard');
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing dashboardType
        title: 'Invalid Dashboard',
      };

      await request(app)
        .post('/api/export/pdf/dashboard')
        .send(invalidData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle invalid dashboard type', async () => {
      const invalidData = {
        dashboardType: 'invalid-type',
        title: 'Invalid Dashboard',
      };

      await request(app)
        .post('/api/export/pdf/dashboard')
        .send(invalidData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/export/pdf/dashboard')
        .send({ dashboardType: 'overview' })
        .expect(401);
    });
  });

  describe('POST /api/export/pdf/report', () => {
    let testReport: any;

    beforeEach(async () => {
      testReport = await prisma.report.create({
        data: {
          title: 'Test PDF Export Report',
          type: 'ASSET_INVENTORY',
          status: 'COMPLETED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          parameters: { dateRange: '30d' },
          generatedAt: new Date(),
        },
      });
    });

    it('should export existing report as PDF', async () => {
      const exportData = {
        reportId: testReport.id,
        format: 'detailed',
        includeCharts: true,
        includeSummary: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/report')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('test-pdf-export-report');
    });

    it('should export custom report data as PDF', async () => {
      const exportData = {
        title: 'Custom Asset Report',
        data: [
          {
            name: 'Test Asset 1',
            category: 'Computer',
            status: 'Active',
            value: 1500,
          },
          {
            name: 'Test Asset 2',
            category: 'Furniture',
            status: 'Maintenance',
            value: 800,
          },
        ],
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'category', label: 'Category' },
          { key: 'status', label: 'Status' },
          { key: 'value', label: 'Value', type: 'currency' },
        ],
        includeTotal: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/report')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('custom-asset-report');
    });

    it('should handle non-existent report ID', async () => {
      const exportData = {
        reportId: 'non-existent-id',
      };

      await request(app)
        .post('/api/export/pdf/report')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should deny access to reports from other organizations', async () => {
      const otherOrg = await createTestOrganization('Other PDF Org');
      const otherUser = await createTestUser({
        email: 'other.pdf@example.com',
        fullName: 'Other PDF User',
        role: 'OWNER',
        organizationId: otherOrg.id,
      });
      const otherToken = await getAuthToken(otherUser.id);

      const exportData = {
        reportId: testReport.id,
      };

      await request(app)
        .post('/api/export/pdf/report')
        .send(exportData)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('POST /api/export/pdf/asset-list', () => {
    beforeEach(async () => {
      await prisma.asset.createMany({
        data: [
          {
            name: 'Asset List Item 1',
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            purchasePrice: 1200,
            currentValue: 1000,
            serialNumber: 'SN001',
            location: 'Office A',
          },
          {
            name: 'Asset List Item 2',
            category: 'Furniture',
            status: 'MAINTENANCE',
            organizationId: testOrganization.id,
            purchasePrice: 600,
            currentValue: 500,
            serialNumber: 'SN002',
            location: 'Office B',
          },
        ],
      });
    });

    it('should export filtered asset list as PDF', async () => {
      const exportData = {
        filters: {
          category: 'Computer',
          status: 'OPERATIONAL',
        },
        columns: ['name', 'category', 'status', 'currentValue', 'location'],
        sortBy: 'name',
        sortOrder: 'asc',
        includeImages: false,
        includeQRCodes: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/asset-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('asset-list');
    });

    it('should export all assets when no filters provided', async () => {
      const exportData = {
        columns: ['name', 'category', 'status'],
        title: 'Complete Asset Inventory',
      };

      const response = await request(app)
        .post('/api/export/pdf/asset-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    it('should handle empty asset list', async () => {
      // Delete all assets
      await prisma.asset.deleteMany({ where: { organizationId: testOrganization.id } });

      const exportData = {
        columns: ['name', 'category', 'status'],
      };

      const response = await request(app)
        .post('/api/export/pdf/asset-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('POST /api/export/pdf/task-list', () => {
    beforeEach(async () => {
      await prisma.task.createMany({
        data: [
          {
            title: 'Task List Item 1',
            description: 'Important maintenance task',
            status: 'TODO',
            priority: 'HIGH',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            estimatedCost: 300,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          {
            title: 'Task List Item 2',
            description: 'Regular inspection task',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            estimatedCost: 150,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        ],
      });
    });

    it('should export filtered task list as PDF', async () => {
      const exportData = {
        filters: {
          status: 'TODO',
          priority: 'HIGH',
          assignee: testUser.id,
        },
        columns: ['title', 'status', 'priority', 'dueDate', 'estimatedCost'],
        sortBy: 'dueDate',
        sortOrder: 'asc',
        includeDescriptions: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/task-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('task-list');
    });

    it('should group tasks by status', async () => {
      const exportData = {
        columns: ['title', 'priority', 'dueDate'],
        groupBy: 'status',
        includeStatistics: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/task-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });
  });

  describe('GET /api/export/pdf/options', () => {
    it('should return available PDF export options', async () => {
      const response = await request(app)
        .get('/api/export/pdf/options')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('dashboardTypes');
      expect(response.body).toHaveProperty('reportFormats');
      expect(response.body).toHaveProperty('paperSizes');
      expect(response.body).toHaveProperty('orientations');

      expect(response.body.dashboardTypes).toContain('overview');
      expect(response.body.dashboardTypes).toContain('asset');
      expect(response.body.dashboardTypes).toContain('task');

      expect(response.body.paperSizes).toContain('A4');
      expect(response.body.paperSizes).toContain('Letter');

      expect(response.body.orientations).toContain('portrait');
      expect(response.body.orientations).toContain('landscape');
    });
  });

  describe('Error handling and validation', () => {
    it('should handle PDF generation failures gracefully', async () => {
      const exportData = {
        dashboardType: 'overview',
        title: 'Test Dashboard',
        // Simulate invalid data that would cause PDF generation to fail
        corruptData: true,
      };

      const response = await request(app)
        .post('/api/export/pdf/dashboard')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('PDF generation failed');
    });

    it('should validate column selections', async () => {
      const exportData = {
        columns: ['invalid-column', 'another-invalid'],
      };

      await request(app)
        .post('/api/export/pdf/asset-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle malformed request data', async () => {
      await request(app)
        .post('/api/export/pdf/dashboard')
        .send('invalid-json')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('Performance and security', () => {
    it('should handle large dataset exports efficiently', async () => {
      // Create large dataset
      const largeAssetData = Array.from({ length: 100 }, (_, i) => ({
        name: `Performance Asset ${i}`,
        category: 'Computer',
        status: 'OPERATIONAL',
        organizationId: testOrganization.id,
        purchasePrice: 1000 + i,
      }));

      await prisma.asset.createMany({ data: largeAssetData });

      const exportData = {
        columns: ['name', 'category', 'status', 'purchasePrice'],
      };

      const start = Date.now();
      const response = await request(app)
        .post('/api/export/pdf/asset-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration = Date.now() - start;

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should limit export size to prevent abuse', async () => {
      const exportData = {
        columns: ['name', 'category', 'status'],
        limit: 10000, // Excessive limit
      };

      await request(app)
        .post('/api/export/pdf/asset-list')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should sanitize user input in PDF content', async () => {
      const exportData = {
        title: '<script>alert("xss")</script>Malicious Title',
        dashboardType: 'overview',
      };

      const response = await request(app)
        .post('/api/export/pdf/dashboard')
        .send(exportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      // PDF should be generated without executing the script
    });
  });
});
