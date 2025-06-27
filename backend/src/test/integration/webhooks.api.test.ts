import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateAuthToken } from '../helpers';
import { webhookService } from '../../services/webhook.service';
import type { User, Organization } from '@prisma/client';
import nock from 'nock';

jest.mock('../../lib/queue', () => ({
  ...jest.requireActual('../../lib/queue'),
  addWebhookJob: jest.fn(),
}));

describe('Webhooks API Integration Tests', () => {
  let authToken: string;
  let testUser: User;
  let testOrg: Organization;
  let webhookId: string;

  beforeAll(async () => {
    // Clear test data
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhookSubscription.deleteMany({});

    // Create test organization and user
    testOrg = await prisma.organization.create({
      data: {
        name: 'Test Webhook Org',
        slug: 'test-webhook-org',
      },
    });

    testUser = await prisma.user.create({
      data: {
        email: 'webhook.test@example.com',
        name: 'Webhook Test User',
        organizationId: testOrg.id,
        role: 'ADMIN',
      },
    });

    authToken = await generateAuthToken(testUser);
  });

  afterAll(async () => {
    // Clean up
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhookSubscription.deleteMany({});
    await prisma.user.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.organization.delete({ where: { id: testOrg.id } });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /api/webhooks', () => {
    it('should create a webhook successfully', async () => {
      const webhookData = {
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        events: ['asset.created', 'task.completed'],
        secret: 'test-secret-key',
        headers: {
          'X-Custom-Header': 'custom-value',
        },
        retryPolicy: {
          maxRetries: 5,
          retryDelayMs: 2000,
          backoffMultiplier: 1.5,
        },
      };

      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: webhookData.name,
        url: webhookData.url,
        events: webhookData.events,
        isActive: true,
        headers: webhookData.headers,
        retryPolicy: webhookData.retryPolicy,
      });

      webhookId = response.body.id;
    });

    it('should auto-generate secret if not provided', async () => {
      const webhookData = {
        name: 'Auto Secret Webhook',
        url: 'https://example.com/webhook2',
        events: ['asset.created'],
      };

      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData)
        .expect(201);

      expect(response.body.secret).toBeDefined();
      expect(response.body.secret).toHaveLength(64);

      // Clean up
      await prisma.webhookSubscription.delete({ where: { id: response.body.id } });
    });

    it('should reject invalid event types', async () => {
      const webhookData = {
        name: 'Invalid Events Webhook',
        url: 'https://example.com/webhook',
        events: ['asset.created', 'invalid.event'],
      };

      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid event types',
        invalidEvents: ['invalid.event'],
      });
    });

    it('should reject invalid URL', async () => {
      const webhookData = {
        name: 'Invalid URL Webhook',
        url: 'not-a-valid-url',
        events: ['asset.created'],
      };

      const response = await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(webhookData)
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should require manage:organization permission', async () => {
      // Create a user without admin role
      const regularUser = await prisma.user.create({
        data: {
          email: 'regular.webhook@example.com',
          name: 'Regular User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const regularToken = await generateAuthToken(regularUser);

      await request(app)
        .post('/api/webhooks')
        .set('Authorization', `Bearer ${regularToken}`)
        .send({
          name: 'Unauthorized Webhook',
          url: 'https://example.com/webhook',
          events: ['asset.created'],
        })
        .expect(403);

      // Clean up
      await prisma.user.delete({ where: { id: regularUser.id } });
    });
  });

  describe('GET /api/webhooks', () => {
    beforeEach(async () => {
      // Create multiple webhooks for testing
      await prisma.webhookSubscription.createMany({
        data: [
          {
            organizationId: testOrg.id,
            name: 'Active Webhook',
            url: 'https://example.com/active',
            events: ['asset.created'],
            isActive: true,
            secret: 'secret1',
          },
          {
            organizationId: testOrg.id,
            name: 'Inactive Webhook',
            url: 'https://example.com/inactive',
            events: ['task.completed'],
            isActive: false,
            secret: 'secret2',
          },
        ],
      });
    });

    afterEach(async () => {
      await prisma.webhookSubscription.deleteMany({
        where: { organizationId: testOrg.id },
      });
    });

    it('should list all webhooks', async () => {
      const response = await request(app)
        .get('/api/webhooks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        name: expect.any(String),
        url: expect.any(String),
        events: expect.any(Array),
        isActive: expect.any(Boolean),
      });
    });

    it('should filter by active status', async () => {
      const response = await request(app)
        .get('/api/webhooks?isActive=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Active Webhook');
    });

    it('should filter by event type', async () => {
      const response = await request(app)
        .get('/api/webhooks?eventType=task.completed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Inactive Webhook');
    });
  });

  describe('GET /api/webhooks/:webhookId', () => {
    let testWebhookId: string;

    beforeEach(async () => {
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: testOrg.id,
          name: 'Get Test Webhook',
          url: 'https://example.com/get-test',
          events: ['asset.created'],
          secret: 'test-secret',
        },
      });
      testWebhookId = webhook.id;
    });

    afterEach(async () => {
      await prisma.webhookSubscription.delete({
        where: { id: testWebhookId },
      });
    });

    it('should get webhook details', async () => {
      const response = await request(app)
        .get(`/api/webhooks/${testWebhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testWebhookId,
        name: 'Get Test Webhook',
        url: 'https://example.com/get-test',
        events: ['asset.created'],
      });
    });

    it('should return 404 for non-existent webhook', async () => {
      await request(app)
        .get('/api/webhooks/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/webhooks/:webhookId', () => {
    let testWebhookId: string;

    beforeEach(async () => {
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: testOrg.id,
          name: 'Update Test Webhook',
          url: 'https://example.com/update-test',
          events: ['asset.created'],
          secret: 'test-secret',
          isActive: true,
        },
      });
      testWebhookId = webhook.id;
    });

    afterEach(async () => {
      await prisma.webhookSubscription.deleteMany({
        where: { id: testWebhookId },
      });
    });

    it('should update webhook properties', async () => {
      const updates = {
        name: 'Updated Webhook Name',
        events: ['task.completed', 'asset.updated'],
        isActive: false,
      };

      const response = await request(app)
        .patch(`/api/webhooks/${testWebhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates)
        .expect(200);

      expect(response.body).toMatchObject({
        id: testWebhookId,
        name: updates.name,
        events: updates.events,
        isActive: updates.isActive,
      });
    });

    it('should reject invalid event types in update', async () => {
      const response = await request(app)
        .patch(`/api/webhooks/${testWebhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          events: ['valid.event', 'invalid.event'],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid event types',
        invalidEvents: ['valid.event', 'invalid.event'],
      });
    });
  });

  describe('DELETE /api/webhooks/:webhookId', () => {
    let testWebhookId: string;

    beforeEach(async () => {
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: testOrg.id,
          name: 'Delete Test Webhook',
          url: 'https://example.com/delete-test',
          events: ['asset.created'],
          secret: 'test-secret',
        },
      });
      testWebhookId = webhook.id;
    });

    it('should delete webhook', async () => {
      await request(app)
        .delete(`/api/webhooks/${testWebhookId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const webhook = await prisma.webhookSubscription.findUnique({
        where: { id: testWebhookId },
      });
      expect(webhook).toBeNull();
    });

    it('should return 404 for non-existent webhook', async () => {
      await request(app)
        .delete('/api/webhooks/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('POST /api/webhooks/:webhookId/test', () => {
    let testWebhookId: string;

    beforeEach(async () => {
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: testOrg.id,
          name: 'Test Delivery Webhook',
          url: 'https://test-webhook.example.com/endpoint',
          events: ['asset.created'],
          secret: 'test-secret',
        },
      });
      testWebhookId = webhook.id;
    });

    afterEach(async () => {
      await prisma.webhookDelivery.deleteMany({
        where: { webhookId: testWebhookId },
      });
      await prisma.webhookSubscription.delete({
        where: { id: testWebhookId },
      });
    });

    it('should send test webhook successfully', async () => {
      // Mock the webhook endpoint
      const scope = nock('https://test-webhook.example.com')
        .post('/endpoint')
        .reply(200, { received: true });

      const response = await request(app)
        .post(`/api/webhooks/${testWebhookId}/test`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'Test webhook delivered successfully',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should handle test webhook failure', async () => {
      // Mock the webhook endpoint to fail
      const scope = nock('https://test-webhook.example.com')
        .post('/endpoint')
        .reply(500, { error: 'Internal Server Error' });

      const response = await request(app)
        .post(`/api/webhooks/${testWebhookId}/test`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: false,
        statusCode: 500,
        message: expect.stringContaining('Test webhook failed'),
      });

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('GET /api/webhooks/:webhookId/deliveries', () => {
    let testWebhookId: string;

    beforeEach(async () => {
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: testOrg.id,
          name: 'Delivery History Webhook',
          url: 'https://example.com/deliveries',
          events: ['asset.created'],
          secret: 'test-secret',
        },
      });
      testWebhookId = webhook.id;

      // Create some delivery records
      await prisma.webhookDelivery.createMany({
        data: [
          {
            webhookId: testWebhookId,
            eventId: 'event-1',
            eventType: 'asset.created',
            url: webhook.url,
            status: 'success',
            statusCode: 200,
            attemptCount: 1,
          },
          {
            webhookId: testWebhookId,
            eventId: 'event-2',
            eventType: 'asset.created',
            url: webhook.url,
            status: 'failed',
            statusCode: 500,
            error: 'Server error',
            attemptCount: 3,
          },
        ],
      });
    });

    afterEach(async () => {
      await prisma.webhookDelivery.deleteMany({
        where: { webhookId: testWebhookId },
      });
      await prisma.webhookSubscription.delete({
        where: { id: testWebhookId },
      });
    });

    it('should get delivery history', async () => {
      const response = await request(app)
        .get(`/api/webhooks/${testWebhookId}/deliveries`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        deliveries: expect.arrayContaining([
          expect.objectContaining({
            status: 'success',
            statusCode: 200,
          }),
          expect.objectContaining({
            status: 'failed',
            statusCode: 500,
          }),
        ]),
        total: 2,
      });
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get(`/api/webhooks/${testWebhookId}/deliveries?status=failed`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        deliveries: expect.arrayContaining([
          expect.objectContaining({
            status: 'failed',
          }),
        ]),
        total: 1,
      });
      expect(response.body.deliveries).toHaveLength(1);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get(`/api/webhooks/${testWebhookId}/deliveries?limit=1&offset=1`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.deliveries).toHaveLength(1);
      expect(response.body.total).toBe(2);
    });
  });

  describe('Webhook Event Emission', () => {
    let testWebhookId: string;

    beforeEach(async () => {
      const webhook = await prisma.webhookSubscription.create({
        data: {
          organizationId: testOrg.id,
          name: 'Event Test Webhook',
          url: 'https://events.example.com/webhook',
          events: ['asset.created', 'task.completed'],
          secret: 'event-secret',
          isActive: true,
        },
      });
      testWebhookId = webhook.id;
    });

    afterEach(async () => {
      await prisma.webhookSubscription.delete({
        where: { id: testWebhookId },
      });
    });

    it('should emit webhook event for asset creation', async () => {
      const mockAddWebhookJob = jest.requireMock('../../lib/queue').addWebhookJob;
      mockAddWebhookJob.mockClear();

      // Create an asset to trigger webhook
      await webhookService.emitEvent({
        id: 'test-event-123',
        type: 'asset.created',
        organizationId: testOrg.id,
        timestamp: new Date(),
        data: {
          assetId: 'asset-123',
          name: 'Test Asset',
        },
      });

      expect(mockAddWebhookJob).toHaveBeenCalledWith({
        webhookId: testWebhookId,
        event: expect.objectContaining({
          type: 'asset.created',
          organizationId: testOrg.id,
        }),
      });
    });

    it('should not emit webhook for unsubscribed events', async () => {
      const mockAddWebhookJob = jest.requireMock('../../lib/queue').addWebhookJob;
      mockAddWebhookJob.mockClear();

      // Emit an event that the webhook is not subscribed to
      await webhookService.emitEvent({
        id: 'test-event-456',
        type: 'user.invited',
        organizationId: testOrg.id,
        timestamp: new Date(),
        data: {
          userId: 'user-123',
          email: 'invited@example.com',
        },
      });

      expect(mockAddWebhookJob).not.toHaveBeenCalled();
    });
  });
});
