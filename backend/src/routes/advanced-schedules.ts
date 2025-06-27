import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  authenticateJWT as authenticate,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { AdvancedScheduleService } from '../services/advanced-schedule.service';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const advancedScheduleService = new AdvancedScheduleService(prisma);

// Validation schemas removed for now

/**
 * @route POST /api/advanced-schedules/seasonal
 * @desc Create a seasonal schedule
 * @access Private (Admin, Manager)
 */
router.post(
  '/seasonal',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assetId, name, description, config } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      const schedule = await advancedScheduleService.createSeasonalSchedule(
        organizationId,
        assetId,
        name,
        config,
        {
          ...config.taskTemplate,
          description: description || config.taskTemplate.description,
        },
      );

      res.status(201).json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/advanced-schedules/usage-based
 * @desc Create a usage-based schedule
 * @access Private (Admin, Manager)
 */
router.post(
  '/usage-based',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assetId, name, description, config } = req.body;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      const schedule = await advancedScheduleService.createUsageBasedSchedule(
        organizationId,
        assetId,
        name,
        config,
        {
          ...config.taskTemplate,
          description: description || config.taskTemplate.description,
        },
      );

      res.status(201).json(schedule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route PUT /api/advanced-schedules/usage-counters/:assetId/:counterType
 * @desc Update a usage counter for an asset
 * @access Private (Admin, Manager, User)
 */
router.put(
  '/usage-counters/:assetId/:counterType',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assetId, counterType } = req.params;
      const { value, increment, notes } = req.body;
      // const authenticatedReq = req as AuthenticatedRequest;
      // const organizationId = authenticatedReq.user.organizationId;

      const counter = await advancedScheduleService.updateUsageCounter(
        assetId as string,
        counterType as string,
        increment || value,
        notes,
      );

      res.json(counter);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/advanced-schedules/usage-counters/:assetId
 * @desc Get all usage counters for an asset
 * @access Private
 */
router.get(
  '/usage-counters/:assetId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assetId } = req.params;
      const authenticatedReq = req as AuthenticatedRequest;
      const organizationId = authenticatedReq.user.organizationId;

      // Verify asset belongs to organization
      const asset = await prisma.asset.findFirst({
        where: {
          id: assetId,
          organizationId,
        },
      });

      if (!asset) {
        res.status(404).json({ message: 'Asset not found' });
        return;
      }

      const counters = await prisma.usageCounter.findMany({
        where: { assetId },
        include: { schedule: true },
      });

      res.json(counters);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route POST /api/advanced-schedules/:scheduleId/rules
 * @desc Add a rule to a schedule
 * @access Private (Admin, Manager)
 */
router.post(
  '/:scheduleId/rules',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scheduleId } = req.params;
      const { ruleType, ruleConfig } = req.body;
      // const authenticatedReq = req as AuthenticatedRequest;
      // const organizationId = authenticatedReq.user.organizationId;

      const rule = await advancedScheduleService.addScheduleRule(
        scheduleId as string,
        ruleType,
        ruleConfig,
      );

      res.status(201).json(rule);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/advanced-schedules/:scheduleId/rules
 * @desc Get all rules for a schedule
 * @access Private
 */
router.get(
  '/:scheduleId/rules',
  authenticate,
  async (_req: any, res: Response, _next: NextFunction) => {
    try {
      // const { scheduleId } = req.params;
      // const authenticatedReq = req as AuthenticatedRequest;
      // const organizationId = authenticatedReq.user.organizationId;

      // TODO: Implement getScheduleRules method in AdvancedScheduleService
      const rules: any[] = [];

      res.json(rules);
    } catch (error) {
      _next(error);
    }
  },
);

/**
 * @route POST /api/advanced-schedules/:scheduleId/dependencies
 * @desc Add a dependency to a schedule
 * @access Private (Admin, Manager)
 */
router.post(
  '/:scheduleId/dependencies',
  authenticate,
  requireRole('OWNER', 'MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { scheduleId } = req.params;
      const { dependsOnScheduleId, offsetDays } = req.body;
      // const authenticatedReq = req as AuthenticatedRequest;
      // const organizationId = authenticatedReq.user.organizationId;

      // TODO: Implement addScheduleDependency method in AdvancedScheduleService
      const dependency = {
        scheduleId,
        dependsOnScheduleId,
        offsetDays,
      };

      res.status(201).json(dependency);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route GET /api/advanced-schedules/:scheduleId/dependencies
 * @desc Get all dependencies for a schedule
 * @access Private
 */
router.get(
  '/:scheduleId/dependencies',
  authenticate,
  async (_req: any, res: Response, _next: NextFunction) => {
    try {
      // const { scheduleId } = req.params;
      // const authenticatedReq = req as AuthenticatedRequest;
      // const organizationId = authenticatedReq.user.organizationId;

      // TODO: Implement getScheduleDependencies method in AdvancedScheduleService
      const dependencies: any[] = [];

      res.json(dependencies);
    } catch (error) {
      _next(error);
    }
  },
);

export default router;
