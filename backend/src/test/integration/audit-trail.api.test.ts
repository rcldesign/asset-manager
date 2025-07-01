import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, getAuthToken } from '../helpers';
import { conditionalDescribe } from './conditionalDescribe';

conditionalDescribe('Audit Trail API Integration Tests', () => {
  let testUser: any;
  let testOrganization: any;
  let authToken: string;
  let testAsset: any;
  let testTask: any;

  beforeAll(async () => {
    testOrganization = await createTestOrganization('Audit Trail Test Org');
    testUser = await createTestUser({
      email: 'audit.trail.test@example.com',
      fullName: 'Audit Trail Test User',
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
    await prisma.auditTrailEntry.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.task.deleteMany({ where: { organizationId: testOrganization.id } });
    await prisma.asset.deleteMany({ where: { organizationId: testOrganization.id } });

    // Create test entities
    testAsset = await prisma.asset.create({
      data: {
        name: 'Audit Test Asset',
        category: 'Computer',
        status: 'OPERATIONAL',
        organizationId: testOrganization.id,
        purchasePrice: 1500,
      },
    });

    testTask = await prisma.task.create({
      data: {
        title: 'Audit Test Task',
        status: 'TODO',
        priority: 'MEDIUM',
        organizationId: testOrganization.id,
        createdBy: testUser.id,
      },
    });
  });

  describe('GET /api/audit-trail', () => {
    beforeEach(async () => {
      // Create test audit entries
      await prisma.auditTrailEntry.createMany({
        data: [
          {
            action: 'CREATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: {
              new: { name: 'Audit Test Asset', category: 'Computer' },
            },
            ipAddress: '192.168.1.1',
            userAgent: 'test-agent',
            timestamp: new Date('2024-01-15T10:00:00Z'),
          },
          {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: {
              old: { status: 'OPERATIONAL' },
              new: { status: 'MAINTENANCE' },
            },
            ipAddress: '192.168.1.1',
            userAgent: 'test-agent',
            timestamp: new Date('2024-01-15T11:00:00Z'),
          },
          {
            action: 'CREATE',
            entityType: 'Task',
            entityId: testTask.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: {
              new: { title: 'Audit Test Task', status: 'TODO' },
            },
            ipAddress: '192.168.1.2',
            userAgent: 'test-agent',
            timestamp: new Date('2024-01-15T12:00:00Z'),
          },
        ],
      });
    });

    it('should return paginated audit trail entries', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('entries');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.entries).toHaveLength(3);
      
      const entry = response.body.entries[0];
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('entityType');
      expect(entry).toHaveProperty('entityId');
      expect(entry).toHaveProperty('userId');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('changes');
    });

    it('should filter by entity type', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .query({ entityType: 'Asset' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(2);
      response.body.entries.forEach((entry: any) => {
        expect(entry.entityType).toBe('Asset');
      });
    });

    it('should filter by action type', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .query({ action: 'CREATE' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(2);
      response.body.entries.forEach((entry: any) => {
        expect(entry.action).toBe('CREATE');
      });
    });

    it('should filter by entity ID', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .query({ entityId: testAsset.id })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(2);
      response.body.entries.forEach((entry: any) => {
        expect(entry.entityId).toBe(testAsset.id);
      });
    });

    it('should filter by user ID', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .query({ userId: testUser.id })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(3);
      response.body.entries.forEach((entry: any) => {
        expect(entry.userId).toBe(testUser.id);
      });
    });

    it('should filter by date range', async () => {
      const startDate = '2024-01-15T10:30:00Z';
      const endDate = '2024-01-15T11:30:00Z';

      const response = await request(app)
        .get('/api/audit-trail')
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(1);
      expect(response.body.entries[0].action).toBe('UPDATE');
    });

    it('should sort entries by timestamp descending by default', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const timestamps = response.body.entries.map((entry: any) => new Date(entry.timestamp));
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i-1].getTime()).toBeGreaterThanOrEqual(timestamps[i].getTime());
      }
    });

    it('should paginate results correctly', async () => {
      const response = await request(app)
        .get('/api/audit-trail')
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(2);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/audit-trail')
        .expect(401);
    });

    it('should only return entries for user organization', async () => {
      const otherOrg = await createTestOrganization('Other Audit Org');
      const otherUser = await createTestUser({
        email: 'other.audit@example.com',
        fullName: 'Other Audit User',
        role: 'OWNER',
        organizationId: otherOrg.id,
      });
      const otherToken = await getAuthToken(otherUser.id);

      const response = await request(app)
        .get('/api/audit-trail')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(0);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('GET /api/audit-trail/:id', () => {
    let testAuditEntry: any;

    beforeEach(async () => {
      testAuditEntry = await prisma.auditTrailEntry.create({
        data: {
          action: 'UPDATE',
          entityType: 'Asset',
          entityId: testAsset.id,
          userId: testUser.id,
          organizationId: testOrganization.id,
          changes: {
            old: { status: 'OPERATIONAL', location: 'Office A' },
            new: { status: 'MAINTENANCE', location: 'Workshop' },
          },
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 Test Browser',
          metadata: {
            reason: 'Scheduled maintenance',
            severity: 'medium',
          },
          timestamp: new Date(),
        },
      });
    });

    it('should return detailed audit entry', async () => {
      const response = await request(app)
        .get(`/api/audit-trail/${testAuditEntry.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testAuditEntry.id,
        action: 'UPDATE',
        entityType: 'Asset',
        entityId: testAsset.id,
        userId: testUser.id,
        changes: {
          old: { status: 'OPERATIONAL', location: 'Office A' },
          new: { status: 'MAINTENANCE', location: 'Workshop' },
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 Test Browser',
        metadata: {
          reason: 'Scheduled maintenance',
          severity: 'medium',
        },
      });
    });

    it('should include related entity information', async () => {
      const response = await request(app)
        .get(`/api/audit-trail/${testAuditEntry.id}`)
        .query({ includeEntity: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('entity');
      expect(response.body.entity).toMatchObject({
        id: testAsset.id,
        name: 'Audit Test Asset',
        category: 'Computer',
      });
    });

    it('should include user information', async () => {
      const response = await request(app)
        .get(`/api/audit-trail/${testAuditEntry.id}`)
        .query({ includeUser: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        id: testUser.id,
        fullName: 'Audit Trail Test User',
        email: 'audit.trail.test@example.com',
      });
    });

    it('should return 404 for non-existent entry', async () => {
      await request(app)
        .get('/api/audit-trail/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should deny access to entries from other organizations', async () => {
      const otherOrg = await createTestOrganization('Other Audit Detail Org');
      const otherUser = await createTestUser({
        email: 'other.detail@example.com',
        fullName: 'Other Detail User',
        role: 'OWNER',
        organizationId: otherOrg.id,
      });
      const otherToken = await getAuthToken(otherUser.id);

      await request(app)
        .get(`/api/audit-trail/${testAuditEntry.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('GET /api/audit-trail/stats', () => {
    beforeEach(async () => {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      await prisma.auditTrailEntry.createMany({
        data: [
          {
            action: 'CREATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: {},
            timestamp: now,
          },
          {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: {},
            timestamp: dayAgo,
          },
          {
            action: 'DELETE',
            entityType: 'Task',
            entityId: testTask.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: {},
            timestamp: weekAgo,
          },
        ],
      });
    });

    it('should return audit trail statistics', async () => {
      const response = await request(app)
        .get('/api/audit-trail/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalEntries');
      expect(response.body).toHaveProperty('entriesByAction');
      expect(response.body).toHaveProperty('entriesByEntityType');
      expect(response.body).toHaveProperty('entriesByTimeframe');

      expect(response.body.totalEntries).toBe(3);
      expect(response.body.entriesByAction).toMatchObject({
        CREATE: 1,
        UPDATE: 1,
        DELETE: 1,
      });
      expect(response.body.entriesByEntityType).toMatchObject({
        Asset: 2,
        Task: 1,
      });
    });

    it('should filter stats by date range', async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const response = await request(app)
        .get('/api/audit-trail/stats')
        .query({ startDate: oneDayAgo.toISOString() })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.totalEntries).toBe(2); // Only recent entries
    });

    it('should include activity trends', async () => {
      const response = await request(app)
        .get('/api/audit-trail/stats')
        .query({ includeTrends: 'true' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('activityTrends');
      expect(response.body.activityTrends).toHaveProperty('daily');
      expect(response.body.activityTrends).toHaveProperty('hourly');
    });
  });

  describe('GET /api/audit-trail/export', () => {
    beforeEach(async () => {
      await prisma.auditTrailEntry.createMany({
        data: [
          {
            action: 'CREATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: { new: { name: 'Test Asset' } },
            ipAddress: '192.168.1.1',
            timestamp: new Date('2024-01-15T10:00:00Z'),
          },
          {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: { 
              old: { status: 'OPERATIONAL' },
              new: { status: 'MAINTENANCE' }
            },
            ipAddress: '192.168.1.1',
            timestamp: new Date('2024-01-15T11:00:00Z'),
          },
        ],
      });
    });

    it('should export audit trail as CSV', async () => {
      const response = await request(app)
        .get('/api/audit-trail/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('audit-trail-export');
      
      const csvContent = response.text;
      expect(csvContent).toContain('timestamp,action,entityType,entityId,userId');
      expect(csvContent).toContain('CREATE');
      expect(csvContent).toContain('UPDATE');
    });

    it('should export audit trail as JSON', async () => {
      const response = await request(app)
        .get('/api/audit-trail/export')
        .query({ format: 'json' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('audit-trail-export.json');
      
      const jsonData = response.body;
      expect(jsonData).toHaveProperty('metadata');
      expect(jsonData).toHaveProperty('entries');
      expect(jsonData.entries).toHaveLength(2);
    });

    it('should apply filters to export', async () => {
      const response = await request(app)
        .get('/api/audit-trail/export')
        .query({ 
          format: 'csv',
          action: 'CREATE',
          entityType: 'Asset'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const csvContent = response.text;
      const lines = csvContent.split('\n').filter(line => line.trim());
      expect(lines).toHaveLength(2); // Header + 1 filtered row
    });

    it('should require appropriate permissions for export', async () => {
      const viewerUser = await createTestUser({
        email: 'viewer.audit@example.com',
        fullName: 'Viewer User',
        role: 'VIEWER',
        organizationId: testOrganization.id,
      });
      const viewerToken = await getAuthToken(viewerUser.id);

      await request(app)
        .get('/api/audit-trail/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: viewerUser.id } });
    });
  });

  describe('POST /api/audit-trail/integrity-check', () => {
    beforeEach(async () => {
      await prisma.auditTrailEntry.createMany({
        data: [
          {
            action: 'CREATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: { new: { name: 'Test Asset' } },
            checksum: 'valid-checksum-1',
            timestamp: new Date('2024-01-15T10:00:00Z'),
          },
          {
            action: 'UPDATE',
            entityType: 'Asset',
            entityId: testAsset.id,
            userId: testUser.id,
            organizationId: testOrganization.id,
            changes: { 
              old: { status: 'OPERATIONAL' },
              new: { status: 'MAINTENANCE' }
            },
            checksum: 'valid-checksum-2',
            timestamp: new Date('2024-01-15T11:00:00Z'),
          },
        ],
      });
    });

    it('should verify audit trail integrity', async () => {
      const response = await request(app)
        .post('/api/audit-trail/integrity-check')
        .send({
          startDate: '2024-01-15T09:00:00Z',
          endDate: '2024-01-15T12:00:00Z',
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('isValid');
      expect(response.body).toHaveProperty('checkedEntries');
      expect(response.body).toHaveProperty('invalidEntries');
      expect(response.body).toHaveProperty('summary');

      expect(response.body.isValid).toBe(true);
      expect(response.body.checkedEntries).toBe(2);
      expect(response.body.invalidEntries).toHaveLength(0);
    });

    it('should detect tampered entries', async () => {
      // Manually tamper with an entry
      await prisma.auditTrailEntry.updateMany({
        where: { action: 'CREATE' },
        data: { checksum: 'invalid-checksum' },
      });

      const response = await request(app)
        .post('/api/audit-trail/integrity-check')
        .send({
          startDate: '2024-01-15T09:00:00Z',
          endDate: '2024-01-15T12:00:00Z',
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.isValid).toBe(false);
      expect(response.body.invalidEntries).toHaveLength(1);
      expect(response.body.invalidEntries[0]).toHaveProperty('reason');
      expect(response.body.invalidEntries[0].reason).toContain('checksum');
    });

    it('should require ADMIN role for integrity checks', async () => {
      const editorUser = await createTestUser({
        email: 'editor.audit@example.com',
        fullName: 'Editor User',
        role: 'EDITOR',
        organizationId: testOrganization.id,
      });
      const editorToken = await getAuthToken(editorUser.id);

      await request(app)
        .post('/api/audit-trail/integrity-check')
        .send({
          startDate: '2024-01-15T09:00:00Z',
          endDate: '2024-01-15T12:00:00Z',
        })
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(403);

      // Cleanup
      await prisma.user.delete({ where: { id: editorUser.id } });
    });
  });

  describe('Bulk operations and performance', () => {
    it('should handle bulk audit entry creation', async () => {
      // Simulate bulk operations that would create many audit entries
      const bulkData = Array.from({ length: 100 }, (_, i) => ({
        action: 'BULK_UPDATE',
        entityType: 'Asset',
        entityId: testAsset.id,
        userId: testUser.id,
        organizationId: testOrganization.id,
        changes: { new: { batchId: i } },
        timestamp: new Date(),
      }));

      await prisma.auditTrailEntry.createMany({ data: bulkData });

      const response = await request(app)
        .get('/api/audit-trail')
        .query({ action: 'BULK_UPDATE' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries).toHaveLength(20); // Default page size
      expect(response.body.pagination.total).toBe(100);
    });

    it('should handle large audit trail queries efficiently', async () => {
      // Create many audit entries
      const manyEntries = Array.from({ length: 200 }, (_, i) => ({
        action: 'PERFORMANCE_TEST',
        entityType: 'Asset',
        entityId: testAsset.id,
        userId: testUser.id,
        organizationId: testOrganization.id,
        changes: {},
        timestamp: new Date(Date.now() - i * 60000), // Stagger timestamps
      }));

      await prisma.auditTrailEntry.createMany({ data: manyEntries });

      const start = Date.now();
      const response = await request(app)
        .get('/api/audit-trail')
        .query({ action: 'PERFORMANCE_TEST', limit: 50 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration = Date.now() - start;

      expect(response.body.entries).toHaveLength(50);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed date ranges gracefully', async () => {
      await request(app)
        .get('/api/audit-trail')
        .query({ 
          startDate: 'invalid-date',
          endDate: 'also-invalid'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle invalid UUIDs', async () => {
      await request(app)
        .get('/api/audit-trail/invalid-uuid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle database errors gracefully', async () => {
      const originalFindMany = prisma.auditTrailEntry.findMany;
      jest.spyOn(prisma.auditTrailEntry, 'findMany').mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/audit-trail')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');

      prisma.auditTrailEntry.findMany = originalFindMany;
    });
  });
});