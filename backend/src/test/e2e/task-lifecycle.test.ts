import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import type { Application } from 'express';
import {
  createTestApp,
  setupTestDatabase,
  cleanupTestDatabase,
  setupTestEnvironment,
} from '../integration/app.setup';
import type { TestDatabaseHelper } from '../helpers';
import { TestAPIHelper } from '../helpers';

describe('Task Lifecycle E2E Test', () => {
  let app: Application;
  let api: TestAPIHelper;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;
  let organizationId: string;
  let userId: string;
  let assetId: string;

  beforeAll(async () => {
    setupTestEnvironment();
    app = createTestApp();
    dbHelper = await setupTestDatabase();

    // Create test organization and user
    const org = await dbHelper.createTestOrganization({
      name: 'E2E Test Organization',
    });
    organizationId = org.id;

    const user = await dbHelper.createTestUser({
      organizationId: org.id,
      email: 'e2e-task@example.com',
      password: 'password123',
      role: 'MANAGER',
    });
    userId = user.id;

    // Initialize API helper
    api = new TestAPIHelper(app);

    // Authenticate user
    authToken = await api.authenticateUser(user.email, 'password123');

    // Create test location and asset
    const location = await dbHelper.getPrisma().location.create({
      data: {
        organizationId: org.id,
        name: 'E2E Test Location',
        path: org.id,
      },
    });

    const asset = await dbHelper.getPrisma().asset.create({
      data: {
        organizationId: org.id,
        locationId: location.id,
        name: 'E2E Test Asset',
        category: 'HARDWARE',
        status: 'OPERATIONAL',
        path: '/e2e-test-asset',
      },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    await cleanupTestDatabase(dbHelper);
  });

  beforeEach(async () => {
    // Clean up tasks before each test
    await dbHelper.getPrisma().taskComment.deleteMany();
    await dbHelper.getPrisma().taskAssignment.deleteMany();
    await dbHelper.getPrisma().task.deleteMany();
  });

  describe('Task Creation and Management', () => {
    test('should create a task and verify its lifecycle', async () => {
      // 1. Create a task
      const createResponse = await api
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'E2E Test Task',
          description: 'This is an E2E test task',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          priority: 'HIGH',
          assetId: assetId,
          assignUserIds: [userId],
        })
        .expect(201);

      const taskId = createResponse.body.id;
      expect(createResponse.body).toMatchObject({
        title: 'E2E Test Task',
        description: 'This is an E2E test task',
        priority: 'HIGH',
        status: 'PLANNED',
        organizationId: organizationId,
        assetId: assetId,
      });

      // 2. Get the task
      const getResponse = await api
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(getResponse.body.id).toBe(taskId);
      expect(getResponse.body.assignments).toHaveLength(1);
      expect(getResponse.body.assignments[0].user.id).toBe(userId);

      // 3. Add a comment
      const commentResponse = await api
        .post(`/api/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Starting work on this task',
        })
        .expect(201);

      expect(commentResponse.body.content).toBe('Starting work on this task');
      expect(commentResponse.body.userId).toBe(userId);

      // 4. Update task status to IN_PROGRESS
      const updateResponse = await api
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'IN_PROGRESS',
          actualMinutes: 30,
        })
        .expect(200);

      expect(updateResponse.body.status).toBe('IN_PROGRESS');
      expect(updateResponse.body.actualMinutes).toBe(30);

      // 5. Complete the task
      const completeResponse = await api
        .put(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'DONE',
          actualMinutes: 120,
          actualCost: 50,
        })
        .expect(200);

      expect(completeResponse.body.status).toBe('DONE');
      expect(completeResponse.body.actualMinutes).toBe(120);
      expect(completeResponse.body.actualCost).toBe('50');

      // 6. Verify task appears in statistics
      const statsResponse = await api
        .get('/api/tasks/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(statsResponse.body.total).toBeGreaterThanOrEqual(1);
      expect(statsResponse.body.byStatus.DONE).toBeGreaterThanOrEqual(1);
      expect(statsResponse.body.avgCompletionTime).toBe(120);
    });

    test('should handle task assignments', async () => {
      // Create another user
      const anotherUser = await dbHelper.createTestUser({
        organizationId: organizationId,
        email: 'another-e2e@example.com',
        password: 'password123',
        role: 'MEMBER',
      });

      // Create task without assignment
      const createResponse = await api
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Multi-user Task',
          dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          priority: 'MEDIUM',
        })
        .expect(201);

      const taskId = createResponse.body.id;

      // Assign multiple users
      const assignResponse = await api
        .put(`/api/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userIds: [userId, anotherUser.id],
        })
        .expect(200);

      expect(assignResponse.body.assignments).toHaveLength(2);

      // Get user-specific tasks
      const userTasksResponse = await api
        .get(`/api/tasks/user/${userId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(userTasksResponse.body.tasks.some((t: any) => t.id === taskId)).toBe(true);
    });

    test('should handle bulk operations', async () => {
      // Create multiple tasks
      const task1 = await api
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Bulk Task 1',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      const task2 = await api
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Bulk Task 2',
          dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      // Bulk update status
      const bulkResponse = await api
        .patch('/api/tasks/bulk/status')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taskIds: [task1.body.id, task2.body.id],
          status: 'IN_PROGRESS',
        })
        .expect(200);

      expect(bulkResponse.body.success).toBe(2);
      expect(bulkResponse.body.failed).toBe(0);

      // Verify both tasks are updated
      const verifyTask1 = await api
        .get(`/api/tasks/${task1.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(verifyTask1.body.status).toBe('IN_PROGRESS');
    });

    test('should filter and search tasks', async () => {
      // Create tasks with different properties
      const now = Date.now();
      await api
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Overdue Task',
          dueDate: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
          priority: 'HIGH',
          assetId: assetId,
        })
        .expect(201);

      await api
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Future Task',
          dueDate: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next week
          priority: 'LOW',
        })
        .expect(201);

      // Test overdue filter
      const overdueResponse = await api
        .get('/api/tasks?isOverdue=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(overdueResponse.body.tasks.length).toBeGreaterThanOrEqual(1);
      expect(
        overdueResponse.body.tasks.every((t: any) => new Date(t.dueDate).getTime() < now),
      ).toBe(true);

      // Test asset filter
      const assetTasksResponse = await api
        .get(`/api/tasks?assetId=${assetId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(assetTasksResponse.body.tasks.length).toBeGreaterThanOrEqual(1);
      expect(assetTasksResponse.body.tasks.every((t: any) => t.assetId === assetId)).toBe(true);

      // Test priority filter
      const highPriorityResponse = await api
        .get('/api/tasks?priority=HIGH')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(highPriorityResponse.body.tasks.every((t: any) => t.priority === 'HIGH')).toBe(true);
    });
  });
});
