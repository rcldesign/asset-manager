import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { dataExportService } from '../services/data-export.service';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import * as fs from 'fs/promises';
import path from 'path';

const router = Router();

// Export options schema
const exportOptionsSchema = z.object({
  format: z.enum(['json', 'csv', 'excel']),
  includeRelations: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
  filters: z.record(z.any()).optional(),
});

// Asset export endpoint
router.post(
  '/assets',
  authMiddleware,
  validateRequest({
    body: exportOptionsSchema,
  }),
  asyncHandler(async (req, res) => {
    const result = await dataExportService.exportAssets(req.context!, req.body);
    
    res.json({
      success: true,
      data: {
        fileName: result.fileName,
        recordCount: result.recordCount,
        format: result.format,
        downloadUrl: `/api/exports/download/${path.basename(result.filePath)}`,
        createdAt: result.createdAt,
      },
    });
  })
);

// Task export endpoint
router.post(
  '/tasks',
  authMiddleware,
  validateRequest({
    body: exportOptionsSchema,
  }),
  asyncHandler(async (req, res) => {
    const result = await dataExportService.exportTasks(req.context!, req.body);
    
    res.json({
      success: true,
      data: {
        fileName: result.fileName,
        recordCount: result.recordCount,
        format: result.format,
        downloadUrl: `/api/exports/download/${path.basename(result.filePath)}`,
        createdAt: result.createdAt,
      },
    });
  })
);

// Location export endpoint
router.post(
  '/locations',
  authMiddleware,
  validateRequest({
    body: exportOptionsSchema,
  }),
  asyncHandler(async (req, res) => {
    const result = await dataExportService.exportLocations(req.context!, req.body);
    
    res.json({
      success: true,
      data: {
        fileName: result.fileName,
        recordCount: result.recordCount,
        format: result.format,
        downloadUrl: `/api/exports/download/${path.basename(result.filePath)}`,
        createdAt: result.createdAt,
      },
    });
  })
);

// User data export (GDPR)
router.post(
  '/user/:userId',
  authMiddleware,
  validateRequest({
    params: z.object({
      userId: z.string().uuid(),
    }),
  }),
  asyncHandler(async (req, res) => {
    // Users can only export their own data unless they're an admin
    if (req.context!.userId !== req.params.userId && 
        req.context!.userRole !== 'OWNER' && 
        req.context!.userRole !== 'MANAGER') {
      return res.status(403).json({
        success: false,
        error: 'You can only export your own data',
      });
    }

    const result = await dataExportService.exportUserData(req.context!, req.params.userId);
    
    res.json({
      success: true,
      data: {
        fileName: result.fileName,
        recordCount: result.recordCount,
        format: result.format,
        downloadUrl: `/api/exports/download/${path.basename(result.filePath)}`,
        createdAt: result.createdAt,
      },
    });
  })
);

// Download exported file
router.get(
  '/download/:fileName',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { fileName } = req.params;
    
    // Security: Ensure fileName doesn't contain path traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file name',
      });
    }

    const exportPath = process.env.EXPORT_PATH || path.join(process.cwd(), 'exports');
    const filePath = path.join(exportPath, fileName);

    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Set appropriate headers based on file extension
      const ext = path.extname(fileName).toLowerCase();
      let contentType = 'application/octet-stream';
      
      switch (ext) {
        case '.json':
          contentType = 'application/json';
          break;
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.xlsx':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Stream the file
      const fileContent = await fs.readFile(filePath);
      res.send(fileContent);

      // Optional: Delete file after download for security
      if (process.env.DELETE_EXPORTS_AFTER_DOWNLOAD === 'true') {
        setTimeout(async () => {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            console.error('Failed to delete export file:', error);
          }
        }, 5000); // Delete after 5 seconds
      }
    } catch (error) {
      res.status(404).json({
        success: false,
        error: 'Export file not found',
      });
    }
  })
);

// Cleanup old exports (admin only)
router.post(
  '/cleanup',
  authMiddleware,
  validateRequest({
    body: z.object({
      daysToKeep: z.number().min(1).max(365).default(7),
    }),
  }),
  asyncHandler(async (req, res) => {
    // Only admins can trigger cleanup
    if (req.context!.userRole !== 'OWNER' && req.context!.userRole !== 'MANAGER') {
      return res.status(403).json({
        success: false,
        error: 'Only administrators can trigger export cleanup',
      });
    }

    const deletedCount = await dataExportService.cleanupOldExports(req.body.daysToKeep);
    
    res.json({
      success: true,
      data: {
        deletedFiles: deletedCount,
        message: `Deleted ${deletedCount} export files older than ${req.body.daysToKeep} days`,
      },
    });
  })
);

export default router;