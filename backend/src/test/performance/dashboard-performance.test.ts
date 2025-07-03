/**
 * Performance test for Dashboard API
 * Tests the performance of dashboard aggregation queries with various data sizes
 */

import { performance } from 'perf_hooks';
import { PrismaClient } from '@prisma/client';
import { DashboardService } from '../../services/dashboard.service';
import type { IRequestContext } from '../../interfaces/context.interface';

const prisma = new PrismaClient();
const dashboardService = new DashboardService(prisma);

describe('Dashboard Performance Tests', () => {
  let testContext: IRequestContext;
  let organizationId: string;

  beforeAll(async () => {
    // Create test organization
    const org = await prisma.organization.create({
      data: {
        name: 'Performance Test Org',
      },
    });
    organizationId = org.id;

    testContext = {
      userId: 'perf-user',
      organizationId: org.id,
      sessionId: 'perf-session',
    };

    // Create test data
    await createTestData();
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.auditTrail.deleteMany({ where: { userId: testContext.userId } });
    await prisma.task.deleteMany({ where: { organizationId } });
    await prisma.asset.deleteMany({ where: { organizationId } });
    await prisma.location.deleteMany({ where: { organizationId } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  async function createTestData() {
    console.log('Creating performance test data...');

    // Create locations
    const locations = [];
    for (let i = 0; i < 10; i++) {
      const location = await prisma.location.create({
        data: {
          organizationId,
          name: `Location ${i + 1}`,
          path: `/location-${i + 1}`,
        },
      });
      locations.push(location);
    }

    // Create assets (1000 assets)
    for (let i = 0; i < 1000; i++) {
      await prisma.asset.create({
        data: {
          organizationId,
          name: `Asset ${i + 1}`,
          category: ['EQUIPMENT', 'HARDWARE', 'SOFTWARE', 'FURNITURE'][i % 4] as any,
          status: ['OPERATIONAL', 'MAINTENANCE', 'REPAIR'][i % 3] as any,
          locationId: locations[i % locations.length].id,
          path: `/assets/asset-${i + 1}`,
          tags: [`tag-${i % 5}`, `category-${i % 3}`],
          warrantyLifetime: i % 10 === 0,
          purchasePrice: Math.random() * 10000,
          purchaseDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Create tasks (2000 tasks)
    for (let i = 0; i < 2000; i++) {
      await prisma.task.create({
        data: {
          organizationId,
          title: `Task ${i + 1}`,
          dueDate: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
          status: ['PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED'][i % 4] as any,
          priority: ['HIGH', 'MEDIUM', 'LOW'][i % 3] as any,
          estimatedCost: Math.random() * 1000,
          estimatedMinutes: Math.floor(Math.random() * 480),
        },
      });
    }

    // Create schedules
    for (let i = 0; i < 50; i++) {
      await prisma.schedule.create({
        data: {
          organizationId,
          name: `Schedule ${i + 1}`,
          scheduleType: 'FIXED_INTERVAL',
          startDate: new Date(),
          isActive: i % 10 !== 0, // 90% active
          taskTemplate: {
            title: `Scheduled Task ${i + 1}`,
            priority: 'MEDIUM',
          },
          autoCreateAdvance: 7,
          intervalDays: 30,
        },
      });
    }

    // Create users
    for (let i = 0; i < 25; i++) {
      await prisma.user.create({
        data: {
          organizationId,
          email: `user${i + 1}@test.com`,
          hashedPassword: 'hashed',
          role: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'][i % 4] as any,
          emailVerified: true,
          totpEnabled: false,
          isActive: true,
          notificationPreferences: {},
          lastLogin:
            i % 5 === 0 ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
        },
      });
    }

    console.log('Test data created successfully');
  }

  it('should perform dashboard stats query within acceptable time', async () => {
    const iterations = 5;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();

      const stats = await dashboardService.getDashboardStats(testContext);

      const end = performance.now();
      const duration = end - start;
      times.push(duration);

      // Verify we got meaningful data
      expect(stats.assets.total).toBeGreaterThan(0);
      expect(stats.tasks.total).toBeGreaterThan(0);
      expect(stats.schedules.total).toBeGreaterThan(0);
      expect(stats.users.total).toBeGreaterThan(0);
    }

    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);

    console.log(`Dashboard Stats Performance:
      Average: ${avgTime.toFixed(2)}ms
      Min: ${minTime.toFixed(2)}ms
      Max: ${maxTime.toFixed(2)}ms
      Times: ${times.map((t) => t.toFixed(2)).join(', ')}ms`);

    // Performance assertion - should complete within 2 seconds
    expect(maxTime).toBeLessThan(2000);
    expect(avgTime).toBeLessThan(1000);
  });

  it('should perform dashboard stats with filters efficiently', async () => {
    const start = performance.now();

    const stats = await dashboardService.getDashboardStats(testContext, {
      assetCategoryFilter: ['EQUIPMENT', 'HARDWARE'],
      taskPriorityFilter: ['HIGH', 'MEDIUM'],
      dateRange: {
        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const end = performance.now();
    const duration = end - start;

    console.log(`Dashboard Stats with Filters: ${duration.toFixed(2)}ms`);

    // Verify filtering worked
    expect(stats.assets.total).toBeGreaterThan(0);
    expect(stats.tasks.total).toBeGreaterThan(0);

    // Should still be fast with filters
    expect(duration).toBeLessThan(1500);
  });

  it('should perform trending data queries efficiently', async () => {
    const metrics = ['assets', 'tasks', 'completions'] as const;

    for (const metric of metrics) {
      const start = performance.now();

      const trendData = await dashboardService.getTrendingData(testContext, metric, 30);

      const end = performance.now();
      const duration = end - start;

      console.log(`Trending Data (${metric}): ${duration.toFixed(2)}ms`);

      expect(Array.isArray(trendData)).toBe(true);
      expect(duration).toBeLessThan(1000);
    }
  });

  it('should handle concurrent dashboard requests', async () => {
    const concurrentRequests = 10;
    const start = performance.now();

    const promises = Array(concurrentRequests)
      .fill(0)
      .map(() => dashboardService.getDashboardStats(testContext));

    const results = await Promise.all(promises);

    const end = performance.now();
    const duration = end - start;

    console.log(`${concurrentRequests} Concurrent Requests: ${duration.toFixed(2)}ms`);

    // All requests should return the same data
    results.forEach((result) => {
      expect(result.assets.total).toBe(results[0].assets.total);
      expect(result.tasks.total).toBe(results[0].tasks.total);
    });

    // Should handle concurrent load reasonably well
    expect(duration).toBeLessThan(5000);
  });

  it('should maintain performance with complex aggregations', async () => {
    // Test the most complex dashboard query scenario
    const start = performance.now();

    const [stats, assetTrend, taskTrend, completionTrend] = await Promise.all([
      dashboardService.getDashboardStats(testContext),
      dashboardService.getTrendingData(testContext, 'assets', 30),
      dashboardService.getTrendingData(testContext, 'tasks', 30),
      dashboardService.getTrendingData(testContext, 'completions', 30),
    ]);

    const end = performance.now();
    const duration = end - start;

    console.log(`Complex Dashboard Aggregation: ${duration.toFixed(2)}ms`);

    // Verify all queries returned data
    expect(stats.assets.total).toBeGreaterThan(0);
    expect(Array.isArray(assetTrend)).toBe(true);
    expect(Array.isArray(taskTrend)).toBe(true);
    expect(Array.isArray(completionTrend)).toBe(true);

    // Complex aggregation should still be reasonably fast
    expect(duration).toBeLessThan(3000);
  });
});
