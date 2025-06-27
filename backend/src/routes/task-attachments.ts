import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { TaskService } from '../services/task.service';
import { FileStorageService } from '../services/file-storage.service';
import { MalwareScanService } from '../services/file-validation.service';
import { NotFoundError, ValidationError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { z as zod } from 'zod';
import { config } from '../config';
import {
  createUploadMiddleware,
  validateUploadedFile,
  createUploadRateLimiter,
  handleUploadErrors,
  checkUploadsEnabled,
  logFileUpload,
} from '../middleware/fileUpload';

// Validation schemas
const attachmentParamsSchema = zod.object({
  taskId: zod.string().uuid(),
});

const attachmentQuerySchema = zod.object({
  limit: zod.string().transform(Number).optional(),
  offset: zod.string().transform(Number).optional(),
});

const attachmentIdParamsSchema = zod.object({
  taskId: zod.string().uuid(),
  attachmentId: zod.string().uuid(),
});

// Type definitions
type AttachmentParamsBody = z.infer<typeof attachmentParamsSchema>;
type AttachmentQueryBody = z.infer<typeof attachmentQuerySchema>;
type AttachmentIdParamsBody = z.infer<typeof attachmentIdParamsSchema>;

const router = Router();
const taskService = new TaskService();
const fileStorageService = new FileStorageService();
const malwareScanService = new MalwareScanService();

// Configure multer with security middleware
const upload = createUploadMiddleware('task');

// Apply common middleware
router.use(authenticateJWT);

/**
 * @swagger
 * /api/tasks/{taskId}/attachments:
 *   post:
 *     summary: Upload task attachment
 *     description: Upload a file attachment for a task
 *     tags: [Task Attachments]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Attachment uploaded successfully
 *       400:
 *         description: Invalid file or request
 *       404:
 *         description: Task not found
 *       413:
 *         description: File too large
 *       429:
 *         description: Too many uploads
 */
router.post(
  '/:taskId/attachments',
  requirePermission('update', 'task', { scope: 'any' }),
  checkUploadsEnabled,
  createUploadRateLimiter('task'),
  upload.single('file'),
  validateUploadedFile('task'),
  logFileUpload('task'),
  validateRequest({ params: attachmentParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as AttachmentParamsBody;

      if (!authenticatedReq.file) {
        throw new ValidationError('No file provided');
      }

      // Verify task exists and user has access
      const task = await taskService.getTaskById(taskId, user.organizationId);
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      const file = authenticatedReq.file;

      // Store file in quarantine first if malware scanning is enabled
      const uploadOptions = {
        allowedMimeTypes: FileStorageService.getAllowedMimeTypes('task'),
        maxSizeBytes: FileStorageService.getMaxFileSize('task'),
      };

      let fileMetadata;
      if (config.security.enableMalwareScanning) {
        // Store in quarantine directory
        fileMetadata = await fileStorageService.uploadFile(file, {
          ...uploadOptions,
          preserveOriginalName: false,
        });

        // Queue for malware scanning
        try {
          const scanResult = await malwareScanService.scanFile(fileMetadata.filePath);
          if (!scanResult.clean) {
            // Delete infected file
            await fileStorageService.deleteFile(fileMetadata.id);
            throw new ValidationError('File failed security scan');
          }

          // Move from quarantine to permanent storage
          // In a real implementation, this would be done by a background job
        } catch (error) {
          logger.error(
            'Malware scan failed',
            error instanceof Error ? error : new Error(String(error)),
          );
          // Delete file if scan fails
          await fileStorageService.deleteFile(fileMetadata.id);
          throw new Error('File security scan failed');
        }
      } else {
        // Direct upload without scanning
        fileMetadata = await fileStorageService.uploadFile(file, uploadOptions);
      }

      // Create database record
      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId,
          uploadedByUserId: user.id,
          originalFilename: file.originalname,
          storedFilename: fileMetadata.storedFilename,
          fileSizeBytes: fileMetadata.fileSizeBytes,
          mimeType: fileMetadata.mimeType,
        },
      });

      logger.info('Task attachment uploaded', {
        taskId,
        attachmentId: attachment.id,
        filename: file.originalname,
        size: file.size,
        userId: user.id,
      });

      res.status(201).json({
        id: attachment.id,
        filename: attachment.originalFilename,
        size: attachment.fileSizeBytes,
        uploadedAt: attachment.uploadDate,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/attachments:
 *   get:
 *     summary: List task attachments
 *     description: Get all attachments for a task
 *     tags: [Task Attachments]
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
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *     responses:
 *       200:
 *         description: Attachments retrieved successfully
 *       404:
 *         description: Task not found
 */
router.get(
  '/:taskId/attachments',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({ params: attachmentParamsSchema, query: attachmentQuerySchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId } = authenticatedReq.params as AttachmentParamsBody;
      const query = authenticatedReq.query as AttachmentQueryBody;

      // Verify task exists and user has access
      const task = await taskService.getTaskById(taskId, user.organizationId);
      if (!task) {
        throw new NotFoundError('Task not found');
      }

      const [attachments, total] = await Promise.all([
        prisma.taskAttachment.findMany({
          where: { taskId },
          include: {
            uploadedBy: {
              select: {
                id: true,
                email: true,
                fullName: true,
              },
            },
          },
          orderBy: {
            uploadDate: 'desc',
          },
          take: query.limit || 20,
          skip: query.offset || 0,
        }),
        prisma.taskAttachment.count({ where: { taskId } }),
      ]);

      res.json({
        attachments: attachments.map((att) => ({
          id: att.id,
          filename: att.originalFilename,
          size: att.fileSizeBytes,
          mimeType: att.mimeType,
          uploadedAt: att.uploadDate,
          uploadedBy: att.uploadedBy,
        })),
        total,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/attachments/{attachmentId}:
 *   get:
 *     summary: Download attachment
 *     description: Download a specific attachment
 *     tags: [Task Attachments]
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
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Attachment not found
 */
router.get(
  '/:taskId/attachments/:attachmentId',
  requirePermission('read', 'task', { scope: 'any' }),
  validateRequest({ params: attachmentIdParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId, attachmentId } = authenticatedReq.params as AttachmentIdParamsBody;

      // Verify attachment exists and user has access
      const attachment = await prisma.taskAttachment.findFirst({
        where: {
          id: attachmentId,
          taskId,
          task: {
            organizationId: user.organizationId,
          },
        },
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Get file from storage using the attachment ID
      const fileDownload = await fileStorageService.downloadFile(attachment.id);

      // Set appropriate headers
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Length', attachment.fileSizeBytes.toString());
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(attachment.originalFilename)}"`,
      );

      // Stream file to response
      fileDownload.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/tasks/{taskId}/attachments/{attachmentId}:
 *   delete:
 *     summary: Delete attachment
 *     description: Delete a specific attachment
 *     tags: [Task Attachments]
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
 *         name: attachmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Attachment deleted successfully
 *       404:
 *         description: Attachment not found
 */
router.delete(
  '/:taskId/attachments/:attachmentId',
  requirePermission('update', 'task', { scope: 'any' }),
  validateRequest({ params: attachmentIdParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { taskId, attachmentId } = authenticatedReq.params as AttachmentIdParamsBody;

      // Verify attachment exists and user has access
      const attachment = await prisma.taskAttachment.findFirst({
        where: {
          id: attachmentId,
          taskId,
          task: {
            organizationId: user.organizationId,
          },
        },
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Delete from storage using the attachment ID
      try {
        await fileStorageService.deleteFile(attachment.id);
      } catch (error) {
        logger.error(
          'Failed to delete file from storage',
          error instanceof Error ? error : new Error(String(error)),
        );
        // Continue with database deletion even if file deletion fails
      }

      // Delete from database
      await prisma.taskAttachment.delete({
        where: { id: attachmentId },
      });

      logger.info('Task attachment deleted', {
        taskId,
        attachmentId,
        filename: attachment.originalFilename,
        userId: user.id,
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// Error handling middleware for file uploads
router.use(handleUploadErrors);

export default router;
