import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { AssetService } from '../services/asset.service';
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
  assetId: zod.string().uuid(),
});

const attachmentQuerySchema = zod.object({
  type: zod.enum(['photo', 'receipt', 'manual', 'other']).optional(),
  limit: zod.string().transform(Number).optional(),
  offset: zod.string().transform(Number).optional(),
});

const attachmentIdParamsSchema = zod.object({
  assetId: zod.string().uuid(),
  attachmentId: zod.string().uuid(),
});

// Type definitions
type AttachmentParamsBody = z.infer<typeof attachmentParamsSchema>;
type AttachmentQueryBody = z.infer<typeof attachmentQuerySchema>;
type AttachmentIdParamsBody = z.infer<typeof attachmentIdParamsSchema>;

const router = Router();
const assetService = new AssetService();
const fileStorageService = new FileStorageService();
const malwareScanService = new MalwareScanService();

// Configure multer with security middleware
const upload = createUploadMiddleware('asset');

// Apply common middleware
router.use(authenticateJWT);

/**
 * @swagger
 * /api/assets/{assetId}/attachments:
 *   post:
 *     summary: Upload asset attachment
 *     description: Upload a file attachment for an asset
 *     tags: [Asset Attachments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
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
 *               type:
 *                 type: string
 *                 enum: [photo, receipt, manual, other]
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Attachment uploaded successfully
 *       400:
 *         description: Invalid file or request
 *       404:
 *         description: Asset not found
 *       413:
 *         description: File too large
 *       429:
 *         description: Too many uploads
 */
router.post(
  '/:assetId/attachments',
  requirePermission('update', 'asset', { scope: 'any' }),
  checkUploadsEnabled,
  createUploadRateLimiter('asset'),
  upload.single('file'),
  validateUploadedFile('asset'),
  logFileUpload('asset'),
  validateRequest({ params: attachmentParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params as AttachmentParamsBody;

      if (!authenticatedReq.file) {
        throw new ValidationError('No file provided');
      }

      // Verify asset exists and user has access
      const asset = await assetService.getAssetById(assetId, user.organizationId);
      if (!asset) {
        throw new NotFoundError('Asset not found');
      }

      const file = authenticatedReq.file;
      const attachmentType = authenticatedReq.body.type || 'other';

      // Store file in quarantine first if malware scanning is enabled
      const uploadOptions = {
        allowedMimeTypes: FileStorageService.getAllowedMimeTypes('asset'),
        maxSizeBytes: FileStorageService.getMaxFileSize('asset'),
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
      const attachment = await prisma.assetAttachment.create({
        data: {
          assetId,
          uploadedByUserId: user.id,
          originalFilename: file.originalname,
          storedFilename: fileMetadata.storedFilename,
          filePath: fileMetadata.filePath,
          fileSizeBytes: fileMetadata.fileSizeBytes,
          mimeType: fileMetadata.mimeType,
          attachmentType,
          isPrimary: false,
        },
      });

      logger.info('Asset attachment uploaded', {
        assetId,
        attachmentId: attachment.id,
        filename: file.originalname,
        size: file.size,
        type: attachmentType,
        userId: user.id,
      });

      res.status(201).json({
        id: attachment.id,
        filename: attachment.originalFilename,
        size: attachment.fileSizeBytes,
        type: attachment.attachmentType,
        uploadedAt: attachment.uploadDate,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}/attachments:
 *   get:
 *     summary: List asset attachments
 *     description: Get all attachments for an asset
 *     tags: [Asset Attachments]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [photo, receipt, manual, other]
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
 *         description: Asset not found
 */
router.get(
  '/:assetId/attachments',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ params: attachmentParamsSchema, query: attachmentQuerySchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params as AttachmentParamsBody;
      const query = authenticatedReq.query as AttachmentQueryBody;

      // Verify asset exists and user has access
      const asset = await assetService.getAssetById(assetId, user.organizationId);
      if (!asset) {
        throw new NotFoundError('Asset not found');
      }

      const whereClause: any = {
        assetId,
      };

      if (query.type) {
        whereClause.attachmentType = query.type;
      }

      const [attachments, total] = await Promise.all([
        prisma.assetAttachment.findMany({
          where: whereClause,
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
        prisma.assetAttachment.count({ where: whereClause }),
      ]);

      res.json({
        attachments: attachments.map((att) => ({
          id: att.id,
          filename: att.originalFilename,
          size: att.fileSizeBytes,
          type: att.attachmentType,
          mimeType: att.mimeType,
          isPrimary: att.isPrimary,
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
 * /api/assets/{assetId}/attachments/{attachmentId}:
 *   get:
 *     summary: Download attachment
 *     description: Download a specific attachment
 *     tags: [Asset Attachments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
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
  '/:assetId/attachments/:attachmentId',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ params: attachmentIdParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId, attachmentId } = authenticatedReq.params as AttachmentIdParamsBody;

      // Verify attachment exists and user has access
      const attachment = await prisma.assetAttachment.findFirst({
        where: {
          id: attachmentId,
          assetId,
          asset: {
            organizationId: user.organizationId,
          },
        },
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Get file from storage
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
 * /api/assets/{assetId}/attachments/{attachmentId}:
 *   delete:
 *     summary: Delete attachment
 *     description: Delete a specific attachment
 *     tags: [Asset Attachments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
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
  '/:assetId/attachments/:attachmentId',
  requirePermission('update', 'asset', { scope: 'any' }),
  validateRequest({ params: attachmentIdParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId, attachmentId } = authenticatedReq.params as AttachmentIdParamsBody;

      // Verify attachment exists and user has access
      const attachment = await prisma.assetAttachment.findFirst({
        where: {
          id: attachmentId,
          assetId,
          asset: {
            organizationId: user.organizationId,
          },
        },
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Delete from storage
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
      await prisma.assetAttachment.delete({
        where: { id: attachmentId },
      });

      logger.info('Asset attachment deleted', {
        assetId,
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

/**
 * @swagger
 * /api/assets/{assetId}/attachments/{attachmentId}/primary:
 *   put:
 *     summary: Set primary attachment
 *     description: Set an attachment as the primary photo for the asset
 *     tags: [Asset Attachments]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
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
 *         description: Primary attachment set successfully
 *       404:
 *         description: Attachment not found
 */
router.put(
  '/:assetId/attachments/:attachmentId/primary',
  requirePermission('update', 'asset', { scope: 'any' }),
  validateRequest({ params: attachmentIdParamsSchema }),
  async (req, res: Response, next: NextFunction): Promise<void> => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId, attachmentId } = authenticatedReq.params as AttachmentIdParamsBody;

      // Verify attachment exists and user has access
      const attachment = await prisma.assetAttachment.findFirst({
        where: {
          id: attachmentId,
          assetId,
          attachmentType: 'photo',
          asset: {
            organizationId: user.organizationId,
          },
        },
      });

      if (!attachment) {
        throw new NotFoundError('Photo attachment not found');
      }

      // Unset current primary
      await prisma.assetAttachment.updateMany({
        where: {
          assetId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });

      // Set new primary
      await prisma.assetAttachment.update({
        where: { id: attachmentId },
        data: { isPrimary: true },
      });

      // Update asset's photoPath
      await prisma.asset.update({
        where: { id: assetId },
        data: { photoPath: attachment.filePath },
      });

      res.json({ message: 'Primary attachment updated' });
    } catch (error) {
      next(error);
    }
  },
);

// Error handling middleware for file uploads
router.use(handleUploadErrors as any);

export default router;
