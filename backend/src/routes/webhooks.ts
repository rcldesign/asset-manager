import { Router, type Response, type NextFunction, type Request } from 'express';
import { z } from 'zod';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { webhookService, type WebhookEventType } from '../services/webhook.service';
import { logger } from '../utils/logger';

const router = Router();

// All webhook routes require authentication
router.use(authenticateJWT);

// Validation schemas
const createWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),
  retryPolicy: z
    .object({
      maxRetries: z.number().min(0).max(10).optional(),
      retryDelayMs: z.number().min(100).max(60000).optional(),
      backoffMultiplier: z.number().min(1).max(4).optional(),
    })
    .optional(),
});

const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  secret: z.string().optional(),
  headers: z.record(z.string()).optional(),
  isActive: z.boolean().optional(),
  retryPolicy: z
    .object({
      maxRetries: z.number().min(0).max(10).optional(),
      retryDelayMs: z.number().min(100).max(60000).optional(),
      backoffMultiplier: z.number().min(1).max(4).optional(),
    })
    .optional(),
});

/**
 * @swagger
 * /api/webhooks:
 *   get:
 *     summary: List organization webhooks
 *     description: Get all webhook configurations for the organization
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: eventType
 *         schema:
 *           type: string
 *         description: Filter by event type
 *     responses:
 *       200:
 *         description: List of webhooks
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Webhook'
 */
router.get(
  '/',
  requirePermission('manage', 'organization'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { isActive, eventType } = req.query;

      const webhooks = await webhookService.getWebhooks(authenticatedReq.user.organizationId, {
        isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        eventType: eventType as WebhookEventType,
      });

      res.json(webhooks);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/webhooks/{webhookId}:
 *   get:
 *     summary: Get webhook details
 *     description: Get a specific webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Webhook details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Webhook'
 *       404:
 *         description: Webhook not found
 */
router.get(
  '/:webhookId',
  requirePermission('manage', 'organization'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const webhook = await webhookService.getWebhook(
        req.params.webhookId!,
        authenticatedReq.user.organizationId,
      );

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      res.json(webhook);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/webhooks:
 *   post:
 *     summary: Create webhook
 *     description: Create a new webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - url
 *               - events
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               secret:
 *                 type: string
 *               headers:
 *                 type: object
 *               retryPolicy:
 *                 type: object
 *     responses:
 *       201:
 *         description: Webhook created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Webhook'
 */
router.post(
  '/',
  requirePermission('manage', 'organization'),
  validateRequest({ body: createWebhookSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { name, url, events, secret, headers, retryPolicy } = req.body as z.infer<
        typeof createWebhookSchema
      >;

      // Validate event types
      const validEvents = events.filter((event) => isValidEventType(event));

      if (validEvents.length !== events.length) {
        res.status(400).json({
          error: 'Invalid event types',
          invalidEvents: events.filter((e) => !isValidEventType(e)),
        });
        return;
      }

      const webhook = await webhookService.createWebhook(
        authenticatedReq.user.organizationId,
        name,
        url,
        validEvents,
        {
          secret,
          headers,
          retryPolicy: retryPolicy
            ? {
                maxRetries: retryPolicy.maxRetries ?? 3,
                retryDelayMs: retryPolicy.retryDelayMs ?? 1000,
                backoffMultiplier: retryPolicy.backoffMultiplier ?? 2,
              }
            : undefined,
        },
      );

      logger.info('Webhook created', {
        webhookId: webhook.id,
        organizationId: authenticatedReq.user.organizationId,
        userId: authenticatedReq.user.id,
      });

      res.status(201).json(webhook);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/webhooks/{webhookId}:
 *   patch:
 *     summary: Update webhook
 *     description: Update webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               url:
 *                 type: string
 *               events:
 *                 type: array
 *                 items:
 *                   type: string
 *               secret:
 *                 type: string
 *               headers:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *               retryPolicy:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Webhook'
 *       404:
 *         description: Webhook not found
 */
router.patch(
  '/:webhookId',
  requirePermission('manage', 'organization'),
  validateRequest({ body: updateWebhookSchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const updates = req.body as z.infer<typeof updateWebhookSchema>;

      // Validate event types if provided
      if (updates.events) {
        const validEvents = updates.events.filter((event) => isValidEventType(event));

        if (validEvents.length !== updates.events.length) {
          res.status(400).json({
            error: 'Invalid event types',
            invalidEvents: updates.events.filter((e) => !isValidEventType(e)),
          });
          return;
        }

        updates.events = validEvents;
      }

      const webhook = await webhookService.updateWebhook(
        req.params.webhookId!,
        authenticatedReq.user.organizationId,
        updates as any, // Type assertion needed due to event type validation above
      );

      if (!webhook) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      logger.info('Webhook updated', {
        webhookId: req.params.webhookId!,
        organizationId: authenticatedReq.user.organizationId,
        userId: authenticatedReq.user.id,
        updates: Object.keys(updates),
      });

      res.json(webhook);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/webhooks/{webhookId}:
 *   delete:
 *     summary: Delete webhook
 *     description: Delete a webhook configuration
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Webhook deleted
 *       404:
 *         description: Webhook not found
 */
router.delete(
  '/:webhookId',
  requirePermission('manage', 'organization'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const deleted = await webhookService.deleteWebhook(
        req.params.webhookId!,
        authenticatedReq.user.organizationId,
      );

      if (!deleted) {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }

      logger.info('Webhook deleted', {
        webhookId: req.params.webhookId!,
        organizationId: authenticatedReq.user.organizationId,
        userId: authenticatedReq.user.id,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/webhooks/{webhookId}/test:
 *   post:
 *     summary: Test webhook
 *     description: Send a test event to the webhook
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: number
 *                 message:
 *                   type: string
 *       404:
 *         description: Webhook not found
 */
router.post(
  '/:webhookId/test',
  requirePermission('manage', 'organization'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const delivery = await webhookService.testWebhook(
        req.params.webhookId!,
        authenticatedReq.user.organizationId,
      );

      logger.info('Webhook test sent', {
        webhookId: req.params.webhookId!,
        organizationId: authenticatedReq.user.organizationId,
        userId: authenticatedReq.user.id,
        success: delivery.status === 'success',
      });

      res.json({
        success: delivery.status === 'success',
        statusCode: delivery.statusCode,
        message:
          delivery.status === 'success'
            ? 'Test webhook delivered successfully'
            : `Test webhook failed: ${delivery.error || 'Unknown error'}`,
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Webhook not found') {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/webhooks/{webhookId}/deliveries:
 *   get:
 *     summary: Get webhook deliveries
 *     description: Get delivery history for a webhook
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, success, failed]
 *     responses:
 *       200:
 *         description: Delivery history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deliveries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/WebhookDelivery'
 *                 total:
 *                   type: number
 */
router.get(
  '/:webhookId/deliveries',
  requirePermission('manage', 'organization'),
  async (req: Request, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { limit = '50', offset = '0', status } = req.query;

      const result = await webhookService.getDeliveries(
        req.params.webhookId!,
        authenticatedReq.user.organizationId,
        {
          limit: parseInt(limit as string, 10),
          offset: parseInt(offset as string, 10),
          status: status as 'pending' | 'success' | 'failed' | undefined,
        },
      );

      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Webhook not found') {
        res.status(404).json({ error: 'Webhook not found' });
        return;
      }
      next(error);
    }
  },
);

// Helper function to validate event types
function isValidEventType(event: string): event is WebhookEventType {
  const validEvents: WebhookEventType[] = [
    'asset.created',
    'asset.updated',
    'asset.deleted',
    'task.created',
    'task.updated',
    'task.completed',
    'task.deleted',
    'task.assigned',
    'task.overdue',
    'schedule.created',
    'schedule.updated',
    'schedule.deleted',
    'user.invited',
    'user.joined',
    'user.deactivated',
    'maintenance.started',
    'maintenance.completed',
    'warranty.expiring',
    'warranty.expired',
  ];

  return validEvents.includes(event as WebhookEventType);
}

export default router;
