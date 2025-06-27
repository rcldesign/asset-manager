import { Router, type Response, type NextFunction } from 'express';
import { LocationService } from '../services/location.service';
import { NotFoundError } from '../utils/errors';
import { authenticateJWT, requirePermission, type AuthenticatedRequest } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { logger } from '../utils/logger';
import { z as zod } from 'zod';

// Validation schemas
const locationCreateSchema = zod.object({
  name: zod.string().min(1).max(255),
  description: zod.string().optional(),
  parentId: zod.string().uuid().optional().nullable(),
});

const locationUpdateSchema = locationCreateSchema.partial();

const locationParamsSchema = zod.object({
  locationId: zod.string().uuid(),
});

const locationQuerySchema = zod.object({
  search: zod.string().optional(),
  includeTree: zod
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

const locationTreeQuerySchema = zod.object({
  rootId: zod.string().uuid().optional(),
});

const locationMoveSchema = zod.object({
  newParentId: zod.string().uuid().optional().nullable(),
});

// Type definitions
type LocationCreateBody = zod.infer<typeof locationCreateSchema>;
type LocationUpdateBody = zod.infer<typeof locationUpdateSchema>;
type LocationParamsBody = zod.infer<typeof locationParamsSchema>;
type LocationQueryBody = zod.infer<typeof locationQuerySchema>;
type LocationMoveBody = zod.infer<typeof locationMoveSchema>;

const router = Router();
const locationService = new LocationService();

// All location routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/locations:
 *   get:
 *     summary: List locations
 *     description: Get all locations for the organization, optionally as a hierarchical tree
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search locations by name
 *       - in: query
 *         name: includeTree
 *         schema:
 *           type: boolean
 *         description: Return locations as hierarchical tree structure
 *     responses:
 *       200:
 *         description: Locations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Location'
 */
router.get(
  '/',
  requirePermission('read', 'location', { scope: 'any' }),
  validateRequest({ query: locationQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as LocationQueryBody;

      let locations;

      if (query.includeTree) {
        // Return hierarchical tree structure
        locations = await locationService.findByOrganization(user.organizationId);
      } else if (query.search) {
        // Return flat list filtered by search
        locations = await locationService.searchByName(user.organizationId, query.search);
      } else {
        // Get all locations as flat list (more efficient than building tree and flattening)
        locations = await locationService.findAllFlat(user.organizationId);
      }

      res.json(locations);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations:
 *   post:
 *     summary: Create location
 *     description: Create a new location
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LocationCreate'
 *     responses:
 *       201:
 *         description: Location created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Location'
 */
router.post(
  '/',
  requirePermission('create', 'location', { scope: 'any' }),
  validateRequest({ body: locationCreateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const body = authenticatedReq.body as LocationCreateBody;

      const location = await locationService.createLocation({
        ...body,
        organizationId: user.organizationId,
      });

      logger.info('Location created', {
        locationId: location.id,
        name: location.name,
        parentId: location.parentId,
        userId: user.id,
      });

      res.status(201).json(location);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations/tree:
 *   get:
 *     summary: Get location tree
 *     description: Get locations organized in a hierarchical tree structure
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rootId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Root location ID to get subtree (optional)
 *     responses:
 *       200:
 *         description: Location tree retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LocationTree'
 */
router.get(
  '/tree',
  requirePermission('read', 'location', { scope: 'any' }),
  validateRequest({ query: locationTreeQuerySchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const query = authenticatedReq.query as { rootId?: string };

      // If rootId is provided, get subtree; otherwise get full tree
      const tree = query.rootId
        ? await locationService.findSubtree(query.rootId, user.organizationId)
        : await locationService.findByOrganization(user.organizationId);
      res.json(tree);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations/{locationId}:
 *   get:
 *     summary: Get location by ID
 *     description: Retrieve a specific location by ID
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Location retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Location'
 *       404:
 *         description: Location not found
 */
router.get(
  '/:locationId',
  requirePermission('read', 'location', { scope: 'any' }),
  validateRequest({ params: locationParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { locationId } = authenticatedReq.params as LocationParamsBody;

      const location = await locationService.getLocationById(locationId, user.organizationId);
      if (!location) {
        throw new NotFoundError('Location not found');
      }

      res.json(location);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations/{locationId}:
 *   put:
 *     summary: Update location
 *     description: Update an existing location
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LocationUpdate'
 *     responses:
 *       200:
 *         description: Location updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Location'
 *       404:
 *         description: Location not found
 */
router.put(
  '/:locationId',
  requirePermission('update', 'location', { scope: 'any' }),
  validateRequest({ params: locationParamsSchema, body: locationUpdateSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { locationId } = authenticatedReq.params as LocationParamsBody;
      const body = authenticatedReq.body as LocationUpdateBody;

      const location = await locationService.updateLocation(locationId, body, user.organizationId);

      logger.info('Location updated', {
        locationId,
        changes: Object.keys(body),
        userId: user.id,
      });

      res.json(location);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations/{locationId}:
 *   delete:
 *     summary: Delete location
 *     description: Delete a location (only if it has no children or assets)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Location deleted successfully
 *       404:
 *         description: Location not found
 *       409:
 *         description: Location has children or assigned assets
 */
router.delete(
  '/:locationId',
  requirePermission('delete', 'location', { scope: 'any' }),
  validateRequest({ params: locationParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { locationId } = authenticatedReq.params as LocationParamsBody;

      await locationService.deleteLocation(locationId, user.organizationId);

      logger.info('Location deleted', {
        locationId,
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
 * /api/locations/{locationId}/move:
 *   post:
 *     summary: Move location
 *     description: Move a location to a new parent (or to root level)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
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
 *               newParentId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: New parent location ID (null for root level)
 *     responses:
 *       200:
 *         description: Location moved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Location'
 *       404:
 *         description: Location not found
 *       400:
 *         description: Invalid move operation (would create circular dependency)
 */
router.post(
  '/:locationId/move',
  requirePermission('update', 'location', { scope: 'any' }),
  validateRequest({ params: locationParamsSchema, body: locationMoveSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { locationId } = authenticatedReq.params as LocationParamsBody;
      const { newParentId } = authenticatedReq.body as LocationMoveBody;

      const location = await locationService.moveLocation(
        locationId,
        newParentId || null,
        user.organizationId,
      );

      logger.info('Location moved', {
        locationId,
        newParentId,
        userId: user.id,
      });

      res.json(location);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations/{locationId}/ancestors:
 *   get:
 *     summary: Get location ancestors
 *     description: Get the path from root to the location (breadcrumb trail)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Location ancestors retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Location'
 *               description: Array of ancestor locations from root to immediate parent
 *       404:
 *         description: Location not found
 */
router.get(
  '/:locationId/ancestors',
  requirePermission('read', 'location', { scope: 'any' }),
  validateRequest({ params: locationParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { locationId } = authenticatedReq.params as LocationParamsBody;

      const ancestors = await locationService.findAncestors(locationId, user.organizationId);
      res.json(ancestors);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/locations/{locationId}/descendants:
 *   get:
 *     summary: Get location descendants
 *     description: Get all locations under the specified location (subtree)
 *     tags: [Locations]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Location descendants retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Location'
 *               description: Array of all descendant locations
 *       404:
 *         description: Location not found
 */
router.get(
  '/:locationId/descendants',
  requirePermission('read', 'location', { scope: 'any' }),
  validateRequest({ params: locationParamsSchema }),
  async (req, res: Response, next: NextFunction) => {
    const authenticatedReq = req as AuthenticatedRequest;
    try {
      const { user } = authenticatedReq;
      const { locationId } = authenticatedReq.params as LocationParamsBody;

      const descendants = await locationService.findSubtree(locationId, user.organizationId);
      res.json(descendants);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
