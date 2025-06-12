import { Router, type Request, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { UserService } from '../services/user.service';
import { ValidationError } from '../utils/errors';
import {
  authenticateJWT,
  requireRole,
  requireOrganizationAccess,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { validateRequest, userSchemas } from '../middleware/validation';

// Type definitions for validated request bodies
type UserCreateBody = z.infer<typeof userSchemas.create>;
type UserUpdateBody = z.infer<typeof userSchemas.update>;
type UserParamsBody = z.infer<typeof userSchemas.params>;

const router = Router();
const userService = new UserService();

// All user routes require authentication
router.use(authenticateJWT);

/**
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieve a user's information by their ID. Requires authentication and organization access.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: User ID
 *         example: 123e4567-e89b-12d3-a456-426614174000
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Access denied - user not in same organization
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get(
  '/:userId',
  requireOrganizationAccess,
  validateRequest({ params: userSchemas.params }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as UserParamsBody;

      const user = await userService.getUserById(userId);

      if (!user) {
        throw new ValidationError('User not found');
      }

      res.json({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        emailVerified: user.emailVerified,
        totpEnabled: user.totpEnabled,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Update user
router.put(
  '/:userId',
  requireOrganizationAccess,
  validateRequest({
    params: userSchemas.params,
    body: userSchemas.update,
  }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as UserParamsBody;
      const { email, fullName, role, isActive } = req.body as UserUpdateBody;

      const user = await userService.updateUser(userId, { email, fullName, role, isActive });

      res.json(user);
    } catch (error) {
      next(error);
    }
  },
);

// Create new user (requires OWNER or MANAGER role)
router.post(
  '/',
  requireRole('OWNER', 'MANAGER'),
  validateRequest({ body: userSchemas.create }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { email, password, fullName, role } = req.body as UserCreateBody;

      const user = await userService.createUser({
        email,
        password,
        fullName,
        role,
        organizationId: authenticatedReq.user.organizationId,
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        emailVerified: user.emailVerified,
        totpEnabled: user.totpEnabled,
        isActive: user.isActive,
        createdAt: user.createdAt,
      });
    } catch (error) {
      next(error);
    }
  },
);

// Delete user (requires OWNER role)
router.delete(
  '/:userId',
  requireRole('OWNER'),
  requireOrganizationAccess,
  validateRequest({ params: userSchemas.params }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as UserParamsBody;

      await userService.deleteUser(userId);

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
