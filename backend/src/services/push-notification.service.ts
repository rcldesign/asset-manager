import webpush from 'web-push';
import type { PushSubscription } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Service for managing web push notifications
 * Handles sending push notifications to subscribed browsers/devices
 */
export class PushNotificationService {
  private static instance: PushNotificationService;
  private initialized: boolean = false;

  private constructor() {
    this.initialize();
  }

  public static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize web-push with VAPID details
   */
  private initialize(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey) {
      logger.warn('VAPID keys not configured. Push notifications are disabled.');
      return;
    }

    try {
      webpush.setVapidDetails(subject || 'mailto:admin@dumbassets.com', publicKey, privateKey);
      this.initialized = true;
      logger.info('Push notification service initialized successfully');
    } catch (error) {
      logger.error(
        'Failed to initialize push notification service',
        error instanceof Error ? error : new Error('Unknown error'),
      );
    }
  }

  /**
   * Send a push notification to a subscription
   * @param subscription - Push subscription object
   * @param payload - Notification payload
   * @throws Error if sending fails
   */
  async sendNotification(
    subscription: Pick<PushSubscription, 'endpoint' | 'p256dh' | 'auth'>,
    payload: {
      title: string;
      body: string;
      icon?: string;
      badge?: string;
      data?: Record<string, any>;
      actions?: Array<{
        action: string;
        title: string;
        icon?: string;
      }>;
    },
  ): Promise<void> {
    if (!this.initialized) {
      logger.debug('Push notification service not initialized, skipping notification');
      return;
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
        TTL: 60 * 60 * 24, // 24 hours
        urgency: 'normal' as const,
      });

      logger.debug('Push notification sent successfully', {
        endpoint: subscription.endpoint.substring(0, 50) + '...',
      });
    } catch (error: any) {
      // Check for specific error codes
      if (error.statusCode === 410 || error.statusCode === 404) {
        // Subscription is invalid, should be removed
        logger.info('Push subscription is no longer valid', {
          endpoint: subscription.endpoint.substring(0, 50) + '...',
          statusCode: error.statusCode,
        });
        throw new InvalidSubscriptionError('Subscription is no longer valid', error.statusCode);
      }

      logger.error(
        'Failed to send push notification',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          statusCode: error.statusCode,
          body: error.body,
        },
      );

      throw error;
    }
  }

  /**
   * Get the VAPID public key for client-side subscription
   * @returns The public key or null if not configured
   */
  getPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /**
   * Check if push notifications are enabled
   * @returns True if the service is initialized
   */
  isEnabled(): boolean {
    return this.initialized;
  }
}

/**
 * Custom error for invalid push subscriptions
 */
export class InvalidSubscriptionError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = 'InvalidSubscriptionError';
  }
}

// Export singleton instance
export const pushNotificationService = PushNotificationService.getInstance();
