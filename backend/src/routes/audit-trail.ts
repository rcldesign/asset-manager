import { Router } from 'express';
import { authenticateJWT, requirePermission } from '../middleware/auth';
import { validateQuery } from '../middleware/validation';
import { AuditService } from '../services/audit.service';
import { z } from 'zod';
import { ActionType } from '@prisma/client';
import prisma from '../lib/prisma';

const router = Router();
const auditService = new AuditService();

// Validation schema for audit trail query
const auditTrailQuerySchema = z.object({
  model: z.string().optional(),
  recordId: z.string().optional(),
  userId: z.string().uuid().optional(),
  action: z.nativeEnum(ActionType).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

/**
 * @swagger
 * /api/audit-trail:
 *   get:
 *     summary: Query audit trail entries
 *     description: Retrieve audit trail entries with filtering and pagination. Only accessible to OWNER and MANAGER roles.
 *     tags: [Audit Trail]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: model
 *         schema:
 *           type: string
 *         description: Filter by model/entity type (e.g., 'Asset', 'Task')
 *       - in: query
 *         name: recordId
 *         schema:
 *           type: string
 *         description: Filter by specific record ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by user who performed actions
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [CREATE, UPDATE, DELETE, UPDATE_MANY, DELETE_MANY]
 *         description: Filter by action type
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries from this date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter entries up to this date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Audit trail entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditTrail'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       400:
 *         description: Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/',
  authenticateJWT,
  requirePermission('read', 'audit'),
  validateQuery(auditTrailQuerySchema),
  async (req, res, next) => {
    try {
      const filters = {
        model: req.query.model as string | undefined,
        recordId: req.query.recordId as string | undefined,
        userId: req.query.userId as string | undefined,
        action: req.query.action as ActionType | undefined,
        fromDate: req.query.fromDate ? new Date(req.query.fromDate as string) : undefined,
        toDate: req.query.toDate ? new Date(req.query.toDate as string) : undefined,
      };

      const pagination = {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 50,
      };

      const result = await auditService.queryAuditTrail(prisma, filters, pagination);

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/audit-trail/{recordId}:
 *   get:
 *     summary: Get audit trail for a specific record
 *     description: Retrieve all audit trail entries for a specific record ID
 *     tags: [Audit Trail]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *         description: Record ID to get audit trail for
 *     responses:
 *       200:
 *         description: Audit trail entries for the record
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditTrail'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - insufficient permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/:recordId',
  authenticateJWT,
  requirePermission('read', 'audit'),
  async (req, res, next) => {
    try {
      const { recordId } = req.params;

      const result = await auditService.queryAuditTrail(
        prisma,
        { recordId },
        { page: 1, limit: 100 }
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/audit-trail/summary/user/{userId}:
 *   get:
 *     summary: Get user activity summary
 *     description: Get a summary of user activity from the audit trail
 *     tags: [Audit Trail]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to get activity summary for
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 365
 *           default: 30
 *         description: Number of days to include in summary
 *     responses:
 *       200:
 *         description: User activity summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   format: uuid
 *                 period:
 *                   type: object
 *                   properties:
 *                     from:
 *                       type: string
 *                       format: date-time
 *                     to:
 *                       type: string
 *                       format: date-time
 *                 activityByModel:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       creates:
 *                         type: integer
 *                       updates:
 *                         type: integer
 *                       deletes:
 *                         type: integer
 *                 totalActions:
 *                   type: integer
 *                 recentActivity:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AuditTrail'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
  '/summary/user/:userId',
  authenticateJWT,
  requirePermission('read', 'audit'),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - days);

      // Get all entries for the user in the period
      const entries = await prisma.auditTrail.findMany({
        where: {
          userId,
          createdAt: {
            gte: fromDate,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Calculate summary statistics
      const activityByModel: Record<string, { creates: number; updates: number; deletes: number }> = {};
      
      entries.forEach(entry => {
        if (!activityByModel[entry.model]) {
          activityByModel[entry.model] = { creates: 0, updates: 0, deletes: 0 };
        }

        switch (entry.action) {
          case 'CREATE':
            activityByModel[entry.model]!.creates++;
            break;
          case 'UPDATE':
          case 'UPDATE_MANY':
            activityByModel[entry.model]!.updates++;
            break;
          case 'DELETE':
          case 'DELETE_MANY':
            activityByModel[entry.model]!.deletes++;
            break;
        }
      });

      res.json({
        userId,
        period: {
          from: fromDate,
          to: new Date(),
        },
        activityByModel,
        totalActions: entries.length,
        recentActivity: entries.slice(0, 10), // Last 10 activities
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;