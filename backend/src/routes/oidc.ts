import { Router, type Request, type Response, type NextFunction } from 'express';
import type { z } from 'zod';
import { oidcService } from '../services/oidc.service';
import { UserService } from '../services/user.service';
import { OrganizationService } from '../services/organization.service';
import { generateTokens } from '../utils/auth';
import { ValidationError, ConfigurationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { validateRequest, oidcSchemas } from '../middleware/validation';
import crypto from 'crypto';

// Type definitions for validated request bodies
type OidcLoginBody = z.infer<typeof oidcSchemas.login>;
type OidcCallbackQuery = z.infer<typeof oidcSchemas.callback>;
type OidcRefreshTokenBody = z.infer<typeof oidcSchemas.refreshTokens>;
type OidcLogoutBody = z.infer<typeof oidcSchemas.logout>;

const router = Router();
const userService = new UserService();
const organizationService = new OrganizationService();

// Store for temporary session data (in production, use Redis or similar)
const sessionStore = new Map<
  string,
  {
    codeVerifier: string;
    state: string;
    nonce: string;
    organizationName?: string;
    timestamp: number;
  }
>();

// Clean up expired sessions (older than 10 minutes)
setInterval(
  () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [key, session] of sessionStore.entries()) {
      if (session.timestamp < tenMinutesAgo) {
        sessionStore.delete(key);
      }
    }
  },
  5 * 60 * 1000,
); // Run every 5 minutes

/**
 * Check if OIDC is available
 */
router.get('/available', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const isAvailable = oidcService.isAvailable();

    res.json({
      available: isAvailable,
      message: isAvailable
        ? 'OIDC authentication is available'
        : 'OIDC authentication is not configured',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Initiate OIDC login flow
 */
router.post(
  '/login',
  validateRequest({ body: oidcSchemas.login }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!oidcService.isAvailable()) {
        throw new ConfigurationError('OIDC authentication is not available');
      }

      const { organizationName } = req.body as OidcLoginBody;

      // Generate secure random values
      const state = crypto.randomBytes(32).toString('base64url');
      const nonce = crypto.randomBytes(32).toString('base64url');

      // Get authorization URL from OIDC service
      const authData = await oidcService.generateAuthorizationUrl(state, nonce);

      // Store session data
      const sessionKey = state;
      sessionStore.set(sessionKey, {
        codeVerifier: authData.codeVerifier,
        state: authData.state,
        nonce: authData.nonce,
        organizationName,
        timestamp: Date.now(),
      });

      logger.info('OIDC login initiated', { state, organizationName });

      res.json({
        authorizationUrl: authData.url,
        state: authData.state,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Handle OIDC callback
 */
router.get(
  '/callback',
  validateRequest({ query: oidcSchemas.callback }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!oidcService.isAvailable()) {
        throw new ConfigurationError('OIDC authentication is not available');
      }

      const { code, state, error: oidcError } = req.query as OidcCallbackQuery;

      // Check for OIDC errors
      if (oidcError) {
        logger.warn('OIDC callback error', { error: oidcError, state });
        throw new ValidationError(`OIDC authentication failed: ${oidcError}`);
      }

      // Retrieve session data
      const sessionData = sessionStore.get(state);
      if (!sessionData) {
        throw new ValidationError('Invalid or expired state parameter');
      }

      // Clean up session data
      sessionStore.delete(state);

      // Exchange code for tokens
      const tokens = await oidcService.exchangeCodeForTokens(
        code,
        sessionData.codeVerifier,
        sessionData.state,
        sessionData.nonce,
        state,
      );

      // Get user info from OIDC provider
      const oidcUserInfo = await oidcService.getUserInfo(tokens.access_token);

      logger.info('OIDC callback successful', {
        sub: oidcUserInfo.sub,
        email: oidcUserInfo.email,
        state,
      });

      // Check if user already exists
      const existingUser = await userService.getUserByEmail(oidcUserInfo.email || '');
      let organization;
      let user;

      if (!existingUser) {
        // Create new user and organization if needed
        if (!oidcUserInfo.email) {
          throw new ValidationError('Email is required for account creation');
        }

        // Determine organization
        if (sessionData.organizationName) {
          // User specified an organization name during login
          try {
            organization = await organizationService.createOrganization({
              name: sessionData.organizationName,
            });
          } catch {
            // If organization name conflicts, generate a unique one
            const timestamp = Date.now();
            organization = await organizationService.createOrganization({
              name: `${sessionData.organizationName}-${timestamp}`,
            });
          }
        } else {
          // Create organization based on user info
          const orgName =
            oidcUserInfo.name ||
            `${oidcUserInfo.given_name || ''} ${oidcUserInfo.family_name || ''}`.trim() ||
            oidcUserInfo.email.split('@')[0] ||
            'My Organization';

          try {
            organization = await organizationService.createOrganization({
              name: orgName,
            });
          } catch {
            // If organization name conflicts, generate a unique one
            const timestamp = Date.now();
            organization = await organizationService.createOrganization({
              name: `${orgName}-${timestamp}`,
            });
          }
        }

        // Create new user
        user = await userService.createUser({
          email: oidcUserInfo.email,
          fullName:
            oidcUserInfo.name ||
            `${oidcUserInfo.given_name || ''} ${oidcUserInfo.family_name || ''}`.trim() ||
            undefined,
          role: 'OWNER', // First user in organization is owner
          organizationId: organization.id,
        });

        // Set user as organization owner
        await organizationService.setOwner(organization.id, user.id);

        logger.info('Created new user and organization from OIDC', {
          userId: user.id,
          organizationId: organization.id,
          email: user.email,
        });
      } else {
        user = existingUser;
        logger.info('Existing user logged in via OIDC', {
          userId: user.id,
          email: user.email,
        });
      }

      // Generate JWT tokens for the user
      const jwtTokens = generateTokens({
        userId: user.id,
        organizationId: user.organizationId,
        role: user.role,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          organizationId: user.organizationId,
          emailVerified: user.emailVerified,
          totpEnabled: user.totpEnabled,
        },
        tokens: jwtTokens,
        oidc: {
          sub: oidcUserInfo.sub,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        },
      });
    } catch (error) {
      logger.error('OIDC callback failed', error instanceof Error ? error : undefined);
      next(error);
    }
  },
);

/**
 * Refresh OIDC tokens
 */
router.post(
  '/refresh',
  validateRequest({ body: oidcSchemas.refreshTokens }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!oidcService.isAvailable()) {
        throw new ConfigurationError('OIDC authentication is not available');
      }

      const { refreshToken } = req.body as OidcRefreshTokenBody;

      // Refresh tokens with OIDC provider
      const newTokens = await oidcService.refreshTokens(refreshToken);

      res.json({
        oidc: {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresIn: newTokens.expires_in,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * Generate OIDC logout URL
 */
router.post(
  '/logout',
  validateRequest({ body: oidcSchemas.logout }),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!oidcService.isAvailable()) {
        throw new ConfigurationError('OIDC authentication is not available');
      }

      const { idToken, postLogoutRedirectUri } = req.body as OidcLogoutBody;

      const logoutUrl = oidcService.generateLogoutUrl(idToken, postLogoutRedirectUri);

      if (logoutUrl) {
        res.json({
          logoutUrl,
          message: 'Logout URL generated successfully',
        });
      } else {
        res.json({
          logoutUrl: null,
          message: 'OIDC provider does not support logout endpoint',
        });
      }
    } catch (error) {
      next(error);
    }
  },
);

export default router;
