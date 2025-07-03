import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { DataExportService } from '../../../services/data-export.service';
import type { IRequestContext } from '../../../interfaces/context.interface';
import * as fs from 'fs/promises';

// Mock all external dependencies
jest.mock('../../../lib/prisma');
jest.mock('../../../services/audit.service');
jest.mock('fs/promises');
jest.mock('json2csv');
jest.mock('xlsx');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('DataExportService', () => {
  let service: DataExportService;
  let mockContext: IRequestContext;

  beforeEach(() => {
    service = new DataExportService();
    mockContext = {
      userId: 'test-user-id',
      userRole: 'OWNER',
      organizationId: 'test-org-id',
      requestId: 'test-request-id',
    };

    jest.clearAllMocks();

    // Setup default mocks
    mockFs.access.mockResolvedValue(undefined);
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.stat.mockResolvedValue({
      mtime: new Date('2024-01-01'),
    } as any);
    mockFs.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance of DataExportService', () => {
      expect(service).toBeInstanceOf(DataExportService);
    });
  });

  describe('flattenObject', () => {
    it('should flatten nested objects correctly', () => {
      const nested = {
        name: 'Test',
        details: {
          category: 'Hardware',
          specs: {
            cpu: 'Intel i7',
            ram: '16GB',
          },
        },
        tags: ['tag1', 'tag2'],
        createdAt: new Date('2024-01-01'),
        nullValue: null,
        undefinedValue: undefined,
      };

      const flattened = service['flattenObject'](nested);

      expect(flattened).toEqual({
        name: 'Test',
        'details.category': 'Hardware',
        'details.specs.cpu': 'Intel i7',
        'details.specs.ram': '16GB',
        tags: '["tag1","tag2"]',
        createdAt: '2024-01-01T00:00:00.000Z',
        nullValue: '',
        undefinedValue: '',
      });
    });

    it('should handle empty objects', () => {
      const empty = {};
      const flattened = service['flattenObject'](empty);
      expect(flattened).toEqual({});
    });

    it('should handle arrays in objects', () => {
      const obj = {
        numbers: [1, 2, 3],
        emptyArray: [],
        strings: ['a', 'b'],
      };

      const flattened = service['flattenObject'](obj);

      expect(flattened).toEqual({
        numbers: '[1,2,3]',
        emptyArray: '',
        strings: '["a","b"]',
      });
    });
  });

  describe('cleanupOldExports', () => {
    it('should delete files older than specified days', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      mockFs.readdir.mockResolvedValueOnce(['old-file.json', 'new-file.json'] as any);
      mockFs.stat
        .mockResolvedValueOnce({ mtime: oldDate } as any)
        .mockResolvedValueOnce({ mtime: new Date() } as any);

      const deletedCount = await service.cleanupOldExports(7);

      expect(deletedCount).toBe(1);
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('old-file.json'));
    });

    it('should not delete recent files', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);

      mockFs.readdir.mockResolvedValueOnce(['recent-file.json'] as any);
      mockFs.stat.mockResolvedValueOnce({ mtime: recentDate } as any);

      const deletedCount = await service.cleanupOldExports(7);

      expect(deletedCount).toBe(0);
      expect(mockFs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('initializeExportDirectory', () => {
    it('should create export directory if it does not exist', async () => {
      mockFs.access.mockRejectedValueOnce(new Error('Directory does not exist'));

      await service['initializeExportDirectory']();

      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.stringContaining('exports'), {
        recursive: true,
      });
    });

    it('should not create directory if it exists', async () => {
      mockFs.access.mockResolvedValueOnce(undefined);

      await service['initializeExportDirectory']();

      expect(mockFs.mkdir).not.toHaveBeenCalled();
    });
  });
});
