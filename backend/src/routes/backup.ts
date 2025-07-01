import { Router, type Response } from 'express';
import { z } from 'zod';
import { BackupService } from '../services/backup.service';
import { authenticateJWT, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { prisma } from '../lib/prisma';
import type { BackupOptions, RestoreOptions } from '../services/backup.service';

const router = Router();
const backupService = new BackupService();

// Validation schemas
const createBackupSchema = {
  body: z.object({
    type: z.enum(['full', 'database', 'files']).optional().default('full'),
    description: z.string().max(500).optional(),
    includeDatabase: z.boolean().optional(),
    includeFiles: z.boolean().optional(),
  }),
};

const restoreBackupSchema = {
  params: z.object({
    backupId: z.string().uuid(),
  }),
  body: z.object({
    validateChecksum: z.boolean().optional().default(true),
    rollbackOnFailure: z.boolean().optional().default(true),
    dryRun: z.boolean().optional().default(false),
  }),
};

const deleteBackupSchema = {
  params: z.object({
    backupId: z.string().uuid(),
  }),
};

// All backup routes require authentication and OWNER role
router.use(authenticateJWT);
router.use(requireRole('OWNER'));

/**
 * @swagger
 * /api/backup/create:
 *   post:
 *     summary: Create a new backup
 *     description: Create a backup of the database and/or user files (OWNER only)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [full, database, files]
 *                 default: full
 *                 description: Type of backup to create
 *               description:
 *                 type: string
 *                 maxLength: 500
 *                 description: Optional description for the backup
 *               includeDatabase:
 *                 type: boolean
 *                 description: Include database in backup (overrides type)
 *               includeFiles:
 *                 type: boolean
 *                 description: Include files in backup (overrides type)
 *     responses:
 *       201:
 *         description: Backup created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 createdBy:
 *                   type: string
 *                 type:
 *                   type: string
 *                   enum: [full, database, files]
 *                 size:
 *                   type: integer
 *                   description: Size in bytes
 *                 checksum:
 *                   type: string
 *                 databaseType:
 *                   type: string
 *                   enum: [embedded, external]
 *                 fileStorageType:
 *                   type: string
 *                   enum: [local, smb]
 *                 includesDatabase:
 *                   type: boolean
 *                 includesFiles:
 *                   type: boolean
 *                 description:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires OWNER role
 *       500:
 *         description: Internal server error
 */
router.post(
  '/create',
  validateRequest(createBackupSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type, description, includeDatabase, includeFiles } = req.body;
    const authUser = req.user!;
    const organizationId = authUser.organizationId;

    // Fetch full user from database for backup service
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    logger.info('Creating backup', {
      userId: user.id,
      organizationId,
      type,
    });

    const options: BackupOptions = {
      type,
      description,
      includeDatabase,
      includeFiles,
    };

    const backup = await backupService.createBackup(user, organizationId, options);

    res.status(201).json({
      id: backup.id,
      timestamp: backup.timestamp,
      createdBy: backup.createdByEmail,
      type: backup.type,
      size: backup.size,
      checksum: backup.checksum,
      databaseType: backup.databaseType,
      fileStorageType: backup.fileStorageType,
      includesDatabase: backup.includesDatabase,
      includesFiles: backup.includesFiles,
      description: backup.description,
    });
  })
);

/**
 * @swagger
 * /api/backup/list:
 *   get:
 *     summary: List available backups
 *     description: Get a list of all available backups for the organization (OWNER only)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of backups
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                   createdBy:
 *                     type: string
 *                   type:
 *                     type: string
 *                     enum: [full, database, files]
 *                   size:
 *                     type: integer
 *                     description: Size in bytes
 *                   description:
 *                     type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires OWNER role
 */
router.get(
  '/list',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const organizationId = user.organizationId;

    logger.info('Listing backups', {
      userId: user.id,
      organizationId,
    });

    const backups = await backupService.listBackups(organizationId);

    res.json(backups);
  })
);

/**
 * @swagger
 * /api/backup/restore/{backupId}:
 *   post:
 *     summary: Restore from backup
 *     description: Restore database and/or files from a specific backup (OWNER only)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the backup to restore
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               validateChecksum:
 *                 type: boolean
 *                 default: true
 *                 description: Validate backup integrity before restore
 *               rollbackOnFailure:
 *                 type: boolean
 *                 default: true
 *                 description: Rollback changes if restore fails
 *               dryRun:
 *                 type: boolean
 *                 default: false
 *                 description: Perform a dry run without making changes
 *     responses:
 *       200:
 *         description: Restore completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 backupId:
 *                   type: string
 *                 restoredAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid backup or validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires OWNER role
 *       404:
 *         description: Backup not found
 *       500:
 *         description: Restore failed
 */
router.post(
  '/restore/:backupId',
  validateRequest(restoreBackupSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { backupId } = req.params;
    const { validateChecksum, rollbackOnFailure, dryRun } = req.body;
    const authUser = req.user!;
    const organizationId = authUser.organizationId;

    // Fetch full user from database for backup service
    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    logger.info('Restoring from backup', {
      userId: user.id,
      organizationId,
      backupId,
      dryRun,
    });

    const options: RestoreOptions = {
      validateChecksum,
      rollbackOnFailure,
      dryRun,
    };

    await backupService.restoreBackup(backupId!, user, organizationId, options);

    res.json({
      message: dryRun ? 'Dry run completed successfully' : 'Restore completed successfully',
      backupId,
      restoredAt: new Date().toISOString(),
    });
  })
);

/**
 * @swagger
 * /api/backup/{backupId}:
 *   delete:
 *     summary: Delete a backup
 *     description: Delete a specific backup file (OWNER only)
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the backup to delete
 *     responses:
 *       200:
 *         description: Backup deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 backupId:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - requires OWNER role
 *       404:
 *         description: Backup not found
 */
router.delete(
  '/:backupId',
  validateRequest(deleteBackupSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { backupId } = req.params;
    const user = req.user!;
    const organizationId = user.organizationId;

    logger.info('Deleting backup', {
      userId: user.id,
      organizationId,
      backupId,
    });

    await backupService.deleteBackup(backupId!, organizationId);

    res.json({
      message: 'Backup deleted successfully',
      backupId,
    });
  })
);

export default router;