import { WebhookService } from '../../../services/webhook.service';
import { prismaMock } from '../../prisma-singleton';
import axios from 'axios';
import * as queue from '../../../lib/queue';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('../../../lib/queue', () => ({
  ...jest.requireActual('../../../lib/queue'),
  addWebhookJob: jest.fn(),
}));

describe('WebhookService', () => {
  let webhookService: WebhookService;
  const mockOrganizationId = 'org-123';
  const mockWebhookId = 'webhook-123';
  const mockUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    webhookService = WebhookService.getInstance();
  });

  describe('createWebhook', () => {
    it('should create a webhook successfully', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['asset.created', 'task.completed'],
        isActive: true,
        headers: {},
        retryPolicy: {
          maxRetries: 3,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.webhookSubscription.create.mockResolvedValue(mockWebhook);

      const result = await webhookService.createWebhook(
        mockOrganizationId,
        'Test Webhook',
        'https://example.com/webhook',
        ['asset.created', 'task.completed'],
        {
          secret: 'test-secret',
        },
      );

      expect(result).toEqual(mockWebhook);
      expect(prismaMock.webhookSubscription.create).toHaveBeenCalledWith({
        data: {
          organizationId: mockOrganizationId,
          name: 'Test Webhook',
          url: 'https://example.com/webhook',
          secret: 'test-secret',
          events: ['asset.created', 'task.completed'],
          headers: {},
          retryPolicy: {
            maxRetries: 3,
            retryDelayMs: 1000,
            backoffMultiplier: 2,
          },
          isActive: true,
        },
      });
    });

    it('should generate a secret if not provided', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: expect.any(String),
        events: ['asset.created'],
        isActive: true,
        headers: {},
        retryPolicy: {
          maxRetries: 3,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.webhookSubscription.create.mockResolvedValue(mockWebhook);

      await webhookService.createWebhook(
        mockOrganizationId,
        'Test Webhook',
        'https://example.com/webhook',
        ['asset.created'],
      );

      expect(prismaMock.webhookSubscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          secret: expect.any(String),
        }),
      });
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook successfully', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['asset.created', 'task.completed'],
        isActive: false,
        headers: {},
        retryPolicy: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.webhookSubscription.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.webhookSubscription.findUnique.mockResolvedValue(mockWebhook);

      const result = await webhookService.updateWebhook(mockWebhookId, mockOrganizationId, {
        isActive: false,
      });

      expect(result).toEqual(mockWebhook);
      expect(prismaMock.webhookSubscription.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockWebhookId,
          organizationId: mockOrganizationId,
        },
        data: {
          isActive: false,
        },
      });
    });

    it('should return null if webhook not found', async () => {
      prismaMock.webhookSubscription.updateMany.mockResolvedValue({ count: 0 });

      const result = await webhookService.updateWebhook(mockWebhookId, mockOrganizationId, {
        isActive: false,
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteWebhook', () => {
    it('should delete webhook successfully', async () => {
      prismaMock.webhookSubscription.deleteMany.mockResolvedValue({ count: 1 });

      const result = await webhookService.deleteWebhook(mockWebhookId, mockOrganizationId);

      expect(result).toBe(true);
      expect(prismaMock.webhookSubscription.deleteMany).toHaveBeenCalledWith({
        where: {
          id: mockWebhookId,
          organizationId: mockOrganizationId,
        },
      });
    });

    it('should return false if webhook not found', async () => {
      prismaMock.webhookSubscription.deleteMany.mockResolvedValue({ count: 0 });

      const result = await webhookService.deleteWebhook(mockWebhookId, mockOrganizationId);

      expect(result).toBe(false);
    });
  });

  describe('emitEvent', () => {
    it('should queue webhook jobs for active webhooks', async () => {
      const mockWebhooks = [
        {
          id: 'webhook-1',
          organizationId: mockOrganizationId,
          name: 'Webhook 1',
          url: 'https://example1.com/webhook',
          secret: 'secret1',
          events: ['asset.created'],
          isActive: true,
          headers: {},
          retryPolicy: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'webhook-2',
          organizationId: mockOrganizationId,
          name: 'Webhook 2',
          url: 'https://example2.com/webhook',
          secret: 'secret2',
          events: ['asset.created'],
          isActive: true,
          headers: {},
          retryPolicy: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prismaMock.webhookSubscription.findMany.mockResolvedValue(mockWebhooks);

      const event = {
        id: 'event-123',
        type: 'asset.created' as const,
        organizationId: mockOrganizationId,
        timestamp: new Date(),
        data: {
          assetId: 'asset-123',
          name: 'Test Asset',
        },
        userId: mockUserId,
      };

      await webhookService.emitEvent(event);

      expect(prismaMock.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          isActive: true,
          events: {
            has: 'asset.created',
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(queue.addWebhookJob).toHaveBeenCalledTimes(2);
      expect(queue.addWebhookJob).toHaveBeenCalledWith({
        webhookId: 'webhook-1',
        event,
      });
      expect(queue.addWebhookJob).toHaveBeenCalledWith({
        webhookId: 'webhook-2',
        event,
      });
    });

    it('should not fail if no webhooks are found', async () => {
      prismaMock.webhookSubscription.findMany.mockResolvedValue([]);

      const event = {
        id: 'event-123',
        type: 'asset.created' as const,
        organizationId: mockOrganizationId,
        timestamp: new Date(),
        data: {
          assetId: 'asset-123',
          name: 'Test Asset',
        },
      };

      await expect(webhookService.emitEvent(event)).resolves.not.toThrow();
      expect(queue.addWebhookJob).not.toHaveBeenCalled();
    });
  });

  describe('deliverWebhook', () => {
    const mockEvent = {
      id: 'event-123',
      type: 'asset.created' as const,
      organizationId: mockOrganizationId,
      timestamp: new Date(),
      data: {
        assetId: 'asset-123',
        name: 'Test Asset',
      },
      userId: mockUserId,
    };

    it('should deliver webhook successfully', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['asset.created'],
        isActive: true,
        headers: { 'X-Custom-Header': 'value' },
        retryPolicy: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDelivery = {
        id: 'delivery-123',
        webhookId: mockWebhookId,
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        url: mockWebhook.url,
        status: 'pending',
        attemptCount: 0,
        createdAt: new Date(),
      };

      prismaMock.webhookSubscription.findUnique.mockResolvedValue(mockWebhook);
      prismaMock.webhookDelivery.create.mockResolvedValue(mockDelivery as any);
      prismaMock.webhookDelivery.update.mockResolvedValue({
        ...mockDelivery,
        status: 'success',
        statusCode: 200,
        attemptCount: 1,
        lastAttemptAt: new Date(),
      } as any);

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { received: true },
      });

      const result = await webhookService.deliverWebhook(mockWebhookId, mockEvent);

      expect(result).toMatchObject({
        status: 'success',
        statusCode: 200,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockWebhook.url,
        {
          id: mockEvent.id,
          type: mockEvent.type,
          timestamp: mockEvent.timestamp.toISOString(),
          data: mockEvent.data,
          metadata: {},
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'value',
            'X-Webhook-Event': mockEvent.type,
            'X-Webhook-Event-Id': mockEvent.id,
            'X-Webhook-Signature': expect.stringMatching(/^sha256=[a-f0-9]+$/),
          }),
        }),
      );
    });

    it('should handle delivery failure', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['asset.created'],
        isActive: true,
        headers: {},
        retryPolicy: {
          maxRetries: 3,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDelivery = {
        id: 'delivery-123',
        webhookId: mockWebhookId,
        eventId: mockEvent.id,
        eventType: mockEvent.type,
        url: mockWebhook.url,
        status: 'pending',
        attemptCount: 0,
        createdAt: new Date(),
      };

      prismaMock.webhookSubscription.findUnique.mockResolvedValue(mockWebhook);
      prismaMock.webhookDelivery.create.mockResolvedValue(mockDelivery as any);
      prismaMock.webhookDelivery.update.mockResolvedValue({
        ...mockDelivery,
        status: 'failed',
        error: 'Network error',
        attemptCount: 1,
        lastAttemptAt: new Date(),
        nextRetryAt: new Date(Date.now() + 1000),
      } as any);

      mockedAxios.post.mockRejectedValue(new Error('Network error'));

      await expect(webhookService.deliverWebhook(mockWebhookId, mockEvent)).rejects.toThrow(
        'Network error',
      );

      expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: mockDelivery.id },
        data: expect.objectContaining({
          status: 'failed',
          error: 'Network error',
          attemptCount: 1,
          lastAttemptAt: expect.any(Date),
          nextRetryAt: expect.any(Date),
        }),
      });
    });

    it('should throw error if webhook is inactive', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['asset.created'],
        isActive: false,
        headers: {},
        retryPolicy: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.webhookSubscription.findUnique.mockResolvedValue(mockWebhook);

      await expect(webhookService.deliverWebhook(mockWebhookId, mockEvent)).rejects.toThrow(
        'Webhook not found or inactive',
      );
    });
  });

  describe('testWebhook', () => {
    it('should deliver test webhook', async () => {
      const mockWebhook = {
        id: mockWebhookId,
        organizationId: mockOrganizationId,
        name: 'Test Webhook',
        url: 'https://example.com/webhook',
        secret: 'test-secret',
        events: ['asset.created'],
        isActive: true,
        headers: {},
        retryPolicy: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockDelivery = {
        id: 'delivery-test',
        webhookId: mockWebhookId,
        eventId: expect.stringMatching(/^test-/),
        eventType: 'asset.created',
        url: mockWebhook.url,
        status: 'success',
        statusCode: 200,
        attemptCount: 1,
        createdAt: new Date(),
      };

      prismaMock.webhookSubscription.findFirst.mockResolvedValue(mockWebhook);
      prismaMock.webhookSubscription.findUnique.mockResolvedValue(mockWebhook);
      prismaMock.webhookDelivery.create.mockResolvedValue(mockDelivery as any);
      prismaMock.webhookDelivery.update.mockResolvedValue(mockDelivery as any);

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { test: true },
      });

      const result = await webhookService.testWebhook(mockWebhookId, mockOrganizationId);

      expect(result).toMatchObject({
        status: 'success',
        statusCode: 200,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        mockWebhook.url,
        expect.objectContaining({
          id: expect.stringMatching(/^test-/),
          type: 'asset.created',
          data: {
            test: true,
            message: 'This is a test webhook delivery',
            webhookId: mockWebhookId,
          },
        }),
        expect.any(Object),
      );
    });

    it('should throw error if webhook not found', async () => {
      prismaMock.webhookSubscription.findFirst.mockResolvedValue(null);

      await expect(webhookService.testWebhook(mockWebhookId, mockOrganizationId)).rejects.toThrow(
        'Webhook not found',
      );
    });
  });
});
