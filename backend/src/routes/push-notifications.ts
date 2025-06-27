import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { pushNotificationService } from '../services/push-notification.service';
import { authenticateJWT, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';

const router = Router();

// All push notification routes require authentication
router.use(authenticateJWT);

// Validation schemas
const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

const testNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  url: z.string().url().optional(),
});

/**
 * @swagger
 * /api/push/vapid-public-key:
 *   get:
 *     summary: Get VAPID public key
 *     description: Retrieve the VAPID public key for push notification subscription
 *     tags: [Push Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: VAPID public key retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 publicKey:
 *                   type: string
 *       503:
 *         description: Push notifications not configured
 */
router.get('/vapid-public-key', (_req, res: Response) => {
  const publicKey = pushNotificationService.getPublicKey();

  if (!publicKey) {
    res.status(503).json({
      error: 'Push notifications not configured',
      message: 'VAPID keys are not set up on this server',
    });
    return;
  }

  res.json({ publicKey });
});

/**
 * @swagger
 * /api/push/subscribe:
 *   post:
 *     summary: Subscribe to push notifications
 *     description: Register a push subscription for the authenticated user
 *     tags: [Push Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endpoint:
 *                 type: string
 *                 format: uri
 *               keys:
 *                 type: object
 *                 properties:
 *                   p256dh:
 *                     type: string
 *                   auth:
 *                     type: string
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *       400:
 *         description: Invalid subscription data
 */
router.post(
  '/subscribe',
  validateRequest({ body: subscriptionSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    const { user } = authenticatedReq;
    const subscription = authenticatedReq.body as z.infer<typeof subscriptionSchema>;

    try {
      // Upsert subscription (update if exists, create if not)
      const pushSubscription = await prisma.pushSubscription.upsert({
        where: { endpoint: subscription.endpoint },
        update: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userId: user.id,
          updatedAt: new Date(),
        },
        create: {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          userId: user.id,
        },
      });

      logger.info('Push subscription created/updated', {
        userId: user.id,
        subscriptionId: pushSubscription.id,
        endpoint: subscription.endpoint.substring(0, 50) + '...',
      });

      res.status(201).json({
        message: 'Subscription created successfully',
        subscriptionId: pushSubscription.id,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/push/unsubscribe:
 *   post:
 *     summary: Unsubscribe from push notifications
 *     description: Remove a push subscription
 *     tags: [Push Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               endpoint:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Unsubscribed successfully
 *       404:
 *         description: Subscription not found
 */
router.post(
  '/unsubscribe',
  validateRequest({ body: z.object({ endpoint: z.string().url() }) }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    const { user } = authenticatedReq;
    const { endpoint } = authenticatedReq.body as { endpoint: string };

    try {
      const result = await prisma.pushSubscription.deleteMany({
        where: {
          endpoint,
          userId: user.id, // Ensure users can only delete their own subscriptions
        },
      });

      if (result.count === 0) {
        res.status(404).json({ error: 'Subscription not found' });
        return;
      }

      logger.info('Push subscription removed', {
        userId: user.id,
        endpoint: endpoint.substring(0, 50) + '...',
      });

      res.json({ message: 'Unsubscribed successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/push/subscriptions:
 *   get:
 *     summary: List push subscriptions
 *     description: Get all push subscriptions for the authenticated user
 *     tags: [Push Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscriptions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       endpoint:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
router.get('/subscriptions', async (req, res: Response, next: NextFunction) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { user } = authenticatedReq;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        endpoint: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Truncate endpoints for security
    const safeSubscriptions = subscriptions.map((sub) => ({
      ...sub,
      endpoint: sub.endpoint.substring(0, 50) + '...',
    }));

    res.json({
      subscriptions: safeSubscriptions,
      count: subscriptions.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/push/test:
 *   post:
 *     summary: Send test notification
 *     description: Send a test push notification to all user's subscriptions
 *     tags: [Push Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Test notification sent
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: No subscriptions found
 */
router.post(
  '/test',
  validateRequest({ body: testNotificationSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    const { user } = authenticatedReq;
    const { title, body, url } = authenticatedReq.body as z.infer<typeof testNotificationSchema>;

    try {
      if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Test notifications disabled in production' });
        return;
      }

      // Check if user has any subscriptions
      const subscriptionCount = await prisma.pushSubscription.count({
        where: { userId: user.id },
      });

      if (subscriptionCount === 0) {
        res.status(404).json({
          error: 'No push subscriptions found',
          message: 'Please enable push notifications first',
        });
        return;
      }

      // Queue test notification
      const { addPushNotificationJob } = await import('../lib/queue');

      await addPushNotificationJob({
        userId: user.id,
        payload: {
          title,
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/badge-72x72.png',
          data: url ? { url } : undefined,
        },
      });

      logger.info('Test push notification queued', {
        userId: user.id,
        title,
      });

      res.json({
        message: 'Test notification queued',
        subscriptionCount,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
