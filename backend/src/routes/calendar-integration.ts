import { Router, type Request, type Response, type NextFunction } from 'express';
// import { z } from 'zod';
import { authenticateJWT as authenticate, type AuthenticatedRequest } from '../middleware/auth';
// import { validateRequest } from '../middleware/validation';
import { CalendarService } from '../services/calendar.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const calendarService = new CalendarService(prisma);

// Validation schemas - commented out until validateRequest is implemented
/*
const googleAuthUrlSchema = z.object({
  query: z.object({
    redirectUrl: z.string().url().optional(),
  }),
});

const googleCallbackSchema = z.object({
  query: z.object({
    code: z.string(),
    state: z.string().optional(),
  }),
});

const syncCalendarSchema = z.object({
  body: z.object({
    calendarId: z.string().optional(),
    syncPastDays: z.number().min(0).max(365).optional(),
    syncFutureDays: z.number().min(1).max(365).optional(),
  }),
});

const icalFeedSchema = z.object({
  params: z.object({
    token: z.string(),
  }),
  query: z.object({
    assetId: z.string().uuid().optional(),
    userId: z.string().uuid().optional(),
    daysAhead: z.string().regex(/^\d+$/).optional(),
    daysBehind: z.string().regex(/^\d+$/).optional(),
  }),
});
*/

/**
 * @route GET /api/calendar/google/auth-url
 * @desc Get Google OAuth authorization URL
 * @access Private
 */
router.get(
  '/google/auth-url',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;
      const { redirectUrl } = req.query;

      const authUrl = await calendarService.getGoogleAuthUrl(userId, redirectUrl as string);

      res.json({ authUrl });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/calendar/google/callback
 * @desc Handle Google OAuth callback
 * @access Private
 */
router.get(
  '/google/callback',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;
      const { code, state } = req.query;

      const result = await calendarService.handleGoogleCallback(
        userId,
        code as string,
        state as string,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/calendar/google/sync
 * @desc Sync tasks with Google Calendar
 * @access Private
 */
router.post(
  '/google/sync',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;
      const organizationId = authenticatedReq.user.organizationId;
      const { calendarId, syncPastDays, syncFutureDays } = req.body;

      const result = await calendarService.syncWithGoogleCalendar(userId, organizationId, {
        calendarId,
        syncPastDays: syncPastDays || 7,
        syncFutureDays: syncFutureDays || 30,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route DELETE /api/calendar/google/disconnect
 * @desc Disconnect Google Calendar integration
 * @access Private
 */
router.delete(
  '/google/disconnect',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;

      await calendarService.disconnectGoogleCalendar(userId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/calendar/google/status
 * @desc Get Google Calendar connection status
 * @access Private
 */
router.get('/google/status', authenticate, async (req: any, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const userId = authenticatedReq.user.id;

    const status = await calendarService.getGoogleCalendarStatus(userId);

    res.json(status);
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/calendar/ical/generate-token
 * @desc Generate iCalendar feed token
 * @access Private
 */
router.post(
  '/ical/generate-token',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;
      const organizationId = authenticatedReq.user.organizationId;

      const token = await calendarService.generateICalToken(userId, organizationId);

      const feedUrl = `${req.protocol}://${req.get('host')}/api/calendar/ical/feed/${token}`;

      res.json({ token, feedUrl });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/calendar/ical/feed/:token
 * @desc Get iCalendar feed
 * @access Public (with token)
 */
router.get('/ical/feed/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const { assetId, userId, daysAhead, daysBehind } = req.query;

    const icalData = await calendarService.getICalFeed(token!, {
      assetId: assetId as string | undefined,
      userId: userId as string | undefined,
      daysAhead: daysAhead ? parseInt(daysAhead as string) : 30,
      daysBehind: daysBehind ? parseInt(daysBehind as string) : 7,
    });

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="tasks.ics"',
    });

    res.send(icalData);
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/calendar/ical/revoke-token
 * @desc Revoke iCalendar feed token
 * @access Private
 */
router.delete(
  '/ical/revoke-token',
  authenticate,
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const userId = authenticatedReq.user.id;

      await calendarService.revokeICalToken(userId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/calendar/ical/status
 * @desc Get iCalendar feed status
 * @access Private
 */
router.get('/ical/status', authenticate, async (req: any, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const userId = authenticatedReq.user.id;

    const status = await calendarService.getICalStatus(userId);

    res.json(status);
  } catch (error) {
    next(error);
  }
});

export default router;
