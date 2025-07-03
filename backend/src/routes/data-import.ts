import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { dataImportService } from '../services/data-import.service';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import multer from 'multer';
import path from 'path';
import * as fs from 'fs/promises';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    const uploadPath = process.env.IMPORT_TEMP_PATH || path.join(process.cwd(), 'temp/imports');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error: any) {
      cb(error, uploadPath);
    }
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedExtensions = ['.csv', '.xlsx', '.xls', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, and JSON files are allowed.'));
    }
  },
});

// Field mapping schema
const fieldMappingSchema = z.record(
  z.union([
    z.string(),
    z.object({
      targetField: z.string(),
      required: z.boolean().optional(),
      defaultValue: z.any().optional(),
    }),
  ]),
);

// Import options schema
const importOptionsSchema = z.object({
  format: z.enum(['csv', 'excel', 'json']),
  mapping: fieldMappingSchema.optional(),
  validateOnly: z.boolean().optional().default(false),
  skipErrors: z.boolean().optional().default(false),
  batchSize: z.number().min(1).max(1000).optional().default(100),
});

// Asset import endpoint
router.post(
  '/assets',
  authMiddleware,
  upload.single('file'),
  validateRequest({
    body: importOptionsSchema,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    try {
      const result = await dataImportService.importAssets(req.context!, req.file.path, req.body);

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      // Clean up uploaded file on error
      await fs.unlink(req.file.path).catch(() => {});
      throw error;
    }
  }),
);

// Task import endpoint
router.post(
  '/tasks',
  authMiddleware,
  upload.single('file'),
  validateRequest({
    body: importOptionsSchema,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    try {
      const result = await dataImportService.importTasks(req.context!, req.file.path, req.body);

      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      throw error;
    }
  }),
);

// Location import endpoint
router.post(
  '/locations',
  authMiddleware,
  upload.single('file'),
  validateRequest({
    body: importOptionsSchema,
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    try {
      const result = await dataImportService.importLocations(req.context!, req.file.path, req.body);

      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      throw error;
    }
  }),
);

// Get import template
router.get(
  '/template/:type',
  authMiddleware,
  validateRequest({
    params: z.object({
      type: z.enum(['assets', 'tasks', 'locations']),
    }),
    query: z.object({
      format: z.enum(['csv', 'excel', 'json']).default('csv'),
    }),
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type } = req.params as { type: string };
    const { format } = req.query as { format: string };

    let template: any;
    let filename: string;
    let contentType: string;

    // Define template structures
    const templates = {
      assets: [
        {
          name: 'Example Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          manufacturer: 'Example Corp',
          modelNumber: 'MODEL-001',
          serialNumber: 'SN-001',
          purchaseDate: '2024-01-01',
          purchasePrice: 1000.0,
          description: 'Example asset description',
          locationId: '',
          tags: 'tag1,tag2',
          warrantyExpiry: '2025-01-01',
          warrantyLifetime: false,
        },
      ],
      tasks: [
        {
          title: 'Example Task',
          description: 'Task description',
          dueDate: '2024-12-31',
          status: 'PLANNED',
          priority: 'MEDIUM',
          estimatedCost: 100.0,
          estimatedMinutes: 60,
          assetId: '',
          isPhotoRequired: false,
        },
      ],
      locations: [
        {
          name: 'Main Office',
          description: 'Main office location',
          parentId: '',
        },
      ],
    };

    template = templates[type as keyof typeof templates];

    switch (format) {
      case 'json':
        filename = `${type}-import-template.json`;
        contentType = 'application/json';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.json(template);
        break;

      case 'csv':
        filename = `${type}-import-template.csv`;
        contentType = 'text/csv';
        const { Parser } = require('json2csv');
        const parser = new Parser();
        const csv = parser.parse(template);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
        break;

      case 'excel':
        filename = `${type}-import-template.xlsx`;
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        const XLSX = require('xlsx');
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(template);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Import Template');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
        break;
    }
  }),
);

// Get field mapping suggestions
router.post(
  '/mapping-suggestions',
  authMiddleware,
  upload.single('file'),
  validateRequest({
    body: z.object({
      targetType: z.enum(['assets', 'tasks', 'locations']),
      format: z.enum(['csv', 'excel', 'json']),
    }),
  }),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
      return;
    }

    try {
      // Read the first few rows to analyze structure
      const data = await dataImportService['parseFile'](req.file.path, req.body.format);
      const sampleData = data.slice(0, 5);

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      if (sampleData.length === 0) {
        res.json({
          success: true,
          data: {
            sourceFields: [],
            suggestedMappings: {},
            sampleData: [],
          },
        });
        return;
      }

      const sourceFields = Object.keys(sampleData[0]);

      // Suggest mappings based on field names
      const suggestedMappings: any = {};
      const commonMappings: Record<string, Record<string, string>> = {
        assets: {
          'asset name': 'name',
          asset_name: 'name',
          type: 'category',
          'asset type': 'category',
          asset_type: 'category',
          serial: 'serialNumber',
          'serial number': 'serialNumber',
          serial_number: 'serialNumber',
          'purchase date': 'purchaseDate',
          purchase_date: 'purchaseDate',
          price: 'purchasePrice',
          cost: 'purchasePrice',
          warranty: 'warrantyExpiry',
          'warranty expiry': 'warrantyExpiry',
          warranty_expiry: 'warrantyExpiry',
        },
        tasks: {
          'task name': 'title',
          task_name: 'title',
          name: 'title',
          due: 'dueDate',
          'due date': 'dueDate',
          due_date: 'dueDate',
          deadline: 'dueDate',
          desc: 'description',
          'estimated time': 'estimatedMinutes',
          estimated_time: 'estimatedMinutes',
          time: 'estimatedMinutes',
        },
        locations: {
          'location name': 'name',
          location_name: 'name',
          parent: 'parentId',
          'parent location': 'parentId',
          parent_location: 'parentId',
          desc: 'description',
        },
      };

      const targetMappings = commonMappings[req.body.targetType] || {};

      sourceFields.forEach((field) => {
        const lowerField = field.toLowerCase();
        if (targetMappings[lowerField]) {
          suggestedMappings[field] = targetMappings[lowerField];
        } else if (lowerField === field) {
          // Direct match
          suggestedMappings[field] = field;
        }
      });

      res.json({
        success: true,
        data: {
          sourceFields,
          suggestedMappings,
          sampleData,
        },
      });
    } catch (error) {
      await fs.unlink(req.file.path).catch(() => {});
      throw error;
    }
  }),
);

export default router;
