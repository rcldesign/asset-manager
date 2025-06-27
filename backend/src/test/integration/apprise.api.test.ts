import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateAuthToken } from '../helpers';
import { AppriseService } from '../../services/apprise.service';
import type { User, Organization } from '@prisma/client';
import nock from 'nock';

// Mock environment variables for Apprise
const originalEnv = process.env;
const mockAppriseURL = 'http://localhost:8000';

beforeAll(() => {
  process.env.APPRISE_API_URL = mockAppriseURL;
  process.env.APPRISE_API_KEY = 'test-api-key';
  process.env.APPRISE_NOTIFICATION_URL = 'discord://webhook_id/webhook_token';
});

afterAll(() => {
  process.env = originalEnv;
});

describe('Apprise API Integration Tests', () => {
  let authToken: string;
  let testUser: User;
  let testOrg: Organization;
  let appriseService: AppriseService;

  beforeAll(async () => {
    // Create test organization and user
    testOrg = await prisma.organization.create({
      data: {
        name: 'Test Apprise Org',
        slug: 'test-apprise-org',
      },
    });

    testUser = await prisma.user.create({
      data: {
        email: 'apprise.test@example.com',
        name: 'Apprise Test User',
        organizationId: testOrg.id,
        role: 'ADMIN',
      },
    });

    authToken = await generateAuthToken(testUser);
    appriseService = AppriseService.getInstance();
  });

  afterAll(async () => {
    // Clean up
    await prisma.user.deleteMany({ where: { organizationId: testOrg.id } });
    await prisma.organization.delete({ where: { id: testOrg.id } });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('GET /api/apprise/status', () => {
    it('should return Apprise configuration status', async () => {
      const response = await request(app)
        .get('/api/apprise/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        isConfigured: true,
        isEnabled: true,
        services: expect.arrayContaining(['discord']),
      });
    });

    it('should require authentication', async () => {
      await request(app).get('/api/apprise/status').expect(401);
    });

    it('should require admin permissions', async () => {
      // Create a regular user
      const regularUser = await prisma.user.create({
        data: {
          email: 'regular.apprise@example.com',
          name: 'Regular User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const regularToken = await generateAuthToken(regularUser);

      await request(app)
        .get('/api/apprise/status')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      // Clean up
      await prisma.user.delete({ where: { id: regularUser.id } });
    });
  });

  describe('POST /api/apprise/test', () => {
    it('should send test notification successfully', async () => {
      // Mock Apprise API response
      const scope = nock(mockAppriseURL).post('/notify/test-api-key').reply(200, {
        success: true,
        status: 'OK',
      });

      const response = await request(app)
        .post('/api/apprise/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Test notification sent successfully',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should handle Apprise API failure', async () => {
      // Mock Apprise API to return error
      const scope = nock(mockAppriseURL).post('/notify/test-api-key').reply(400, {
        success: false,
        error: 'Invalid notification URL',
      });

      const response = await request(app)
        .post('/api/apprise/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('Failed to send test notification'),
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should handle network errors', async () => {
      // Mock network error
      const scope = nock(mockAppriseURL)
        .post('/notify/test-api-key')
        .replyWithError('Network error');

      const response = await request(app)
        .post('/api/apprise/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('Failed to send test notification'),
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app).post('/api/apprise/test').expect(401);
    });

    it('should require admin permissions', async () => {
      // Create a regular user
      const regularUser = await prisma.user.create({
        data: {
          email: 'regular.apprise.test@example.com',
          name: 'Regular Test User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const regularToken = await generateAuthToken(regularUser);

      await request(app)
        .post('/api/apprise/test')
        .set('Authorization', `Bearer ${regularToken}`)
        .expect(403);

      // Clean up
      await prisma.user.delete({ where: { id: regularUser.id } });
    });
  });

  describe('POST /api/apprise/alert', () => {
    const validAlertData = {
      title: 'Test Alert',
      body: 'This is a test alert message',
      type: 'info' as const,
    };

    it('should send alert notification successfully', async () => {
      // Mock Apprise API response
      const scope = nock(mockAppriseURL).post('/notify/test-api-key').reply(200, {
        success: true,
        status: 'OK',
      });

      const response = await request(app)
        .post('/api/apprise/alert')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAlertData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Alert notification sent successfully',
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/apprise/alert')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate alert type', async () => {
      const response = await request(app)
        .post('/api/apprise/alert')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...validAlertData,
          type: 'invalid-type',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should handle Apprise API failure', async () => {
      // Mock Apprise API to return error
      const scope = nock(mockAppriseURL).post('/notify/test-api-key').reply(500, {
        success: false,
        error: 'Server error',
      });

      const response = await request(app)
        .post('/api/apprise/alert')
        .set('Authorization', `Bearer ${authToken}`)
        .send(validAlertData)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        message: expect.stringContaining('Failed to send alert'),
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app).post('/api/apprise/alert').send(validAlertData).expect(401);
    });

    it('should require admin permissions', async () => {
      // Create a regular user
      const regularUser = await prisma.user.create({
        data: {
          email: 'regular.alert@example.com',
          name: 'Regular Alert User',
          organizationId: testOrg.id,
          role: 'USER',
        },
      });

      const regularToken = await generateAuthToken(regularUser);

      await request(app)
        .post('/api/apprise/alert')
        .set('Authorization', `Bearer ${regularToken}`)
        .send(validAlertData)
        .expect(403);

      // Clean up
      await prisma.user.delete({ where: { id: regularUser.id } });
    });
  });

  describe('Apprise Service Integration', () => {
    it('should handle notification types correctly', async () => {
      const notifications = [
        {
          title: 'Info Notification',
          body: 'Information message',
          type: 'info' as const,
        },
        {
          title: 'Success Notification',
          body: 'Success message',
          type: 'success' as const,
        },
        {
          title: 'Warning Notification',
          body: 'Warning message',
          type: 'warning' as const,
        },
        {
          title: 'Error Notification',
          body: 'Error message',
          type: 'failure' as const,
        },
      ];

      for (const notification of notifications) {
        const scope = nock(mockAppriseURL)
          .post('/notify/test-api-key')
          .reply(200, { success: true });

        const result = await appriseService.sendNotification(notification);
        expect(result).toBe(true);
        expect(scope.isDone()).toBe(true);
      }
    });

    it('should handle URL attachments', async () => {
      const scope = nock(mockAppriseURL).post('/notify/test-api-key').reply(200, { success: true });

      const notification = {
        title: 'Notification with Attachment',
        body: 'Message with URL',
        type: 'info' as const,
        attachments: ['https://example.com/image.png'],
      };

      const result = await appriseService.sendNotification(notification);
      expect(result).toBe(true);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle timeout errors', async () => {
      const scope = nock(mockAppriseURL)
        .post('/notify/test-api-key')
        .delayConnection(31000) // Longer than timeout
        .reply(200, { success: true });

      const notification = {
        title: 'Timeout Test',
        body: 'This should timeout',
        type: 'info' as const,
      };

      const result = await appriseService.sendNotification(notification);
      expect(result).toBe(false);
    });

    it('should handle service configuration correctly', async () => {
      expect(appriseService.isConfigured()).toBe(true);

      const services = appriseService.getConfiguredServices();
      expect(services).toContain('discord');
      expect(services).toHaveLength(1);
    });
  });

  describe('Environment Configuration Tests', () => {
    let originalAppriseService: AppriseService;

    beforeEach(() => {
      // Store original service instance
      originalAppriseService = AppriseService.getInstance();
      // Reset singleton for testing
      (AppriseService as any).instance = undefined;
    });

    afterEach(() => {
      // Restore original service
      (AppriseService as any).instance = originalAppriseService;
    });

    it('should handle missing API URL', async () => {
      // Temporarily remove API URL
      const originalUrl = process.env.APPRISE_API_URL;
      delete process.env.APPRISE_API_URL;

      const service = AppriseService.getInstance();
      expect(service.isConfigured()).toBe(false);

      // Restore
      process.env.APPRISE_API_URL = originalUrl;
    });

    it('should handle missing notification URL', async () => {
      // Temporarily remove notification URL
      const originalNotificationUrl = process.env.APPRISE_NOTIFICATION_URL;
      delete process.env.APPRISE_NOTIFICATION_URL;

      const service = AppriseService.getInstance();
      expect(service.isConfigured()).toBe(false);

      // Restore
      process.env.APPRISE_NOTIFICATION_URL = originalNotificationUrl;
    });

    it('should work without API key', async () => {
      // Temporarily remove API key
      const originalApiKey = process.env.APPRISE_API_KEY;
      delete process.env.APPRISE_API_KEY;

      const service = AppriseService.getInstance();
      expect(service.isConfigured()).toBe(true); // Should still be configured

      // Mock request without API key in URL
      const scope = nock(mockAppriseURL).post('/notify').reply(200, { success: true });

      const result = await service.sendNotification({
        title: 'Test',
        body: 'Test message',
        type: 'info',
      });

      expect(result).toBe(true);
      expect(scope.isDone()).toBe(true);

      // Restore
      process.env.APPRISE_API_KEY = originalApiKey;
    });
  });
});
