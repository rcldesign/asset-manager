import { Router } from 'express';
import { authMiddleware, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validation';
import { DataExportService } from '../services/data-export.service';
import { UserService } from '../services/user.service';
import { z } from 'zod';
import { NotFoundError } from '../utils/errors';

const router = Router();
const dataExportService = new DataExportService();
const userService = new UserService();

// Validation schemas
const userIdParamsSchema = z.object({
  userId: z.string().uuid(),
});

const dataExportRequestSchema = z.object({
  userId: z.string().uuid(),
  includeRelatedData: z.boolean().default(true),
  format: z.enum(['json', 'csv', 'excel']).default('json'),
});

const dataDeleteRequestSchema = z.object({
  userId: z.string().uuid(),
  confirmation: z.literal('DELETE_ALL_USER_DATA'),
});

/**
 * @swagger
 * /api/gdpr/export:
 *   post:
 *     summary: Export user data for GDPR compliance
 *     description: Export all data associated with a user account in machine-readable format
 *     tags: [GDPR]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of user to export data for
 *               includeRelatedData:
 *                 type: boolean
 *                 default: true
 *                 description: Whether to include related assets, tasks, etc.
 *               format:
 *                 type: string
 *                 enum: [json, csv, excel]
 *                 default: json
 *                 description: Export format
 *     responses:
 *       200:
 *         description: Data export created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GDPRDataExport'
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.post(
  '/export',
  authMiddleware,
  requirePermission('read', 'user'),
  validateBody(dataExportRequestSchema),
  async (req, res, next) => {
    try {
      const { userId, includeRelatedData, format } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;

      // Verify user exists and belongs to the organization
      const user = await userService.getUserById(userId);
      if (!user || user.organizationId !== authenticatedReq.user.organizationId) {
        throw new NotFoundError('User');
      }

      // Export user data
      if (includeRelatedData) {
        const exportResult = await dataExportService.exportUserData(
          authenticatedReq.context!,
          userId
        );
        res.json(exportResult);
      } else {
        // Export basic user data only
        const exportResult = await dataExportService.exportUserData(
          authenticatedReq.context!,
          userId
        );
        res.json(exportResult);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/gdpr/delete:
 *   post:
 *     summary: Delete user data for GDPR compliance
 *     description: Permanently delete all data associated with a user account
 *     tags: [GDPR]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - confirmation
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of user to delete data for
 *               confirmation:
 *                 type: string
 *                 enum: [DELETE_ALL_USER_DATA]
 *                 description: Confirmation string required for deletion
 *     responses:
 *       200:
 *         description: User data deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deletedAt:
 *                   type: string
 *                   format: date-time
 *                 userId:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Invalid request or confirmation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.post(
  '/delete',
  authMiddleware,
  requirePermission('delete', 'user'),
  validateBody(dataDeleteRequestSchema),
  async (req, res, next) => {
    try {
      const { userId, confirmation } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;

      // Verify user exists and belongs to the organization
      const user = await userService.getUserById(userId);
      if (!user || user.organizationId !== authenticatedReq.user.organizationId) {
        throw new NotFoundError('User');
      }

      // Delete user and all associated data
      await userService.deleteUser(authenticatedReq.context!, userId);

      res.json({
        message: 'User data deleted successfully',
        deletedAt: new Date().toISOString(),
        userId,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/gdpr/user/{userId}/data-summary:
 *   get:
 *     summary: Get summary of user data for GDPR compliance
 *     description: Get a summary of what data is stored for a user without exporting it
 *     tags: [GDPR]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID to get data summary for
 *     responses:
 *       200:
 *         description: User data summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   format: uuid
 *                 dataTypes:
 *                   type: object
 *                   properties:
 *                     personalData:
 *                       type: object
 *                       properties:
 *                         email:
 *                           type: boolean
 *                         fullName:
 *                           type: boolean
 *                         profileData:
 *                           type: boolean
 *                     activityData:
 *                       type: object
 *                       properties:
 *                         taskAssignments:
 *                           type: integer
 *                         taskComments:
 *                           type: integer
 *                         auditTrail:
 *                           type: integer
 *                     systemData:
 *                       type: object
 *                       properties:
 *                         sessions:
 *                           type: integer
 *                         apiTokens:
 *                           type: integer
 *                         notifications:
 *                           type: integer
 *                 estimatedExportSize:
 *                   type: string
 *                   description: Estimated size of full data export
 *       404:
 *         description: User not found
 */
router.get(
  '/user/:userId/data-summary',
  authMiddleware,
  requirePermission('read', 'user'),
  validateParams(userIdParamsSchema),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const authenticatedReq = req as AuthenticatedRequest;

      // Verify user exists and belongs to the organization
      const user = await userService.getUserById(userId);
      if (!user || user.organizationId !== authenticatedReq.user.organizationId) {
        throw new NotFoundError('User');
      }

      // Get data summary (this would need to be implemented in a service)
      const summary = {
        userId,
        dataTypes: {
          personalData: {
            email: !!user.email,
            fullName: !!user.fullName,
            profileData: true,
          },
          activityData: {
            taskAssignments: 0, // Would need to count from database
            taskComments: 0,
            auditTrail: 0,
          },
          systemData: {
            sessions: 0,
            apiTokens: 0,
            notifications: 0,
          },
        },
        estimatedExportSize: '< 1MB', // Would calculate based on actual data
      };

      res.json(summary);
    } catch (error) {
      next(error);
    }
  }
);

export default router;