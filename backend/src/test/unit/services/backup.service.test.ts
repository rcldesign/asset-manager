import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { promises as fs } from 'fs';
import archiver from 'archiver';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../utils/errors';

// Enable automatic mocking for Prisma
jest.mock('../../../lib/prisma');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    writeFile: jest.fn(),
    rm: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
    copyFile: jest.fn(),
  },
  createReadStream: jest.fn(),
  createWriteStream: jest.fn(),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: jest.fn((fn) => fn),
}));

jest.mock('archiver');
jest.mock('unzipper');

jest.mock('../../../config', () => ({
  config: {
    uploadDir: '/uploads',
    databaseUrl: 'postgresql://user:pass@localhost:5432/testdb',
    useEmbeddedDb: true,
    fileStorageType: 'local',
    smbHost: undefined,
    smbShare: undefined,
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Import modules after mocking
import { BackupService } from '../../../services/backup.service';
import { prisma } from '../../../lib/prisma';

// Type the mocked modules
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper function to create a mock user with all required fields
const createMockUser = (overrides: Partial<any> = {}): User => ({
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  fullName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  lastActiveAt: null,
  role: UserRole.OWNER,
  organizationId: 'org-123',
  emailVerified: true,
  isActive: true,
  totpEnabled: false,
  totpSecret: null,
  notificationPreferences: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('BackupService', () => {
  let backupService: BackupService;
  let mockUser: User;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock Prisma methods used by BackupService
    (mockPrisma as any).asset = { count: jest.fn().mockResolvedValue(10) };
    (mockPrisma as any).task = { count: jest.fn().mockResolvedValue(5) };
    (mockPrisma as any).user = { count: jest.fn().mockResolvedValue(3) };
    (mockPrisma as any).taskAttachment = { count: jest.fn().mockResolvedValue(8) };
    
    backupService = new BackupService(mockPrisma);
    mockUser = createMockUser();
  });

  describe('createBackup', () => {
    it('should create a full backup successfully', async () => {
      const mockArchive = {
        pipe: jest.fn(),
        directory: jest.fn(),
        finalize: jest.fn().mockResolvedValue(undefined),
      };

      const mockWriteStream = {
        on: jest.fn((event, callback) => {
          if (event === 'close') callback();
        }),
      };

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 1024000 });
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      (archiver as unknown as jest.Mock).mockReturnValue(mockArchive);
      (require('fs').createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);
      (require('fs').createReadStream as jest.Mock).mockReturnValue({
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn((event, callback) => {
          if (event === 'end') callback();
          return this;
        }),
      });

      const result = await backupService.createBackup(mockUser, 'org-123', {
        type: 'full',
        description: 'Test backup',
      });

      expect(result).toMatchObject({
        type: 'full',
        createdBy: 'user-123',
        createdByEmail: 'test@example.com',
        organizationId: 'org-123',
        includesDatabase: true,
        includesFiles: true,
        description: 'Test backup',
      });
      expect(fs.mkdir as jest.Mock).toHaveBeenCalled();
      expect(fs.writeFile as jest.Mock).toHaveBeenCalled();
      expect(mockArchive.finalize).toHaveBeenCalled();
    });

    it('should create a database-only backup', async () => {
      const mockArchive = {
        pipe: jest.fn(),
        directory: jest.fn(),
        finalize: jest.fn().mockResolvedValue(undefined),
      };

      const mockWriteStream = {
        on: jest.fn((event, callback) => {
          if (event === 'close') callback();
        }),
      };

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 512000 });
      (fs.rm as jest.Mock).mockResolvedValue(undefined);
      (archiver as unknown as jest.Mock).mockReturnValue(mockArchive);
      (require('fs').createWriteStream as jest.Mock).mockReturnValue(mockWriteStream);
      (require('fs').createReadStream as jest.Mock).mockReturnValue({
        pipe: jest.fn().mockReturnThis(),
        on: jest.fn((event, callback) => {
          if (event === 'end') callback();
          return this;
        }),
      });

      const result = await backupService.createBackup(mockUser, 'org-123', {
        type: 'database',
      });

      expect(result).toMatchObject({
        type: 'database',
        includesDatabase: true,
        includesFiles: false,
      });
    });

    it('should handle backup creation errors', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Failed to create directory'));

      await expect(
        backupService.createBackup(mockUser, 'org-123', { type: 'full' }),
      ).rejects.toThrow('Failed to create directory');
    });
  });

  describe('listBackups', () => {
    it('should list backups for an organization', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([
        'backup-123.zip',
        'backup-456.zip',
        'other-file.txt',
      ]);

      (fs.stat as jest.Mock).mockResolvedValue({ size: 1024000 });

      // Mock extractMetadata to return different metadata for each backup
      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy
        .mockResolvedValueOnce({
          id: '123',
          timestamp: new Date('2024-01-01'),
          createdByEmail: 'user1@example.com',
          organizationId: 'org-123',
          type: 'full',
          description: 'Backup 1',
        })
        .mockResolvedValueOnce({
          id: '456',
          timestamp: new Date('2024-01-02'),
          createdByEmail: 'user2@example.com',
          organizationId: 'org-123',
          type: 'database',
          description: 'Backup 2',
        });

      const result = await backupService.listBackups('org-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '456',
        type: 'database',
        description: 'Backup 2',
      });
      expect(result[1]).toMatchObject({
        id: '123',
        type: 'full',
        description: 'Backup 1',
      });
    });

    it('should handle empty backup directory', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([]);

      const result = await backupService.listBackups('org-123');

      expect(result).toHaveLength(0);
    });
  });

  describe('restoreBackup', () => {
    it('should restore a backup successfully', async () => {
      const mockMetadata = {
        id: '123',
        organizationId: 'org-123',
        checksum: 'abc123',
        includesDatabase: true,
        includesFiles: true,
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockResolvedValue(mockMetadata);

      const calculateChecksumSpy = jest.spyOn(backupService as any, 'calculateChecksum');
      calculateChecksumSpy.mockResolvedValue('abc123');

      const extractBackupSpy = jest.spyOn(backupService as any, 'extractBackup');
      extractBackupSpy.mockResolvedValue(undefined);

      const restoreDatabaseSpy = jest.spyOn(backupService as any, 'restoreDatabase');
      restoreDatabaseSpy.mockResolvedValue(undefined);

      const restoreFilesSpy = jest.spyOn(backupService as any, 'restoreFiles');
      restoreFilesSpy.mockResolvedValue(undefined);

      await backupService.restoreBackup('123', mockUser, 'org-123');

      expect(extractMetadataSpy).toHaveBeenCalled();
      expect(calculateChecksumSpy).toHaveBeenCalled();
      expect(extractBackupSpy).toHaveBeenCalled();
      expect(restoreDatabaseSpy).toHaveBeenCalled();
      expect(restoreFilesSpy).toHaveBeenCalled();
    });

    it('should throw NotFoundError if backup does not exist', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('File not found'));

      await expect(backupService.restoreBackup('123', mockUser, 'org-123')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should throw ForbiddenError if backup belongs to different organization', async () => {
      const mockMetadata = {
        id: '123',
        organizationId: 'different-org',
        checksum: 'abc123',
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockResolvedValue(mockMetadata);

      await expect(backupService.restoreBackup('123', mockUser, 'org-123')).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('should throw ValidationError if checksum validation fails', async () => {
      const mockMetadata = {
        id: '123',
        organizationId: 'org-123',
        checksum: 'abc123',
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockResolvedValue(mockMetadata);

      const calculateChecksumSpy = jest.spyOn(backupService as any, 'calculateChecksum');
      calculateChecksumSpy.mockResolvedValue('different-checksum');

      await expect(
        backupService.restoreBackup('123', mockUser, 'org-123', {
          validateChecksum: true,
        }),
      ).rejects.toThrow(ValidationError);
    });

    it('should skip actual restore in dry run mode', async () => {
      const mockMetadata = {
        id: '123',
        organizationId: 'org-123',
        checksum: 'abc123',
        includesDatabase: true,
        includesFiles: true,
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockResolvedValue(mockMetadata);

      const calculateChecksumSpy = jest.spyOn(backupService as any, 'calculateChecksum');
      calculateChecksumSpy.mockResolvedValue('abc123');

      const extractBackupSpy = jest.spyOn(backupService as any, 'extractBackup');
      const restoreDatabaseSpy = jest.spyOn(backupService as any, 'restoreDatabase');
      const restoreFilesSpy = jest.spyOn(backupService as any, 'restoreFiles');

      await backupService.restoreBackup('123', mockUser, 'org-123', {
        dryRun: true,
      });

      expect(extractBackupSpy).not.toHaveBeenCalled();
      expect(restoreDatabaseSpy).not.toHaveBeenCalled();
      expect(restoreFilesSpy).not.toHaveBeenCalled();
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup successfully', async () => {
      const mockMetadata = {
        id: '123',
        organizationId: 'org-123',
      };

      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockResolvedValue(mockMetadata);

      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await backupService.deleteBackup('123', 'org-123');

      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('backup-123.zip'));
    });

    it('should throw ForbiddenError if backup belongs to different organization', async () => {
      const mockMetadata = {
        id: '123',
        organizationId: 'different-org',
      };

      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockResolvedValue(mockMetadata);

      await expect(backupService.deleteBackup('123', 'org-123')).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError if backup does not exist', async () => {
      const extractMetadataSpy = jest.spyOn(backupService as any, 'extractMetadata');
      extractMetadataSpy.mockRejectedValue(new Error('File not found'));

      await expect(backupService.deleteBackup('123', 'org-123')).rejects.toThrow(NotFoundError);
    });
  });
});
