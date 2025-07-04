import { Router, type Request, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { OrganizationService } from '../services/organization.service';
import {
  authenticateJWT,
  requireRole,
  requireOrganizationAccess,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { validateRequest, organizationSchemas } from '../middleware/validation';

// Type definitions for validated request bodies
type OrganizationUpdateBody = z.infer<typeof organizationSchemas.update>;
type OrganizationSetOwnerBody = z.infer<typeof organizationSchemas.setOwner>;
type OrganizationParamsBody = z.infer<typeof organizationSchemas.params>;

const router = Router();
const organizationService = new OrganizationService();

// All organization routes require authentication
router.use(authenticateJWT);

// Get current user's organization
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const organization = await organizationService.getOrganizationById(
      authenticatedReq.user.organizationId,
    );

    res.json(organization);
  } catch (error) {
    next(error);
  }
});

// Get organization by ID (requires access to that organization)
router.get(
  '/:organizationId',
  requireOrganizationAccess,
  validateRequest({ params: organizationSchemas.params }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = req.params as OrganizationParamsBody;

      const organization = await organizationService.getOrganizationById(organizationId);

      res.json(organization);
    } catch (error) {
      next(error);
    }
  },
);

// Update organization (requires OWNER role)
router.put(
  '/:organizationId',
  requireRole('OWNER'),
  requireOrganizationAccess,
  validateRequest({
    params: organizationSchemas.params,
    body: organizationSchemas.update,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = req.params as OrganizationParamsBody;
      const { name } = req.body as OrganizationUpdateBody;

      const organization = await organizationService.updateOrganization(organizationId, { name });

      res.json(organization);
    } catch (error) {
      next(error);
    }
  },
);

// Get organization members
router.get(
  '/:organizationId/members',
  requireOrganizationAccess,
  validateRequest({ params: organizationSchemas.params }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = req.params as OrganizationParamsBody;

      const members = await organizationService.getMembers(organizationId);

      res.json({ members });
    } catch (error) {
      next(error);
    }
  },
);

// Get organization statistics
router.get(
  '/:organizationId/statistics',
  requireOrganizationAccess,
  validateRequest({ params: organizationSchemas.params }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = req.params as OrganizationParamsBody;

      const statistics = await organizationService.getStatistics(organizationId);

      res.json(statistics);
    } catch (error) {
      next(error);
    }
  },
);

// Set organization owner (requires current OWNER role)
router.put(
  '/:organizationId/owner',
  requireRole('OWNER'),
  requireOrganizationAccess,
  validateRequest({
    params: organizationSchemas.params,
    body: organizationSchemas.setOwner,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = req.params as OrganizationParamsBody;
      const { userId } = req.body as OrganizationSetOwnerBody;

      await organizationService.setOwner(organizationId, userId);

      res.json({ message: 'Organization owner updated successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// Delete organization (requires OWNER role)
router.delete(
  '/:organizationId',
  requireRole('OWNER'),
  requireOrganizationAccess,
  validateRequest({ params: organizationSchemas.params }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = req.params as OrganizationParamsBody;

      await organizationService.deleteOrganization(organizationId);

      res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
