import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { logger } from '../utils/logger';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * @route GET /api/google/auth/status
 * @desc Check if user has connected Google Calendar
 * @access Private
 */
router.get(
  '/auth/status',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;

      const service = new GoogleCalendarService(userId);
      const hasCredentials = await service.hasValidCredentials();

      res.json({
        connected: hasCredentials,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/google/auth/connect
 * @desc Initiate Google OAuth flow
 * @access Private
 */
router.get(
  '/auth/connect',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;

      // Generate auth URL with user ID as state parameter
      const authUrl = GoogleCalendarService.generateAuthUrl(userId);

      res.json({ authUrl });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/google/auth/callback
 * @desc Handle Google OAuth callback
 * @access Public (but validates state parameter)
 */
router.get('/auth/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state: userId, error: oauthError } = req.query;

    // Handle OAuth errors (e.g., user denied access)
    if (oauthError) {
      logger.warn('Google OAuth error', { error: oauthError });
      res.redirect(`${process.env.FRONTEND_URL}/settings/calendar?error=access_denied`);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'Invalid state parameter' });
      return;
    }

    // Exchange code for tokens
    const service = new GoogleCalendarService(userId);
    await service.exchangeCodeForTokens(code);

    logger.info('Google Calendar connected successfully', { userId });

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/settings/calendar?success=connected`);
  } catch (error) {
    logger.error(
      'Google OAuth callback error',
      error instanceof Error ? error : new Error('Unknown error'),
    );

    // Redirect to frontend with error
    res.redirect(`${process.env.FRONTEND_URL}/settings/calendar?error=auth_failed`);
  }
});

/**
 * @route DELETE /api/google/auth/disconnect
 * @desc Disconnect Google Calendar (revoke access)
 * @access Private
 */
router.delete(
  '/auth/disconnect',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;

      const service = new GoogleCalendarService(userId);
      await service.revokeAccess();

      logger.info('Google Calendar disconnected', { userId });

      res.json({ message: 'Google Calendar disconnected successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/google/calendar/events
 * @desc Get upcoming calendar events
 * @access Private
 */
router.get(
  '/calendar/events',
  authenticateJWT,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;

      const service = new GoogleCalendarService(userId);

      try {
        const events = await service.listUpcomingEvents({
          maxResults: 20,
        });

        res.json({ events });
        return;
      } catch (error: any) {
        // Check for invalid_grant error
        if (error.response?.data?.error === 'invalid_grant') {
          logger.warn(`Invalid grant for user ${userId}. Credentials expired.`);

          // Delete stale credentials in the background
          service
            .revokeAccess()
            .catch((e) => logger.error(`Failed to delete stale credentials for user ${userId}`, e));

          res.status(401).json({
            error: 're_authentication_required',
            message: 'Your connection to Google has expired. Please reconnect your calendar.',
          });
          return;
        }

        throw error; // Re-throw other errors
      }
    } catch (error) {
      next(error);
    }
  },
);

export default router;
