import { promises as fs, createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import unzipper from 'unzipper';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import type { User, PrismaClient } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { webhookService } from './webhook.service';
import type { BackupCreatedPayload, BackupRestoredPayload } from '../types/webhook-payloads';

const execAsync = promisify(exec);

export interface BackupMetadata {
  id: string;
  timestamp: Date;
  createdBy: string;
  createdByEmail: string;
  organizationId: string;
  version: string;
  type: 'full' | 'database' | 'files';
  size: number;
  checksum: string;
  databaseType: 'embedded' | 'external';
  fileStorageType: 'local' | 'smb';
  includesDatabase: boolean;
  includesFiles: boolean;
  description?: string;
}

export interface BackupOptions {
  type?: 'full' | 'database' | 'files';
  description?: string;
  includeDatabase?: boolean;
  includeFiles?: boolean;
}

export interface RestoreOptions {
  validateChecksum?: boolean;
  rollbackOnFailure?: boolean;
  dryRun?: boolean;
}

export interface BackupListItem {
  id: string;
  timestamp: Date;
  createdBy: string;
  type: 'full' | 'database' | 'files';
  size: number;
  description?: string;
}

/**
 * Service for handling backup and restore operations
 * Supports both embedded and external PostgreSQL databases
 * Supports local Docker volume and SMB file storage
 */
export class BackupService {
  private prisma: PrismaClient;
  private readonly backupDir: string;
  private readonly tempDir: string;
  private readonly appVersion = '1.0.0'; // Should be read from package.json in real implementation

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
    this.backupDir = path.join(config.uploadDir, '..', 'backups');
    this.tempDir = path.join(config.uploadDir, '..', 'temp');
  }

  /**
   * Initialize backup directories
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
    await fs.mkdir(this.tempDir, { recursive: true });
  }

  /**
   * Create a new backup
   */
  async createBackup(
    user: User,
    organizationId: string,
    options: BackupOptions = {},
  ): Promise<BackupMetadata> {
    const {
      type = 'full',
      description,
      includeDatabase = type === 'full' || type === 'database',
      includeFiles = type === 'full' || type === 'files',
    } = options;

    await this.ensureDirectories();

    const backupId = uuidv4();
    const timestamp = new Date();
    const backupPath = path.join(this.backupDir, `backup-${backupId}.zip`);
    const tempBackupDir = path.join(this.tempDir, backupId);

    try {
      // Create temporary directory for this backup
      await fs.mkdir(tempBackupDir, { recursive: true });

      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp,
        createdBy: user.id,
        createdByEmail: user.email,
        organizationId,
        version: this.appVersion,
        type,
        size: 0,
        checksum: '',
        databaseType: config.useEmbeddedDb ? 'embedded' : 'external',
        fileStorageType: config.fileStorageType,
        includesDatabase: includeDatabase,
        includesFiles: includeFiles,
        description,
      };

      // Save metadata
      await fs.writeFile(
        path.join(tempBackupDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
      );

      // Backup database if requested
      if (includeDatabase) {
        logger.info('Starting database backup', { backupId });
        await this.backupDatabase(tempBackupDir);
      }

      // Backup files if requested
      if (includeFiles) {
        logger.info('Starting files backup', { backupId });
        await this.backupFiles(tempBackupDir, organizationId);
      }

      // Create archive
      logger.info('Creating backup archive', { backupId });
      const archive = archiver('zip', {
        zlib: { level: 9 }, // Maximum compression
      });

      const output = createWriteStream(backupPath);
      archive.pipe(output);

      archive.directory(tempBackupDir, false);
      await archive.finalize();

      // Wait for archive to finish
      await new Promise<void>((resolve, reject) => {
        output.on('close', () => resolve());
        output.on('error', reject);
      });

      // Calculate size and checksum
      const stats = await fs.stat(backupPath);
      metadata.size = stats.size;
      metadata.checksum = await this.calculateChecksum(backupPath);

      // Update metadata with final values
      await fs.writeFile(
        path.join(tempBackupDir, 'metadata.json'),
        JSON.stringify(metadata, null, 2),
      );

      // Clean up temp directory
      await fs.rm(tempBackupDir, { recursive: true, force: true });

      logger.info('Backup created successfully', {
        backupId,
        size: metadata.size,
        type: metadata.type,
      });

      // Emit webhook event for backup creation
      try {
        // Get entity counts
        const [assetCount, taskCount, userCount, attachmentCount] = await Promise.all([
          this.prisma.asset.count({ where: { organizationId } }),
          this.prisma.task.count({ where: { organizationId } }),
          this.prisma.user.count({ where: { organizationId } }),
          this.prisma.taskAttachment.count({
            where: {
              task: {
                organizationId,
              },
            },
          }),
        ]);

        const payload: BackupCreatedPayload = {
          backup: {
            id: backupId,
            type,
            size: metadata.size,
            location: backupPath,
            createdAt: timestamp,
          },
          initiatedBy: {
            id: user.id,
            email: user.email,
            name: user.fullName || user.email,
            role: user.role,
          },
          includedEntities: {
            assets: assetCount,
            tasks: taskCount,
            users: userCount,
            attachments: attachmentCount,
          },
        };

        const enhancedEvent = await webhookService.createEnhancedEvent(
          'backup.created',
          organizationId,
          user.id,
          payload,
        );

        await webhookService.emitEvent(enhancedEvent);
      } catch (error) {
        logger.error('Failed to emit backup webhook event:', error as Error);
      }

      return metadata;
    } catch (error) {
      // Clean up on error
      await fs.rm(tempBackupDir, { recursive: true, force: true }).catch(() => {});
      await fs.unlink(backupPath).catch(() => {});

      logger.error('Backup creation failed', error as Error, { backupId });
      throw error;
    }
  }

  /**
   * Backup database
   */
  private async backupDatabase(backupDir: string): Promise<void> {
    const dbBackupPath = path.join(backupDir, 'database.sql');

    if (config.useEmbeddedDb) {
      // For embedded database, use pg_dump with the embedded connection
      const pgDumpCommand = `pg_dump "${config.databaseUrl}" > "${dbBackupPath}"`;

      try {
        await execAsync(pgDumpCommand);
      } catch (error) {
        throw new Error(
          `Database backup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } else {
      // For external database, parse connection string and use pg_dump
      const dbUrl = new URL(config.databaseUrl || '');
      const pgDumpCommand = `PGPASSWORD="${dbUrl.password}" pg_dump -h "${dbUrl.hostname}" -p "${dbUrl.port}" -U "${dbUrl.username}" -d "${dbUrl.pathname.slice(1)}" > "${dbBackupPath}"`;

      try {
        await execAsync(pgDumpCommand);
      } catch (error) {
        throw new Error(
          `Database backup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Compress the SQL file
    const compressCommand = `gzip "${dbBackupPath}"`;
    await execAsync(compressCommand);
  }

  /**
   * Backup user files
   */
  private async backupFiles(backupDir: string, organizationId: string): Promise<void> {
    const filesBackupDir = path.join(backupDir, 'files');
    await fs.mkdir(filesBackupDir, { recursive: true });

    if (config.fileStorageType === 'local') {
      // For local storage, copy files from upload directory
      const orgUploadDir = path.join(config.uploadDir, organizationId);

      try {
        await fs.access(orgUploadDir);
        // Copy organization's files
        await this.copyDirectory(orgUploadDir, path.join(filesBackupDir, organizationId));
      } catch (error) {
        // Directory doesn't exist, which is fine
        logger.warn('No files found for organization', { organizationId });
      }
    } else if (config.fileStorageType === 'smb') {
      // For SMB storage, document that backup should be done externally
      const smbInfoPath = path.join(filesBackupDir, 'SMB_BACKUP_INFO.txt');
      const smbInfo = `Files are stored on SMB share and should be backed up separately.
SMB Share: ${config.smbHost}/${config.smbShare}
Organization Path: ${organizationId}/

Please use your existing SMB backup infrastructure to backup these files.`;

      await fs.writeFile(smbInfoPath, smbInfo);
    }
  }

  /**
   * List available backups
   */
  async listBackups(organizationId: string): Promise<BackupListItem[]> {
    await this.ensureDirectories();

    const files = await fs.readdir(this.backupDir);
    const backups: BackupListItem[] = [];

    for (const file of files) {
      if (!file.startsWith('backup-') || !file.endsWith('.zip')) continue;

      try {
        const backupPath = path.join(this.backupDir, file);
        const stats = await fs.stat(backupPath);

        // Extract metadata from the backup
        const metadata = await this.extractMetadata(backupPath);

        if (metadata.organizationId === organizationId) {
          backups.push({
            id: metadata.id,
            timestamp: new Date(metadata.timestamp),
            createdBy: metadata.createdByEmail,
            type: metadata.type,
            size: stats.size,
            description: metadata.description,
          });
        }
      } catch (error) {
        logger.warn('Failed to read backup metadata', { file, error });
      }
    }

    // Sort by timestamp descending
    backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return backups;
  }

  /**
   * Restore from backup
   */
  async restoreBackup(
    backupId: string,
    user: User,
    organizationId: string,
    options: RestoreOptions = {},
  ): Promise<void> {
    const { validateChecksum = true, rollbackOnFailure = true, dryRun = false } = options;

    const backupPath = path.join(this.backupDir, `backup-${backupId}.zip`);

    // Check if backup exists
    try {
      await fs.access(backupPath);
    } catch {
      throw new NotFoundError('Backup not found');
    }

    // Extract and validate metadata
    const metadata = await this.extractMetadata(backupPath);

    if (metadata.organizationId !== organizationId) {
      throw new ForbiddenError('Backup belongs to different organization');
    }

    // Validate checksum if requested
    if (validateChecksum) {
      const currentChecksum = await this.calculateChecksum(backupPath);
      if (currentChecksum !== metadata.checksum) {
        throw new ValidationError('Backup integrity check failed');
      }
    }

    if (dryRun) {
      logger.info('Dry run mode - no changes will be made', { backupId });
      return;
    }

    const tempRestoreDir = path.join(this.tempDir, `restore-${backupId}`);

    try {
      // Extract backup
      await fs.mkdir(tempRestoreDir, { recursive: true });
      await this.extractBackup(backupPath, tempRestoreDir);

      // Create restore checkpoint if rollback is enabled
      let checkpointId: string | undefined;
      if (rollbackOnFailure) {
        checkpointId = await this.createRestoreCheckpoint(organizationId);
      }

      try {
        // Restore database if included
        if (metadata.includesDatabase) {
          logger.info('Restoring database', { backupId });
          await this.restoreDatabase(tempRestoreDir);
        }

        // Restore files if included
        if (metadata.includesFiles) {
          logger.info('Restoring files', { backupId });
          await this.restoreFiles(tempRestoreDir, organizationId);
        }

        logger.info('Restore completed successfully', { backupId });

        // Emit webhook event for backup restoration
        try {
          // Get restored entity counts
          const [assetCount, taskCount, userCount, attachmentCount] = await Promise.all([
            this.prisma.asset.count({ where: { organizationId } }),
            this.prisma.task.count({ where: { organizationId } }),
            this.prisma.user.count({ where: { organizationId } }),
            this.prisma.taskAttachment.count({
              where: {
                task: {
                  organizationId,
                },
              },
            }),
          ]);

          const payload: BackupRestoredPayload = {
            backup: {
              id: backupId,
              type: metadata.type,
              restoredFrom: metadata.timestamp,
              restoredAt: new Date(),
            },
            restoredBy: {
              id: user.id,
              email: user.email,
              name: user.fullName || user.email,
              role: user.role,
            },
            restoredEntities: {
              assets: assetCount,
              tasks: taskCount,
              users: userCount,
              attachments: attachmentCount,
            },
          };

          const enhancedEvent = await webhookService.createEnhancedEvent(
            'backup.restored',
            organizationId,
            user.id,
            payload,
          );

          await webhookService.emitEvent(enhancedEvent);
        } catch (error) {
          logger.error('Failed to emit restore webhook event:', error as Error);
        }
      } catch (error) {
        // Rollback if enabled
        if (rollbackOnFailure && checkpointId) {
          logger.error('Restore failed, rolling back', error as Error, { backupId });
          await this.rollbackFromCheckpoint(checkpointId, organizationId);
        }
        throw error;
      }
    } finally {
      // Clean up temp directory
      await fs.rm(tempRestoreDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string, organizationId: string): Promise<void> {
    const backupPath = path.join(this.backupDir, `backup-${backupId}.zip`);

    // Check if backup exists and belongs to organization
    try {
      const metadata = await this.extractMetadata(backupPath);
      if (metadata.organizationId !== organizationId) {
        throw new ForbiddenError('Backup belongs to different organization');
      }
    } catch (error) {
      if (error instanceof ForbiddenError) throw error;
      throw new NotFoundError('Backup not found');
    }

    await fs.unlink(backupPath);
    logger.info('Backup deleted', { backupId });
  }

  /**
   * Calculate file checksum
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    await pipeline(stream, hash);
    return hash.digest('hex');
  }

  /**
   * Extract metadata from backup without fully extracting
   */
  private async extractMetadata(backupPath: string): Promise<BackupMetadata> {
    return new Promise((resolve, reject) => {
      const stream = createReadStream(backupPath).pipe(unzipper.ParseOne(/metadata\.json$/));

      let data = '';
      stream.on('data', (chunk: any) => {
        data += chunk;
      });
      stream.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error('Failed to parse backup metadata'));
        }
      });
      stream.on('error', reject);
    });
  }

  /**
   * Extract backup to directory
   */
  private async extractBackup(backupPath: string, targetDir: string): Promise<void> {
    await pipeline(createReadStream(backupPath), unzipper.Extract({ path: targetDir }));
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Restore database from backup
   */
  private async restoreDatabase(restoreDir: string): Promise<void> {
    const dbBackupPath = path.join(restoreDir, 'database.sql.gz');

    // Decompress the SQL file
    const decompressCommand = `gunzip "${dbBackupPath}"`;
    await execAsync(decompressCommand);

    const sqlPath = path.join(restoreDir, 'database.sql');

    if (config.useEmbeddedDb) {
      // For embedded database
      const psqlCommand = `psql "${config.databaseUrl}" < "${sqlPath}"`;
      await execAsync(psqlCommand);
    } else {
      // For external database
      const dbUrl = new URL(config.databaseUrl || '');
      const psqlCommand = `PGPASSWORD="${dbUrl.password}" psql -h "${dbUrl.hostname}" -p "${dbUrl.port}" -U "${dbUrl.username}" -d "${dbUrl.pathname.slice(1)}" < "${sqlPath}"`;
      await execAsync(psqlCommand);
    }
  }

  /**
   * Restore files from backup
   */
  private async restoreFiles(restoreDir: string, organizationId: string): Promise<void> {
    const filesBackupDir = path.join(restoreDir, 'files');

    if (config.fileStorageType === 'local') {
      const orgBackupDir = path.join(filesBackupDir, organizationId);
      const orgUploadDir = path.join(config.uploadDir, organizationId);

      // Check if backup contains files
      try {
        await fs.access(orgBackupDir);
        // Clear existing files
        await fs.rm(orgUploadDir, { recursive: true, force: true });
        // Copy files from backup
        await this.copyDirectory(orgBackupDir, orgUploadDir);
      } catch {
        logger.warn('No files found in backup for organization', { organizationId });
      }
    }
    // For SMB, we just inform that manual restore is needed
  }

  /**
   * Create a restore checkpoint (simplified version)
   */
  private async createRestoreCheckpoint(_organizationId: string): Promise<string> {
    // In a real implementation, this would create a database snapshot
    // For now, we'll just create a quick backup
    const checkpointId = `checkpoint-${Date.now()}`;
    logger.info('Creating restore checkpoint', { checkpointId });
    // Implementation would go here
    return checkpointId;
  }

  /**
   * Rollback from checkpoint
   */
  private async rollbackFromCheckpoint(
    checkpointId: string,
    _organizationId: string,
  ): Promise<void> {
    logger.info('Rolling back from checkpoint', { checkpointId });
    // Implementation would go here
  }
}
