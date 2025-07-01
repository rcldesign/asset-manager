import { promises as fs } from 'fs';
import path from 'path';
import { createReadStream, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface FileMetadata {
  id: string;
  originalFilename: string;
  storedFilename: string;
  filePath: string;
  fileSizeBytes: number;
  mimeType: string;
  uploadDate: Date;
  checksumMd5?: string;
}

export interface UploadOptions {
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
  preserveOriginalName?: boolean;
}

export interface FileDownload {
  stream: NodeJS.ReadableStream;
  metadata: FileMetadata;
}

export interface FileStorageProvider {
  upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileMetadata>;
  download(fileId: string): Promise<FileDownload>;
  delete(fileId: string): Promise<void>;
  exists(fileId: string): Promise<boolean>;
  getMetadata(fileId: string): Promise<FileMetadata | null>;
  validateFile(file: Express.Multer.File, options?: UploadOptions): Promise<void>;
}

/**
 * Local file storage provider for Docker volumes.
 * Handles file operations on the local filesystem with security validations.
 *
 * @class LocalFileStorageProvider
 * @implements {FileStorageProvider}
 */
export class LocalFileStorageProvider implements FileStorageProvider {
  private readonly uploadDir: string;

  /**
   * Creates an instance of LocalFileStorageProvider.
   * @param {string} [uploadDir=config.upload.dir] - Directory for file uploads
   */
  constructor(uploadDir: string = config.upload.dir) {
    this.uploadDir = uploadDir;
    this.ensureUploadDirectory();
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadDir);
    } catch {
      await fs.mkdir(this.uploadDir, { recursive: true });
      logger.info(`Created upload directory: ${this.uploadDir}`);
    }
  }

  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileMetadata> {
    await this.validateFile(file, options);

    const fileId = uuidv4();
    const fileExtension = path.extname(file.originalname);
    const storedFilename = options?.preserveOriginalName
      ? `${fileId}_${file.originalname}`
      : `${fileId}${fileExtension}`;

    const filePath = path.join(this.uploadDir, storedFilename);

    try {
      // Ensure the file buffer exists
      if (!file.buffer) {
        throw new Error('File buffer is missing');
      }

      // Write file to disk
      await fs.writeFile(filePath, file.buffer);

      const metadata: FileMetadata = {
        id: fileId,
        originalFilename: file.originalname,
        storedFilename,
        filePath,
        fileSizeBytes: file.size,
        mimeType: file.mimetype,
        uploadDate: new Date(),
      };

      logger.info('File uploaded successfully', {
        fileId,
        originalFilename: file.originalname,
        storedFilename,
        size: file.size,
      });

      return metadata;
    } catch (error) {
      logger.error(
        `Failed to upload file: ${file.originalname}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error(
        `File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async download(fileId: string): Promise<FileDownload> {
    const metadata = await this.getMetadata(fileId);
    if (!metadata) {
      throw new Error(`File not found: ${fileId}`);
    }

    if (!existsSync(metadata.filePath)) {
      throw new Error(`Physical file not found: ${metadata.filePath}`);
    }

    const stream = createReadStream(metadata.filePath);
    return { stream, metadata };
  }

  async delete(fileId: string): Promise<void> {
    const metadata = await this.getMetadata(fileId);
    if (!metadata) {
      logger.warn(`Attempted to delete non-existent file: ${fileId}`);
      return;
    }

    try {
      if (existsSync(metadata.filePath)) {
        await fs.unlink(metadata.filePath);
        logger.info('File deleted successfully', { fileId, filePath: metadata.filePath });
      } else {
        logger.warn('File already removed from disk', { fileId, filePath: metadata.filePath });
      }
    } catch (error) {
      logger.error(
        `Failed to delete file: ${fileId} at ${metadata.filePath}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      throw new Error(
        `File deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async exists(fileId: string): Promise<boolean> {
    const metadata = await this.getMetadata(fileId);
    return metadata !== null && existsSync(metadata.filePath);
  }

  async getMetadata(fileId: string): Promise<FileMetadata | null> {
    // In a real implementation, this would query the database
    // For now, we'll reconstruct metadata from the file system
    const files = await fs.readdir(this.uploadDir);
    const matchingFile = files.find((file) => file.startsWith(fileId));

    if (!matchingFile) {
      return null;
    }

    const filePath = path.join(this.uploadDir, matchingFile);
    const stats = await fs.stat(filePath);

    // Extract original filename if it was preserved
    const originalFilename = matchingFile.includes('_')
      ? matchingFile.substring(matchingFile.indexOf('_') + 1)
      : matchingFile;

    return {
      id: fileId,
      originalFilename,
      storedFilename: matchingFile,
      filePath,
      fileSizeBytes: stats.size,
      mimeType: this.getMimeTypeFromExtension(path.extname(originalFilename)),
      uploadDate: stats.birthtime,
    };
  }

  async validateFile(file: Express.Multer.File, options?: UploadOptions): Promise<void> {
    const maxSize = options?.maxSizeBytes || config.upload.maxFileSize;
    const allowedTypes = options?.allowedMimeTypes;

    // Size validation
    if (file.size > maxSize) {
      throw new Error(
        `File size (${file.size} bytes) exceeds maximum allowed size (${maxSize} bytes)`,
      );
    }

    // MIME type validation
    if (allowedTypes && !allowedTypes.includes(file.mimetype)) {
      throw new Error(
        `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }

    // File name validation (prevent path traversal)
    if (
      file.originalname.includes('..') ||
      file.originalname.includes('/') ||
      file.originalname.includes('\\')
    ) {
      throw new Error('Invalid file name: path traversal characters detected');
    }

    // Empty file validation
    if (file.size === 0) {
      throw new Error('Empty files are not allowed');
    }
  }

  private getMimeTypeFromExtension(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.csv': 'text/csv',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}

/**
 * SMB/CIFS file storage provider (placeholder implementation).
 * In a production environment, this would use libraries like 'node-smb2' or 'samba-client'.
 *
 * @class SMBFileStorageProvider
 * @implements {FileStorageProvider}
 */
export class SMBFileStorageProvider implements FileStorageProvider {
  /**
   * Creates an instance of SMBFileStorageProvider.
   * @param {NonNullable<typeof config.fileStorage.smb>} smbConfig - SMB configuration
   */
  constructor(private readonly smbConfig: NonNullable<typeof config.fileStorage.smb>) {
    // SMB configuration stored for future implementation
    logger.info(`SMB provider configured for host: ${this.smbConfig.host}`);
  }

  async upload(file: Express.Multer.File, options?: UploadOptions): Promise<FileMetadata> {
    // TODO: Implement SMB upload logic
    // This would typically involve:
    // 1. Connecting to the SMB share
    // 2. Creating a unique filename
    // 3. Uploading the file to the share
    // 4. Returning metadata

    logger.warn('SMB upload not yet implemented, falling back to local storage');
    const localProvider = new LocalFileStorageProvider();
    return localProvider.upload(file, options);
  }

  async download(fileId: string): Promise<FileDownload> {
    // TODO: Implement SMB download logic
    logger.warn('SMB download not yet implemented, falling back to local storage');
    const localProvider = new LocalFileStorageProvider();
    return localProvider.download(fileId);
  }

  async delete(fileId: string): Promise<void> {
    // TODO: Implement SMB delete logic
    logger.warn('SMB delete not yet implemented, falling back to local storage');
    const localProvider = new LocalFileStorageProvider();
    return localProvider.delete(fileId);
  }

  async exists(fileId: string): Promise<boolean> {
    // TODO: Implement SMB exists check
    logger.warn('SMB exists check not yet implemented, falling back to local storage');
    const localProvider = new LocalFileStorageProvider();
    return localProvider.exists(fileId);
  }

  async getMetadata(fileId: string): Promise<FileMetadata | null> {
    // TODO: Implement SMB metadata retrieval
    logger.warn('SMB metadata retrieval not yet implemented, falling back to local storage');
    const localProvider = new LocalFileStorageProvider();
    return localProvider.getMetadata(fileId);
  }

  async validateFile(file: Express.Multer.File, options?: UploadOptions): Promise<void> {
    // Use same validation as local provider
    const localProvider = new LocalFileStorageProvider();
    return localProvider.validateFile(file, options);
  }
}

/**
 * File Storage Service.
 * Main service class that provides a unified interface for file operations.
 * Automatically selects the appropriate storage provider based on configuration.
 * Supports local filesystem and SMB/CIFS storage backends.
 *
 * @class FileStorageService
 */
export class FileStorageService {
  private readonly provider: FileStorageProvider;

  /**
   * Creates an instance of FileStorageService.
   * Initializes the appropriate storage provider based on configuration.
   */
  constructor() {
    this.provider = this.createProvider();
    logger.info(`File storage service initialized with provider: ${config.fileStorage.type}`);
  }

  private createProvider(): FileStorageProvider {
    switch (config.fileStorage.type) {
      case 'local':
        return new LocalFileStorageProvider();
      case 'smb':
        if (!config.fileStorage.smb) {
          throw new Error('SMB configuration is required when FILE_STORAGE_TYPE=smb');
        }
        return new SMBFileStorageProvider(config.fileStorage.smb);
      default:
        throw new Error(`Unsupported file storage type: ${config.fileStorage.type}`);
    }
  }

  /**
   * Upload a file to the configured storage backend.
   * Validates file against size and type restrictions.
   *
   * @param {Express.Multer.File} file - File to upload from multer
   * @param {UploadOptions} [options] - Upload restrictions and options
   * @returns {Promise<FileMetadata>} Metadata of uploaded file
   * @throws {Error} If file validation fails or upload fails
   *
   * @example
   * const metadata = await fileStorageService.uploadFile(req.file, {
   *   allowedMimeTypes: ['image/jpeg', 'image/png'],
   *   maxSizeBytes: 5 * 1024 * 1024 // 5MB
   * });
   */
  async uploadFile(file: Express.Multer.File, options?: UploadOptions): Promise<FileMetadata> {
    return this.provider.upload(file, options);
  }

  /**
   * Download a file from storage.
   * Returns a readable stream and metadata.
   *
   * @param {string} fileId - Unique file identifier
   * @returns {Promise<FileDownload>} Stream and metadata for download
   * @throws {Error} If file not found
   *
   * @example
   * const { stream, metadata } = await fileStorageService.downloadFile('file-123');
   * stream.pipe(res);
   */
  async downloadFile(fileId: string): Promise<FileDownload> {
    return this.provider.download(fileId);
  }

  /**
   * Delete a file from storage.
   *
   * @param {string} fileId - Unique file identifier
   * @returns {Promise<void>}
   * @throws {Error} If deletion fails
   *
   * @example
   * await fileStorageService.deleteFile('file-123');
   */
  async deleteFile(fileId: string): Promise<void> {
    return this.provider.delete(fileId);
  }

  /**
   * Check if a file exists in storage.
   *
   * @param {string} fileId - Unique file identifier
   * @returns {Promise<boolean>} True if file exists
   *
   * @example
   * if (await fileStorageService.fileExists('file-123')) {
   *   console.log('File available for download');
   * }
   */
  async fileExists(fileId: string): Promise<boolean> {
    return this.provider.exists(fileId);
  }

  /**
   * Get file metadata without downloading the file.
   *
   * @param {string} fileId - Unique file identifier
   * @returns {Promise<FileMetadata | null>} File metadata or null if not found
   *
   * @example
   * const metadata = await fileStorageService.getFileMetadata('file-123');
   * if (metadata) {
   *   console.log(`File size: ${metadata.fileSizeBytes} bytes`);
   * }
   */
  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    return this.provider.getMetadata(fileId);
  }

  /**
   * Validate a file before upload.
   * Checks size, type, and filename security.
   *
   * @param {Express.Multer.File} file - File to validate
   * @param {UploadOptions} [options] - Validation options
   * @returns {Promise<void>}
   * @throws {Error} If validation fails
   *
   * @example
   * try {
   *   await fileStorageService.validateFile(req.file, {
   *     allowedMimeTypes: ['image/jpeg'],
   *     maxSizeBytes: 1024 * 1024 // 1MB
   *   });
   * } catch (error) {
   *   return res.status(400).json({ error: error.message });
   * }
   */
  async validateFile(file: Express.Multer.File, options?: UploadOptions): Promise<void> {
    return this.provider.validateFile(file, options);
  }

  /**
   * Get allowed file types for different contexts.
   * Provides context-specific MIME type restrictions.
   *
   * @param {'asset' | 'task' | 'profile'} context - Upload context
   * @returns {string[]} Array of allowed MIME types
   *
   * @example
   * const allowedTypes = FileStorageService.getAllowedMimeTypes('asset');
   * // ['image/jpeg', 'image/png', 'application/pdf', ...]
   */
  static getAllowedMimeTypes(context: 'asset' | 'task' | 'profile'): string[] {
    switch (context) {
      case 'asset':
        return [
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/csv',
        ];
      case 'task':
        return ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
      case 'profile':
        return ['image/jpeg', 'image/png'];
      default:
        return [];
    }
  }

  /**
   * Get maximum file size for different contexts.
   * Provides context-specific size limits.
   *
   * @param {'asset' | 'task' | 'profile'} context - Upload context
   * @returns {number} Maximum file size in bytes
   *
   * @example
   * const maxSize = FileStorageService.getMaxFileSize('profile');
   * // 5242880 (5MB)
   */
  static getMaxFileSize(context: 'asset' | 'task' | 'profile'): number {
    switch (context) {
      case 'asset':
        return 50 * 1024 * 1024; // 50MB for asset attachments
      case 'task':
        return 25 * 1024 * 1024; // 25MB for task attachments
      case 'profile':
        return 5 * 1024 * 1024; // 5MB for profile pictures
      default:
        return config.upload.maxFileSize;
    }
  }

  /**
   * Upload a report file.
   * This method handles file uploads from generated reports.
   *
   * @param {string} filePath - Path to the report file
   * @param {object} metadata - Report metadata
   * @returns {Promise<FileMetadata>} Metadata of uploaded file
   * @throws {Error} If file reading or upload fails
   */
  async uploadReportFile(
    filePath: string,
    metadata: {
      reportType: string;
      format: string;
      userId: string;
      organizationId: string;
    },
  ): Promise<FileMetadata> {
    try {
      // Read the file from disk
      const fileBuffer = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);
      const filename = path.basename(filePath);

      // Determine MIME type based on format
      let mimeType = 'application/octet-stream';
      switch (metadata.format.toLowerCase()) {
        case 'pdf':
          mimeType = 'application/pdf';
          break;
        case 'csv':
          mimeType = 'text/csv';
          break;
        case 'xlsx':
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
      }

      // Create a mock Multer file object
      const file: Express.Multer.File = {
        fieldname: 'report',
        originalname: filename,
        encoding: '7bit',
        mimetype: mimeType,
        buffer: fileBuffer,
        size: stats.size,
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      // Upload using the standard upload method
      const uploadedFile = await this.uploadFile(file, {
        allowedMimeTypes: [mimeType],
        maxSizeBytes: 100 * 1024 * 1024, // 100MB for reports
        preserveOriginalName: true,
      });

      logger.info('Report file uploaded successfully', {
        fileId: uploadedFile.id,
        reportType: metadata.reportType,
        format: metadata.format,
        userId: metadata.userId,
        organizationId: metadata.organizationId,
      });

      return uploadedFile;
    } catch (error) {
      logger.error('Failed to upload report file', error as Error, {
        filePath,
        metadata,
      });
      throw error;
    }
  }
}
