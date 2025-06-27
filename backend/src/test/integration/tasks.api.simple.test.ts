import request from 'supertest';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import type { TestDatabaseHelper } from './app.setup';
import { createTestApp, setupTestDatabase, cleanupTestDatabase } from './app.setup';
import type { Application } from 'express';
import { generateTokens } from '../../utils/auth';

describe('Tasks API Simple Test', () => {
  let app: Application;
  let dbHelper: TestDatabaseHelper;
  let authToken: string;

  beforeAll(async () => {
    // Setup database and app
    dbHelper = await setupTestDatabase();
    app = createTestApp();

    // Create test data directly
    const org = await dbHelper.createTestOrganization({
      name: 'Simple Test Org',
    });

    const user = await dbHelper.createTestUser({
      organizationId: org.id,
      email: 'simple-test@example.com',
      password: 'password123',
      role: 'MANAGER',
    });

    // Generate auth token
    const tokens = generateTokens({
      userId: user.id,
      organizationId: org.id,
      role: 'MANAGER',
    });
    authToken = tokens.accessToken;

    // Create location for assets
    await dbHelper.getPrisma().location.create({
      data: {
        organizationId: org.id,
        name: 'Test Location',
        path: org.id,
      },
    });
  });

  afterAll(async () => {
    await cleanupTestDatabase(dbHelper);
  });

  test('should create and retrieve a task', async () => {
    // Create task
    const createResponse = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        title: 'Simple Test Task',
        description: 'A simple task for testing',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        priority: 'HIGH',
      });

    console.log('Create response:', createResponse.status, createResponse.body);
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.title).toBe('Simple Test Task');

    const taskId = createResponse.body.id;

    // Get task
    const getResponse = await request(app)
      .get(`/api/tasks/${taskId}`)
      .set('Authorization', `Bearer ${authToken}`);

    console.log('Get response:', getResponse.status, getResponse.body);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(taskId);
    expect(getResponse.body.title).toBe('Simple Test Task');
  });

  test('should list tasks', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`);

    console.log('List response:', response.status, response.body);
    expect(response.status).toBe(200);
    expect(response.body.tasks).toBeDefined();
    expect(Array.isArray(response.body.tasks)).toBe(true);
  });

  test('should require authentication', async () => {
    const response = await request(app).get('/api/tasks');

    expect(response.status).toBe(401);
  });
});
