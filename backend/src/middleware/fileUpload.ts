import multer from 'multer';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import type { FileValidationOptions } from '../services/file-validation.service';
import { FileValidationService } from '../services/file-validation.service';
import { config } from '../config';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import type { AuthenticatedRequest } from './auth';

// Extended file type with validation metadata
interface FileWithValidation extends Express.Multer.File {
  validationMetadata?: Record<string, unknown>;
}

// Configure multer for memory storage (files stored in buffer)
const storage = multer.memoryStorage();

// File upload limits
const FILE_UPLOAD_LIMITS = {
  asset: {
    maxSize: 50 * 1024 * 1024, // 50MB
    maxFiles: 10,
  },
  task: {
    maxSize: 25 * 1024 * 1024, // 25MB
    maxFiles: 5,
  },
  profile: {
    maxSize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
  },
};

// Allowed MIME types by context
const ALLOWED_MIME_TYPES = {
  asset: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
  ],
  task: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/zip',
  ],
  profile: ['image/jpeg', 'image/png', 'image/webp'],
};

// Allowed extensions by context
const ALLOWED_EXTENSIONS = {
  asset: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.txt',
    '.csv',
    '.zip',
    '.rar',
    '.7z',
  ],
  task: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.zip'],
  profile: ['.jpg', '.jpeg', '.png', '.webp'],
};

/**
 * Create multer instance with security configurations
 */
export function createUploadMiddleware(context: 'asset' | 'task' | 'profile'): multer.Multer {
  const limits = FILE_UPLOAD_LIMITS[context];

  return multer({
    storage: storage,
    limits: {
      fileSize: limits.maxSize,
      files: limits.maxFiles,
      fieldSize: 1024 * 1024, // 1MB for field data
      headerPairs: 100, // Limit header pairs to prevent header bomb attacks
    },
    fileFilter: (_req, file, cb) => {
      // Basic file filter - detailed validation happens in validateUploadedFile
      const extension = file.originalname.toLowerCase().split('.').pop();

      // Reject obviously dangerous extensions immediately
      const dangerousExtensions = ['exe', 'scr', 'bat', 'cmd', 'com', 'pif', 'vbs', 'js', 'jar'];
      if (extension && dangerousExtensions.includes(extension)) {
        const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE');
        error.message = `File type .${extension} is not allowed`;
        return cb(error);
      }

      // Accept file for now, full validation will happen in middleware
      cb(null, true);
    },
  });
}

/**
 * Middleware to validate uploaded files
 */
export function validateUploadedFile(
  context: 'asset' | 'task' | 'profile',
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.file && !req.files) {
        return next();
      }

      const fileValidationService = new FileValidationService();
      const files = req.files
        ? Array.isArray(req.files)
          ? req.files
          : Object.values(req.files).flat()
        : [req.file];

      const validationOptions: FileValidationOptions = {
        allowedMimeTypes: ALLOWED_MIME_TYPES[context],
        allowedExtensions: ALLOWED_EXTENSIONS[context],
        maxSizeBytes: FILE_UPLOAD_LIMITS[context].maxSize,
        checkMagicNumbers: true,
        scanForMalware: config.security.enableMalwareScanning,
      };

      for (const file of files.filter(Boolean)) {
        if (!file) continue;

        const validationResult = await fileValidationService.validateFile(file, validationOptions);

        if (!validationResult.isValid) {
          logger.warn('File validation failed', {
            filename: file.originalname,
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            context,
          });

          throw new ValidationError(
            `File validation failed: ${validationResult.errors.join(', ')}`,
          );
        }

        // Log warnings if any
        if (validationResult.warnings.length > 0) {
          logger.info('File validation warnings', {
            filename: file.originalname,
            warnings: validationResult.warnings,
            context,
          });
        }

        // Attach validation metadata to file object for later use
        (file as FileWithValidation).validationMetadata = validationResult.metadata;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Rate limiting for file uploads
 */
export const createUploadRateLimiter = (
  context: 'asset' | 'task' | 'profile',
): ReturnType<typeof rateLimit> => {
  const limits = {
    asset: { windowMs: 15 * 60 * 1000, max: 50 }, // 50 uploads per 15 minutes
    task: { windowMs: 15 * 60 * 1000, max: 30 }, // 30 uploads per 15 minutes
    profile: { windowMs: 60 * 60 * 1000, max: 5 }, // 5 uploads per hour
  };

  return rateLimit({
    ...limits[context],
    message: `Too many file uploads. Please try again later.`,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      const authReq = req as AuthenticatedRequest;
      return authReq.user?.id || req.ip || 'unknown';
    },
    skip: (req) => {
      // Skip rate limiting for admin users
      const authReq = req as AuthenticatedRequest;
      return authReq.user?.role === 'OWNER';
    },
  });
};

/**
 * Middleware to handle file upload errors
 */
export function handleUploadErrors(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        res.status(400).json({
          error: 'File too large',
          message: `File size exceeds the maximum allowed size`,
          code: 'FILE_TOO_LARGE',
        });
        return;
      case 'LIMIT_FILE_COUNT':
        res.status(400).json({
          error: 'Too many files',
          message: `Number of files exceeds the maximum allowed`,
          code: 'TOO_MANY_FILES',
        });
        return;
      case 'LIMIT_UNEXPECTED_FILE':
        if (error.message && error.message.includes('File type')) {
          res.status(400).json({
            error: 'Invalid file type',
            message: error.message,
            code: 'INVALID_FILE_TYPE',
          });
        } else {
          res.status(400).json({
            error: 'Unexpected field',
            message: `Unexpected file field in request`,
            code: 'UNEXPECTED_FIELD',
          });
        }
        return;
      default:
        res.status(400).json({
          error: 'Upload error',
          message: error.message,
          code: 'UPLOAD_ERROR',
        });
        return;
    }
  }

  next(error);
}

/**
 * Clean filename for storage and display
 */
export function sanitizeFilename(filename: string): string {
  // Remove any path components
  const basename = filename.split(/[/\\]/).pop() || 'unnamed';

  // Replace spaces and special characters
  let cleaned = basename.replace(/[^a-zA-Z0-9.-]/g, '_');

  // Remove multiple dots
  cleaned = cleaned.replace(/\.{2,}/g, '.');

  // Ensure it doesn't start with a dot
  cleaned = cleaned.replace(/^\./, '');

  // Limit length
  const maxLength = 100;
  if (cleaned.length > maxLength) {
    const ext = cleaned.lastIndexOf('.');
    if (ext > 0) {
      cleaned = cleaned.substring(0, maxLength - (cleaned.length - ext)) + cleaned.substring(ext);
    } else {
      cleaned = cleaned.substring(0, maxLength);
    }
  }

  return cleaned || 'unnamed_file';
}

/**
 * Generate a secure storage path
 */
export function generateStoragePath(context: 'asset' | 'task' | 'profile', fileId: string): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Organize files by context/year/month/day/file
  return `${context}/${year}/${month}/${day}/${fileId}`;
}

/**
 * Middleware to check if uploads are enabled
 */
export function checkUploadsEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!config.upload.enabled) {
    res.status(503).json({
      error: 'Service unavailable',
      message: 'File uploads are temporarily disabled',
      code: 'UPLOADS_DISABLED',
    });
    return;
  }
  next();
}

/**
 * Middleware to log file uploads
 */
export function logFileUpload(
  context: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.file || req.files) {
      const files = req.files
        ? Array.isArray(req.files)
          ? req.files
          : Object.values(req.files).flat()
        : [req.file];

      files.filter(Boolean).forEach((file) => {
        logger.info('File upload attempt', {
          context,
          filename: file?.originalname,
          size: file?.size,
          mimetype: file?.mimetype,
          userId: (req as AuthenticatedRequest).user?.id,
          ip: req.ip,
        });
      });
    }
    next();
  };
}
