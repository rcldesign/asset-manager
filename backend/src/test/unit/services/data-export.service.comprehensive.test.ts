import { DataExportService, ExportOptions, UserDataExport } from '../../../services/data-export.service';
import { IRequestContext } from '../../../interfaces/context.interface';
import { prisma } from '../../../lib/prisma';
import { AuditService } from '../../../services/audit.service';
import { ActionType } from '@prisma/client';
import * as fs from 'fs/promises';
import { Parser } from 'json2csv';
import * as XLSX from 'xlsx';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
    schedule: {
      findMany: jest.fn(),
    },
    location: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    taskAssignment: {
      findMany: jest.fn(),
    },
    taskComment: {
      findMany: jest.fn(),
    },
    activityLog: {
      findMany: jest.fn(),
    },
    notification: {
      findMany: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
    },
    apiToken: {
      findMany: jest.fn(),
    },
    calendarIntegration: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../../services/audit.service');
jest.mock('fs/promises');
jest.mock('json2csv');
jest.mock('xlsx');

describe('DataExportService - Comprehensive Tests', () => {
  let service: DataExportService;
  let mockContext: IRequestContext;
  let mockAuditService: jest.Mocked<AuditService>;

  beforeEach(() => {
    service = new DataExportService();
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
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  describe('exportAssets', () => {
    const mockAssets = [
      {
        id: 'asset-1',
        name: 'Test Asset 1',
        category: 'Computer',
        status: 'ACTIVE',
        organizationId: 'org-123',
        location: { name: 'Office A' },
        assetTemplate: { name: 'Laptop Template' },
        components: [],
        attachments: [],
        tasks: [],
      },
      {
        id: 'asset-2',
        name: 'Test Asset 2',
        category: 'Furniture',
        status: 'INACTIVE',
        organizationId: 'org-123',
        location: { name: 'Office B' },
        assetTemplate: null,
        components: [],
        attachments: [],
        tasks: [],
      },
    ];

    beforeEach(() => {
      (prisma.asset.findMany as jest.Mock).mockResolvedValue(mockAssets);
    });

    it('should export assets to JSON format', async () => {
      const options: ExportOptions = {
        format: 'json',
        includeRelations: true,
      };

      const result = await service.exportAssets(mockContext, options);

      expect(prisma.asset.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        include: {
          location: true,
          assetTemplate: true,
          components: true,
          attachments: true,
          tasks: { include: { assignments: true } },
        },
      });

      expect(result.recordCount).toBe(2);
      expect(result.format).toBe('json');
      expect(result.fileName).toMatch(/assets-export-.*\.json/);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.stringContaining('"Test Asset 1"')
      );
    });

    it('should export assets to CSV format', async () => {
      const mockParser = {
        parse: jest.fn().mockReturnValue('id,name,category\nasset-1,Test Asset 1,Computer'),
      };
      (Parser as jest.Mock).mockImplementation(() => mockParser);

      const options: ExportOptions = {
        format: 'csv',
        fields: ['id', 'name', 'category'],
      };

      const result = await service.exportAssets(mockContext, options);

      expect(result.format).toBe('csv');
      expect(result.fileName).toMatch(/assets-export-.*\.csv/);
      expect(mockParser.parse).toHaveBeenCalled();
    });

    it('should export assets to Excel format', async () => {
      const mockWorkbook = { SheetNames: ['Assets'], Sheets: { Assets: {} } };
      const mockBuffer = Buffer.from('excel-data');

      (XLSX.utils.json_to_sheet as jest.Mock).mockReturnValue({});
      (XLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook);
      (XLSX.write as jest.Mock).mockReturnValue(mockBuffer);

      const options: ExportOptions = {
        format: 'excel',
        includeRelations: false,
      };

      const result = await service.exportAssets(mockContext, options);

      expect(result.format).toBe('excel');
      expect(result.fileName).toMatch(/assets-export-.*\.xlsx/);
      expect(XLSX.utils.json_to_sheet).toHaveBeenCalled();
      expect(XLSX.utils.book_new).toHaveBeenCalled();
    });

    it('should apply filters when exporting assets', async () => {
      const options: ExportOptions = {
        format: 'json',
        filters: {
          status: 'ACTIVE',
          category: 'Computer',
        },
      };

      await service.exportAssets(mockContext, options);

      expect(prisma.asset.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-123',
          status: 'ACTIVE',
          category: 'Computer',
        },
        include: undefined,
      });
    });

    it('should throw error for unsupported format', async () => {
      const options: ExportOptions = {
        format: 'xml' as any,
      };

      await expect(service.exportAssets(mockContext, options)).rejects.toThrow(
        'Unsupported export format: xml'
      );
    });

    it('should log audit trail for export', async () => {
      const options: ExportOptions = {
        format: 'json',
      };

      await service.exportAssets(mockContext, options);

      expect(mockAuditService.log).toHaveBeenCalledWith(prisma, {
        context: mockContext,
        model: 'Asset',
        recordId: 'EXPORT',
        action: ActionType.CREATE,
        newValue: {
          format: 'json',
          recordCount: 2,
          filters: undefined,
          includeRelations: undefined,
        },
      });
    });

    it('should handle empty asset results', async () => {
      (prisma.asset.findMany as jest.Mock).mockResolvedValue([]);

      const options: ExportOptions = {
        format: 'json',
      };

      const result = await service.exportAssets(mockContext, options);

      expect(result.recordCount).toBe(0);
    });
  });

  describe('exportTasks', () => {
    const mockTasks = [
      {
        id: 'task-1',
        title: 'Test Task 1',
        status: 'TODO',
        priority: 'HIGH',
        organizationId: 'org-123',
        asset: { name: 'Test Asset' },
        schedule: { name: 'Weekly Check' },
        assignments: [{ user: { fullName: 'John Doe' } }],
        comments: [],
        attachments: [],
        subtasks: [],
      },
    ];

    beforeEach(() => {
      (prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks);
    });

    it('should export tasks with relations', async () => {
      const options: ExportOptions = {
        format: 'json',
        includeRelations: true,
      };

      const result = await service.exportTasks(mockContext, options);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        include: {
          asset: true,
          schedule: true,
          assignments: {
            include: {
              user: {
                select: { id: true, email: true, fullName: true },
              },
            },
          },
          comments: true,
          attachments: true,
          subtasks: true,
        },
      });

      expect(result.recordCount).toBe(1);
      expect(result.format).toBe('json');
    });

    it('should export tasks without relations', async () => {
      const options: ExportOptions = {
        format: 'csv',
        includeRelations: false,
      };

      const mockParser = {
        parse: jest.fn().mockReturnValue('id,title,status\ntask-1,Test Task 1,TODO'),
      };
      (Parser as jest.Mock).mockImplementation(() => mockParser);

      await service.exportTasks(mockContext, options);

      expect(prisma.task.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-123' },
        include: undefined,
      });
    });
  });

  describe('exportSchedules', () => {
    const mockSchedules = [
      {
        id: 'schedule-1',
        name: 'Weekly Maintenance',
        frequency: 'WEEKLY',
        organizationId: 'org-123',
        tasks: [{ title: 'Check Equipment' }],
      },
    ];

    beforeEach(() => {
      (prisma.schedule.findMany as jest.Mock).mockResolvedValue(mockSchedules);
    });

    it('should export schedules successfully', async () => {
      const options: ExportOptions = {
        format: 'json',
        includeRelations: true,
      };

      const result = await service.exportSchedules(mockContext, options);

      expect(result.recordCount).toBe(1);
      expect(result.fileName).toMatch(/schedules-export-.*\.json/);
    });
  });

  describe('exportLocations', () => {
    const mockLocations = [
      {
        id: 'location-1',
        name: 'Building A',
        type: 'BUILDING',
        organizationId: 'org-123',
        assets: [{ name: 'Asset 1' }],
      },
    ];

    beforeEach(() => {
      (prisma.location.findMany as jest.Mock).mockResolvedValue(mockLocations);
    });

    it('should export locations successfully', async () => {
      const options: ExportOptions = {
        format: 'excel',
        includeRelations: false,
      };

      const mockWorkbook = { SheetNames: ['Locations'], Sheets: { Locations: {} } };
      (XLSX.utils.json_to_sheet as jest.Mock).mockReturnValue({});
      (XLSX.utils.book_new as jest.Mock).mockReturnValue(mockWorkbook);
      (XLSX.write as jest.Mock).mockReturnValue(Buffer.from('excel-data'));

      const result = await service.exportLocations(mockContext, options);

      expect(result.recordCount).toBe(1);
      expect(result.format).toBe('excel');
    });
  });

  describe('exportUserData', () => {
    const mockUserData = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      organizationId: 'org-123',
    };

    const mockTaskAssignments = [
      { id: 'assignment-1', taskId: 'task-1', userId: 'user-123' },
    ];

    const mockActivities = [
      { id: 'activity-1', userId: 'user-123', action: 'LOGIN' },
    ];

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserData);
      (prisma.asset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.task.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.taskAssignment.findMany as jest.Mock).mockResolvedValue(mockTaskAssignments);
      (prisma.taskComment.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.activityLog.findMany as jest.Mock).mockResolvedValue(mockActivities);
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.session.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.apiToken.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.calendarIntegration.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('should export complete user data for GDPR compliance', async () => {
      const result = await service.exportUserData(mockContext, 'user-123');

      expect(result.userData).toEqual(mockUserData);
      expect(result.taskAssignments).toEqual(mockTaskAssignments);
      expect(result.activities).toEqual(mockActivities);
      expect(result.exportedAt).toBeInstanceOf(Date);

      // Verify all queries were made with correct user ID
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        include: expect.any(Object),
      });

      expect(prisma.taskAssignment.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        include: expect.any(Object),
      });
    });

    it('should throw error when user not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.exportUserData(mockContext, 'nonexistent-user')).rejects.toThrow(
        'User not found'
      );
    });

    it('should verify organization access', async () => {
      const differentOrgUser = {
        ...mockUserData,
        organizationId: 'different-org',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(differentOrgUser);

      await expect(service.exportUserData(mockContext, 'user-123')).rejects.toThrow(
        'Access denied: User belongs to different organization'
      );
    });
  });

  describe('cleanupOldExports', () => {
    it('should delete old export files', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);

      (fs.readdir as jest.Mock).mockResolvedValue(['old-export.json', 'recent-export.json']);
      (fs.stat as jest.Mock)
        .mockResolvedValueOnce({ mtime: oldDate })
        .mockResolvedValueOnce({ mtime: recentDate });
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      const deletedCount = await service.cleanupOldExports(7);

      expect(deletedCount).toBe(1);
      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('old-export.json')
      );
    });

    it('should handle errors during cleanup gracefully', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['test-export.json']);
      (fs.stat as jest.Mock).mockRejectedValue(new Error('File access error'));

      const deletedCount = await service.cleanupOldExports(7);

      expect(deletedCount).toBe(0);
    });
  });

  describe('flattenObject', () => {
    it('should flatten complex nested objects', async () => {
      const complexObject = {
        id: 'test-1',
        details: {
          specifications: {
            hardware: {
              cpu: 'Intel i7',
              memory: '16GB',
            },
            software: {
              os: 'Windows 11',
              apps: ['Office', 'Chrome'],
            },
          },
          warranty: {
            provider: 'Dell',
            expiryDate: new Date('2025-12-31'),
          },
        },
        tags: ['laptop', 'workstation'],
        metadata: null,
        isActive: true,
      };

      const flattened = (service as any).flattenObject(complexObject);

      expect(flattened).toMatchObject({
        id: 'test-1',
        'details.specifications.hardware.cpu': 'Intel i7',
        'details.specifications.hardware.memory': '16GB',
        'details.specifications.software.os': 'Windows 11',
        'details.specifications.software.apps': '["Office","Chrome"]',
        'details.warranty.provider': 'Dell',
        'details.warranty.expiryDate': '2025-12-31T00:00:00.000Z',
        tags: '["laptop","workstation"]',
        metadata: '',
        isActive: true,
      });
    });

    it('should handle circular references safely', async () => {
      const obj: any = { name: 'test' };
      obj.self = obj; // Create circular reference

      const flattened = (service as any).flattenObject(obj);

      expect(flattened.name).toBe('test');
      // Circular reference should be handled gracefully
    });
  });

  describe('field filtering', () => {
    it('should filter fields when specified in options', async () => {
      const mockAssets = [
        { id: 'asset-1', name: 'Asset 1', category: 'Computer', secret: 'hidden' },
      ];
      (prisma.asset.findMany as jest.Mock).mockResolvedValue(mockAssets);

      const options: ExportOptions = {
        format: 'json',
        fields: ['id', 'name'],
      };

      await service.exportAssets(mockContext, options);

      const writeCall = (fs.writeFile as jest.Mock).mock.calls[0];
      const exportedData = JSON.parse(writeCall[1]);

      expect(exportedData[0]).toEqual({
        id: 'asset-1',
        name: 'Asset 1',
      });
      expect(exportedData[0].category).toBeUndefined();
      expect(exportedData[0].secret).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Cannot create directory'));

      const options: ExportOptions = { format: 'json' };

      await expect(service.exportAssets(mockContext, options)).rejects.toThrow();
    });

    it('should handle database errors', async () => {
      (prisma.asset.findMany as jest.Mock).mockRejectedValue(new Error('Database connection lost'));

      const options: ExportOptions = { format: 'json' };

      await expect(service.exportAssets(mockContext, options)).rejects.toThrow(
        'Database connection lost'
      );
    });

    it('should handle CSV parsing errors', async () => {
      const mockParser = {
        parse: jest.fn().mockImplementation(() => {
          throw new Error('CSV parsing failed');
        }),
      };
      (Parser as jest.Mock).mockImplementation(() => mockParser);

      (prisma.asset.findMany as jest.Mock).mockResolvedValue([{ id: 'test' }]);

      const options: ExportOptions = { format: 'csv' };

      await expect(service.exportAssets(mockContext, options)).rejects.toThrow();
    });
  });
});