import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { TaskService } from '../services/task.service';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { z as zod } from 'zod';

// Validation schemas
const taskCommentCreateSchema = zod.object({
  content: zod.string().min(1).max(2000),
});

const taskCommentUpdateSchema = zod.object({
  content: zod.string().min(1).max(2000),
});

const taskParamsSchema = zod.object({
  taskId: zod.string().uuid(),
});

const commentParamsSchema = zod.object({
  taskId: zod.string().uuid(),
  commentId: zod.string().uuid(),
});

const taskCommentsQuerySchema = zod.object({
  page: zod.string().transform(Number).optional(),
  limit: zod.string().transform(Number).optional(),
  orderBy: zod.enum(['asc', 'desc']).optional(),
});

// Type definitions
type TaskCommentCreateBody = z.infer<typeof taskCommentCreateSchema>;
type TaskCommentUpdateBody = z.infer<typeof taskCommentUpdateSchema>;
type TaskParamsBody = z.infer<typeof taskParamsSchema>;
type CommentParamsBody = z.infer<typeof commentParamsSchema>;
type TaskCommentsQueryBody = z.infer<typeof taskCommentsQuerySchema>;

const router = Router();
const taskService = new TaskService();

// All task comment routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/tasks/{taskId}/comments:
 *   post:
 *     summary: Create task comment
 *     description: Create a new comment on a task with automatic @mentions processing
 *     tags: [Task Comments]
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
 *                 description: Comment content (supports @mentions)
 *     responses:
 *       201:
 *         description: Comment created successfully
 *       404:
 *         description: Task not found
 */
router.post(
  '/:taskId/comments',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ params: taskParamsSchema, body: taskCommentCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskParamsBody;
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

/**
 * @swagger
 * /api/tasks/{taskId}/comments:
 *   get:
 *     summary: Get task comments
 *     description: Get paginated list of comments for a task
 *     tags: [Task Comments]
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
 *       - in: query
 *         name: orderBy
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order by creation date (default desc)
 *     responses:
 *       200:
 *         description: Comments retrieved successfully
 */
router.get(
  '/:taskId/comments',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({ params: taskParamsSchema, query: taskCommentsQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as TaskParamsBody;
      const query = authenticatedReq.query as TaskCommentsQueryBody;

      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 100);
      const orderBy = query.orderBy || 'desc';

      const result = await taskService.getTaskComments(taskId, user.organizationId, {
        page,
        limit,
        orderBy,
      });

      res.json({
        comments: result.data,
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
 * /api/tasks/{taskId}/comments/{commentId}:
 *   put:
 *     summary: Update task comment
 *     description: Update a comment (only by comment author)
 *     tags: [Task Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: commentId
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
 *       200:
 *         description: Comment updated successfully
 *       403:
 *         description: Not authorized to edit this comment
 *       404:
 *         description: Comment not found
 */
router.put(
  '/:taskId/comments/:commentId',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ params: commentParamsSchema, body: taskCommentUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { commentId } = authenticatedReq.params as CommentParamsBody;
      const { content } = authenticatedReq.body as TaskCommentUpdateBody;

      const comment = await taskService.updateTaskComment(
        commentId,
        user.id,
        user.organizationId,
        content,
      );

      res.json(comment);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/comments/{commentId}:
 *   delete:
 *     summary: Delete task comment
 *     description: Delete a comment (only by comment author)
 *     tags: [Task Comments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Comment deleted successfully
 *       403:
 *         description: Not authorized to delete this comment
 *       404:
 *         description: Comment not found
 */
router.delete(
  '/:taskId/comments/:commentId',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ params: commentParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { commentId } = authenticatedReq.params as CommentParamsBody;

      await taskService.deleteTaskComment(commentId, user.id, user.organizationId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

export default router;
