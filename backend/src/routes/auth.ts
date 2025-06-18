import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { UserService } from '../services/user.service';
import { OrganizationService } from '../services/organization.service';
import { generateTokens, verifyRefreshToken, generateQRCode } from '../utils/auth';
import { ValidationError } from '../utils/errors';
import {
  authenticateJWT,
  authenticateRequest,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { validateRequest, authSchemas, commonSchemas } from '../middleware/validation';
import { authRateLimit, twoFactorRateLimit } from '../middleware/security';

// Type definitions for validated request bodies
type RegisterBody = z.infer<typeof authSchemas.register>;
type LoginBody = z.infer<typeof authSchemas.login>;
type ChangePasswordBody = z.infer<typeof authSchemas.changePassword>;
type RefreshTokenBody = z.infer<typeof authSchemas.refreshToken>;
type SetupTwoFactorBody = z.infer<typeof authSchemas.setupTwoFactor>;
type CreateApiTokenBody = z.infer<typeof authSchemas.createApiToken>;

const router = Router();
const userService = new UserService();
const organizationService = new OrganizationService();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user and organization
 *     description: Create a new user account and organization. The user becomes the organization owner.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - organizationName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: User password (minimum 8 characters)
 *                 example: SecurePass123!
 *               fullName:
 *                 type: string
 *                 description: User full name
 *                 example: John Doe
 *               organizationName:
 *                 type: string
 *                 description: Organization name
 *                 example: Acme Corp
 *     responses:
 *       201:
 *         description: User and organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/AuthTokens'
 *                 - type: object
 *                   properties:
 *                     organization:
 *                       $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many registration attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/register',
  authRateLimit,
  validateRequest({ body: authSchemas.register }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, fullName, organizationName } = req.body as RegisterBody;

      // Create organization and owner user in a single atomic transaction
      const result = await organizationService.create({
        name: organizationName,
        ownerEmail: email,
        ownerPassword: password,
        ownerFullName: fullName,
      });

      const { organization, owner: user } = result;

      // Generate tokens
      const tokens = generateTokens({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
      });

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          organizationId: user.organizationId,
          emailVerified: user.emailVerified,
          totpEnabled: user.totpEnabled,
          isActive: user.isActive,
        },
        organization: {
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt,
          updatedAt: organization.updatedAt,
        },
        tokens,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     description: Authenticate user with email and password. Returns JWT tokens on success.
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 description: User password
 *                 example: SecurePass123!
 *               totpToken:
 *                 type: string
 *                 pattern: '^[0-9]{6}$'
 *                 description: TOTP token (required if 2FA is enabled)
 *                 example: '123456'
 *     responses:
 *       200:
 *         description: Login successful or 2FA required
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/AuthTokens'
 *                 - type: object
 *                   properties:
 *                     requiresTwoFactor:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: Please provide your 2FA code
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many login attempts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post(
  '/login',
  authRateLimit,
  validateRequest({ body: authSchemas.login }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, totpToken } = req.body as LoginBody;

      const authResult = await userService.authenticateUser(email, password, totpToken);

      if (!authResult) {
        res.status(401).json({
          error: 'Invalid credentials',
        });
        return;
      }

      if (authResult.requiresTwoFactor) {
        res.json({
          requiresTwoFactor: true,
          message: 'Please provide your 2FA code',
        });
        return;
      }

      // Generate tokens
      const tokens = generateTokens({
        userId: authResult.user.id,
        organizationId: authResult.user.organizationId,
        role: authResult.user.role,
      });

      res.json({
        user: {
          id: authResult.user.id,
          email: authResult.user.email,
          fullName: authResult.user.fullName,
          role: authResult.user.role,
          organizationId: authResult.user.organizationId,
          emailVerified: authResult.user.emailVerified,
          totpEnabled: authResult.user.totpEnabled,
          isActive: authResult.user.isActive,
        },
        tokens,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/refresh',
  validateRequest({ body: authSchemas.refreshToken }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body as RefreshTokenBody;

      const payload = verifyRefreshToken(refreshToken);

      // Verify user still exists and is active
      const user = await userService.getUserById(payload.userId);
      if (!user || !user.isActive) {
        throw new ValidationError('User not found or inactive');
      }

      // Generate new tokens
      const tokens = generateTokens({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
      });

      res.json({ tokens });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/logout', authenticateJWT, (_req: Request, res: Response, next: NextFunction) => {
  try {
    // In a full implementation, you might want to blacklist the JWT token
    // For now, we'll just return success since JWTs are stateless
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticateRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const user = await userService.getUserById(authenticatedReq.user.id);

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
});

router.post(
  '/change-password',
  authenticateJWT,
  validateRequest({ body: authSchemas.changePassword }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { currentPassword, newPassword } = req.body as ChangePasswordBody;

      await userService.changePassword(authenticatedReq.user.id, {
        currentPassword,
        newPassword,
      });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// 2FA Setup Routes
router.post(
  '/2fa/setup',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;

      const totpSecret = await userService.setupTwoFactor(authenticatedReq.user.id);

      // Generate QR code for easier setup
      const qrCodeDataUrl = await generateQRCode(totpSecret.qrCodeUrl);

      res.json({
        secret: totpSecret.secret,
        qrCode: qrCodeDataUrl,
        manualEntryKey: totpSecret.manualEntryKey,
        message:
          'Scan the QR code with your authenticator app and verify with a token to enable 2FA',
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/2fa/enable',
  authenticateJWT,
  twoFactorRateLimit,
  validateRequest({ body: authSchemas.setupTwoFactor }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { totpToken } = req.body as SetupTwoFactorBody;

      await userService.enableTwoFactor(authenticatedReq.user.id, totpToken);

      res.json({ message: '2FA enabled successfully' });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/2fa/disable',
  authenticateJWT,
  twoFactorRateLimit,
  validateRequest({ body: authSchemas.setupTwoFactor }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { totpToken } = req.body as SetupTwoFactorBody;

      await userService.disableTwoFactor(authenticatedReq.user.id, totpToken);

      res.json({ message: '2FA disabled successfully' });
    } catch (error) {
      next(error);
    }
  },
);

// API Token Management
router.get('/tokens', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const tokens = await userService.listApiTokens(authenticatedReq.user.id);

    res.json({ tokens });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/tokens',
  authenticateJWT,
  validateRequest({ body: authSchemas.createApiToken }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { name, expiresAt } = req.body as CreateApiTokenBody;

      const apiToken = await userService.createApiToken(authenticatedReq.user.id, {
        name,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      });

      res.status(201).json({
        id: apiToken.id,
        name: apiToken.name,
        token: apiToken.token,
        expiresAt: apiToken.expiresAt,
        createdAt: apiToken.createdAt,
        message:
          'API token created successfully. This is the only time you will see the token value.',
      });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/tokens/:tokenId',
  authenticateJWT,
  validateRequest({ params: z.object({ tokenId: commonSchemas.id }) }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const { tokenId } = req.params as { tokenId: string };

      await userService.revokeApiToken(authenticatedReq.user.id, tokenId);

      res.json({ message: 'API token deleted successfully' });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
