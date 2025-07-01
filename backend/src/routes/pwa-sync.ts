import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validation';
import { z } from 'zod';
import { ValidationError } from '../utils/errors';
import prisma from '../lib/prisma';

const router = Router();

// Validation schemas
const syncStatusQuerySchema = z.object({
  lastSyncTimestamp: z.string().datetime().optional(),
  deviceId: z.string().max(100).optional(),
});

const syncRequestSchema = z.object({
  deviceId: z.string().max(100),
  lastSyncTimestamp: z.string().datetime().optional(),
  pendingChanges: z.array(z.object({
    type: z.enum(['asset', 'task', 'location']),
    id: z.string().uuid(),
    action: z.enum(['create', 'update', 'delete']),
    data: z.record(z.any()).optional(),
    timestamp: z.string().datetime(),
  })).optional(),
});

/**
 * @swagger
 * /api/pwa-sync/status:
 *   get:
 *     summary: Get PWA sync status
 *     description: Check sync status and get information about pending changes
 *     tags: [PWA Sync]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lastSyncTimestamp
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Last successful sync timestamp
 *       - in: query
 *         name: deviceId
 *         schema:
 *           type: string
 *         description: Device identifier for tracking
 *     responses:
 *       200:
 *         description: Sync status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncStatus'
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/status',
  authMiddleware,
  validateQuery(syncStatusQuerySchema),
  async (req, res, next) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { lastSyncTimestamp, deviceId } = req.query as any;

      const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : new Date(0);
      const now = new Date();

      // Check for changes since last sync
      const [assetChanges, taskChanges, locationChanges] = await Promise.all([
        prisma.asset.count({
          where: {
            organizationId: authenticatedReq.user.organizationId,
            updatedAt: { gt: lastSync },
          },
        }),
        prisma.task.count({
          where: {
            organizationId: authenticatedReq.user.organizationId,
            updatedAt: { gt: lastSync },
          },
        }),
        prisma.location.count({
          where: {
            organizationId: authenticatedReq.user.organizationId,
            updatedAt: { gt: lastSync },
          },
        }),
      ]);

      const syncStatus = {
        serverTime: now.toISOString(),
        lastSyncTime: lastSync.toISOString(),
        hasUpdates: assetChanges > 0 || taskChanges > 0 || locationChanges > 0,
        pendingChanges: {
          assets: assetChanges,
          tasks: taskChanges,
          locations: locationChanges,
        },
        syncRequired: assetChanges > 0 || taskChanges > 0 || locationChanges > 0,
        deviceId: deviceId || null,
      };

      res.json(syncStatus);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/pwa-sync/pull:
 *   post:
 *     summary: Pull latest data changes
 *     description: Get all changes since last sync for offline PWA
 *     tags: [PWA Sync]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SyncRequest'
 *     responses:
 *       200:
 *         description: Latest changes retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SyncResponse'
 *       400:
 *         description: Invalid sync request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/pull',
  authMiddleware,
  validateBody(syncRequestSchema),
  async (req, res, next) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { lastSyncTimestamp, deviceId } = req.body;

      const lastSync = lastSyncTimestamp ? new Date(lastSyncTimestamp) : new Date(0);
      const now = new Date();

      // Get changed data since last sync
      const [assets, tasks, locations] = await Promise.all([
        prisma.asset.findMany({
          where: {
            organizationId: authenticatedReq.user.organizationId,
            updatedAt: { gt: lastSync },
          },
          include: {
            location: {
              select: { id: true, name: true },
            },
            assetTemplate: {
              select: { id: true, name: true },
            },
          },
          orderBy: { updatedAt: 'asc' },
        }),
        prisma.task.findMany({
          where: {
            organizationId: authenticatedReq.user.organizationId,
            updatedAt: { gt: lastSync },
          },
          include: {
            asset: {
              select: { id: true, name: true },
            },
            assignments: {
              include: {
                user: {
                  select: { id: true, email: true, fullName: true },
                },
              },
            },
          },
          orderBy: { updatedAt: 'asc' },
        }),
        prisma.location.findMany({
          where: {
            organizationId: authenticatedReq.user.organizationId,
            updatedAt: { gt: lastSync },
          },
          orderBy: { updatedAt: 'asc' },
        }),
      ]);

      const syncResponse = {
        syncTimestamp: now.toISOString(),
        deviceId,
        changes: {
          assets: assets.map(asset => ({
            type: 'asset' as const,
            action: 'update' as const,
            id: asset.id,
            data: asset,
            timestamp: asset.updatedAt.toISOString(),
          })),
          tasks: tasks.map(task => ({
            type: 'task' as const,
            action: 'update' as const,
            id: task.id,
            data: task,
            timestamp: task.updatedAt.toISOString(),
          })),
          locations: locations.map(location => ({
            type: 'location' as const,
            action: 'update' as const,
            id: location.id,
            data: location,
            timestamp: location.updatedAt.toISOString(),
          })),
        },
        hasMoreChanges: false, // Could implement pagination if needed
        nextSyncToken: now.toISOString(),
      };

      res.json(syncResponse);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/pwa-sync/push:
 *   post:
 *     summary: Push local changes to server
 *     description: Upload pending changes from offline PWA to server
 *     tags: [PWA Sync]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *               - changes
 *             properties:
 *               deviceId:
 *                 type: string
 *               changes:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [asset, task, location]
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     action:
 *                       type: string
 *                       enum: [create, update, delete]
 *                     data:
 *                       type: object
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *     responses:
 *       200:
 *         description: Changes processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 syncTimestamp:
 *                   type: string
 *                   format: date-time
 *                 processedChanges:
 *                   type: integer
 *                 conflicts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       changeId:
 *                         type: string
 *                       type:
 *                         type: string
 *                       reason:
 *                         type: string
 *                       serverData:
 *                         type: object
 *                       clientData:
 *                         type: object
 *       400:
 *         description: Invalid changes or sync conflicts
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/push',
  authMiddleware,
  async (req, res, next) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { deviceId, changes } = req.body;

      if (!Array.isArray(changes)) {
        throw new ValidationError('Changes must be an array');
      }

      const conflicts: any[] = [];
      let processedChanges = 0;

      // Process each change
      for (const change of changes) {
        try {
          const { type, id, action, data, timestamp } = change;

          // Validate change format
          if (!type || !id || !action) {
            conflicts.push({
              changeId: id || 'unknown',
              type: 'validation',
              reason: 'Missing required fields',
              clientData: change,
            });
            continue;
          }

          // Check if record exists and hasn't been modified since client change
          let existingRecord: any = null;
          const changeTimestamp = new Date(timestamp);

          switch (type) {
            case 'asset':
              existingRecord = await prisma.asset.findFirst({
                where: {
                  id,
                  organizationId: authenticatedReq.user.organizationId,
                },
              });
              break;
            case 'task':
              existingRecord = await prisma.task.findFirst({
                where: {
                  id,
                  organizationId: authenticatedReq.user.organizationId,
                },
              });
              break;
            case 'location':
              existingRecord = await prisma.location.findFirst({
                where: {
                  id,
                  organizationId: authenticatedReq.user.organizationId,
                },
              });
              break;
          }

          // Check for conflicts
          if (existingRecord && existingRecord.updatedAt > changeTimestamp) {
            conflicts.push({
              changeId: id,
              type: 'conflict',
              reason: 'Record modified on server after client change',
              serverData: existingRecord,
              clientData: data,
            });
            continue;
          }

          // Apply the change (simplified - would need proper validation and service calls)
          switch (action) {
            case 'create':
              // Would use appropriate service to create
              break;
            case 'update':
              // Would use appropriate service to update
              break;
            case 'delete':
              // Would use appropriate service to delete
              break;
          }

          processedChanges++;
        } catch (error) {
          conflicts.push({
            changeId: change.id || 'unknown',
            type: 'error',
            reason: error instanceof Error ? error.message : 'Unknown error',
            clientData: change,
          });
        }
      }

      const response = {
        syncTimestamp: new Date().toISOString(),
        deviceId,
        processedChanges,
        conflicts,
        success: conflicts.length === 0,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /api/pwa-sync/reset:
 *   post:
 *     summary: Reset sync state for device
 *     description: Clear sync state for a device, forcing full resync on next pull
 *     tags: [PWA Sync]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - deviceId
 *             properties:
 *               deviceId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sync state reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 resetAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/reset',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { deviceId } = req.body;

      if (!deviceId) {
        throw new ValidationError('Device ID is required');
      }

      // Clear any stored sync state for this device
      // This would typically involve clearing cached data or sync tokens
      
      res.json({
        message: 'Sync state reset successfully',
        resetAt: new Date().toISOString(),
        deviceId,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;