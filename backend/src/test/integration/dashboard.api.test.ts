import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { createTestUser, createTestOrganization, getAuthToken } from '../helpers';
import { conditionalDescribe } from './conditionalDescribe';

conditionalDescribe('Dashboard API Integration Tests', () => {
  let testUser: any;
  let testOrganization: any;
  let authToken: string;

  beforeAll(async () => {
    testOrganization = await createTestOrganization('Dashboard Test Org');
    testUser = await createTestUser({
      email: 'dashboard.test@example.com',
      fullName: 'Dashboard Test User',
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
    await prisma.schedule.deleteMany({ where: { organizationId: testOrganization.id } });
  });

  describe('GET /api/dashboard/stats', () => {
    beforeEach(async () => {
      // Create test data
      await prisma.asset.createMany({
        data: [
          {
            name: 'Test Asset 1',
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            purchasePrice: 1500,
            currentValue: 1200,
          },
          {
            name: 'Test Asset 2',
            category: 'Furniture',
            status: 'MAINTENANCE',
            organizationId: testOrganization.id,
            purchasePrice: 500,
            currentValue: 400,
          },
          {
            name: 'Test Asset 3',
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            purchasePrice: 2000,
            currentValue: 1800,
          },
        ],
      });

      await prisma.task.createMany({
        data: [
          {
            title: 'Test Task 1',
            status: 'TODO',
            priority: 'HIGH',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            estimatedCost: 100,
          },
          {
            title: 'Test Task 2',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            estimatedCost: 200,
          },
          {
            title: 'Test Task 3',
            status: 'COMPLETED',
            priority: 'LOW',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            actualCost: 150,
            completedAt: new Date(),
          },
        ],
      });
    });

    it('should return comprehensive dashboard statistics', async () => {
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        assets: {
          total: 3,
          byStatus: {
            OPERATIONAL: 2,
            MAINTENANCE: 1,
          },
          byCategory: {
            Computer: 2,
            Furniture: 1,
          },
          totalValue: 4000,
          currentValue: 3400,
        },
        tasks: {
          total: 3,
          byStatus: {
            TODO: 1,
            IN_PROGRESS: 1,
            COMPLETED: 1,
          },
          byPriority: {
            HIGH: 1,
            MEDIUM: 1,
            LOW: 1,
          },
          completionRate: expect.any(Number),
        },
        users: {
          total: 1,
          active: 1,
        },
      });
    });

    it('should return empty stats for new organization', async () => {
      const emptyOrg = await createTestOrganization('Empty Test Org');
      const emptyUser = await createTestUser({
        email: 'empty.test@example.com',
        fullName: 'Empty Test User',
        role: 'OWNER',
        organizationId: emptyOrg.id,
      });
      const emptyToken = await getAuthToken(emptyUser.id);

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${emptyToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        assets: {
          total: 0,
          byStatus: {},
          byCategory: {},
          totalValue: 0,
          currentValue: 0,
        },
        tasks: {
          total: 0,
          byStatus: {},
          byPriority: {},
          completionRate: 0,
        },
        users: {
          total: 1,
          active: 1,
        },
      });

      // Cleanup
      await prisma.user.delete({ where: { id: emptyUser.id } });
      await prisma.organization.delete({ where: { id: emptyOrg.id } });
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/dashboard/stats')
        .expect(401);
    });

    it('should filter by date range when provided', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const response = await request(app)
        .get('/api/dashboard/stats')
        .query({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('assets');
      expect(response.body).toHaveProperty('tasks');
      expect(response.body).toHaveProperty('users');
    });
  });

  describe('GET /api/dashboard/trending', () => {
    beforeEach(async () => {
      // Create trending data over time
      const dates = [
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
        new Date(), // today
      ];

      for (let i = 0; i < dates.length; i++) {
        await prisma.asset.create({
          data: {
            name: `Trending Asset ${i}`,
            category: 'Computer',
            status: 'OPERATIONAL',
            organizationId: testOrganization.id,
            createdAt: dates[i],
          },
        });

        await prisma.task.create({
          data: {
            title: `Trending Task ${i}`,
            status: i === 2 ? 'COMPLETED' : 'TODO',
            priority: 'MEDIUM',
            organizationId: testOrganization.id,
            createdBy: testUser.id,
            createdAt: dates[i],
            completedAt: i === 2 ? dates[i] : null,
          },
        });
      }
    });

    it('should return trending data for charts', async () => {
      const response = await request(app)
        .get('/api/dashboard/trending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        assets: {
          labels: expect.any(Array),
          data: expect.any(Array),
        },
        tasks: {
          created: {
            labels: expect.any(Array),
            data: expect.any(Array),
          },
          completed: {
            labels: expect.any(Array),
            data: expect.any(Array),
          },
        },
      });

      expect(response.body.assets.data.length).toBeGreaterThan(0);
    });

    it('should support different time periods', async () => {
      const response = await request(app)
        .get('/api/dashboard/trending')
        .query({ period: '30d' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('assets');
      expect(response.body).toHaveProperty('tasks');
    });

    it('should handle invalid time period gracefully', async () => {
      const response = await request(app)
        .get('/api/dashboard/trending')
        .query({ period: 'invalid' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/dashboard/summary', () => {
    beforeEach(async () => {
      // Create test data for summary
      await prisma.asset.create({
        data: {
          name: 'Summary Asset',
          category: 'Equipment',
          status: 'OPERATIONAL',
          organizationId: testOrganization.id,
          warrantyExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        },
      });

      await prisma.task.create({
        data: {
          title: 'Urgent Task',
          status: 'TODO',
          priority: 'CRITICAL',
          organizationId: testOrganization.id,
          createdBy: testUser.id,
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
        },
      });
    });

    it('should return quick summary for headers', async () => {
      const response = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        totalAssets: expect.any(Number),
        totalTasks: expect.any(Number),
        urgentTasks: expect.any(Number),
        expiringWarranties: expect.any(Number),
        recentActivity: expect.any(Array),
      });

      expect(response.body.urgentTasks).toBeGreaterThan(0);
      expect(response.body.expiringWarranties).toBeGreaterThan(0);
    });

    it('should include recent activity', async () => {
      const response = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.recentActivity).toBeInstanceOf(Array);
      if (response.body.recentActivity.length > 0) {
        expect(response.body.recentActivity[0]).toHaveProperty('type');
        expect(response.body.recentActivity[0]).toHaveProperty('title');
        expect(response.body.recentActivity[0]).toHaveProperty('timestamp');
      }
    });

    it('should limit recent activity items', async () => {
      const response = await request(app)
        .get('/api/dashboard/summary')
        .query({ activityLimit: 3 })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.recentActivity.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Permission-based access', () => {
    it('should allow VIEWER role to access dashboard stats', async () => {
      const viewerUser = await createTestUser({
        email: 'viewer.dashboard@example.com',
        fullName: 'Viewer User',
        role: 'VIEWER',
        organizationId: testOrganization.id,
      });
      const viewerToken = await getAuthToken(viewerUser.id);

      await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);

      // Cleanup
      await prisma.user.delete({ where: { id: viewerUser.id } });
    });

    it('should deny access to users from different organization', async () => {
      const otherOrg = await createTestOrganization('Other Org');
      const otherUser = await createTestUser({
        email: 'other.user@example.com',
        fullName: 'Other User',
        role: 'OWNER',
        organizationId: otherOrg.id,
      });
      const otherToken = await getAuthToken(otherUser.id);

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      // Should only see data from their own organization
      expect(response.body.assets.total).toBe(0);
      expect(response.body.tasks.total).toBe(0);

      // Cleanup
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.organization.delete({ where: { id: otherOrg.id } });
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock a database error
      const originalFindMany = prisma.asset.findMany;
      jest.spyOn(prisma.asset, 'findMany').mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toHaveProperty('error');

      // Restore original method
      prisma.asset.findMany = originalFindMany;
    });

    it('should validate query parameters', async () => {
      await request(app)
        .get('/api/dashboard/stats')
        .query({ startDate: 'invalid-date' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should handle malformed authorization header', async () => {
      await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', 'Invalid Token')
        .expect(401);
    });
  });

  describe('Performance considerations', () => {
    it('should handle large datasets efficiently', async () => {
      // Create a larger dataset
      const assets = Array.from({ length: 100 }, (_, i) => ({
        name: `Asset ${i}`,
        category: i % 2 === 0 ? 'Computer' : 'Furniture',
        status: i % 3 === 0 ? 'MAINTENANCE' : 'OPERATIONAL',
        organizationId: testOrganization.id,
      }));

      await prisma.asset.createMany({ data: assets });

      const start = Date.now();
      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration = Date.now() - start;

      expect(response.body.assets.total).toBe(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should cache results appropriately', async () => {
      // First request
      const start1 = Date.now();
      await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration1 = Date.now() - start1;

      // Second request (should be faster if cached)
      const start2 = Date.now();
      await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const duration2 = Date.now() - start2;

      // Note: This test assumes caching is implemented
      // If no caching, both requests should have similar duration
      expect(duration2).toBeLessThanOrEqual(duration1 + 100); // Allow for some variance
    });
  });
});