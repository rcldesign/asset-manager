import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import type { TestDatabaseHelper } from './app.setup';
import { createTestApp, setupTestDatabase, cleanupTestDatabase } from './app.setup';
import type { Application } from 'express';
import type { User, Organization, Task, Asset, Location } from '@prisma/client';
import { generateTokens } from '../../utils/auth';

describe('Tasks API Integration Tests', () => {
  let app: Application;
  let dbHelper: TestDatabaseHelper;
  let testUser: User;
  let testOrganization: Organization;
  let testLocation: Location;
  let authToken: string;
  let testAsset: Asset;

  beforeAll(async () => {
    // Setup database and app
    dbHelper = await setupTestDatabase();
    app = createTestApp();

    // Create test organization
    const testOrgData = await dbHelper.createTestOrganization({
      name: 'Test Organization for Tasks',
    });

    // Get the full organization object
    testOrganization = await dbHelper.getPrisma().organization.findUniqueOrThrow({
      where: { id: testOrgData.id },
    });

    // Create test user
    const testUserData = await dbHelper.createTestUser({
      organizationId: testOrganization.id,
      email: 'tasks-test@example.com',
      password: 'password123',
      role: 'MANAGER',
    });

    // Get the full user object
    testUser = await dbHelper.getPrisma().user.findUniqueOrThrow({
      where: { id: testUserData.id },
    });

    // Generate auth token
    const tokens = generateTokens({
      userId: testUser.id,
      organizationId: testUser.organizationId,
      role: testUser.role,
    });
    authToken = tokens.accessToken;

    // Create test location for assets
    testLocation = await dbHelper.getPrisma().location.create({
      data: {
        organizationId: testOrganization.id,
        name: 'Test Location',
        path: testOrganization.id,
      },
    });

    // Create a test asset for task association
    testAsset = await dbHelper.getPrisma().asset.create({
      data: {
        organizationId: testOrganization.id,
        locationId: testLocation.id,
        name: 'Test Asset for Tasks',
        category: 'HARDWARE',
        status: 'OPERATIONAL',
        path: '/test-asset',
      },
    });
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

  describe('POST /api/tasks', () => {
    test('should create a task successfully', async () => {
      const taskData = {
        title: 'Test Task',
        description: 'This is a test task',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        priority: 'HIGH',
        estimatedMinutes: 120,
        assetId: testAsset.id,
        assignUserIds: [testUser.id],
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(201);

      expect(response.body).toMatchObject({
        title: taskData.title,
        description: taskData.description,
        priority: taskData.priority,
        estimatedMinutes: taskData.estimatedMinutes,
        status: 'PLANNED',
        organizationId: testOrganization.id,
        assetId: testAsset.id,
      });

      expect(response.body.id).toBeDefined();
      expect(new Date(response.body.dueDate)).toBeInstanceOf(Date);
    });

    test('should create a task without optional fields', async () => {
      const taskData = {
        title: 'Minimal Task',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(201);

      expect(response.body).toMatchObject({
        title: taskData.title,
        status: 'PLANNED',
        priority: 'MEDIUM',
        organizationId: testOrganization.id,
      });
    });

    test('should reject task creation with missing required fields', async () => {
      const response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'Task without title',
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should reject task creation without authentication', async () => {
      await request(app)
        .post('/api/tasks')
        .send({
          title: 'Unauthorized Task',
          dueDate: new Date().toISOString(),
        })
        .expect(401);
    });
  });

  describe('GET /api/tasks', () => {
    beforeEach(async () => {
      // Create test tasks
      await dbHelper.getPrisma().task.createMany({
        data: [
          {
            organizationId: testOrganization.id,
            title: 'Task 1',
            description: 'First task',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: 'PLANNED',
            priority: 'HIGH',
            assetId: testAsset.id,
          },
          {
            organizationId: testOrganization.id,
            title: 'Task 2',
            description: 'Second task',
            dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
          },
          {
            organizationId: testOrganization.id,
            title: 'Overdue Task',
            description: 'This task is overdue',
            dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
            status: 'PLANNED',
            priority: 'HIGH',
          },
        ],
      });
    });

    test('should list tasks with pagination', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response.body.tasks).toHaveLength(2);
      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
      expect(response.body.totalPages).toBe(2);
    });

    test('should filter tasks by status', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'PLANNED' })
        .expect(200);

      expect(response.body.tasks).toHaveLength(2);
      response.body.tasks.forEach((task: Task) => {
        expect(task.status).toBe('PLANNED');
      });
    });

    test('should filter tasks by priority', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ priority: 'HIGH' })
        .expect(200);

      expect(response.body.tasks).toHaveLength(2);
      response.body.tasks.forEach((task: Task) => {
        expect(task.priority).toBe('HIGH');
      });
    });

    test('should filter overdue tasks', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ isOverdue: 'true' })
        .expect(200);

      expect(response.body.tasks).toHaveLength(1);
      expect(response.body.tasks[0].title).toBe('Overdue Task');
    });

    test('should filter tasks by asset', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ assetId: testAsset.id })
        .expect(200);

      expect(response.body.tasks).toHaveLength(1);
      expect(response.body.tasks[0].assetId).toBe(testAsset.id);
    });

    test('should sort tasks by dueDate', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ sortBy: 'dueDate', sortOrder: 'asc' })
        .expect(200);

      expect(response.body.tasks).toHaveLength(3);
      const dueDates = response.body.tasks.map((task: Task) => new Date(task.dueDate));
      for (let i = 1; i < dueDates.length; i++) {
        expect(dueDates[i].getTime()).toBeGreaterThanOrEqual(dueDates[i - 1].getTime());
      }
    });
  });

  describe('GET /api/tasks/:taskId', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await dbHelper.getPrisma().task.create({
        data: {
          organizationId: testOrganization.id,
          title: 'Test Task Detail',
          description: 'Task for detail testing',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'PLANNED',
          priority: 'MEDIUM',
          assetId: testAsset.id,
        },
      });
    });

    test('should get task by ID', async () => {
      const response = await request(app)
        .get(`/api/tasks/${testTask.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testTask.id,
        title: testTask.title,
        description: testTask.description,
        status: testTask.status,
        priority: testTask.priority,
        assetId: testTask.assetId,
      });
    });

    test('should return 404 for non-existent task', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app)
        .get(`/api/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    test('should return 400 for invalid task ID format', async () => {
      await request(app)
        .get('/api/tasks/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('PUT /api/tasks/:taskId', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await dbHelper.getPrisma().task.create({
        data: {
          organizationId: testOrganization.id,
          title: 'Task to Update',
          description: 'Original description',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'PLANNED',
          priority: 'MEDIUM',
        },
      });
    });

    test('should update task successfully', async () => {
      const updateData = {
        title: 'Updated Task Title',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        actualMinutes: 90,
      };

      const response = await request(app)
        .put(`/api/tasks/${testTask.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testTask.id,
        title: updateData.title,
        status: updateData.status,
        priority: updateData.priority,
        actualMinutes: updateData.actualMinutes,
      });
    });

    test('should reject invalid status transitions', async () => {
      // Update task to DONE first
      await dbHelper.getPrisma().task.update({
        where: { id: testTask.id },
        data: { status: 'DONE' },
      });

      // Try to transition to PLANNED (invalid)
      await request(app)
        .put(`/api/tasks/${testTask.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'PLANNED' })
        .expect(409); // Conflict error for invalid transition
    });

    test('should return 404 for non-existent task', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app)
        .put(`/api/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title' })
        .expect(404);
    });
  });

  describe('DELETE /api/tasks/:taskId', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await dbHelper.getPrisma().task.create({
        data: {
          organizationId: testOrganization.id,
          title: 'Task to Delete',
          description: 'Will be deleted',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'PLANNED',
          priority: 'MEDIUM',
        },
      });
    });

    test('should delete task successfully', async () => {
      await request(app)
        .delete(`/api/tasks/${testTask.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify task is deleted
      const deletedTask = await dbHelper.getPrisma().task.findUnique({
        where: { id: testTask.id },
      });
      expect(deletedTask).toBeNull();
    });

    test('should return 404 for non-existent task', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      await request(app)
        .delete(`/api/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/tasks/:taskId/assign', () => {
    let testTask: Task;
    let anotherUser: User;

    beforeEach(async () => {
      testTask = await dbHelper.getPrisma().task.create({
        data: {
          organizationId: testOrganization.id,
          title: 'Task for Assignment',
          description: 'Will be assigned to users',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'PLANNED',
          priority: 'MEDIUM',
        },
      });

      // Create another user for assignment testing
      // Check if user already exists
      const existingUser = await dbHelper.getPrisma().user.findUnique({
        where: { email: 'another@test.com' },
      });

      if (existingUser) {
        anotherUser = existingUser;
      } else {
        anotherUser = await dbHelper.getPrisma().user.create({
          data: {
            email: 'another@test.com',
            passwordHash: 'hashedpassword',
            fullName: 'Another User',
            organizationId: testOrganization.id,
            role: 'MEMBER',
            emailVerified: true,
            isActive: true,
          },
        });
      }
    });

    test('should assign users to task', async () => {
      const response = await request(app)
        .put(`/api/tasks/${testTask.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userIds: [testUser.id, anotherUser.id] })
        .expect(200);

      expect(response.body.assignments).toHaveLength(2);
      const assignedUserIds = response.body.assignments.map((a: any) => a.user.id);
      expect(assignedUserIds).toContain(testUser.id);
      expect(assignedUserIds).toContain(anotherUser.id);
    });

    test('should replace existing assignments', async () => {
      // First assignment
      await request(app)
        .put(`/api/tasks/${testTask.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userIds: [testUser.id] })
        .expect(200);

      // Replace with different user
      const response = await request(app)
        .put(`/api/tasks/${testTask.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userIds: [anotherUser.id] })
        .expect(200);

      expect(response.body.assignments).toHaveLength(1);
      expect(response.body.assignments[0].user.id).toBe(anotherUser.id);
    });

    test('should handle empty assignment list', async () => {
      const response = await request(app)
        .put(`/api/tasks/${testTask.id}/assign`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userIds: [] })
        .expect(200);

      expect(response.body.assignments).toHaveLength(0);
    });
  });

  describe('Task Comments API', () => {
    let testTask: Task;

    beforeEach(async () => {
      testTask = await dbHelper.getPrisma().task.create({
        data: {
          organizationId: testOrganization.id,
          title: 'Task with Comments',
          description: 'Task for comment testing',
          dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: 'PLANNED',
          priority: 'MEDIUM',
        },
      });
    });

    describe('POST /api/tasks/:taskId/comments', () => {
      test('should add comment to task', async () => {
        const commentData = {
          content: 'This is a test comment',
        };

        const response = await request(app)
          .post(`/api/tasks/${testTask.id}/comments`)
          .set('Authorization', `Bearer ${authToken}`)
          .send(commentData)
          .expect(201);

        expect(response.body).toMatchObject({
          content: commentData.content,
          taskId: testTask.id,
          userId: testUser.id,
        });
        expect(response.body.user).toMatchObject({
          id: testUser.id,
          email: testUser.email,
          fullName: testUser.fullName,
        });
      });

      test('should reject empty comment', async () => {
        await request(app)
          .post(`/api/tasks/${testTask.id}/comments`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ content: '' })
          .expect(400);
      });

      test('should reject comment for non-existent task', async () => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        await request(app)
          .post(`/api/tasks/${fakeId}/comments`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({ content: 'Comment for fake task' })
          .expect(404);
      });
    });

    describe('GET /api/tasks/:taskId/comments', () => {
      beforeEach(async () => {
        // Create test comments
        await dbHelper.getPrisma().taskComment.createMany({
          data: [
            {
              taskId: testTask.id,
              userId: testUser.id,
              content: 'First comment',
            },
            {
              taskId: testTask.id,
              userId: testUser.id,
              content: 'Second comment',
            },
            {
              taskId: testTask.id,
              userId: testUser.id,
              content: 'Third comment',
            },
          ],
        });
      });

      test('should get task comments with pagination', async () => {
        const response = await request(app)
          .get(`/api/tasks/${testTask.id}/comments`)
          .set('Authorization', `Bearer ${authToken}`)
          .query({ page: 1, limit: 2 })
          .expect(200);

        expect(response.body.comments).toHaveLength(2);
        expect(response.body.total).toBe(3);
        expect(response.body.page).toBe(1);
        expect(response.body.totalPages).toBe(2);
      });

      test('should return comments in descending order by creation date', async () => {
        const response = await request(app)
          .get(`/api/tasks/${testTask.id}/comments`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.comments).toHaveLength(3);
        const createdDates = response.body.comments.map((c: any) => new Date(c.createdAt));
        for (let i = 1; i < createdDates.length; i++) {
          expect(createdDates[i].getTime()).toBeLessThanOrEqual(createdDates[i - 1].getTime());
        }
      });
    });
  });

  describe('Bulk Operations', () => {
    let tasks: Task[];

    beforeEach(async () => {
      await dbHelper.getPrisma().task.createMany({
        data: [
          {
            organizationId: testOrganization.id,
            title: 'Bulk Task 1',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: 'PLANNED',
            priority: 'MEDIUM',
          },
          {
            organizationId: testOrganization.id,
            title: 'Bulk Task 2',
            dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: 'PLANNED',
            priority: 'MEDIUM',
          },
        ],
      });

      tasks = await dbHelper.getPrisma().task.findMany({
        where: { organizationId: testOrganization.id },
        orderBy: { createdAt: 'desc' },
        take: 2,
      });
    });

    describe('PATCH /api/tasks/bulk/status', () => {
      test('should update status for multiple tasks', async () => {
        const response = await request(app)
          .patch('/api/tasks/bulk/status')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            taskIds: tasks.map((t) => t.id),
            status: 'IN_PROGRESS',
          })
          .expect(200);

        expect(response.body.success).toBe(2);
        expect(response.body.failed).toBe(0);
        expect(response.body.errors).toHaveLength(0);

        // Verify status changes
        const updatedTasks = await dbHelper.getPrisma().task.findMany({
          where: { id: { in: tasks.map((t) => t.id) } },
        });
        updatedTasks.forEach((task) => {
          expect(task.status).toBe('IN_PROGRESS');
        });
      });

      test('should handle mixed success and failure', async () => {
        const fakeId = '550e8400-e29b-41d4-a716-446655440000';
        const response = await request(app)
          .patch('/api/tasks/bulk/status')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            taskIds: [tasks[0]?.id || '', fakeId],
            status: 'IN_PROGRESS',
          })
          .expect(200);

        expect(response.body.success).toBe(1);
        expect(response.body.failed).toBe(1);
        expect(response.body.errors).toHaveLength(1);
        expect(response.body.errors[0]).toContain(fakeId);
      });
    });
  });

  describe('Statistics and Special Endpoints', () => {
    beforeEach(async () => {
      await dbHelper.getPrisma().task.createMany({
        data: [
          {
            organizationId: testOrganization.id,
            title: 'Completed Task',
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
            status: 'DONE',
            priority: 'HIGH',
            actualMinutes: 120,
            completedAt: new Date(),
          },
          {
            organizationId: testOrganization.id,
            title: 'In Progress Task',
            dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
          },
          {
            organizationId: testOrganization.id,
            title: 'Overdue Task',
            dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
            status: 'PLANNED',
            priority: 'HIGH',
          },
        ],
      });
    });

    describe('GET /api/tasks/stats', () => {
      test('should get task statistics', async () => {
        const response = await request(app)
          .get('/api/tasks/stats')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toMatchObject({
          total: 3,
          byStatus: expect.objectContaining({
            DONE: 1,
            IN_PROGRESS: 1,
            PLANNED: 1,
          }),
          byPriority: expect.objectContaining({
            HIGH: 2,
            MEDIUM: 1,
          }),
          overdue: 1,
          avgCompletionTime: 120,
          completionRate: expect.any(Number),
        });
      });
    });

    describe('GET /api/tasks/overdue', () => {
      test('should get overdue tasks', async () => {
        const response = await request(app)
          .get('/api/tasks/overdue')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveLength(1);
        expect(response.body[0].title).toBe('Overdue Task');
        expect(new Date(response.body[0].dueDate).getTime()).toBeLessThan(Date.now());
      });
    });
  });
});
