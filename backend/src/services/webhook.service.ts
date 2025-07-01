import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { addWebhookJob } from '../lib/queue';
import type { Prisma, Organization, User } from '@prisma/client';
import type { 
  WebhookEventPayloadMap, 
  EnhancedWebhookEvent,
  WebhookUser,
  WebhookOrganization 
} from '../types/webhook-payloads';

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  organizationId: string;
  timestamp: Date;
  data: Record<string, any>;
  userId?: string;
  metadata?: Record<string, any>;
}

export type WebhookEventType =
  | 'asset.created'
  | 'asset.updated'
  | 'asset.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.completed'
  | 'task.deleted'
  | 'task.assigned'
  | 'task.overdue'
  | 'schedule.created'
  | 'schedule.updated'
  | 'schedule.deleted'
  | 'user.invited'
  | 'user.joined'
  | 'user.deactivated'
  | 'maintenance.started'
  | 'maintenance.completed'
  | 'warranty.expiring'
  | 'warranty.expired'
  | 'audit.created'
  | 'report.generated'
  | 'report.scheduled'
  | 'backup.created'
  | 'backup.restored'
  | 'sync.completed'
  | 'gdpr.export_requested'
  | 'gdpr.deletion_requested';

export interface WebhookConfig {
  id: string;
  organizationId: string;
  name: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  isActive: boolean;
  headers?: Record<string, string>;
  retryPolicy?: {
    maxRetries: number;
    retryDelayMs: number;
    backoffMultiplier: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: WebhookEventType;
  url: string;
  status: 'pending' | 'success' | 'failed';
  statusCode?: number;
  responseBody?: string;
  error?: string;
  attemptCount: number;
  lastAttemptAt?: Date;
  nextRetryAt?: Date;
  createdAt: Date;
}

export class WebhookService {
  private static instance: WebhookService;

  private constructor() {}

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  /**
   * Create a new webhook configuration
   */
  public async createWebhook(
    organizationId: string,
    name: string,
    url: string,
    events: WebhookEventType[],
    options?: {
      secret?: string;
      headers?: Record<string, string>;
      retryPolicy?: WebhookConfig['retryPolicy'];
    },
  ): Promise<WebhookConfig> {
    const webhook = await prisma.webhookSubscription.create({
      data: {
        organizationId,
        name,
        url,
        secret: options?.secret || crypto.randomBytes(32).toString('hex'),
        events,
        headers: options?.headers || {},
        retryPolicy: options?.retryPolicy || {
          maxRetries: 3,
          retryDelayMs: 1000,
          backoffMultiplier: 2,
        },
        isActive: true,
      },
    });

    logger.info('Webhook created', {
      webhookId: webhook.id,
      organizationId,
      url,
      events,
    });

    return webhook as WebhookConfig;
  }

  /**
   * Update webhook configuration
   */
  public async updateWebhook(
    webhookId: string,
    organizationId: string,
    updates: Partial<{
      url: string;
      events: WebhookEventType[];
      secret: string;
      headers: Record<string, string>;
      isActive: boolean;
      retryPolicy: WebhookConfig['retryPolicy'];
    }>,
  ): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhookSubscription.updateMany({
      where: {
        id: webhookId,
        organizationId,
      },
      data: updates as Prisma.WebhookSubscriptionUpdateManyMutationInput,
    });

    if (webhook.count === 0) {
      return null;
    }

    const updated = await prisma.webhookSubscription.findUnique({
      where: { id: webhookId },
    });

    logger.info('Webhook updated', {
      webhookId,
      updates: Object.keys(updates),
    });

    return updated as WebhookConfig;
  }

  /**
   * Delete webhook configuration
   */
  public async deleteWebhook(webhookId: string, organizationId: string): Promise<boolean> {
    const result = await prisma.webhookSubscription.deleteMany({
      where: {
        id: webhookId,
        organizationId,
      },
    });

    if (result.count > 0) {
      logger.info('Webhook deleted', { webhookId, organizationId });
      return true;
    }

    return false;
  }

  /**
   * Get webhook configurations for an organization
   */
  public async getWebhooks(
    organizationId: string,
    options?: {
      isActive?: boolean;
      eventType?: WebhookEventType;
    },
  ): Promise<WebhookConfig[]> {
    const where: Prisma.WebhookSubscriptionWhereInput = {
      organizationId,
    };

    if (options?.isActive !== undefined) {
      where.isActive = options.isActive;
    }

    if (options?.eventType) {
      where.events = {
        has: options.eventType,
      };
    }

    const webhooks = await prisma.webhookSubscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return webhooks as WebhookConfig[];
  }

  /**
   * Get a specific webhook
   */
  public async getWebhook(
    webhookId: string,
    organizationId: string,
  ): Promise<WebhookConfig | null> {
    const webhook = await prisma.webhookSubscription.findFirst({
      where: {
        id: webhookId,
        organizationId,
      },
    });

    return webhook as WebhookConfig | null;
  }

  /**
   * Create an enhanced webhook event with full context
   */
  public async createEnhancedEvent<T extends WebhookEventType>(
    type: T,
    organizationId: string,
    userId: string,
    payload: WebhookEventPayloadMap[T]
  ): Promise<EnhancedWebhookEvent<WebhookEventPayloadMap[T]>> {
    // Fetch organization and user details
    const [organization, user] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: organizationId },
        select: { id: true, name: true }
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true }
      })
    ]);

    if (!organization || !user) {
      throw new Error('Organization or user not found for webhook event');
    }

    const webhookUser: WebhookUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    const webhookOrg: WebhookOrganization = {
      id: organization.id,
      name: organization.name
    };

    return {
      id: `${type}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      type,
      organizationId,
      organization: webhookOrg,
      timestamp: new Date(),
      triggeredBy: webhookUser,
      data: payload,
      metadata: {
        version: '2.0', // Indicates enhanced payload format
        source: 'asset-manager-backend'
      }
    };
  }

  /**
   * Emit a webhook event (supports both legacy and enhanced formats)
   */
  public async emitEvent(event: WebhookEvent | EnhancedWebhookEvent): Promise<void> {
    try {
      // Find all active webhooks for this organization that subscribe to this event type
      const webhooks = await this.getWebhooks(event.organizationId, {
        isActive: true,
        eventType: event.type as WebhookEventType,
      });

      if (webhooks.length === 0) {
        logger.debug('No active webhooks for event', {
          eventType: event.type,
          organizationId: event.organizationId,
        });
        return;
      }

      // Queue webhook delivery jobs for each webhook
      for (const webhook of webhooks) {
        await addWebhookJob({
          webhookId: webhook.id,
          event: event as WebhookEvent, // Type assertion for compatibility
        });
      }

      logger.info('Webhook event emitted', {
        eventType: event.type,
        organizationId: event.organizationId,
        webhookCount: webhooks.length,
      });
    } catch (error) {
      logger.error(
        'Failed to emit webhook event',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          eventType: event.type,
          organizationId: event.organizationId,
        },
      );
      // Don't throw - webhook failures shouldn't break the main flow
    }
  }

  /**
   * Deliver a webhook (called by the webhook worker)
   */
  public async deliverWebhook(webhookId: string, event: WebhookEvent): Promise<WebhookDelivery> {
    const webhook = await prisma.webhookSubscription.findUnique({
      where: { id: webhookId },
    });

    if (!webhook || !webhook.isActive) {
      throw new Error('Webhook not found or inactive');
    }

    // Create delivery record
    const delivery = await prisma.webhookDelivery.create({
      data: {
        webhookId,
        eventId: event.id,
        eventType: event.type,
        url: webhook.url,
        status: 'pending',
        attemptCount: 0,
      },
    });

    try {
      // Prepare payload - check if it's an enhanced event
      const isEnhancedEvent = 'organization' in event && 'triggeredBy' in event;
      
      const payload = isEnhancedEvent ? {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp.toISOString(),
        organization: (event as EnhancedWebhookEvent).organization,
        triggeredBy: (event as EnhancedWebhookEvent).triggeredBy,
        data: event.data,
        metadata: event.metadata || {},
      } : {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp.toISOString(),
        data: event.data,
        metadata: event.metadata || {},
        // For backward compatibility, add organizationId if not enhanced
        organizationId: event.organizationId
      };

      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'DumbAssets-Webhook/1.0',
        'X-Webhook-Event': event.type,
        'X-Webhook-Event-Id': event.id,
        'X-Webhook-Timestamp': event.timestamp.toISOString(),
        ...((webhook.headers as Record<string, string>) || {}),
      };

      // Add signature if secret is configured
      if (webhook.secret) {
        const signature = this.generateSignature(JSON.stringify(payload), webhook.secret);
        headers['X-Webhook-Signature'] = signature;
      }

      // Make the request
      const response = await axios.post(webhook.url, payload, {
        headers,
        timeout: 30000, // 30 second timeout
        validateStatus: () => true, // Don't throw on any status
      });

      // Update delivery record
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: response.status >= 200 && response.status < 300 ? 'success' : 'failed',
          statusCode: response.status,
          responseBody:
            typeof response.data === 'string'
              ? response.data
              : JSON.stringify(response.data).substring(0, 1000), // Limit response storage
          attemptCount: 1,
          lastAttemptAt: new Date(),
        },
      });

      logger.info('Webhook delivered', {
        webhookId,
        eventType: event.type,
        status: response.status,
      });

      return {
        ...delivery,
        status: response.status >= 200 && response.status < 300 ? 'success' : 'failed',
        statusCode: response.status,
      } as WebhookDelivery;
    } catch (error) {
      // Update delivery record with error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          error: errorMessage,
          attemptCount: 1,
          lastAttemptAt: new Date(),
          // Calculate next retry time based on retry policy
          nextRetryAt: this.calculateNextRetryTime(
            1,
            webhook.retryPolicy as WebhookConfig['retryPolicy'],
          ),
        },
      });

      logger.error(
        'Webhook delivery failed',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          webhookId,
          eventType: event.type,
        },
      );

      throw error;
    }
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Calculate next retry time based on retry policy
   */
  private calculateNextRetryTime(
    attemptCount: number,
    retryPolicy?: WebhookConfig['retryPolicy'],
  ): Date | null {
    if (!retryPolicy || attemptCount >= retryPolicy.maxRetries) {
      return null;
    }

    const delayMs =
      retryPolicy.retryDelayMs * Math.pow(retryPolicy.backoffMultiplier, attemptCount - 1);

    return new Date(Date.now() + delayMs);
  }

  /**
   * Get webhook delivery history
   */
  public async getDeliveries(
    webhookId: string,
    organizationId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: 'pending' | 'success' | 'failed';
    },
  ): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    // Verify webhook belongs to organization
    const webhook = await this.getWebhook(webhookId, organizationId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const where: Prisma.WebhookDeliveryWhereInput = {
      webhookId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      prisma.webhookDelivery.count({ where }),
    ]);

    return {
      deliveries: deliveries as WebhookDelivery[],
      total,
    };
  }

  /**
   * Test webhook configuration
   */
  public async testWebhook(webhookId: string, organizationId: string): Promise<WebhookDelivery> {
    const webhook = await this.getWebhook(webhookId, organizationId);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    // Create a test event
    const testEvent: WebhookEvent = {
      id: `test-${Date.now()}`,
      type: 'asset.created', // Use a common event type for testing
      organizationId,
      timestamp: new Date(),
      data: {
        test: true,
        message: 'This is a test webhook delivery',
        webhookId,
      },
      metadata: {
        source: 'manual-test',
      },
    };

    // Deliver immediately without queueing
    return this.deliverWebhook(webhookId, testEvent);
  }
}

// Export singleton instance
export const webhookService = WebhookService.getInstance();
