import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { TaskService } from '../services/task.service';
import { NotificationService } from '../services/notification.service';
import { CalendarSyncService } from '../services/calendar-sync.service';
import { NotFoundError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { z as zod } from 'zod';
import type { TaskStatus, TaskPriority } from '@prisma/client';

// Validation schemas
const taskCreateSchema = zod.object({
  title: zod.string().min(1).max(255),
  description: zod.string().optional(),
  dueDate: zod.string().datetime(),
  status: zod.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED']).optional(),
  priority: zod.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  estimatedCost: zod.number().min(0).optional(),
  estimatedMinutes: zod.number().min(0).optional(),
  assetId: zod.string().uuid().optional(),
  scheduleId: zod.string().uuid().optional(),
  assignUserIds: zod.array(zod.string().uuid()).optional(),
});

const taskUpdateSchema = zod.object({
  title: zod.string().min(1).max(255).optional(),
  description: zod.string().optional(),
  dueDate: zod.string().datetime().optional(),
  status: zod.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED']).optional(),
  priority: zod.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  estimatedCost: zod.number().min(0).optional(),
  actualCost: zod.number().min(0).optional(),
  estimatedMinutes: zod.number().min(0).optional(),
  actualMinutes: zod.number().min(0).optional(),
  assetId: zod.string().uuid().nullable().optional(),
});

const taskParamsSchema = zod.object({
  taskId: zod.string().uuid(),
});

const taskQuerySchema = zod.object({
  page: zod.union([zod.string(), zod.number()]).transform(Number).optional(),
  limit: zod.union([zod.string(), zod.number()]).transform(Number).optional(),
  assetId: zod.string().uuid().optional(),
  scheduleId: zod.string().uuid().optional(),
  assignedToUserId: zod.string().uuid().optional(),
  status: zod.string().optional(), // Can be comma-separated values
  priority: zod.string().optional(), // Can be comma-separated values
  dueDateBefore: zod.string().datetime().optional(),
  dueDateAfter: zod.string().datetime().optional(),
  isOverdue: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  sortBy: zod.enum(['dueDate', 'createdAt', 'updatedAt', 'priority', 'title']).optional(),
  sortOrder: zod.enum(['asc', 'desc']).optional(),
  includeAssignments: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  includeComments: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  includeAttachments: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const taskAssignmentSchema = zod.object({
  userIds: zod.array(zod.string().uuid()),
});

const taskCommentCreateSchema = zod.object({
  content: zod.string().min(1).max(2000),
});

const taskCommentParamsSchema = zod.object({
  taskId: zod.string().uuid(),
});

const taskCommentQuerySchema = zod.object({
  page: zod.union([zod.string(), zod.number()]).transform(Number).optional(),
  limit: zod.union([zod.string(), zod.number()]).transform(Number).optional(),
});

const bulkTaskUpdateSchema = zod.object({
  taskIds: zod.array(zod.string().uuid()),
  status: zod.enum(['PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED']),
});

// Type definitions
type TaskCreateBody = z.infer<typeof taskCreateSchema>;
type TaskUpdateBody = z.infer<typeof taskUpdateSchema>;
type TaskParamsBody = z.infer<typeof taskParamsSchema>;
type TaskQueryBody = z.infer<typeof taskQuerySchema>;
type TaskAssignmentBody = z.infer<typeof taskAssignmentSchema>;
type TaskCommentCreateBody = z.infer<typeof taskCommentCreateSchema>;
type TaskCommentParamsBody = z.infer<typeof taskCommentParamsSchema>;
type TaskCommentQueryBody = z.infer<typeof taskCommentQuerySchema>;
type BulkTaskUpdateBody = z.infer<typeof bulkTaskUpdateSchema>;

const router = Router();
const taskService = new TaskService();
const notificationService = new NotificationService(prisma);
const calendarSyncService = new CalendarSyncService();

// All task routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: List tasks
 *     description: Get a paginated list of tasks with optional filtering
 *     tags: [Tasks]
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
 *         name: scheduleId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by schedule
 *       - in: query
 *         name: assignedToUserId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by assigned user
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (comma-separated for multiple)
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *         description: Filter by priority (comma-separated for multiple)
 *       - in: query
 *         name: dueDateBefore
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by due date before
 *       - in: query
 *         name: dueDateAfter
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter by due date after
 *       - in: query
 *         name: isOverdue
 *         schema:
 *           type: boolean
 *         description: Filter overdue tasks
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [dueDate, createdAt, updatedAt, priority, title]
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: includeAssignments
 *         schema:
 *           type: boolean
 *         description: Include task assignments
 *       - in: query
 *         name: includeComments
 *         schema:
 *           type: boolean
 *         description: Include task comments
 *       - in: query
 *         name: includeAttachments
 *         schema:
 *           type: boolean
 *         description: Include task attachments
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully
 */
router.get(
  '/',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({ query: taskQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as TaskQueryBody;

      // page and limit are already transformed to numbers by Zod validation
      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);

      const filters = {
        assetId: query.assetId,
        scheduleId: query.scheduleId,
        assignedToUserId: query.assignedToUserId,
        status: query.status ? (query.status.split(',') as TaskStatus[]) : undefined,
        priority: query.priority ? (query.priority.split(',') as TaskPriority[]) : undefined,
        dueDateBefore: query.dueDateBefore ? new Date(query.dueDateBefore) : undefined,
        dueDateAfter: query.dueDateAfter ? new Date(query.dueDateAfter) : undefined,
        isOverdue: query.isOverdue,
        page,
        limit,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        includeAssignments: query.includeAssignments,
        includeComments: query.includeComments,
        includeAttachments: query.includeAttachments,
      };

      const result = await taskService.findTasks(user.organizationId, filters);

      res.json({
        tasks: result.data,
        total: result.meta.total,
        page: Number(result.meta.page),
        totalPages: result.meta.lastPage,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create task
 *     description: Create a new task
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskCreate'
 *     responses:
 *       201:
 *         description: Task created successfully
 */
router.post(
  '/',
  requirePermission('create', 'task', { scope: 'any' }),
  validateRequest({ body: taskCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const body = authenticatedReq.body as TaskCreateBody;

      // Fetch user details for activity tracking
      const userDetails = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, fullName: true, email: true },
      });

      const task = await taskService.createTask(
        {
          organizationId: user.organizationId,
          title: body.title,
          description: body.description,
          dueDate: new Date(body.dueDate),
          status: body.status,
          priority: body.priority,
          estimatedCost: body.estimatedCost,
          estimatedMinutes: body.estimatedMinutes,
          assetId: body.assetId,
          scheduleId: body.scheduleId,
          assignUserIds: body.assignUserIds,
        },
        { id: user.id, name: userDetails?.fullName || userDetails?.email || user.email }, // For activity tracking
      );

      // Send notification for task creation
      await notificationService.createNotification({
        organizationId: user.organizationId,
        userId: user.id,
        taskId: task.id,
        assetId: task.assetId || undefined,
        type: 'task-assigned',
        title: 'Task Created',
        message: `Task "${task.title}" has been created`,
        sendInApp: true,
      });

      // Sync task to Google Calendar if enabled
      if (body.assignUserIds && body.assignUserIds.length > 0) {
        // Sync for each assigned user
        for (const assignedUserId of body.assignUserIds) {
          calendarSyncService.syncTaskToCalendar(task.id, assignedUserId).catch((error) => {
            logger.error(
              'Failed to sync task to calendar',
              error instanceof Error ? error : new Error('Unknown error'),
              {
                taskId: task.id,
                userId: assignedUserId,
              },
            );
          });
        }
      }

      res.status(201).json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/stats:
 *   get:
 *     summary: Get task statistics
 *     description: Get comprehensive statistics about tasks
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Task statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 byStatus:
 *                   type: object
 *                 byPriority:
 *                   type: object
 *                 overdue:
 *                   type: integer
 *                 dueSoon:
 *                   type: integer
 *                 avgCompletionTime:
 *                   type: number
 *                 completionRate:
 *                   type: number
 */
router.get(
  '/stats',
  requirePermission('read', 'task', { scope: 'any' }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const stats = await taskService.getTaskStatistics(user.organizationId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/overdue:
 *   get:
 *     summary: Get overdue tasks
 *     description: Get all overdue tasks for the organization
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Overdue tasks retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 */
router.get(
  '/overdue',
  requirePermission('read', 'task', { scope: 'any' }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const tasks = await taskService.getOverdueTasks(user.organizationId);
      res.json(tasks);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/user/{userId}:
 *   get:
 *     summary: Get user tasks
 *     description: Get tasks assigned to a specific user
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (comma-separated for multiple)
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *         description: Filter by priority (comma-separated for multiple)
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
 *     responses:
 *       200:
 *         description: User tasks retrieved successfully
 */
router.get(
  '/user/:userId',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({
    params: zod.object({ userId: zod.string().uuid() }),
    query: zod.object({
      status: zod.string().optional(),
      priority: zod.string().optional(),
      page: zod.string().transform(Number).optional(),
      limit: zod.string().transform(Number).optional(),
    }),
  }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { userId } = authenticatedReq.params;
      const query = authenticatedReq.query as {
        status?: string;
        priority?: string;
        page?: number;
        limit?: number;
      };

      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);

      const result = await taskService.getUserTasks(userId!, user.organizationId, {
        status: query.status ? (query.status.split(',') as TaskStatus[]) : undefined,
        priority: query.priority ? (query.priority.split(',') as TaskPriority[]) : undefined,
        page,
        limit,
      });

      res.json({
        tasks: result.data,
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
 * /api/tasks/asset/{assetId}:
 *   get:
 *     summary: Get asset tasks
 *     description: Get tasks for a specific asset
 *     tags: [Tasks]
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
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (comma-separated for multiple)
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *         description: Filter by priority (comma-separated for multiple)
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
 *     responses:
 *       200:
 *         description: Asset tasks retrieved successfully
 */
router.get(
  '/asset/:assetId',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({
    params: zod.object({ assetId: zod.string().uuid() }),
    query: zod.object({
      status: zod.string().optional(),
      priority: zod.string().optional(),
      page: zod.string().transform(Number).optional(),
      limit: zod.string().transform(Number).optional(),
    }),
  }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params;
      const query = authenticatedReq.query as {
        status?: string;
        priority?: string;
        page?: number;
        limit?: number;
      };

      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);

      const result = await taskService.getAssetTasks(assetId!, user.organizationId, {
        status: query.status ? (query.status.split(',') as TaskStatus[]) : undefined,
        priority: query.priority ? (query.priority.split(',') as TaskPriority[]) : undefined,
        page,
        limit,
      });

      res.json({
        tasks: result.data,
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
 * /api/tasks/bulk/status:
 *   patch:
 *     summary: Bulk update task status
 *     description: Update status for multiple tasks at once
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               taskIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               status:
 *                 type: string
 *                 enum: [PLANNED, IN_PROGRESS, DONE, SKIPPED]
 *     responses:
 *       200:
 *         description: Bulk operation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: integer
 *                 failed:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.patch(
  '/bulk/status',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ body: bulkTaskUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskIds, status } = authenticatedReq.body as BulkTaskUpdateBody;

      const result = await taskService.bulkUpdateTaskStatus(taskIds, user.organizationId, status);

      logger.info('Bulk task status update completed', {
        total: taskIds.length,
        success: result.success,
        failed: result.failed,
        status,
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
 * /api/tasks/{taskId}:
 *   get:
 *     summary: Get task by ID
 *     description: Retrieve a specific task by ID
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Task retrieved successfully
 *       404:
 *         description: Task not found
 */
router.get(
  '/:taskId',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({ params: taskParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskParamsBody;

      const task = await taskService.getTaskById(taskId, user.organizationId, {
        includeAssignments: true,
        includeComments: true,
        includeAttachments: true,
      });

      if (!task) {
        throw new NotFoundError('Task not found');
      }

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   put:
 *     summary: Update task
 *     description: Update an existing task
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskUpdate'
 *     responses:
 *       200:
 *         description: Task updated successfully
 *       404:
 *         description: Task not found
 */
router.put(
  '/:taskId',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ params: taskParamsSchema, body: taskUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskParamsBody;
      const body = authenticatedReq.body as TaskUpdateBody;

      // Fetch user details for activity tracking
      const userDetails = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, fullName: true, email: true },
      });

      const task = await taskService.updateTask(
        taskId,
        user.organizationId,
        {
          ...body,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        },
        { id: user.id, name: userDetails?.fullName || userDetails?.email || user.email }, // For activity tracking
      );

      // Sync updated task to calendars of all assigned users
      const taskWithAssignments = await taskService.getTaskById(taskId, user.organizationId, {
        includeAssignments: true,
      });

      if (taskWithAssignments && taskWithAssignments.assignments) {
        for (const assignment of taskWithAssignments.assignments) {
          calendarSyncService.syncTaskToCalendar(task.id, assignment.userId).catch((error) => {
            logger.error(
              'Failed to sync updated task to calendar',
              error instanceof Error ? error : new Error('Unknown error'),
              {
                taskId: task.id,
                userId: assignment.userId,
              },
            );
          });
        }
      }

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}:
 *   delete:
 *     summary: Delete task
 *     description: Delete a task
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Task deleted successfully
 *       404:
 *         description: Task not found
 */
router.delete(
  '/:taskId',
  requirePermission('delete', 'task', { scope: 'any' }),
  validateRequest({ params: taskParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskParamsBody;

      // Get task assignments before deletion for calendar sync cleanup
      const task = await taskService.getTaskById(taskId, user.organizationId, {
        includeAssignments: true,
      });

      if (task && task.assignments) {
        // Remove from calendars of all assigned users
        for (const assignment of task.assignments) {
          calendarSyncService.removeTaskFromCalendar(taskId, assignment.userId).catch((error) => {
            logger.error(
              'Failed to remove task from calendar',
              error instanceof Error ? error : new Error('Unknown error'),
              {
                taskId,
                userId: assignment.userId,
              },
            );
          });
        }
      }

      await taskService.deleteTask(taskId, user.organizationId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/assign:
 *   put:
 *     summary: Assign users to task
 *     description: Assign or reassign users to a task
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Task assignments updated successfully
 *       404:
 *         description: Task not found
 */
router.put(
  '/:taskId/assign',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ params: taskParamsSchema, body: taskAssignmentSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskParamsBody;
      const { userIds } = authenticatedReq.body as TaskAssignmentBody;

      const task = await taskService.assignUsersToTask(taskId, user.organizationId, userIds);

      // Send notifications to newly assigned users
      if (task.assignments) {
        for (const assignment of task.assignments) {
          try {
            await notificationService.createNotification({
              organizationId: user.organizationId,
              userId: assignment.user.id,
              taskId: task.id,
              assetId: task.assetId || undefined,
              type: 'task-assigned',
              title: 'Task Assigned',
              message: `You have been assigned to task: ${task.title}`,
              sendInApp: true,
            });
          } catch (notificationError) {
            logger.warn('Failed to send task assignment notification', {
              taskId: task.id,
              userId: assignment.user.id,
              error:
                notificationError instanceof Error ? notificationError.message : 'Unknown error',
            });
          }
        }
      }

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/comments:
 *   get:
 *     summary: Get task comments
 *     description: Get paginated comments for a task
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 *       404:
 *         description: Task not found
 */
router.get(
  '/:taskId/comments',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({ params: taskCommentParamsSchema, query: taskCommentQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskCommentParamsBody;
      const query = authenticatedReq.query as TaskCommentQueryBody;

      // page and limit are already transformed to numbers by Zod validation
      const page = query.page ?? 1;
      const limit = Math.min(query.limit ?? 20, 100);

      const result = await taskService.getTaskComments(taskId, user.organizationId, {
        page,
        limit,
      });

      res.json({
        comments: result.data,
        total: result.meta.total,
        page: Number(result.meta.page),
        totalPages: result.meta.lastPage,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/comments:
 *   post:
 *     summary: Add task comment
 *     description: Add a new comment to a task
 *     tags: [Tasks]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
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
 *               content:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *     responses:
 *       201:
 *         description: Comment added successfully
 *       404:
 *         description: Task not found
 */
router.post(
  '/:taskId/comments',
  requirePermission('create', 'task', { scope: 'any' }),
  validateRequest({ params: taskCommentParamsSchema, body: taskCommentCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskCommentParamsBody;
      const { content } = authenticatedReq.body as TaskCommentCreateBody;

      const comment = await taskService.createTaskComment({
        taskId,
        userId: user.id,
        content,
      });

      res.status(201).json(comment);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
