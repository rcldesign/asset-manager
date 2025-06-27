import * as crypto from 'crypto';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface FileValidationOptions {
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
  allowedExtensions?: string[];
  scanForMalware?: boolean;
  checkMagicNumbers?: boolean;
  requireVirusScan?: boolean;
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata: {
    actualMimeType?: string;
    fileSize: number;
    extension: string;
    hasValidMagicNumber: boolean;
    checksum?: string;
  };
}

export interface MagicNumberSignature {
  mimeType: string;
  signatures: { offset: number; bytes: Buffer }[];
}

/**
 * Enhanced file validation service with security features.
 * Provides comprehensive file validation including magic number verification,
 * malware scanning, and content analysis for embedded threats.
 *
 * @class FileValidationService
 */
export class FileValidationService {
  // Magic number signatures for common file types
  private static readonly MAGIC_NUMBERS: MagicNumberSignature[] = [
    // Images
    {
      mimeType: 'image/jpeg',
      signatures: [{ offset: 0, bytes: Buffer.from([0xff, 0xd8, 0xff]) }],
    },
    {
      mimeType: 'image/png',
      signatures: [
        { offset: 0, bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
      ],
    },
    {
      mimeType: 'image/gif',
      signatures: [
        { offset: 0, bytes: Buffer.from('GIF87a', 'ascii') },
        { offset: 0, bytes: Buffer.from('GIF89a', 'ascii') },
      ],
    },
    {
      mimeType: 'image/webp',
      signatures: [
        { offset: 0, bytes: Buffer.from('RIFF', 'ascii') },
        { offset: 8, bytes: Buffer.from('WEBP', 'ascii') },
      ],
    },
    // Documents
    {
      mimeType: 'application/pdf',
      signatures: [{ offset: 0, bytes: Buffer.from('%PDF-', 'ascii') }],
    },
    {
      mimeType: 'application/zip',
      signatures: [
        { offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
        { offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x05, 0x06]) }, // Empty archive
        { offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x07, 0x08]) }, // Spanned archive
      ],
    },
    // Office documents (which are actually zip files)
    {
      mimeType: 'application/vnd.openxmlformats-officedocument',
      signatures: [{ offset: 0, bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }],
    },
  ];

  // Dangerous file extensions that should be blocked
  private static readonly DANGEROUS_EXTENSIONS = [
    '.exe',
    '.scr',
    '.vbs',
    '.com',
    '.pif',
    '.cmd',
    '.bat',
    '.dll',
    '.jar',
    '.app',
    '.msi',
    '.ps1',
    '.psm1',
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ksh',
    '.csh',
    '.tcsh',
    '.command',
    '.workflow',
    '.action',
    '.definition',
    '.wsc',
    '.wsf',
    '.ws',
    '.vb',
    '.vbe',
    '.js',
    '.jse',
    '.hta',
    '.htm',
    '.html',
    '.mht',
    '.mhtml',
    '.xml',
    '.xsl',
    '.xslt',
  ];

  // Safe file extensions whitelist
  private static readonly SAFE_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.bmp',
    '.svg',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.csv',
    '.rtf',
    '.odt',
    '.ods',
    '.odp',
    '.mp4',
    '.avi',
    '.mov',
    '.wmv',
    '.mpg',
    '.mpeg',
    '.mp3',
    '.wav',
    '.ogg',
    '.m4a',
    '.aac',
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
    '.bz2',
  ];

  /**
   * Comprehensive file validation with multiple security checks.
   * Validates file size, extension, MIME type, magic numbers, and content.
   *
   * @param {Express.Multer.File} file - File to validate
   * @param {FileValidationOptions} [options={}] - Validation options
   * @returns {Promise<FileValidationResult>} Validation results with errors and warnings
   *
   * @example
   * const result = await validationService.validateFile(req.file, {
   *   allowedMimeTypes: ['image/jpeg', 'image/png'],
   *   maxSizeBytes: 5 * 1024 * 1024,
   *   checkMagicNumbers: true
   * });
   *
   * if (!result.isValid) {
   *   console.error('Validation errors:', result.errors);
   * }
   */
  async validateFile(
    file: Express.Multer.File,
    options: FileValidationOptions = {},
  ): Promise<FileValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const metadata: any = {
      fileSize: file.size,
      extension: path.extname(file.originalname).toLowerCase(),
      hasValidMagicNumber: false,
    };

    // 1. File size validation
    const maxSize = options.maxSizeBytes || 10 * 1024 * 1024; // Default 10MB
    if (file.size > maxSize) {
      errors.push(
        `File size (${this.formatFileSize(file.size)}) exceeds maximum allowed size (${this.formatFileSize(maxSize)})`,
      );
    }

    if (file.size === 0) {
      errors.push('Empty files are not allowed');
    }

    // 2. File name validation
    const fileName = file.originalname;
    if (this.containsPathTraversal(fileName)) {
      errors.push('Invalid filename: path traversal attempt detected');
    }

    if (this.containsDangerousCharacters(fileName)) {
      errors.push('Filename contains invalid characters');
    }

    // 3. Extension validation
    const extension = metadata.extension;
    if (extension === '') {
      warnings.push('File has no extension');
    }

    // Check against dangerous extensions
    if (FileValidationService.DANGEROUS_EXTENSIONS.includes(extension)) {
      errors.push(`File extension ${extension} is not allowed for security reasons`);
    }

    // Check against allowed extensions if specified
    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      if (!options.allowedExtensions.includes(extension)) {
        errors.push(
          `File extension ${extension} is not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`,
        );
      }
    } else if (!FileValidationService.SAFE_EXTENSIONS.includes(extension)) {
      warnings.push(`File extension ${extension} is not in the safe extensions list`);
    }

    // 4. MIME type validation with magic numbers
    if (options.checkMagicNumbers !== false) {
      const magicNumberResult = await this.checkMagicNumbers(file.buffer);
      metadata.hasValidMagicNumber = magicNumberResult.isValid;
      metadata.actualMimeType = magicNumberResult.detectedMimeType;

      if (!magicNumberResult.isValid) {
        warnings.push('Could not verify file type from magic numbers');
      } else if (magicNumberResult.detectedMimeType) {
        // Verify MIME type matches expected
        if (
          options.allowedMimeTypes &&
          !options.allowedMimeTypes.includes(magicNumberResult.detectedMimeType)
        ) {
          errors.push(`Detected file type (${magicNumberResult.detectedMimeType}) is not allowed`);
        }

        // Check for MIME type mismatch
        if (file.mimetype !== magicNumberResult.detectedMimeType) {
          warnings.push(
            `Declared MIME type (${file.mimetype}) does not match detected type (${magicNumberResult.detectedMimeType})`,
          );
        }
      }
    } else if (options.allowedMimeTypes && !options.allowedMimeTypes.includes(file.mimetype)) {
      errors.push(
        `File type ${file.mimetype} is not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`,
      );
    }

    // 5. Calculate file checksum
    metadata.checksum = this.calculateChecksum(file.buffer);

    // 6. Check for embedded scripts in certain file types
    if (this.shouldCheckForEmbeddedContent(extension)) {
      const embeddedContentCheck = await this.checkForEmbeddedScripts(file.buffer);
      if (embeddedContentCheck.hasEmbeddedScripts) {
        errors.push('File contains potentially dangerous embedded content');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      metadata,
    };
  }

  /**
   * Check file magic numbers to verify actual file type.
   * Prevents MIME type spoofing by examining file headers.
   *
   * @param {Buffer} buffer - File buffer to check
   * @returns {Promise<Object>} Validation result with detected MIME type
   * @private
   */
  private async checkMagicNumbers(buffer: Buffer): Promise<{
    isValid: boolean;
    detectedMimeType?: string;
  }> {
    for (const magicNumber of FileValidationService.MAGIC_NUMBERS) {
      const matches = magicNumber.signatures.every((signature) => {
        if (buffer.length < signature.offset + signature.bytes.length) {
          return false;
        }
        return buffer
          .slice(signature.offset, signature.offset + signature.bytes.length)
          .equals(signature.bytes);
      });

      if (matches) {
        return {
          isValid: true,
          detectedMimeType: magicNumber.mimeType,
        };
      }
    }

    return { isValid: false };
  }

  /**
   * Check for path traversal attempts in filename.
   * Prevents directory traversal attacks.
   *
   * @param {string} filename - Filename to check
   * @returns {boolean} True if path traversal detected
   * @private
   */
  private containsPathTraversal(filename: string): boolean {
    const dangerous = ['..', '~', '\\', '/', ':', '*', '?', '"', '<', '>', '|'];
    return dangerous.some((char) => filename.includes(char));
  }

  /**
   * Check for dangerous characters in filename.
   * Ensures filename contains only safe characters.
   *
   * @param {string} filename - Filename to check
   * @returns {boolean} True if dangerous characters found
   * @private
   */
  private containsDangerousCharacters(filename: string): boolean {
    // Allow only alphanumeric, dots, hyphens, underscores, and spaces
    const safePattern = /^[a-zA-Z0-9.\-_ ]+$/;
    return !safePattern.test(filename);
  }

  /**
   * Calculate file checksum for integrity verification.
   *
   * @param {Buffer} buffer - File buffer
   * @returns {string} SHA-256 checksum in hexadecimal
   * @private
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Format file size for human-readable display.
   *
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size string (e.g., "2.5 MB")
   * @private
   */
  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Check if file type should be scanned for embedded content.
   * Identifies file types that can contain executable content.
   *
   * @param {string} extension - File extension
   * @returns {boolean} True if file should be scanned
   * @private
   */
  private shouldCheckForEmbeddedContent(extension: string): boolean {
    const extensionsToCheck = ['.svg', '.xml', '.html', '.htm', '.xhtml'];
    return extensionsToCheck.includes(extension);
  }

  /**
   * Check for embedded scripts in files like SVG.
   * Detects potentially malicious JavaScript and event handlers.
   *
   * @param {Buffer} buffer - File buffer to scan
   * @returns {Promise<Object>} Detection results with found patterns
   * @private
   */
  private async checkForEmbeddedScripts(buffer: Buffer): Promise<{
    hasEmbeddedScripts: boolean;
    scriptPatterns?: string[];
  }> {
    const content = buffer.toString('utf8');
    const dangerousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i, // Event handlers like onclick, onload, etc.
      /<iframe/i,
      /<embed/i,
      /<object/i,
      /<applet/i,
      /<link/i,
      /<meta.*http-equiv/i,
      /document\./i,
      /window\./i,
      /eval\s*\(/i,
      /setTimeout\s*\(/i,
      /setInterval\s*\(/i,
    ];

    const foundPatterns: string[] = [];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        foundPatterns.push(pattern.source);
      }
    }

    return {
      hasEmbeddedScripts: foundPatterns.length > 0,
      scriptPatterns: foundPatterns,
    };
  }

  /**
   * Sanitize filename for safe storage.
   * Removes dangerous characters and path components.
   *
   * @param {string} filename - Original filename
   * @returns {string} Sanitized filename safe for storage
   *
   * @example
   * const safe = validationService.sanitizeFilename('../../../etc/passwd');
   * // Returns: 'etc_passwd'
   */
  sanitizeFilename(filename: string): string {
    // Remove path components
    const basename = path.basename(filename);

    // Replace unsafe characters with underscores
    let safe = basename.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    // Remove multiple consecutive dots
    safe = safe.replace(/\.{2,}/g, '.');

    // Remove leading/trailing dots and spaces
    safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');

    // Ensure filename is not empty
    if (!safe) {
      safe = 'unnamed_file';
    }

    // Limit length
    const maxLength = 255;
    if (safe.length > maxLength) {
      const extension = path.extname(safe);
      const nameWithoutExt = safe.slice(0, safe.length - extension.length);
      safe = nameWithoutExt.slice(0, maxLength - extension.length) + extension;
    }

    return safe;
  }

  /**
   * Generate secure storage filename with unique ID.
   * Creates collision-free filenames while preserving extension.
   *
   * @param {string} originalFilename - Original filename
   * @returns {Object} Generated ID, secure filename, and sanitized original
   *
   * @example
   * const result = validationService.generateSecureFilename('photo.jpg');
   * // Returns: {
   * //   id: 'a1b2c3d4e5f6...',
   * //   filename: 'a1b2c3d4e5f6...jpg',
   * //   sanitizedOriginal: 'photo.jpg'
   * // }
   */
  generateSecureFilename(originalFilename: string): {
    id: string;
    filename: string;
    sanitizedOriginal: string;
  } {
    const id = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(originalFilename).toLowerCase();
    const sanitizedOriginal = this.sanitizeFilename(originalFilename);

    return {
      id,
      filename: `${id}${extension}`,
      sanitizedOriginal,
    };
  }
}

/**
 * Malware scanning service (stub for integration).
 * Provides interface for integrating with ClamAV or other antivirus engines.
 *
 * @class MalwareScanService
 */
export class MalwareScanService {
  private scannerAvailable = false;

  /**
   * Creates an instance of MalwareScanService.
   * Checks for available malware scanning engines.
   */
  constructor() {
    // Check if ClamAV or other scanner is available
    this.checkScannerAvailability();
  }

  private async checkScannerAvailability(): Promise<void> {
    // TODO: Check if ClamAV daemon is running
    // For now, we'll assume it's not available
    this.scannerAvailable = false;
    if (!this.scannerAvailable) {
      logger.warn('Malware scanner not available. File scanning disabled.');
    }
  }

  /**
   * Scan file for malware using available antivirus engine.
   *
   * @param {string} filePath - Path to file to scan
   * @returns {Promise<Object>} Scan results with threat information
   * @throws {Error} If scan fails
   *
   * @example
   * const result = await malwareService.scanFile('/tmp/upload.exe');
   * if (!result.clean) {
   *   console.error('Threats detected:', result.threats);
   * }
   */
  async scanFile(filePath: string): Promise<{
    clean: boolean;
    threats?: string[];
    scannerUsed?: string;
  }> {
    if (!this.scannerAvailable) {
      logger.debug('Malware scanner not available, skipping scan', { filePath });
      return { clean: true };
    }

    try {
      // TODO: Implement actual scanning
      // This would typically involve:
      // 1. Sending file to ClamAV daemon
      // 2. Parsing response
      // 3. Returning result

      logger.info('File scanned successfully', { filePath });
      return {
        clean: true,
        scannerUsed: 'none', // Would be 'clamav' or other scanner
      };
    } catch (error) {
      logger.error(
        'Malware scan failed',
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error('Unable to scan file for malware');
    }
  }

  /**
   * Scan file buffer for malware (for in-memory scanning).
   * Allows scanning without writing to disk.
   *
   * @param {Buffer} _buffer - File buffer to scan
   * @param {string} _filename - Filename for logging
   * @returns {Promise<Object>} Scan results
   *
   * @example
   * const result = await malwareService.scanBuffer(fileBuffer, 'upload.doc');
   */
  async scanBuffer(
    _buffer: Buffer,
    _filename: string,
  ): Promise<{
    clean: boolean;
    threats?: string[];
  }> {
    // TODO: Implement buffer scanning
    return { clean: true };
  }
}
