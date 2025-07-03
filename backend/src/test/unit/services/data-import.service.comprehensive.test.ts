import type { ImportOptions } from '../../../services/data-import.service';
import {
  DataImportService,
  ImportResult,
  ValidationResult,
} from '../../../services/data-import.service';
import type { IRequestContext } from '../../../interfaces/context.interface';
import { prisma } from '../../../lib/prisma';
import { AuditService } from '../../../services/audit.service';
import * as fs from 'fs/promises';
import { parse } from 'csv-parse';
import * as XLSX from 'xlsx';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    asset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    task: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    location: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    assetTemplate: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../../services/audit.service');
jest.mock('fs/promises');
jest.mock('csv-parse');
jest.mock('xlsx');

describe('DataImportService - Comprehensive Tests', () => {
  let service: DataImportService;
  let mockContext: IRequestContext;
  let mockAuditService: jest.Mocked<AuditService>;

  beforeEach(() => {
    service = new DataImportService();
    mockContext = {
      userId: 'user-123',
      userRole: 'OWNER',
      organizationId: 'org-123',
      requestId: 'req-123',
    };

    mockAuditService = new AuditService() as jest.Mocked<AuditService>;
    (service as any).auditService = mockAuditService;

    jest.clearAllMocks();

    // Setup default file system mocks
    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('test,data\nvalue1,value2'));
  });

  describe('importFromCSV', () => {
    const mockCsvData = [
      { name: 'Asset 1', category: 'Computer', serial: 'ABC123' },
      { name: 'Asset 2', category: 'Furniture', serial: 'DEF456' },
    ];

    beforeEach(() => {
      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, mockCsvData);
      });
    });

    it('should import assets from CSV successfully', async () => {
      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          category: 'category',
          serial: 'serialNumber',
        },
      };

      (prisma.asset.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.totalRecords).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.duplicateCount).toBe(0);

      expect(prisma.asset.create).toHaveBeenCalledTimes(2);
      expect(prisma.asset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Asset 1',
          category: 'Computer',
          serialNumber: 'ABC123',
          organizationId: 'org-123',
        }),
      });
    });

    it('should handle duplicates when updateExisting is false', async () => {
      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          category: 'category',
        },
      };

      (prisma.asset.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing-1' }) // First asset exists
        .mockResolvedValueOnce(null); // Second asset is new
      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.duplicateCount).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates![0]).toMatchObject({
        originalData: mockCsvData[0],
        reason: 'Asset with name "Asset 1" already exists',
      });
    });

    it('should update existing records when updateExisting is true', async () => {
      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: true,
        fieldMapping: {
          name: 'name',
          category: 'category',
        },
      };

      const existingAsset = { id: 'existing-1', name: 'Asset 1' };
      (prisma.asset.findFirst as jest.Mock).mockResolvedValue(existingAsset);
      (prisma.asset.update as jest.Mock) = jest
        .fn()
        .mockResolvedValue({ ...existingAsset, category: 'Computer' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.updatedCount).toBe(2);
      expect(result.successCount).toBe(2);
    });

    it('should validate required fields', async () => {
      const invalidData = [
        { name: 'Valid Asset', category: 'Computer' },
        { category: 'Computer' }, // Missing required name
      ];

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, invalidData);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: { targetField: 'name', required: true },
          category: 'category',
        },
      };

      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.errorCount).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].error).toContain("Required field 'name' is missing");
    });

    it('should apply field transformations', async () => {
      const dataWithTransforms = [{ name: 'Asset 1', price: '1500.50', active: 'yes' }];

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, dataWithTransforms);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          price: {
            targetField: 'purchasePrice',
            transform: (value: string) => parseFloat(value),
          },
          active: {
            targetField: 'status',
            transform: (value: string) =>
              value.toLowerCase() === 'yes' ? 'OPERATIONAL' : 'MAINTENANCE',
          },
        },
      };

      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(prisma.asset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Asset 1',
          purchasePrice: 1500.5,
          status: 'OPERATIONAL',
        }),
      });
    });

    it('should handle CSV parsing errors', async () => {
      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(new Error('Invalid CSV format'), null);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: { name: 'name' },
      };

      await expect(
        service.importFromCSV('/path/to/file.csv', mockContext, options),
      ).rejects.toThrow('Invalid CSV format');
    });

    it('should handle file reading errors', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: { name: 'name' },
      };

      await expect(
        service.importFromCSV('/path/to/file.csv', mockContext, options),
      ).rejects.toThrow('File not found');
    });
  });

  describe('importFromExcel', () => {
    const mockExcelData = [
      ['Name', 'Category', 'Serial'],
      ['Asset 1', 'Computer', 'ABC123'],
      ['Asset 2', 'Furniture', 'DEF456'],
    ];

    beforeEach(() => {
      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: {
          Sheet1: {},
        },
      };

      (XLSX.readFile as jest.Mock).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        { Name: 'Asset 1', Category: 'Computer', Serial: 'ABC123' },
        { Name: 'Asset 2', Category: 'Furniture', Serial: 'DEF456' },
      ]);
    });

    it('should import from Excel successfully', async () => {
      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          Name: 'name',
          Category: 'category',
          Serial: 'serialNumber',
        },
      };

      (prisma.asset.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromExcel('/path/to/file.xlsx', mockContext, options);

      expect(result.totalRecords).toBe(2);
      expect(result.successCount).toBe(2);
      expect(XLSX.readFile).toHaveBeenCalledWith('/path/to/file.xlsx');
    });

    it('should handle Excel files with multiple sheets', async () => {
      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: { Name: 'name' },
        sheetName: 'Assets',
      };

      const mockWorkbook = {
        SheetNames: ['Sheet1', 'Assets', 'Sheet3'],
        Sheets: {
          Assets: {},
        },
      };

      (XLSX.readFile as jest.Mock).mockReturnValue(mockWorkbook);
      (XLSX.utils.sheet_to_json as jest.Mock).mockReturnValue([
        { Name: 'Asset from specific sheet' },
      ]);

      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      await service.importFromExcel('/path/to/file.xlsx', mockContext, options);

      expect(XLSX.utils.sheet_to_json).toHaveBeenCalledWith(mockWorkbook.Sheets.Assets, {
        header: 1,
      });
    });

    it('should throw error for non-existent sheet', async () => {
      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: { Name: 'name' },
        sheetName: 'NonExistentSheet',
      };

      const mockWorkbook = {
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      };

      (XLSX.readFile as jest.Mock).mockReturnValue(mockWorkbook);

      await expect(
        service.importFromExcel('/path/to/file.xlsx', mockContext, options),
      ).rejects.toThrow('Sheet "NonExistentSheet" not found');
    });
  });

  describe('importTasks', () => {
    const mockTaskData = [
      {
        title: 'Task 1',
        description: 'Description 1',
        priority: 'HIGH',
        assetName: 'Asset 1',
        assignedTo: 'user@example.com',
      },
    ];

    it('should import tasks with asset and user lookups', async () => {
      const options: ImportOptions = {
        entityType: 'task',
        updateExisting: false,
        fieldMapping: {
          title: 'title',
          description: 'description',
          priority: 'priority',
          assetName: {
            targetField: 'assetId',
            isLookup: true,
            lookupEntity: 'asset',
            lookupField: 'name',
          },
          assignedTo: {
            targetField: 'assignedTo',
            isLookup: true,
            lookupEntity: 'user',
            lookupField: 'email',
          },
        },
      };

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, mockTaskData);
      });

      // Mock lookups
      (prisma.asset.findFirst as jest.Mock).mockResolvedValue({ id: 'asset-123' });
      (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-456' });
      (prisma.task.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.task.create as jest.Mock).mockResolvedValue({ id: 'new-task' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.successCount).toBe(1);
      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Task 1',
          assetId: 'asset-123',
          assignedTo: 'user-456',
          organizationId: 'org-123',
        }),
      });
    });

    it('should handle failed lookups gracefully', async () => {
      const options: ImportOptions = {
        entityType: 'task',
        updateExisting: false,
        fieldMapping: {
          title: 'title',
          assetName: {
            targetField: 'assetId',
            isLookup: true,
            lookupEntity: 'asset',
            lookupField: 'name',
          },
        },
      };

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, mockTaskData);
      });

      (prisma.asset.findFirst as jest.Mock).mockResolvedValue(null); // Asset not found
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.errorCount).toBe(1);
      expect(result.errors![0].error).toContain('Lookup failed for assetId');
    });
  });

  describe('importLocations', () => {
    const mockLocationData = [
      { name: 'Building A', type: 'BUILDING', parentLocation: null },
      { name: 'Floor 1', type: 'FLOOR', parentLocation: 'Building A' },
      { name: 'Room 101', type: 'ROOM', parentLocation: 'Floor 1' },
    ];

    it('should import locations with hierarchical relationships', async () => {
      const options: ImportOptions = {
        entityType: 'location',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          type: 'type',
          parentLocation: {
            targetField: 'parentId',
            isLookup: true,
            lookupEntity: 'location',
            lookupField: 'name',
          },
        },
      };

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, mockLocationData);
      });

      // Mock location lookups for hierarchy
      (prisma.location.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // Building A (no parent)
        .mockResolvedValueOnce({ id: 'building-a-id' }) // Floor 1 parent lookup
        .mockResolvedValueOnce({ id: 'floor-1-id' }); // Room 101 parent lookup

      (prisma.location.create as jest.Mock)
        .mockResolvedValueOnce({ id: 'building-a-id', name: 'Building A' })
        .mockResolvedValueOnce({ id: 'floor-1-id', name: 'Floor 1' })
        .mockResolvedValueOnce({ id: 'room-101-id', name: 'Room 101' });

      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.successCount).toBe(3);
      expect(prisma.location.create).toHaveBeenCalledTimes(3);

      // Verify hierarchy is created correctly
      expect(prisma.location.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          name: 'Building A',
          type: 'BUILDING',
          parentId: null,
        }),
      });

      expect(prisma.location.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          name: 'Floor 1',
          type: 'FLOOR',
          parentId: 'building-a-id',
        }),
      });
    });
  });

  describe('previewImport', () => {
    it('should provide import preview without making changes', async () => {
      const mockData = [
        { name: 'Asset 1', category: 'Computer' },
        { name: 'Asset 2', category: 'Furniture' },
      ];

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, mockData);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          category: 'category',
        },
      };

      (prisma.asset.findFirst as jest.Mock)
        .mockResolvedValueOnce({ id: 'existing-1' }) // First asset exists
        .mockResolvedValueOnce(null); // Second asset is new

      const preview = await service.previewImport('/path/to/file.csv', mockContext, options);

      expect(preview.totalRecords).toBe(2);
      expect(preview.potentialDuplicates).toBe(1);
      expect(preview.potentialCreations).toBe(1);
      expect(preview.potentialUpdates).toBe(0);
      expect(preview.validationErrors).toHaveLength(0);

      // Verify no actual database operations were performed
      expect(prisma.asset.create).not.toHaveBeenCalled();
    });

    it('should identify validation errors in preview', async () => {
      const invalidData = [
        { name: 'Valid Asset', category: 'Computer' },
        { category: 'Computer' }, // Missing required name
      ];

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, invalidData);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: { targetField: 'name', required: true },
          category: 'category',
        },
      };

      const preview = await service.previewImport('/path/to/file.csv', mockContext, options);

      expect(preview.validationErrors).toHaveLength(1);
      expect(preview.validationErrors[0].error).toContain("Required field 'name' is missing");
    });
  });

  describe('validateImportData', () => {
    it('should validate data against constraints', async () => {
      const data = [
        { name: 'Valid Asset', category: 'Computer', serialNumber: 'ABC123' },
        { name: '', category: 'Computer' }, // Invalid - empty name
        { name: 'Asset 2' }, // Invalid - missing required category
      ];

      const fieldMapping = {
        name: { targetField: 'name', required: true },
        category: { targetField: 'category', required: true },
        serialNumber: 'serialNumber',
      };

      const validation = await service.validateImportData(data, fieldMapping, mockContext);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(2);
      expect(validation.validRecords).toHaveLength(1);
      expect(validation.invalidRecords).toHaveLength(2);
    });

    it('should validate data types and formats', async () => {
      const data = [
        { name: 'Asset 1', purchasePrice: 'invalid-number', purchaseDate: '2024-01-15' },
      ];

      const fieldMapping = {
        name: 'name',
        purchasePrice: {
          targetField: 'purchasePrice',
          transform: (value: string) => {
            const num = parseFloat(value);
            if (isNaN(num)) throw new Error('Invalid number format');
            return num;
          },
        },
        purchaseDate: 'purchaseDate',
      };

      const validation = await service.validateImportData(data, fieldMapping, mockContext);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors[0].error).toContain('Invalid number format');
    });
  });

  describe('getBatchStatus', () => {
    it('should return status of import batch', async () => {
      const batchId = 'batch-123';

      // Mock batch status storage (would be in Redis or database)
      const mockStatus = {
        id: batchId,
        status: 'PROCESSING',
        totalRecords: 100,
        processedRecords: 75,
        successCount: 70,
        errorCount: 5,
        startedAt: new Date(),
      };

      // Mock the internal batch status retrieval
      jest.spyOn(service as any, 'getBatchStatusFromStorage').mockResolvedValue(mockStatus);

      const status = await service.getBatchStatus(batchId);

      expect(status).toEqual(mockStatus);
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle transformation errors gracefully', async () => {
      const data = [{ name: 'Asset 1', price: 'invalid' }];

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, data);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          price: {
            targetField: 'purchasePrice',
            transform: (value: string) => {
              const num = parseFloat(value);
              if (isNaN(num)) throw new Error('Invalid price format');
              return num;
            },
          },
        },
      };

      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.errorCount).toBe(1);
      expect(result.errors![0].error).toContain('Invalid price format');
    });

    it('should handle database transaction failures', async () => {
      const data = [{ name: 'Asset 1' }];

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, data);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: { name: 'name' },
      };

      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('Database connection lost'));

      await expect(
        service.importFromCSV('/path/to/file.csv', mockContext, options),
      ).rejects.toThrow('Database connection lost');
    });

    it('should handle large datasets with batching', async () => {
      // Create large dataset
      const largeData = Array.from({ length: 1000 }, (_, i) => ({
        name: `Asset ${i + 1}`,
        category: 'Computer',
      }));

      (parse as any).mockImplementation((data: any, options: any, callback: any) => {
        callback(null, largeData);
      });

      const options: ImportOptions = {
        entityType: 'asset',
        updateExisting: false,
        fieldMapping: {
          name: 'name',
          category: 'category',
        },
        batchSize: 100,
      };

      (prisma.asset.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.asset.create as jest.Mock).mockResolvedValue({ id: 'new-asset' });
      (prisma.$transaction as jest.Mock).mockImplementation((fn) => fn(prisma));

      const result = await service.importFromCSV('/path/to/file.csv', mockContext, options);

      expect(result.totalRecords).toBe(1000);
      expect(result.successCount).toBe(1000);

      // Verify batching occurred (should have multiple transaction calls)
      expect((prisma.$transaction as jest.Mock).mock.calls.length).toBeGreaterThan(1);
    });
  });
});
