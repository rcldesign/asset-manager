import { Router, type Response, type NextFunction } from 'express';
import { AssetTemplateService } from '../services/asset-template.service';
import { NotFoundError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { z as zod } from 'zod';

// Validation schemas
const assetTemplateCreateSchema = zod.object({
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
  defaultFields: zod.record(zod.unknown()).optional(),
  customFields: zod.record(zod.unknown()).optional(),
});

const assetTemplateUpdateSchema = assetTemplateCreateSchema.partial().extend({
  isActive: zod.boolean().optional(),
});

const assetTemplateParamsSchema = zod.object({
  templateId: zod.string().uuid(),
});

const assetTemplateQuerySchema = zod.object({
  page: zod.union([zod.string(), zod.number()]).transform(Number).optional(),
  limit: zod.union([zod.string(), zod.number()]).transform(Number).optional(),
  search: zod.string().optional(),
  category: zod
    .enum(['HARDWARE', 'SOFTWARE', 'FURNITURE', 'VEHICLE', 'EQUIPMENT', 'PROPERTY', 'OTHER'])
    .optional(),
  hasCustomField: zod.string().optional(),
  customFieldSearch: zod.string().optional(),
  includeInactive: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
  sortBy: zod.enum(['name', 'category', 'createdAt', 'updatedAt']).optional(),
  sortOrder: zod.enum(['asc', 'desc']).optional(),
});

const assetTemplateCloneSchema = zod.object({
  name: zod.string().min(1).max(255),
  description: zod.string().optional(),
});

const assetTemplateImportObjectSchema = zod.object({
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
  defaultFields: zod.record(zod.unknown()).optional(),
  customFields: zod.record(zod.unknown()).optional(),
  isActive: zod.boolean().optional(),
});

const assetTemplateImportSchema = zod.object({
  templates: zod.array(assetTemplateImportObjectSchema),
  conflictStrategy: zod.enum(['fail', 'skip', 'rename']).optional(),
});

const customFieldValidationSchema = zod.object({
  values: zod.record(zod.unknown()),
});

const assetTemplateSimpleQuerySchema = zod.object({
  includeInactive: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

// Type definitions
type AssetTemplateCreateBody = zod.infer<typeof assetTemplateCreateSchema>;
type AssetTemplateUpdateBody = zod.infer<typeof assetTemplateUpdateSchema>;
type AssetTemplateParamsBody = zod.infer<typeof assetTemplateParamsSchema>;
type AssetTemplateQueryBody = zod.infer<typeof assetTemplateQuerySchema>;
type AssetTemplateCloneBody = zod.infer<typeof assetTemplateCloneSchema>;
type AssetTemplateImportBody = zod.infer<typeof assetTemplateImportSchema>;
type CustomFieldValidationBody = zod.infer<typeof customFieldValidationSchema>;
type AssetTemplateSimpleQueryBody = zod.infer<typeof assetTemplateSimpleQuerySchema>;

const router = Router();
const assetTemplateService = new AssetTemplateService();

// All asset template routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/asset-templates:
 *   get:
 *     summary: List asset templates
 *     description: Get a paginated list of asset templates with optional filtering
 *     tags: [Asset Templates]
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
 *         description: Items per page (default 10)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in template name
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [HARDWARE, SOFTWARE, FURNITURE, VEHICLE, EQUIPMENT, PROPERTY, OTHER]
 *         description: Filter by category
 *       - in: query
 *         name: hasCustomField
 *         schema:
 *           type: string
 *         description: Filter templates that have a specific custom field
 *       - in: query
 *         name: customFieldSearch
 *         schema:
 *           type: string
 *         description: Search within custom field definitions
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive templates
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [name, category, createdAt, updatedAt]
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Asset templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 templates:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AssetTemplate'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get(
  '/',
  requirePermission('read', 'asset-template', { scope: 'any' }),
  validateRequest({ query: assetTemplateQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as AssetTemplateQueryBody;

      const result = await assetTemplateService.findTemplates(user.organizationId, {
        page: query.page,
        limit: Math.min(query.limit || 10, 100),
        name: query.search,
        category: query.category,
        hasCustomField: query.hasCustomField,
        customFieldSearch: query.customFieldSearch,
        includeInactive: query.includeInactive,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      });

      res.json({
        templates: result.data,
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
 * /api/asset-templates:
 *   post:
 *     summary: Create asset template
 *     description: Create a new asset template
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssetTemplateCreate'
 *     responses:
 *       201:
 *         description: Asset template created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssetTemplate'
 */
router.post(
  '/',
  requirePermission('create', 'asset-template', { scope: 'any' }),
  validateRequest({ body: assetTemplateCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const body = authenticatedReq.body as AssetTemplateCreateBody;

      const template = await assetTemplateService.createTemplate({
        ...body,
        organizationId: user.organizationId,
      });

      logger.info('Asset template created', {
        templateId: template.id,
        name: template.name,
        category: template.category,
        userId: user.id,
      });

      res.status(201).json(template);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/simple:
 *   get:
 *     summary: Get simple template list
 *     description: Get all active templates for the organization (simple list)
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *         description: Include inactive templates
 *     responses:
 *       200:
 *         description: Templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AssetTemplate'
 */
router.get(
  '/simple',
  requirePermission('read', 'asset-template', { scope: 'any' }),
  validateRequest({ query: assetTemplateSimpleQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { includeInactive } = authenticatedReq.query as AssetTemplateSimpleQueryBody;

      const templates = await assetTemplateService.findByOrganization(
        user.organizationId,
        includeInactive,
      );

      res.json(templates);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/export:
 *   get:
 *     summary: Export asset templates
 *     description: Export all active templates for backup or sharing
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Templates exported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
router.get(
  '/export',
  requirePermission('read', 'asset-template', { scope: 'any' }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;

      const exportData = await assetTemplateService.exportTemplates(user.organizationId);

      logger.info('Asset templates exported', {
        count: exportData.length,
        userId: user.id,
      });

      res.json(exportData);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/import:
 *   post:
 *     summary: Import asset templates
 *     description: Import templates from exported data
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               templates:
 *                 type: array
 *                 items:
 *                   type: object
 *               conflictStrategy:
 *                 type: string
 *                 enum: [fail, skip, rename]
 *                 description: How to handle naming conflicts
 *     responses:
 *       200:
 *         description: Templates imported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 created:
 *                   type: integer
 *                 skipped:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.post(
  '/import',
  requirePermission('create', 'asset-template', { scope: 'any' }),
  validateRequest({ body: assetTemplateImportSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templates, conflictStrategy = 'skip' } =
        authenticatedReq.body as AssetTemplateImportBody;

      // Transform templates to ensure all required fields have defaults
      const normalizedTemplates = templates.map((template) => ({
        name: template.name,
        description: template.description || null,
        category: template.category,
        defaultFields: (template.defaultFields || {}) as any,
        customFields: (template.customFields || {}) as any,
        isActive: template.isActive !== undefined ? template.isActive : true,
      }));

      const result = await assetTemplateService.importTemplates(
        user.organizationId,
        normalizedTemplates,
        conflictStrategy,
      );

      logger.info('Asset templates imported', {
        created: result.created,
        skipped: result.skipped,
        errors: result.errors.length,
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
 * /api/asset-templates/{templateId}:
 *   get:
 *     summary: Get asset template by ID
 *     description: Retrieve a specific asset template by ID
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Asset template retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssetTemplate'
 *       404:
 *         description: Asset template not found
 */
router.get(
  '/:templateId',
  requirePermission('read', 'asset-template', { scope: 'any' }),
  validateRequest({ params: assetTemplateParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templateId } = authenticatedReq.params as AssetTemplateParamsBody;

      const template = await assetTemplateService.getTemplateById(templateId, user.organizationId);
      if (!template) {
        throw new NotFoundError('Asset template not found');
      }

      res.json(template);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/{templateId}:
 *   put:
 *     summary: Update asset template
 *     description: Update an existing asset template
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssetTemplateUpdate'
 *     responses:
 *       200:
 *         description: Asset template updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssetTemplate'
 *       404:
 *         description: Asset template not found
 */
router.put(
  '/:templateId',
  requirePermission('update', 'asset-template', { scope: 'any' }),
  validateRequest({ params: assetTemplateParamsSchema, body: assetTemplateUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templateId } = authenticatedReq.params as AssetTemplateParamsBody;
      const body = authenticatedReq.body as AssetTemplateUpdateBody;

      const template = await assetTemplateService.updateTemplate(
        templateId,
        body,
        user.organizationId,
      );

      logger.info('Asset template updated', {
        templateId,
        changes: Object.keys(body),
        userId: user.id,
      });

      res.json(template);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/{templateId}:
 *   delete:
 *     summary: Delete asset template
 *     description: Delete an asset template (only if not in use)
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Asset template deleted successfully
 *       404:
 *         description: Asset template not found
 *       409:
 *         description: Template is in use and cannot be deleted
 */
router.delete(
  '/:templateId',
  requirePermission('delete', 'asset-template', { scope: 'any' }),
  validateRequest({ params: assetTemplateParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templateId } = authenticatedReq.params as AssetTemplateParamsBody;

      await assetTemplateService.deleteTemplate(templateId, user.organizationId);

      logger.info('Asset template deleted', {
        templateId,
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
 * /api/asset-templates/{templateId}/clone:
 *   post:
 *     summary: Clone asset template
 *     description: Create a copy of an existing asset template
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
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
 *               name:
 *                 type: string
 *                 description: Name for the cloned template
 *               description:
 *                 type: string
 *                 description: Description for the cloned template
 *     responses:
 *       201:
 *         description: Asset template cloned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssetTemplate'
 *       404:
 *         description: Asset template not found
 */
router.post(
  '/:templateId/clone',
  requirePermission('create', 'asset-template', { scope: 'any' }),
  validateRequest({ params: assetTemplateParamsSchema, body: assetTemplateCloneSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templateId } = authenticatedReq.params as AssetTemplateParamsBody;
      const { name } = authenticatedReq.body as AssetTemplateCloneBody;

      const clonedTemplate = await assetTemplateService.cloneTemplate(
        templateId,
        user.organizationId,
        name,
      );

      logger.info('Asset template cloned', {
        originalTemplateId: templateId,
        clonedTemplateId: clonedTemplate.id,
        name: clonedTemplate.name,
        userId: user.id,
      });

      res.status(201).json(clonedTemplate);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/{templateId}/stats:
 *   get:
 *     summary: Get template usage statistics
 *     description: Get usage statistics for an asset template
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Template statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 assetCount:
 *                   type: integer
 *                 lastUsed:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 isInUse:
 *                   type: boolean
 *       404:
 *         description: Asset template not found
 */
router.get(
  '/:templateId/stats',
  requirePermission('read', 'asset-template', { scope: 'any' }),
  validateRequest({ params: assetTemplateParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templateId } = authenticatedReq.params as AssetTemplateParamsBody;

      const stats = await assetTemplateService.getTemplateStats(templateId, user.organizationId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/asset-templates/{templateId}/validate:
 *   post:
 *     summary: Validate custom field values
 *     description: Validate custom field values against the template's schema
 *     tags: [Asset Templates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
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
 *               values:
 *                 type: object
 *                 description: Custom field values to validate
 *     responses:
 *       200:
 *         description: Validation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       404:
 *         description: Asset template not found
 */
router.post(
  '/:templateId/validate',
  requirePermission('read', 'asset-template', { scope: 'any' }),
  validateRequest({ params: assetTemplateParamsSchema, body: customFieldValidationSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { templateId } = authenticatedReq.params as AssetTemplateParamsBody;
      const { values } = authenticatedReq.body as CustomFieldValidationBody;

      const validation = await assetTemplateService.validateCustomFieldValues(
        templateId,
        values,
        user.organizationId,
      );
      res.json(validation);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
