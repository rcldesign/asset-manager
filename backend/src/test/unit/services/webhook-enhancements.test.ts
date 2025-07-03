import { webhookService } from '../../../services/webhook.service';
import { prisma } from '../../../lib/prisma';
import type { WebhookEventPayloadMap } from '../../../types/webhook-payloads';

jest.mock('../../../lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    webhookSubscription: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/queue', () => ({
  addWebhookJob: jest.fn(),
}));

describe('Webhook Enhancements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEnhancedEvent', () => {
    it('should create an enhanced webhook event with full context', async () => {
      // Mock organization and user data
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        fullName: 'Test User',
        role: 'MANAGER',
      });

      const payload: WebhookEventPayloadMap['asset.created'] = {
        asset: {
          id: 'asset-123',
          name: 'Test Asset',
          category: 'EQUIPMENT',
          status: 'OPERATIONAL',
        },
      };

      const event = await webhookService.createEnhancedEvent(
        'asset.created',
        'org-123',
        'user-123',
        payload,
      );

      expect(event).toMatchObject({
        type: 'asset.created',
        organizationId: 'org-123',
        organization: {
          id: 'org-123',
          name: 'Test Organization',
        },
        triggeredBy: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'MANAGER',
        },
        data: payload,
        metadata: {
          version: '2.0',
          source: 'asset-manager-backend',
        },
      });

      expect(event.id).toMatch(/^asset\.created-\d+-[a-f0-9]+$/);
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should throw error if organization not found', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MANAGER',
      });

      await expect(
        webhookService.createEnhancedEvent('asset.created', 'org-123', 'user-123', {
          asset: {
            id: 'asset-123',
            name: 'Test Asset',
            category: 'EQUIPMENT',
            status: 'OPERATIONAL',
          },
        }),
      ).rejects.toThrow('Organization or user not found for webhook event');
    });

    it('should throw error if user not found', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
      });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        webhookService.createEnhancedEvent('asset.created', 'org-123', 'user-123', {
          asset: {
            id: 'asset-123',
            name: 'Test Asset',
            category: 'EQUIPMENT',
            status: 'OPERATIONAL',
          },
        }),
      ).rejects.toThrow('Organization or user not found for webhook event');
    });
  });

  describe('Event Type Coverage', () => {
    const newEventTypes = [
      'audit.created',
      'report.generated',
      'report.scheduled',
      'backup.created',
      'backup.restored',
      'sync.completed',
      'gdpr.export_requested',
      'gdpr.deletion_requested',
    ];

    it.each(newEventTypes)('should support %s event type', async (eventType) => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MANAGER',
      });

      const event = await webhookService.createEnhancedEvent(
        eventType as any,
        'org-123',
        'user-123',
        {} as any,
      );

      expect(event.type).toBe(eventType);
    });
  });

  describe('Payload Structure', () => {
    beforeEach(() => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MANAGER',
      });
    });

    it('should create proper audit.created payload', async () => {
      const payload: WebhookEventPayloadMap['audit.created'] = {
        audit: {
          id: 'audit-123',
          model: 'Asset',
          recordId: 'asset-123',
          action: 'UPDATE',
          userId: 'user-123',
          timestamp: new Date(),
        },
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'MANAGER',
        },
        changes: {
          oldValue: { status: 'OPERATIONAL' },
          newValue: { status: 'MAINTENANCE' },
        },
        affectedEntity: {
          type: 'Asset',
          id: 'asset-123',
          name: 'Test Asset',
        },
      };

      const event = await webhookService.createEnhancedEvent(
        'audit.created',
        'org-123',
        'user-123',
        payload,
      );

      expect(event.data).toEqual(payload);
    });

    it('should create proper sync.completed payload', async () => {
      const payload: WebhookEventPayloadMap['sync.completed'] = {
        sync: {
          id: 'sync-123',
          deviceId: 'device-123',
          deviceName: 'Test Device',
          syncToken: 'token-123',
          startedAt: new Date(),
          completedAt: new Date(),
        },
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'VIEWER',
        },
        summary: {
          uploaded: 10,
          downloaded: 5,
          conflicts: 2,
          conflictResolution: 'CLIENT_WINS',
        },
      };

      const event = await webhookService.createEnhancedEvent(
        'sync.completed',
        'org-123',
        'user-123',
        payload,
      );

      expect(event.data).toEqual(payload);
    });

    it('should create proper gdpr.export_requested payload', async () => {
      const payload: WebhookEventPayloadMap['gdpr.export_requested'] = {
        request: {
          id: 'request-123',
          userId: 'user-123',
          requestedAt: new Date(),
          status: 'completed',
        },
        requestedBy: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'VIEWER',
        },
        dataCategories: ['profile', 'tasks', 'comments', 'attachments'],
      };

      const event = await webhookService.createEnhancedEvent(
        'gdpr.export_requested',
        'org-123',
        'user-123',
        payload,
      );

      expect(event.data).toEqual(payload);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle legacy webhook events', async () => {
      const legacyEvent = {
        id: 'legacy-event-123',
        type: 'asset.created' as const,
        organizationId: 'org-123',
        timestamp: new Date(),
        data: {
          assetId: 'asset-123',
          name: 'Test Asset',
        },
        metadata: {
          source: 'legacy-service',
        },
      };

      (prisma.webhookSubscription.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'webhook-123',
          organizationId: 'org-123',
          url: 'https://example.com/webhook',
          events: ['asset.created'],
          isActive: true,
        },
      ]);

      await webhookService.emitEvent(legacyEvent);

      expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          isActive: true,
          events: { has: 'asset.created' },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle enhanced webhook events', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        id: 'org-123',
        name: 'Test Organization',
      });

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'MANAGER',
      });

      (prisma.webhookSubscription.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'webhook-123',
          organizationId: 'org-123',
          url: 'https://example.com/webhook',
          events: ['asset.created'],
          isActive: true,
        },
      ]);

      const enhancedEvent = await webhookService.createEnhancedEvent(
        'asset.created',
        'org-123',
        'user-123',
        {
          asset: {
            id: 'asset-123',
            name: 'Test Asset',
            category: 'EQUIPMENT',
            status: 'OPERATIONAL',
          },
        },
      );

      await webhookService.emitEvent(enhancedEvent);

      expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          isActive: true,
          events: { has: 'asset.created' },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
