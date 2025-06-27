import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { appriseService } from '../services/apprise.service';
import { logger } from '../utils/logger';

const router = Router();

// All Apprise routes require authentication and organization management permission
router.use(authenticateJWT);
router.use(requirePermission('manage', 'organization'));

// Validation schemas
const testNotificationSchema = z.object({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(1000),
  type: z.enum(['info', 'success', 'warning', 'error']).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * @swagger
 * /api/apprise/status:
 *   get:
 *     summary: Get Apprise service status
 *     description: Check if Apprise is configured and get service information
 *     tags: [Apprise]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Apprise service status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 isConfigured:
 *                   type: boolean
 *                 isEnabled:
 *                   type: boolean
 *                 services:
 *                   type: array
 *                   items:
 *                     type: string
 *                 tags:
 *                   type: object
 */
router.get('/status', async (_req, res: Response) => {
  const isConfigured = appriseService.isConfigured();
  const services = appriseService.getConfiguredServices();

  res.json({
    isConfigured,
    isEnabled: isConfigured,
    services,
    tags: process.env.APPRISE_TAGS ? Object.keys(JSON.parse(process.env.APPRISE_TAGS || '{}')) : [],
  });
});

/**
 * @swagger
 * /api/apprise/test:
 *   post:
 *     summary: Send test notification
 *     description: Send a test notification through Apprise to verify configuration
 *     tags: [Apprise]
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
 *               type:
 *                 type: string
 *                 enum: [info, success, warning, error]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Test notification sent
 *       503:
 *         description: Apprise not configured
 */
router.post(
  '/test',
  validateRequest({ body: testNotificationSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    const { title, body, type, tags } = authenticatedReq.body as z.infer<
      typeof testNotificationSchema
    >;

    try {
      if (!appriseService.isConfigured()) {
        res.status(503).json({
          error: 'Apprise not configured',
          message: 'Please configure APPRISE_API_URL and APPRISE_URLS environment variables',
        });
        return;
      }

      const success = await appriseService.sendNotification({
        title,
        body,
        type,
        tag: tags,
      });

      if (success) {
        logger.info('Test Apprise notification sent', {
          userId: authenticatedReq.user.id,
          title,
          type,
          tags,
        });

        res.json({
          message: 'Test notification sent successfully',
          services: appriseService.getConfiguredServices(),
        });
      } else {
        res.status(500).json({
          error: 'Failed to send notification',
          message: 'Check server logs for details',
        });
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/apprise/alert:
 *   post:
 *     summary: Send alert notification
 *     description: Send a high-priority alert notification through Apprise
 *     tags: [Apprise]
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
 *     responses:
 *       200:
 *         description: Alert sent
 *       503:
 *         description: Apprise not configured
 */
router.post(
  '/alert',
  validateRequest({
    body: z.object({
      title: z.string().min(1).max(100),
      body: z.string().min(1).max(1000),
    }),
  }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    const { title, body } = authenticatedReq.body as { title: string; body: string };

    try {
      if (!appriseService.isConfigured()) {
        res.status(503).json({
          error: 'Apprise not configured',
        });
        return;
      }

      const success = await appriseService.sendAlert(title, body);

      if (success) {
        logger.warn('Alert sent via Apprise', {
          userId: authenticatedReq.user.id,
          title,
        });

        res.json({ message: 'Alert sent successfully' });
      } else {
        res.status(500).json({
          error: 'Failed to send alert',
        });
      }
    } catch (error) {
      next(error);
    }
  },
);

export default router;
