import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { requirePermission } from '../middleware/auth';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import { ReportingService } from '../services/reporting.service';
import { z } from 'zod';
import prisma from '../lib/prisma';

const router = Router();
const reportingService = new ReportingService();

// Validation schemas
const createReportSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  type: z.enum(['asset', 'task', 'schedule', 'maintenance', 'financial', 'custom']),
  filters: z.record(z.any()).default({}),
  columns: z.array(
    z.object({
      field: z.string(),
      label: z.string(),
      type: z.enum(['string', 'number', 'date', 'boolean']),
      format: z.string().optional(),
      aggregate: z.enum(['sum', 'avg', 'count', 'min', 'max']).optional(),
    }),
  ),
  groupBy: z.array(z.string()).optional(),
  sortBy: z
    .array(
      z.object({
        field: z.string(),
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .optional(),
  isPublic: z.boolean().default(false),
});

const generateReportSchema = z.object({
  format: z.enum(['json', 'csv', 'excel', 'pdf']).default('json'),
  includeHeaders: z.boolean().optional(),
  dateFormat: z.string().optional(),
  numberFormat: z.string().optional(),
  timezone: z.string().optional(),
});

const assetReportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'excel', 'pdf']).default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  locationId: z.string().uuid().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
});

const taskReportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'excel', 'pdf']).default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  assigneeId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

const userReportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'excel', 'pdf']).default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  includeInactive: z.boolean().default(false),
});

/**
 * @swagger
 * /api/reports/templates:
 *   get:
 *     summary: Get available report templates
 *     description: Retrieve predefined report templates that can be used to generate reports
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Report templates retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   type:
 *                     type: string
 *                   columns:
 *                     type: array
 *                     items:
 *                       $ref: '#/components/schemas/ReportColumn'
 *       401:
 *         description: Unauthorized
 */
router.get('/templates', authenticateJWT, async (_req, res, next) => {
  try {
    const templates = await reportingService.getReportTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Create a new report definition
 *     description: Create a custom report definition that can be used to generate reports
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [asset, task, schedule, maintenance, financial, custom]
 *               filters:
 *                 type: object
 *                 additionalProperties: true
 *               columns:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ReportColumn'
 *               groupBy:
 *                 type: array
 *                 items:
 *                   type: string
 *               sortBy:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     field:
 *                       type: string
 *                     direction:
 *                       type: string
 *                       enum: [asc, desc]
 *               isPublic:
 *                 type: boolean
 *                 default: false
 *             required: [name, type, columns]
 *     responses:
 *       201:
 *         description: Report definition created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReportDefinition'
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.post(
  '/',
  authenticateJWT,
  requirePermission('create', 'report'),
  validateBody(createReportSchema),
  async (req: any, res, next) => {
    try {
      const reportDefinition = await reportingService.createReportDefinition(req.context!, req.body);
      res.status(201).json(reportDefinition);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/{reportId}/generate:
 *   post:
 *     summary: Generate a report
 *     description: Generate a report based on its definition in the requested format
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *         description: Report definition ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [json, csv, excel, pdf]
 *                 default: json
 *               includeHeaders:
 *                 type: boolean
 *               dateFormat:
 *                 type: string
 *               numberFormat:
 *                 type: string
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metadata:
 *                   type: object
 *                   properties:
 *                     reportId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *                     rowCount:
 *                       type: integer
 *                     format:
 *                       type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied to report
 *       404:
 *         description: Report definition not found
 */
router.post(
  '/:reportId/generate',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateParams(z.object({ reportId: z.string() })),
  validateBody(generateReportSchema),
  async (req: any, res, next) => {
    try {
      const { reportId } = req.params;
      const options = req.body;

      const report = await reportingService.generateReport(req.context!, reportId, options);

      // Set appropriate headers based on format
      if (options.format === 'csv' && report.file) {
        res.setHeader('Content-Type', report.mimeType || 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
        res.send(report.file);
      } else if (options.format === 'excel' && report.file) {
        res.setHeader(
          'Content-Type',
          report.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
        res.send(report.file);
      } else {
        // JSON format
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/quick/asset-inventory:
 *   get:
 *     summary: Generate quick asset inventory report
 *     description: Generate a quick asset inventory report in the specified format
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel]
 *           default: json
 *         description: Report format
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by asset category
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by asset status
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by location
 *     responses:
 *       200:
 *         description: Report generated successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/quick/asset-inventory',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateQuery(
    z.object({
      format: z.enum(['json', 'csv', 'excel']).default('json'),
      category: z.string().optional(),
      status: z.string().optional(),
      locationId: z.string().uuid().optional(),
    }),
  ),
  async (req: any, res, next) => {
    try {
      const { format } = req.query;

      // Generate asset inventory report
      const report = await reportingService.generateReport(req.context!, 'asset-inventory', {
        format: format as any,
        includeHeaders: true,
      });

      if (format === 'csv' && report.file) {
        res.setHeader('Content-Type', report.mimeType || 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
        res.send(report.file);
      } else if (format === 'excel' && report.file) {
        res.setHeader(
          'Content-Type',
          report.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
        res.send(report.file);
      } else {
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/quick/maintenance-summary:
 *   get:
 *     summary: Generate maintenance summary report
 *     description: Generate a summary of maintenance tasks and costs
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel]
 *           default: json
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: groupByAsset
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: Report generated successfully
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/quick/maintenance-summary',
  authenticateJWT,
  requirePermission('read', 'report'),
  async (req, res, next) => {
    try {
      const format = (req.query.format as string) || 'json';
      // const groupByAsset = req.query.groupByAsset !== 'false';

      // Maintenance report logic is stubbed

      // Generate stub maintenance report data
      const data = [
        {
          assetName: 'Sample Asset',
          totalCost: 1000,
          totalTime: 10,
          taskCount: 5,
        },
      ];

      const formatted = {
        data,
        file: format === 'csv' ? 'asset,cost,time,tasks\nSample Asset,1000,10,5' : null,
        mimeType: format === 'csv' ? 'text/csv' : 'application/json',
        fileName: `maintenance-summary.${format}`,
      };

      const report = {
        metadata: {
          reportId: 'maintenance-summary',
          name: 'Maintenance Summary',
          generatedAt: new Date(),
          rowCount: data.length,
          format,
        },
        ...formatted,
      };

      if (format === 'csv' && report.file) {
        res.setHeader('Content-Type', report.mimeType || 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
        res.send(report.file);
      } else if (format === 'excel' && report.file) {
        res.setHeader(
          'Content-Type',
          report.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
        res.send(report.file);
      } else {
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/asset-age-analysis:
 *   get:
 *     summary: Generate asset age analysis report
 *     description: Generate a comprehensive report analyzing asset ages and their distribution
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel, pdf]
 *           default: json
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Asset age analysis report generated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  '/asset-age-analysis',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateQuery(assetReportQuerySchema),
  async (req: any, res, next) => {
    try {
      const { format, ...filters } = req.query;

      const reportRequest = { organizationId: req.context!.organizationId, filters, format: format as any };
      const report = await reportingService.generateAssetAgeAnalysis(reportRequest, {});

      if (format !== 'json') {
        const exported = await reportingService.exportReport(
          report,
          format as any,
          'Asset Age Analysis Report',
        );

        if (format === 'pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="asset-age-analysis.pdf"');
        } else if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="asset-age-analysis.csv"');
        } else if (format === 'excel') {
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          res.setHeader('Content-Disposition', 'attachment; filename="asset-age-analysis.xlsx"');
        }

        res.send(exported);
      } else {
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/asset-warranty:
 *   get:
 *     summary: Generate asset warranty report
 *     description: Generate a report showing warranty status and expiry dates for assets
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel, pdf]
 *           default: json
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Asset warranty report generated successfully
 */
router.get(
  '/asset-warranty',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateQuery(assetReportQuerySchema),
  async (req: any, res, next) => {
    try {
      const { format, ...filters } = req.query;

      const reportRequest = { organizationId: req.context!.organizationId, filters, format: format as any };
      const report = await reportingService.generateAssetWarrantyReport(reportRequest, {});

      if (format !== 'json') {
        const exported = await reportingService.exportReport(
          report,
          format as any,
          'Asset Warranty Report',
        );

        if (format === 'pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="asset-warranty-report.pdf"');
        } else if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="asset-warranty-report.csv"');
        } else if (format === 'excel') {
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          res.setHeader('Content-Disposition', 'attachment; filename="asset-warranty-report.xlsx"');
        }

        res.send(exported);
      } else {
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/task-completion:
 *   get:
 *     summary: Generate task completion report
 *     description: Generate a comprehensive report on task completion rates and metrics
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel, pdf]
 *           default: json
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: assigneeId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: assetId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Task completion report generated successfully
 */
router.get(
  '/task-completion',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateQuery(taskReportQuerySchema),
  async (req: any, res, next) => {
    try {
      const { format, ...filters } = req.query;

      const reportRequest = { organizationId: req.context!.organizationId, filters, format: format as any };
      const report = await reportingService.generateTaskCompletionReport(reportRequest, {});

      if (format !== 'json') {
        const exported = await reportingService.exportReport(
          report,
          format as any,
          'Task Completion Report',
        );

        if (format === 'pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="task-completion-report.pdf"');
        } else if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="task-completion-report.csv"');
        } else if (format === 'excel') {
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          res.setHeader(
            'Content-Disposition',
            'attachment; filename="task-completion-report.xlsx"',
          );
        }

        res.send(exported);
      } else {
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/user-workload:
 *   get:
 *     summary: Generate user workload report
 *     description: Generate a report showing user workload distribution and performance metrics
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv, excel, pdf]
 *           default: json
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *     responses:
 *       200:
 *         description: User workload report generated successfully
 */
router.get(
  '/user-workload',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateQuery(userReportQuerySchema),
  async (req: any, res, next) => {
    try {
      const { format, ...filters } = req.query;

      const reportRequest = { organizationId: req.context!.organizationId, filters, format: format as any };
      const report = await reportingService.generateUserWorkloadReport(reportRequest, {});

      if (format !== 'json') {
        const exported = await reportingService.exportReport(
          report,
          format as any,
          'User Workload Report',
        );

        if (format === 'pdf') {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename="user-workload-report.pdf"');
        } else if (format === 'csv') {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', 'attachment; filename="user-workload-report.csv"');
        } else if (format === 'excel') {
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          );
          res.setHeader('Content-Disposition', 'attachment; filename="user-workload-report.xlsx"');
        }

        res.send(exported);
      } else {
        res.json(report);
      }
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/scheduled:
 *   get:
 *     summary: Get scheduled reports
 *     description: Retrieve all scheduled reports for the organization
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduled reports retrieved successfully
 */
router.get(
  '/scheduled',
  authenticateJWT,
  requirePermission('read', 'report'),
  async (req, res, next) => {
    try {
      const scheduledReports = await prisma.scheduledReport.findMany({
        where: {
          organizationId: req.context!.organizationId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          report: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      res.json(scheduledReports);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/scheduled:
 *   post:
 *     summary: Create a scheduled report
 *     description: Create a new scheduled report
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *               format:
 *                 type: string
 *                 enum: [pdf, csv, excel]
 *               schedule:
 *                 type: object
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *               filters:
 *                 type: object
 *               enabled:
 *                 type: boolean
 *             required: [name, type, format, schedule, recipients]
 *     responses:
 *       201:
 *         description: Scheduled report created successfully
 */
router.post(
  '/scheduled',
  authenticateJWT,
  requirePermission('create', 'report'),
  validateBody(
    z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      type: z.string(),
      format: z.enum(['pdf', 'csv', 'excel']),
      schedule: z.record(z.any()),
      recipients: z.array(z.string().email()),
      filters: z.record(z.any()).optional(),
      enabled: z.boolean().default(true),
      customReportId: z.string(),
    }),
  ),
  async (req, res, next) => {
    try {
      const { schedule, ...data } = req.body;

      // Calculate next run time based on schedule
      const nextRunAt = reportingService.calculateNextRunTime(schedule);

      const scheduledReport = await prisma.scheduledReport.create({
        data: {
          ...data,
          schedule,
          nextRunAt,
          organizationId: req.context!.organizationId,
          createdById: req.context!.userId,
        },
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          report: true,
        },
      });

      res.status(201).json(scheduledReport);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/scheduled/{id}:
 *   patch:
 *     summary: Update a scheduled report
 *     description: Update an existing scheduled report
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Scheduled report ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               format:
 *                 type: string
 *               schedule:
 *                 type: object
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *               filters:
 *                 type: object
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Scheduled report updated successfully
 */
router.patch(
  '/scheduled/:id',
  authenticateJWT,
  requirePermission('update', 'report'),
  validateParams(z.object({ id: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { schedule, ...data } = req.body;

      const updateData: any = { ...data };

      if (schedule) {
        updateData.schedule = schedule;
        updateData.nextRunAt = reportingService.calculateNextRunTime(schedule);
      }

      const scheduledReport = await prisma.scheduledReport.update({
        where: {
          id,
          organizationId: req.context!.organizationId,
        },
        data: updateData,
        include: {
          createdBy: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          report: true,
        },
      });

      res.json(scheduledReport);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/scheduled/{id}:
 *   delete:
 *     summary: Delete a scheduled report
 *     description: Delete a scheduled report
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Scheduled report ID
 *     responses:
 *       204:
 *         description: Scheduled report deleted successfully
 */
router.delete(
  '/scheduled/:id',
  authenticateJWT,
  requirePermission('delete', 'report'),
  validateParams(z.object({ id: z.string().uuid() })),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      await prisma.scheduledReport.delete({
        where: {
          id,
          organizationId: req.context!.organizationId,
        },
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @swagger
 * /api/reports/history:
 *   get:
 *     summary: Get report generation history
 *     description: Retrieve history of generated reports
 *     tags: [Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Report history retrieved successfully
 */
router.get(
  '/history',
  authenticateJWT,
  requirePermission('read', 'report'),
  validateQuery(
    z.object({
      limit: z.coerce.number().min(1).max(100).default(50),
      offset: z.coerce.number().min(0).default(0),
    }),
  ),
  async (req, res, next) => {
    try {
      const { limit, offset } = req.query as any;

      const history = await prisma.reportHistory.findMany({
        where: {
          organizationId: req.context!.organizationId,
        },
        include: {
          generatedBy: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
          scheduledReport: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          generatedAt: 'desc',
        },
        take: limit,
        skip: offset,
      });

      const total = await prisma.reportHistory.count({
        where: {
          organizationId: req.context!.organizationId,
        },
      });

      res.json({
        data: history,
        total,
        limit,
        offset,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
