import { Router, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { AssetService } from '../services/asset.service';
import { FileStorageService } from '../services/file-storage.service';
import { NotificationService } from '../services/notification.service';
import { ValidationError, NotFoundError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { z as zod } from 'zod';
import type { AssetCategory, AssetStatus } from '@prisma/client';
import { createUploadMiddleware } from '../middleware/fileUpload';

// Configure multer with security middleware
const upload = createUploadMiddleware('asset');

// Validation schemas
const assetCreateSchema = zod.object({
  name: zod.string().min(1).max(255),
  description: zod.string().optional(),
  category: zod.enum([
    'HARDWARE',
    'SOFTWARE',
    'FURNITURE',
    'VEHICLE',
    'EQUIPMENT',
    'PROPERTY',
    'OTHER',
  ]),
  status: zod
    .enum(['OPERATIONAL', 'MAINTENANCE', 'REPAIR', 'RETIRED', 'DISPOSED', 'LOST'])
    .optional(),
  serialNumber: zod.string().optional(),
  modelNumber: zod.string().optional(),
  manufacturer: zod.string().optional(),
  purchaseDate: zod.string().datetime().optional(),
  purchasePrice: zod.number().optional(),
  warrantyExpiry: zod.string().datetime().optional(),
  locationId: zod.string().uuid().optional(),
  assetTemplateId: zod.string().uuid().optional(),
  parentId: zod.string().uuid().optional(),
  customFields: zod.record(zod.unknown()).optional(),
  tags: zod.array(zod.string()).optional(),
  qrCode: zod.string().optional(),
  link: zod.string().url().optional(),
});

const assetUpdateSchema = assetCreateSchema.partial();

const assetParamsSchema = zod.object({
  assetId: zod.string().uuid(),
});

const assetQuerySchema = zod.object({
  page: zod.string().transform(Number).optional(),
  limit: zod.string().transform(Number).optional(),
  search: zod.string().optional(),
  category: zod
    .enum(['HARDWARE', 'SOFTWARE', 'FURNITURE', 'VEHICLE', 'EQUIPMENT', 'PROPERTY', 'OTHER'])
    .optional(),
  status: zod
    .enum(['OPERATIONAL', 'MAINTENANCE', 'REPAIR', 'RETIRED', 'DISPOSED', 'LOST'])
    .optional(),
  locationId: zod.string().uuid().optional(),
  parentId: zod.string().uuid().optional(),
  includeChildren: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  tags: zod.string().optional(), // Comma-separated tags
});

const bulkOperationSchema = zod.object({
  assetIds: zod.array(zod.string().uuid()),
  operation: zod.enum(['delete', 'updateStatus', 'updateCategory', 'move']),
  data: zod.record(zod.unknown()).optional(),
});

const assetTreeQuerySchema = zod.object({
  rootId: zod.string().uuid().optional(),
});

const assetStatsQuerySchema = zod.object({});

// Type definitions
type AssetCreateBody = z.infer<typeof assetCreateSchema>;
type AssetUpdateBody = z.infer<typeof assetUpdateSchema>;
type AssetParamsBody = z.infer<typeof assetParamsSchema>;
type AssetQueryBody = z.infer<typeof assetQuerySchema>;
type BulkOperationBody = z.infer<typeof bulkOperationSchema>;
type AssetTreeQueryBody = z.infer<typeof assetTreeQuerySchema>;

const router = Router();
const assetService = new AssetService();
const fileStorageService = new FileStorageService();
const notificationService = new NotificationService(prisma);

// All asset routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/assets:
 *   get:
 *     summary: List assets
 *     description: Get a paginated list of assets with optional filtering
 *     tags: [Assets]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in name, description, serial number
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [HARDWARE, SOFTWARE, FURNITURE, VEHICLE, EQUIPMENT, PROPERTY, OTHER]
 *         description: Filter by category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPERATIONAL, MAINTENANCE, REPAIR, RETIRED, DISPOSED, LOST]
 *         description: Filter by status
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by location
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by parent asset
 *       - in: query
 *         name: includeChildren
 *         schema:
 *           type: boolean
 *         description: Include child assets in results
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated tags to filter by
 *     responses:
 *       200:
 *         description: Assets retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 assets:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Asset'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get(
  '/',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ query: assetQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as AssetQueryBody;

      const page = query.page || 1;
      const limit = Math.min(query.limit || 20, 100);

      const filters = {
        name: query.search,
        category: query.category as AssetCategory | undefined,
        status: query.status as AssetStatus | undefined,
        locationId: query.locationId,
        parentId: query.parentId,
        includeChildren: query.includeChildren,
        tags: query.tags ? query.tags.split(',') : undefined,
        page,
        limit,
      };

      const result = await assetService.findAssets(user.organizationId, filters);

      res.json({
        assets: result.data,
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
 * /api/assets:
 *   post:
 *     summary: Create asset
 *     description: Create a new asset
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssetCreate'
 *     responses:
 *       201:
 *         description: Asset created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Asset'
 */
router.post(
  '/',
  requirePermission('create', 'asset', { scope: 'any' }),
  validateRequest({ body: assetCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const body = authenticatedReq.body as AssetCreateBody;

      const asset = await assetService.createAsset({
        ...body,
        organizationId: user.organizationId,
        purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
        warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : undefined,
      });

      // Send notification for asset creation
      await notificationService.createNotification({
        organizationId: user.organizationId,
        userId: user.id,
        assetId: asset.id,
        type: 'asset-maintenance-due', // Using closest available type
        title: 'Asset Created',
        message: `Asset "${asset.name}" has been created`,
        sendInApp: true,
      });

      res.status(201).json(asset);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/tree:
 *   get:
 *     summary: Get asset tree
 *     description: Get assets organized in a hierarchical tree structure
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rootId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Root asset ID (optional)
 *     responses:
 *       200:
 *         description: Asset tree retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AssetTree'
 */
router.get(
  '/tree',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ query: assetTreeQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as AssetTreeQueryBody;

      const tree = await assetService.getAssetTree(user.organizationId, query.rootId);
      res.json(tree);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/stats:
 *   get:
 *     summary: Get asset statistics
 *     description: Get comprehensive statistics about assets
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Asset statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 byCategory:
 *                   type: object
 *                 byStatus:
 *                   type: object
 *                 warrantyExpiring:
 *                   type: integer
 */
router.get(
  '/stats',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ query: assetStatsQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const stats = await assetService.getAssetStatistics(user.organizationId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}:
 *   get:
 *     summary: Get asset by ID
 *     description: Retrieve a specific asset by ID
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Asset retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Asset'
 *       404:
 *         description: Asset not found
 */
router.get(
  '/:assetId',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ params: assetParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params as AssetParamsBody;

      const asset = await assetService.getAssetById(assetId, user.organizationId);
      if (!asset) {
        throw new NotFoundError('Asset not found');
      }

      res.json(asset);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}:
 *   put:
 *     summary: Update asset
 *     description: Update an existing asset
 *     tags: [Assets]
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
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssetUpdate'
 *     responses:
 *       200:
 *         description: Asset updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Asset'
 *       404:
 *         description: Asset not found
 */
router.put(
  '/:assetId',
  requirePermission('update', 'asset', { scope: 'any' }),
  validateRequest({ params: assetParamsSchema, body: assetUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params as AssetParamsBody;
      const body = authenticatedReq.body as AssetUpdateBody;

      const asset = await assetService.updateAsset(
        assetId,
        {
          ...body,
          purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
          warrantyExpiry: body.warrantyExpiry ? new Date(body.warrantyExpiry) : undefined,
        },
        user.organizationId,
      );

      res.json(asset);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}:
 *   delete:
 *     summary: Delete asset
 *     description: Delete an asset (with optional cascade)
 *     tags: [Assets]
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
 *         name: cascade
 *         schema:
 *           type: boolean
 *         description: Whether to delete child assets as well
 *     responses:
 *       204:
 *         description: Asset deleted successfully
 *       404:
 *         description: Asset not found
 */
router.delete(
  '/:assetId',
  requirePermission('delete', 'asset', { scope: 'any' }),
  validateRequest({ params: assetParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params as AssetParamsBody;
      const cascade = authenticatedReq.query.cascade === 'true';

      await assetService.deleteAsset(assetId, user.organizationId, cascade);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}/files:
 *   post:
 *     summary: Upload asset file
 *     description: Upload a file attachment to an asset
 *     tags: [Assets]
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
 *               attachmentType:
 *                 type: string
 *                 description: Type of attachment (photo, receipt, manual, etc.)
 *               isPrimary:
 *                 type: boolean
 *                 description: Whether this is the primary image for the asset
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssetAttachment'
 */
router.post(
  '/:assetId/files',
  requirePermission('update', 'asset', { scope: 'any' }),
  validateRequest({ params: assetParamsSchema }),
  upload.single('file'),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId } = authenticatedReq.params as AssetParamsBody;
      const file = authenticatedReq.file;
      const { attachmentType = 'general', isPrimary = false } = authenticatedReq.body;

      if (!file) {
        throw new ValidationError('No file provided');
      }

      // Verify asset exists and belongs to organization
      const asset = await assetService.getAssetById(assetId, user.organizationId);
      if (!asset) {
        throw new NotFoundError('Asset not found');
      }

      // Upload file to storage
      const fileMetadata = await fileStorageService.uploadFile(file, {
        allowedMimeTypes: FileStorageService.getAllowedMimeTypes('asset'),
        maxSizeBytes: FileStorageService.getMaxFileSize('asset'),
      });

      // Create asset attachment record
      const attachment = await prisma.assetAttachment.create({
        data: {
          assetId,
          uploadedByUserId: user.id,
          originalFilename: fileMetadata.originalFilename,
          storedFilename: fileMetadata.storedFilename,
          filePath: fileMetadata.filePath,
          fileSizeBytes: fileMetadata.fileSizeBytes,
          mimeType: fileMetadata.mimeType,
          attachmentType,
          isPrimary: isPrimary === 'true',
        },
      });

      logger.info('Asset file uploaded', {
        assetId,
        attachmentId: attachment.id,
        filename: fileMetadata.originalFilename,
        size: fileMetadata.fileSizeBytes,
        userId: user.id,
      });

      res.status(201).json(attachment);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}/files/{attachmentId}:
 *   get:
 *     summary: Download asset file
 *     description: Download a file attachment from an asset
 *     tags: [Assets]
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
 *         description: File downloaded successfully
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get(
  '/:assetId/files/:attachmentId',
  requirePermission('read', 'asset', { scope: 'any' }),
  validateRequest({ params: assetParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId, attachmentId } = authenticatedReq.params;

      // Verify asset exists and belongs to organization
      const asset = await assetService.getAssetById(assetId!, user.organizationId);
      if (!asset) {
        throw new NotFoundError('Asset not found');
      }

      // Get attachment record
      const attachment = await prisma.assetAttachment.findFirst({
        where: {
          id: attachmentId,
          assetId,
        },
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Get file from storage
      const fileMetadata = await fileStorageService.getFileMetadata(attachment.id);
      if (!fileMetadata) {
        throw new NotFoundError('File not found in storage');
      }

      const { stream } = await fileStorageService.downloadFile(attachment.id);

      // Set response headers
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalFilename}"`);
      res.setHeader('Content-Length', attachment.fileSizeBytes);

      // Stream file to response
      stream.pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/assets/{assetId}/files/{attachmentId}:
 *   delete:
 *     summary: Delete asset file
 *     description: Delete a file attachment from an asset
 *     tags: [Assets]
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
 *         description: File deleted successfully
 */
router.delete(
  '/:assetId/files/:attachmentId',
  requirePermission('update', 'asset', { scope: 'any' }),
  validateRequest({ params: assetParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetId, attachmentId } = authenticatedReq.params;

      // Verify asset exists and belongs to organization
      const asset = await assetService.getAssetById(assetId!, user.organizationId);
      if (!asset) {
        throw new NotFoundError('Asset not found');
      }

      // Get attachment record
      const attachment = await prisma.assetAttachment.findFirst({
        where: {
          id: attachmentId,
          assetId,
        },
      });

      if (!attachment) {
        throw new NotFoundError('Attachment not found');
      }

      // Delete from storage
      try {
        await fileStorageService.deleteFile(attachment.id);
      } catch (error) {
        logger.warn('Failed to delete file from storage', {
          attachmentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with database deletion even if storage deletion fails
      }

      // Delete from database
      await prisma.assetAttachment.delete({
        where: { id: attachmentId },
      });

      logger.info('Asset file deleted', {
        assetId,
        attachmentId,
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
 * /api/assets/bulk:
 *   post:
 *     summary: Bulk asset operations
 *     description: Perform bulk operations on multiple assets
 *     tags: [Assets]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               assetIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               operation:
 *                 type: string
 *                 enum: [delete, updateStatus, updateCategory, move]
 *               data:
 *                 type: object
 *                 description: Operation-specific data
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
router.post(
  '/bulk',
  requirePermission('update', 'asset', { scope: 'any' }),
  validateRequest({ body: bulkOperationSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { assetIds, operation, data } = authenticatedReq.body as BulkOperationBody;

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const assetId of assetIds) {
        try {
          switch (operation) {
            case 'delete':
              await assetService.deleteAsset(assetId, user.organizationId, false);
              break;
            case 'updateStatus':
              if (data?.status) {
                await assetService.updateAssetStatus(
                  assetId,
                  data.status as AssetStatus,
                  user.organizationId,
                );
              }
              break;
            case 'updateCategory':
              if (data?.category) {
                await assetService.updateAsset(
                  assetId,
                  { category: data.category as AssetCategory },
                  user.organizationId,
                );
              }
              break;
            case 'move':
              if (data?.locationId) {
                await assetService.updateAsset(
                  assetId,
                  { locationId: data.locationId as string },
                  user.organizationId,
                );
              }
              break;
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
          success++;
        } catch (error) {
          failed++;
          errors.push(
            `Asset ${assetId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      logger.info('Bulk asset operation completed', {
        operation,
        total: assetIds.length,
        success,
        failed,
        userId: user.id,
      });

      res.json({ success, failed, errors });
    } catch (error) {
      next(error);
    }
  },
);


export default router;
