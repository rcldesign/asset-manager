import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { NotificationService } from '../services/notification.service';
import { NotFoundError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { z as zod } from 'zod';

// Validation schemas
const notificationQuerySchema = zod.object({
  page: zod.string().transform(Number).optional(),
  limit: zod.string().transform(Number).optional(),
  type: zod.string().optional(),
  isRead: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  startDate: zod.string().datetime().optional(),
  endDate: zod.string().datetime().optional(),
  sortBy: zod.enum(['createdAt', 'updatedAt', 'type']).optional(),
  sortOrder: zod.enum(['asc', 'desc']).optional(),
});

const notificationParamsSchema = zod.object({
  notificationId: zod.string().uuid(),
});

const markReadSchema = zod.object({
  notificationIds: zod.array(zod.string().uuid()),
});

const notificationPreferencesSchema = zod.object({
  inApp: zod
    .object({
      enabled: zod.boolean(),
      types: zod.array(zod.string()).optional(),
    })
    .optional(),
  email: zod
    .object({
      enabled: zod.boolean(),
      types: zod.array(zod.string()).optional(),
      digest: zod.boolean().optional(),
      digestFrequency: zod.enum(['daily', 'weekly']).optional(),
    })
    .optional(),
  push: zod
    .object({
      enabled: zod.boolean(),
      types: zod.array(zod.string()).optional(),
    })
    .optional(),
});

const testNotificationSchema = zod.object({
  type: zod.enum([
    'task-assigned',
    'task-due',
    'task-overdue',
    'task-completed',
    'asset-warranty-expiring',
    'schedule-created',
    'schedule-modified',
    'mention',
    'general',
  ]),
  title: zod.string().min(1).max(255),
  message: zod.string().min(1).max(1000),
  assetId: zod.string().uuid().optional(),
  taskId: zod.string().uuid().optional(),
  scheduleId: zod.string().uuid().optional(),
});

// Type definitions
type NotificationQueryBody = z.infer<typeof notificationQuerySchema>;
type NotificationParamsBody = z.infer<typeof notificationParamsSchema>;
type MarkReadBody = z.infer<typeof markReadSchema>;
type NotificationPreferencesBody = z.infer<typeof notificationPreferencesSchema>;
type TestNotificationBody = z.infer<typeof testNotificationSchema>;

const router = Router();
const notificationService = new NotificationService(prisma);

// All notification routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: List notifications
 *     description: Get a paginated list of notifications for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number (default 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page (default 20)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by notification type
 *       - in: query
 *         name: isRead
 *         schema:
 *           type: boolean
 *         description: Filter by read status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by end date
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, type]
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 */
router.get(
  '/',
  validateRequest({ query: notificationQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as NotificationQueryBody;

      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 100);

      const whereClause: Record<string, unknown> = {
        userId: user.id,
        organizationId: user.organizationId,
      };

      if (query.type) {
        whereClause.type = query.type;
      }

      if (query.isRead !== undefined) {
        whereClause.isRead = query.isRead;
      }

      if (query.startDate || query.endDate) {
        const dateFilter: Record<string, Date> = {};
        if (query.startDate) {
          dateFilter.gte = new Date(query.startDate);
        }
        if (query.endDate) {
          dateFilter.lte = new Date(query.endDate);
        }
        whereClause.createdAt = dateFilter;
      }

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where: whereClause,
          include: {
            asset: {
              select: {
                id: true,
                name: true,
                category: true,
              },
            },
            task: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
            schedule: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
          orderBy: {
            [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
          },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.notification.count({ where: whereClause }),
      ]);

      res.json({
        notifications,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   get:
 *     summary: Get notification by ID
 *     description: Retrieve a specific notification by ID
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification retrieved successfully
 *       404:
 *         description: Notification not found
 */
router.get(
  '/:notificationId',
  validateRequest({ params: notificationParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { notificationId } = authenticatedReq.params as NotificationParamsBody;

      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: user.id,
        },
        include: {
          asset: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
          task: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
          schedule: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      // Mark as read if not already
      if (!notification.isRead) {
        await prisma.notification.update({
          where: { id: notificationId },
          data: { isRead: true, readAt: new Date() },
        });
      }

      res.json(notification);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notifications/mark-read:
 *   post:
 *     summary: Mark notifications as read
 *     description: Mark one or more notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notificationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Notifications marked as read
 */
router.post(
  '/mark-read',
  validateRequest({ body: markReadSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { notificationIds } = authenticatedReq.body as MarkReadBody;

      const result = await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId: user.id,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      res.json({
        updated: result.count,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notifications/mark-all-read:
 *   post:
 *     summary: Mark all notifications as read
 *     description: Mark all unread notifications as read
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications marked as read
 */
router.post('/mark-all-read', async (req, res: Response, next: NextFunction) => {
  const authenticatedReq = req as AuthenticatedRequest;
  try {
    const { user } = authenticatedReq;

    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json({
      updated: result.count,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/{notificationId}:
 *   delete:
 *     summary: Delete notification
 *     description: Delete a notification
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: notificationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Notification deleted successfully
 *       404:
 *         description: Notification not found
 */
router.delete(
  '/:notificationId',
  validateRequest({ params: notificationParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { notificationId } = authenticatedReq.params as NotificationParamsBody;

      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId: user.id,
        },
      });

      if (!notification) {
        throw new NotFoundError('Notification not found');
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get unread notification count
 *     description: Get the count of unread notifications
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadCount:
 *                   type: integer
 *                 byType:
 *                   type: object
 */
router.get('/unread-count', async (req, res: Response, next: NextFunction) => {
  const authenticatedReq = req as AuthenticatedRequest;
  try {
    const { user } = authenticatedReq;

    const [unreadCount, byType] = await Promise.all([
      prisma.notification.count({
        where: {
          userId: user.id,
          isRead: false,
        },
      }),
      prisma.notification.groupBy({
        by: ['type'],
        where: {
          userId: user.id,
          isRead: false,
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const byTypeMap = byType.reduce(
      (acc, item) => {
        acc[item.type] = item._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json({
      unreadCount,
      byType: byTypeMap,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/preferences:
 *   get:
 *     summary: Get notification preferences
 *     description: Get the user's notification preferences
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences retrieved successfully
 */
router.get('/preferences', async (req, res: Response, next: NextFunction) => {
  const authenticatedReq = req as AuthenticatedRequest;
  try {
    const { user } = authenticatedReq;

    // Get user preferences from database or use defaults
    const userPreferences = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        notificationPreferences: true,
      },
    });

    const defaultPreferences = {
      inApp: {
        enabled: true,
        types: ['all'],
      },
      email: {
        enabled: true,
        types: ['task-overdue', 'asset-warranty-expiring'],
        digest: false,
        digestFrequency: 'daily',
      },
      push: {
        enabled: false,
        types: ['all'],
      },
    };

    const preferences = userPreferences?.notificationPreferences || defaultPreferences;

    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/notifications/preferences:
 *   put:
 *     summary: Update notification preferences
 *     description: Update the user's notification preferences
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NotificationPreferences'
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 */
router.put(
  '/preferences',
  validateRequest({ body: notificationPreferencesSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const preferences = authenticatedReq.body as NotificationPreferencesBody;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          notificationPreferences: preferences as any,
        },
      });

      logger.info('Notification preferences updated', {
        userId: user.id,
        preferences,
      });

      res.json(preferences);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/notifications/test:
 *   post:
 *     summary: Send test notification
 *     description: Send a test notification (development/testing only)
 *     tags: [Notifications]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               assetId:
 *                 type: string
 *                 format: uuid
 *               taskId:
 *                 type: string
 *                 format: uuid
 *               scheduleId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Test notification sent
 */
router.post(
  '/test',
  requirePermission('create', 'notification', { scope: 'own' }),
  validateRequest({ body: testNotificationSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const body = authenticatedReq.body as TestNotificationBody;

      const notification = await notificationService.createNotification({
        organizationId: user.organizationId,
        userId: user.id,
        type: body.type as string,
        title: body.title,
        message: body.message,
        assetId: body.assetId,
        taskId: body.taskId,
        scheduleId: body.scheduleId,
        sendInApp: true,
        sendEmail: true,
      });

      res.status(201).json(notification);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
