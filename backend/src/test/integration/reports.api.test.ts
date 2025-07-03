import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, getAuthToken } from '../helpers';
import { conditionalDescribe } from './conditionalDescribe';

conditionalDescribe('Reports API Integration Tests', () => {
  let testUser: any;
  let testOrganization: any;
  let authToken: string;

  beforeAll(async () => {
    testOrganization = await createTestOrganization('Reports Test Org');
    testUser = await createTestUser({
      email: 'reports.test@example.com',
      fullName: 'Reports Test User',
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
    await prisma.report.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.task.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.asset.deleteMany({ where: { organizationId: testOrganization.id } });
  });

  describe('GET /api/reports', () => {
    beforeEach(async () => {
      // Create test reports
      await prisma.report.createMany({
        data: [
          {
            title: 'Asset Inventory Report',
            type: 'ASSET_INVENTORY',
            status: 'COMPLETED',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            parameters: { dateRange: '30d' },
            generatedAt: new Date(),
          },
          {
            title: 'Task Summary Report',
            type: 'TASK_SUMMARY',
            status: 'GENERATING',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            parameters: { includeCompleted: true },
          },
        ],
      });
    });

    it('should return list of reports for organization', async () => {
      const response = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('reports');
      expect(response.body.reports).toHaveLength(2);
      expect(response.body.reports[0]).toMatchObject({
        title: 'Asset Inventory Report',
        type: 'ASSET_INVENTORY',
        status: 'COMPLETED',
      });
    });

    it('should filter reports by type', async () => {
      const response = await request(app)
        .get('/api/reports')
        .query({ type: 'ASSET_INVENTORY' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.reports).toHaveLength(1);
      expect(response.body.reports[0].type).toBe('ASSET_INVENTORY');
    });

    it('should filter reports by status', async () => {
      const response = await request(app)
        .get('/api/reports')
        .query({ status: 'COMPLETED' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.reports).toHaveLength(1);
      expect(response.body.reports[0].status).toBe('COMPLETED');
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/reports')
        .query({ page: 1, limit: 1 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.reports).toHaveLength(1);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(2);
    });

    it('should require authentication', async () => {
      await request(app).get('/api/reports').expect(401);
    });
  });

  describe('POST /api/reports', () => {
    it('should create new report', async () => {
      const reportData = {
        title: 'Custom Asset Report',
        type: 'CUSTOM',
        parameters: {
          filters: { category: 'Computer' },
          columns: ['name', 'category', 'status'],
          dateRange: '7d',
        },
      };

      const response = await request(app)
        .post('/api/reports')
        .send(reportData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toMatchObject({
        title: 'Custom Asset Report',
        type: 'CUSTOM',
        status: 'PENDING',
        organizationId: testOrganization.id,
        createdBy: testUser.id,
      });
    });

    it('should validate required fields', async () => {
      const invalidData = {
        title: '', // Empty title
        type: 'INVALID_TYPE',
      };

      await request(app)
        .post('/api/reports')
        .send(invalidData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle scheduled reports', async () => {
      const scheduleData = {
        title: 'Weekly Asset Report',
        type: 'ASSET_INVENTORY',
        parameters: { dateRange: '7d' },
        schedule: {
          frequency: 'WEEKLY',
          dayOfWeek: 1,
          hour: 9,
        },
      };

      const response = await request(app)
        .post('/api/reports')
        .send(scheduleData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(response.body).toHaveProperty('schedule');
      expect(response.body.schedule.frequency).toBe('WEEKLY');
    });
  });

  describe('GET /api/reports/:id', () => {
    let testReport: any;

    beforeEach(async () => {
      testReport = await prisma.report.create({
        data: {
          title: 'Test Report Details',
          type: 'ASSET_INVENTORY',
          status: 'COMPLETED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          parameters: { dateRange: '30d' },
          generatedAt: new Date(),
          fileUrl: '/reports/test-report.pdf',
          filePath: '/tmp/test-report.pdf',
        },
      });
    });

    it('should return report details', async () => {
      const response = await request(app)
        .get(`/api/reports/${testReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testReport.id,
        title: 'Test Report Details',
        type: 'ASSET_INVENTORY',
        status: 'COMPLETED',
      });
    });

    it('should return 404 for non-existent report', async () => {
      await request(app)
        .get('/api/reports/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should deny access to reports from other organizations', async () => {
      const otherOrg = await createTestOrganization('Other Org');
      const otherUser = await createTestUser({
        email: 'other.reports@example.com',
        fullName: 'Other User',
        role: 'OWNER',
        organizationId: otherOrg.id,
      });
      const otherToken = await getAuthToken(otherUser.id);

      await request(app)
        .get(`/api/reports/${testReport.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('PUT /api/reports/:id', () => {
    let testReport: any;

    beforeEach(async () => {
      testReport = await prisma.report.create({
        data: {
          title: 'Editable Report',
          type: 'CUSTOM',
          status: 'DRAFT',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          parameters: { dateRange: '30d' },
        },
      });
    });

    it('should update report details', async () => {
      const updateData = {
        title: 'Updated Report Title',
        parameters: { dateRange: '60d' },
      };

      const response = await request(app)
        .put(`/api/reports/${testReport.id}`)
        .send(updateData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.title).toBe('Updated Report Title');
      expect(response.body.parameters.dateRange).toBe('60d');
    });

    it('should not allow updating completed reports', async () => {
      const completedReport = await prisma.report.create({
        data: {
          title: 'Completed Report',
          type: 'ASSET_INVENTORY',
          status: 'COMPLETED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          generatedAt: new Date(),
        },
      });

      await request(app)
        .put(`/api/reports/${completedReport.id}`)
        .send({ title: 'Should not update' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('DELETE /api/reports/:id', () => {
    let testReport: any;

    beforeEach(async () => {
      testReport = await prisma.report.create({
        data: {
          title: 'Deletable Report',
          type: 'CUSTOM',
          status: 'DRAFT',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          parameters: { dateRange: '30d' },
        },
      });
    });

    it('should delete report', async () => {
      await request(app)
        .delete(`/api/reports/${testReport.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const deletedReport = await prisma.report.findUnique({
        where: { id: testReport.id },
      });
      expect(deletedReport).toBeNull();
    });

    it('should require OWNER or ADMIN role for deletion', async () => {
      const editorUser = await createTestUser({
        email: 'editor.reports@example.com',
        fullName: 'Editor User',
        role: 'EDITOR',
        organizationId: testOrganization.id,
      });
      const editorToken = await getAuthToken(editorUser.id);

      await request(app)
        .delete(`/api/reports/${testReport.id}`)
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: editorUser.id } });
    });
  });

  describe('POST /api/reports/:id/generate', () => {
    let testReport: any;

    beforeEach(async () => {
      // Create test data for report generation
      await prisma.asset.createMany({
        data: [
          {
            name: 'Report Asset 1',
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            purchasePrice: 1500,
          },
          {
            name: 'Report Asset 2',
            category: 'Furniture',
            status: 'MAINTENANCE',
            organizationId: testOrganization.id,
            purchasePrice: 800,
          },
        ],
      });

      testReport = await prisma.report.create({
        data: {
          title: 'Generate Test Report',
          type: 'ASSET_INVENTORY',
          status: 'DRAFT',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          parameters: { includeInactive: false },
        },
      });
    });

    it('should trigger report generation', async () => {
      const response = await request(app)
        .post(`/api/reports/${testReport.id}/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body).toMatchObject({
        id: testReport.id,
        status: 'GENERATING',
      });
    });

    it('should not regenerate completed reports without force flag', async () => {
      const completedReport = await prisma.report.create({
        data: {
          title: 'Already Generated',
          type: 'ASSET_INVENTORY',
          status: 'COMPLETED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          generatedAt: new Date(),
        },
      });

      await request(app)
        .post(`/api/reports/${completedReport.id}/generate`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should regenerate with force flag', async () => {
      const completedReport = await prisma.report.create({
        data: {
          title: 'Force Regenerate',
          type: 'ASSET_INVENTORY',
          status: 'COMPLETED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          generatedAt: new Date(),
        },
      });

      const response = await request(app)
        .post(`/api/reports/${completedReport.id}/generate`)
        .send({ force: true })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(202);

      expect(response.body.status).toBe('GENERATING');
    });
  });

  describe('GET /api/reports/:id/download', () => {
    let testReport: any;

    beforeEach(async () => {
      testReport = await prisma.report.create({
        data: {
          title: 'Downloadable Report',
          type: 'ASSET_INVENTORY',
          status: 'COMPLETED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          generatedAt: new Date(),
          fileUrl: '/reports/downloadable-report.pdf',
          filePath: '/tmp/downloadable-report.pdf',
          fileSize: 1024000,
        },
      });
    });

    it('should download report file', async () => {
      const response = await request(app)
        .get(`/api/reports/${testReport.id}/download`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/pdf/);
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should return 404 for reports without files', async () => {
      const noFileReport = await prisma.report.create({
        data: {
          title: 'No File Report',
          type: 'CUSTOM',
          status: 'FAILED',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
        },
      });

      await request(app)
        .get(`/api/reports/${noFileReport.id}/download`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /api/reports/templates', () => {
    it('should return available report templates', async () => {
      const response = await request(app)
        .get('/api/reports/templates')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('templates');
      expect(response.body.templates).toBeInstanceOf(Array);

      const templates = response.body.templates;
      expect(templates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'ASSET_INVENTORY',
            name: expect.any(String),
            description: expect.any(String),
            parameters: expect.any(Object),
          }),
        ]),
      );
    });

    it('should filter templates by category', async () => {
      const response = await request(app)
        .get('/api/reports/templates')
        .query({ category: 'assets' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const templates = response.body.templates;
      templates.forEach((template: any) => {
        expect(template.category).toBe('assets');
      });
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle invalid report parameters', async () => {
      const invalidData = {
        title: 'Invalid Report',
        type: 'ASSET_INVENTORY',
        parameters: {
          dateRange: 'invalid-range',
          invalidParam: 'should-be-filtered',
        },
      };

      await request(app)
        .post('/api/reports')
        .send(invalidData)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle database errors gracefully', async () => {
      const originalCreate = prisma.report.create;
      jest.spyOn(prisma.report, 'create').mockRejectedValue(new Error('Database error'));

      await request(app)
        .post('/api/reports')
        .send({
          title: 'Test Report',
          type: 'ASSET_INVENTORY',
          parameters: {},
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      prisma.report.create = originalCreate;
    });

    it('should validate malformed UUIDs', async () => {
      await request(app)
        .get('/api/reports/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('Performance considerations', () => {
    it('should handle large report lists efficiently', async () => {
      // Create many reports
      const reports = Array.from({ length: 50 }, (_, i) => ({
        title: `Performance Report ${i}`,
        type: 'ASSET_INVENTORY',
        status: 'COMPLETED',
        organizationId: testOrganization.id,
        createdBy: testUser.id,
        generatedAt: new Date(),
      }));

      await prisma.report.createMany({ data: reports });

      const start = Date.now();
      const response = await request(app)
        .get('/api/reports')
        .query({ limit: 20 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration = Date.now() - start;

      expect(response.body.reports).toHaveLength(20);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
