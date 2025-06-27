import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { ScheduleService } from '../services/schedule.service';
import { NotFoundError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { z as zod } from 'zod';
import type { ScheduleType } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Validation schemas
const scheduleCreateSchema = zod.object({
  name: zod.string().min(1).max(255),
  description: zod.string().optional(),
  assetId: zod.string().uuid(),
  type: zod.enum(['CALENDAR', 'INTERVAL', 'USAGE_BASED', 'SEASONAL', 'MONTHLY']),
  isActive: zod.boolean().optional(),
  recurrenceRule: zod.string().optional(),
  intervalDays: zod.number().min(1).optional(),
  usageThreshold: zod.number().min(0).optional(),
  monthlyDayOfMonth: zod.number().min(1).max(31).optional(),
  seasonalMonths: zod.array(zod.number().min(1).max(12)).optional(),
  taskTemplate: zod.object({
    title: zod.string().min(1).max(255),
    description: zod.string().optional(),
    priority: zod.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
    estimatedMinutes: zod.number().min(0).optional(),
    estimatedCost: zod.number().min(0).optional(),
    assignUserIds: zod.array(zod.string().uuid()).optional(),
  }),
  startDate: zod.string().datetime().optional(),
  endDate: zod.string().datetime().optional(),
});

const scheduleUpdateSchema = zod.object({
  name: zod.string().min(1).max(255).optional(),
  description: zod.string().optional(),
  isActive: zod.boolean().optional(),
  recurrenceRule: zod.string().optional(),
  intervalDays: zod.number().min(1).optional(),
  usageThreshold: zod.number().min(0).optional(),
  monthlyDayOfMonth: zod.number().min(1).max(31).optional(),
  seasonalMonths: zod.array(zod.number().min(1).max(12)).optional(),
  taskTemplate: zod
    .object({
      title: zod.string().min(1).max(255),
      description: zod.string().optional(),
      priority: zod.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
      estimatedMinutes: zod.number().min(0).optional(),
      estimatedCost: zod.number().min(0).optional(),
      assignUserIds: zod.array(zod.string().uuid()).optional(),
    })
    .optional(),
  startDate: zod.string().datetime().optional(),
  endDate: zod.string().datetime().optional(),
});

const scheduleParamsSchema = zod.object({
  scheduleId: zod.string().uuid(),
});

const scheduleQuerySchema = zod.object({
  page: zod.string().transform(Number).optional(),
  limit: zod.string().transform(Number).optional(),
  assetId: zod.string().uuid().optional(),
  type: zod.string().optional(),
  isActive: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  includeAsset: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  sortBy: zod.enum(['name', 'createdAt', 'updatedAt', 'nextRunAt']).optional(),
  sortOrder: zod.enum(['asc', 'desc']).optional(),
});

const usageUpdateSchema = zod.object({
  currentUsage: zod.number().min(0),
});

const nextOccurrencesQuerySchema = zod.object({
  count: zod.string().transform(Number).optional(),
  startDate: zod.string().datetime().optional(),
  endDate: zod.string().datetime().optional(),
});

// Type definitions
type ScheduleCreateBody = z.infer<typeof scheduleCreateSchema>;
type ScheduleUpdateBody = z.infer<typeof scheduleUpdateSchema>;
type ScheduleParamsBody = z.infer<typeof scheduleParamsSchema>;
type ScheduleQueryBody = z.infer<typeof scheduleQuerySchema>;
type UsageUpdateBody = z.infer<typeof usageUpdateSchema>;
type NextOccurrencesQueryBody = z.infer<typeof nextOccurrencesQuerySchema>;

const router = Router();
const scheduleService = new ScheduleService(prisma);

// All schedule routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/schedules:
 *   get:
 *     summary: List schedules
 *     description: Get a paginated list of schedules with optional filtering
 *     tags: [Schedules]
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
 *         name: assetId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by asset
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [CALENDAR, INTERVAL, USAGE_BASED, SEASONAL, MONTHLY]
 *         description: Filter by schedule type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: includeAsset
 *         schema:
 *           type: boolean
 *         description: Include asset details
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, createdAt, updatedAt, nextRunAt]
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Schedules retrieved successfully
 */
router.get(
  '/',
  requirePermission('read', 'schedule', { scope: 'any' }),
  validateRequest({ query: scheduleQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as ScheduleQueryBody;

      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 100);

      const filters = {
        assetId: query.assetId,
        type: query.type as ScheduleType | undefined,
        isActive: query.isActive,
        page,
        limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        includeAsset: query.includeAsset,
      };

      const result = await scheduleService.findSchedules(user.organizationId, filters);

      res.json({
        schedules: result.data,
        total: result.meta.total,
        page: result.meta.page,
        totalPages: result.meta.lastPage,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules:
 *   post:
 *     summary: Create schedule
 *     description: Create a new maintenance schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScheduleCreate'
 *     responses:
 *       201:
 *         description: Schedule created successfully
 */
router.post(
  '/',
  requirePermission('create', 'schedule', { scope: 'any' }),
  validateRequest({ body: scheduleCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const body = authenticatedReq.body as ScheduleCreateBody;

      // Validate schedule configuration based on type
      await scheduleService.validateScheduleConfig(body);

      const schedule = await scheduleService.createSchedule({
        organizationId: user.organizationId,
        ...body,
        scheduleType: body.type as any, // Map type to scheduleType for backward compatibility
        type: body.type,
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      });

      res.status(201).json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}:
 *   get:
 *     summary: Get schedule by ID
 *     description: Retrieve a specific schedule by ID
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Schedule retrieved successfully
 *       404:
 *         description: Schedule not found
 */
router.get(
  '/:scheduleId',
  requirePermission('read', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;

      const schedule = await scheduleService.getScheduleById(scheduleId, user.organizationId, {
        includeAsset: true,
      });

      if (!schedule) {
        throw new NotFoundError('Schedule not found');
      }

      res.json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}:
 *   put:
 *     summary: Update schedule
 *     description: Update an existing schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ScheduleUpdate'
 *     responses:
 *       200:
 *         description: Schedule updated successfully
 *       404:
 *         description: Schedule not found
 */
router.put(
  '/:scheduleId',
  requirePermission('update', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema, body: scheduleUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;
      const body = authenticatedReq.body as ScheduleUpdateBody;

      const schedule = await scheduleService.updateSchedule(scheduleId, user.organizationId, {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      });

      res.json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}:
 *   delete:
 *     summary: Delete schedule
 *     description: Delete a schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Schedule deleted successfully
 *       404:
 *         description: Schedule not found
 */
router.delete(
  '/:scheduleId',
  requirePermission('delete', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;

      await scheduleService.deleteSchedule(scheduleId, user.organizationId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}/activate:
 *   post:
 *     summary: Activate schedule
 *     description: Activate a maintenance schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Schedule activated successfully
 *       404:
 *         description: Schedule not found
 */
router.post(
  '/:scheduleId/activate',
  requirePermission('update', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;

      const schedule = await scheduleService.activateSchedule(scheduleId, user.organizationId);
      res.json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}/deactivate:
 *   post:
 *     summary: Deactivate schedule
 *     description: Deactivate a maintenance schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Schedule deactivated successfully
 *       404:
 *         description: Schedule not found
 */
router.post(
  '/:scheduleId/deactivate',
  requirePermission('update', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;

      const schedule = await scheduleService.deactivateSchedule(scheduleId, user.organizationId);
      res.json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}/update-usage:
 *   post:
 *     summary: Update usage for usage-based schedule
 *     description: Update the current usage value for a usage-based schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               currentUsage:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       200:
 *         description: Usage updated successfully
 *       404:
 *         description: Schedule not found
 *       400:
 *         description: Schedule is not usage-based
 */
router.post(
  '/:scheduleId/update-usage',
  requirePermission('update', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema, body: usageUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;
      const { currentUsage } = authenticatedReq.body as UsageUpdateBody;

      const schedule = await scheduleService.updateUsageBasedSchedule(
        scheduleId,
        user.organizationId,
        currentUsage,
      );

      res.json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}/next-occurrences:
 *   get:
 *     summary: Get next occurrences
 *     description: Get the next scheduled occurrences
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *         description: Number of occurrences to return (default 10)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start date for occurrences
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End date for occurrences
 *     responses:
 *       200:
 *         description: Next occurrences retrieved successfully
 *       404:
 *         description: Schedule not found
 */
router.get(
  '/:scheduleId/next-occurrences',
  requirePermission('read', 'schedule', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema, query: nextOccurrencesQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;
      const query = authenticatedReq.query as NextOccurrencesQueryBody;

      const schedule = await scheduleService.getScheduleById(scheduleId, user.organizationId);
      if (!schedule) {
        throw new NotFoundError('Schedule not found');
      }

      const count = Math.min(query.count || 10, 50);
      const startDate = query.startDate ? new Date(query.startDate) : new Date();
      const endDate = query.endDate ? new Date(query.endDate) : undefined;

      const occurrences = await scheduleService.getNextOccurrences(
        schedule,
        count,
        startDate,
        endDate,
      );

      res.json({ occurrences });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/{scheduleId}/generate-tasks:
 *   post:
 *     summary: Generate tasks now
 *     description: Manually trigger task generation for a schedule
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scheduleId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tasks generated successfully
 *       404:
 *         description: Schedule not found
 */
router.post(
  '/:scheduleId/generate-tasks',
  requirePermission('create', 'task', { scope: 'any' }),
  validateRequest({ params: scheduleParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { scheduleId } = authenticatedReq.params as ScheduleParamsBody;

      const result = await scheduleService.generateTasksNow(scheduleId, user.organizationId);

      logger.info('Manual task generation completed', {
        scheduleId,
        tasksCreated: result.tasksCreated,
        userId: user.id,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/schedules/by-asset/{assetId}:
 *   get:
 *     summary: Get schedules by asset
 *     description: Get all schedules for a specific asset
 *     tags: [Schedules]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Schedules retrieved successfully
 */
router.get(
  '/by-asset/:assetId',
  requirePermission('read', 'schedule', { scope: 'any' }),
  validateRequest({
    params: zod.object({ assetId: zod.string().uuid() }),
    query: zod.object({
      isActive: zod
        .string()
        .transform((v) => v === 'true')
        .optional(),
    }),
  }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params;
      const { isActive } = authenticatedReq.query as { isActive?: boolean };

      const schedules = await scheduleService.getSchedulesByAsset(
        assetId!,
        user.organizationId,
        isActive,
      );

      res.json({ schedules });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
