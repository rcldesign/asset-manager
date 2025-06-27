import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth';
import { authenticateJWT as authenticate } from '../middleware/auth';
import { ActivityStreamService } from '../services/activity-stream.service';
import { prisma } from '../lib/prisma';

const router = Router();
const activityStreamService = new ActivityStreamService(prisma);

/**
 * @route GET /api/activity-streams
 * @desc Get organization activity stream
 * @access Private
 */
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const organizationId = authenticatedReq.user.organizationId;
    const {
      actorId,
      targetType,
      targetId,
      objectType,
      objectId,
      verb,
      startDate,
      endDate,
      page,
      limit,
    } = req.query;

    const result = await activityStreamService.getActivityFeed({
      organizationId,
      actorId: actorId as string,
      targetType: targetType as string,
      targetId: targetId as string,
      objectType: objectType as string,
      objectId: objectId as string,
      verb: verb as string,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/activity-streams/asset/:assetId
 * @desc Get activity stream for a specific asset
 * @access Private
 */
router.get(
  '/asset/:assetId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const { assetId } = req.params;
      const { page, limit } = req.query;

      if (!assetId) {
        res.status(400).json({ error: 'Asset ID is required' });
        return;
      }

      const result = await activityStreamService.getAssetActivityFeed(
        assetId,
        organizationId,
        page ? parseInt(page as string, 10) : 1,
        limit ? parseInt(limit as string, 10) : 20,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/activity-streams/user/:userId
 * @desc Get activity stream for a specific user
 * @access Private
 */
router.get(
  '/user/:userId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;
      const { userId } = req.params;
      const { page, limit } = req.query;

      if (!userId) {
        res.status(400).json({ error: 'User ID is required' });
        return;
      }

      const result = await activityStreamService.getUserActivityFeed(
        userId,
        organizationId,
        page ? parseInt(page as string, 10) : 1,
        limit ? parseInt(limit as string, 10) : 20,
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/activity-streams/summary
 * @desc Get activity summary statistics for the organization
 * @access Private
 */
router.get('/summary', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authenticatedReq = req as AuthenticatedRequest;
    const organizationId = authenticatedReq.user.organizationId;
    const { hours } = req.query;

    const result = await activityStreamService.getActivitySummary(
      organizationId,
      hours ? parseInt(hours as string, 10) : undefined,
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
