import { Router, type Response, type NextFunction } from 'express';
// import { z } from 'zod';
import {
  authenticateJWT as authenticate,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/auth';
// import { validateRequest } from '../middleware/validation';
import { TaskEnhancementService } from '../services/task-enhancement.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const taskEnhancementService = new TaskEnhancementService(prisma);

// Validation schemas - commented out until validateRequest is implemented
/*
const updateAssignmentsSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    userIds: z.array(z.string().uuid()),
  }),
});

const createSubtasksSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    subtasks: z.array(
      z.object({
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        dueDate: z.string().datetime(),
        priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
        estimatedMinutes: z.number().optional(),
        assignUserIds: z.array(z.string().uuid()).optional(),
        order: z.number().optional(),
      })
    ),
  }),
});

const updateCompletionRequirementsSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    requirePhoto: z.boolean().optional(),
    requireChecklist: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
    customRequirements: z.record(z.any()).optional(),
  }),
});

const updateChecklistSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    checklist: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        isCompleted: z.boolean(),
        completedAt: z.string().datetime().optional(),
        completedBy: z.string().uuid().optional(),
      })
    ),
  }),
});

const completeTaskSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    actualCost: z.number().optional(),
    actualMinutes: z.number().optional(),
    notes: z.string().optional(),
  }),
});

const reorderSubtasksSchema = z.object({
  params: z.object({
    taskId: z.string().uuid(),
  }),
  body: z.object({
    orderedTaskIds: z.array(z.string().uuid()),
  }),
});
*/

/**
 * @route PUT /api/task-enhancements/:taskId/assignments
 * @desc Update task assignments (multi-user)
 * @access Private (Admin, Manager)
 */
router.put(
  '/:taskId/assignments',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { userIds } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const assignedBy = authenticatedReq.user.id;

      const task = await taskEnhancementService.updateTaskAssignments(
        taskId,
        organizationId,
        userIds,
        assignedBy,
      );

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/task-enhancements/:taskId/subtasks
 * @desc Create subtasks for a task
 * @access Private (Admin, Manager)
 */
router.post(
  '/:taskId/subtasks',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { subtasks } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const createdBy = authenticatedReq.user.id;

      const subtasksData = subtasks.map((st: any) => ({
        ...st,
        dueDate: new Date(st.dueDate),
      }));

      const createdSubtasks = await taskEnhancementService.createSubtasks(
        taskId,
        organizationId,
        subtasksData,
        createdBy,
      );

      res.status(201).json(createdSubtasks);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route PUT /api/task-enhancements/:taskId/completion-requirements
 * @desc Update task completion requirements
 * @access Private (Admin, Manager)
 */
router.put(
  '/:taskId/completion-requirements',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const requirements = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      const task = await taskEnhancementService.updateCompletionRequirements(
        taskId,
        organizationId,
        requirements,
      );

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route PUT /api/task-enhancements/:taskId/checklist
 * @desc Update task checklist
 * @access Private
 */
router.put(
  '/:taskId/checklist',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { checklist } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const updatedBy = authenticatedReq.user.id;

      const task = await taskEnhancementService.updateChecklist(
        taskId,
        organizationId,
        checklist,
        updatedBy,
      );

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/task-enhancements/:taskId/completion-status
 * @desc Check if task completion requirements are met
 * @access Private
 */
router.get(
  '/:taskId/completion-status',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;

      const status = await taskEnhancementService.checkCompletionRequirements(taskId);

      res.json(status);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/task-enhancements/:taskId/complete
 * @desc Complete a task with validation
 * @access Private
 */
router.post(
  '/:taskId/complete',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { actualCost, actualMinutes, notes } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const completedBy = authenticatedReq.user.id;

      const task = await taskEnhancementService.completeTask(
        taskId,
        organizationId,
        completedBy,
        actualCost,
        actualMinutes,
        notes,
      );

      res.json(task);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/task-enhancements/:taskId/hierarchy
 * @desc Get task with all subtasks
 * @access Private
 */
router.get(
  '/:taskId/hierarchy',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      const hierarchy = await taskEnhancementService.getTaskHierarchy(taskId, organizationId);

      res.json(hierarchy);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route PUT /api/task-enhancements/:taskId/subtasks/reorder
 * @desc Reorder subtasks
 * @access Private (Admin, Manager)
 */
router.put(
  '/:taskId/subtasks/reorder',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { orderedTaskIds } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      await taskEnhancementService.reorderSubtasks(taskId, organizationId, orderedTaskIds);

      res.json({ message: 'Subtasks reordered successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/task-enhancements/by-assignees
 * @desc Get tasks by multiple assignees
 * @access Private
 */
router.get('/by-assignees', authenticate, async (req: any, res: Response, next: NextFunction) => {
  try {
    const organizationId = (req as AuthenticatedRequest).user.organizationId;
    const { userIds, status, dueDateFrom, dueDateTo, includeSubtasks, page, limit } = req.query;

    const userIdsArray = typeof userIds === 'string' ? userIds.split(',') : [];
    const statusArray = typeof status === 'string' ? status.split(',') : undefined;

    const result = await taskEnhancementService.getTasksByAssignees(organizationId, userIdsArray, {
      status: statusArray as any,
      dueDateFrom: dueDateFrom ? new Date(dueDateFrom as string) : undefined,
      dueDateTo: dueDateTo ? new Date(dueDateTo as string) : undefined,
      includeSubtasks: includeSubtasks === 'true',
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
