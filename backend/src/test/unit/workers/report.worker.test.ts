import { processReportJob } from '../../../workers/report.worker';
import { jest } from '@jest/globals';
import type { Job } from 'bullmq';
import type { ReportJob } from '../../../lib/queue';
import type { FileStorageService as OriginalFileStorageService } from '../../../services/file-storage.service';
import type { Stats } from 'fs';
import type { PrismaClient } from '@prisma/client';
import type { addEmailJob as originalAddEmailJob } from '../../../lib/queue';
import type { createWriteStream as originalCreateWriteStream } from 'fs';
import type {
  readFile as originalReadFile,
  stat as originalStat,
  writeFile as originalWriteFile,
  mkdir as originalMkdir,
  unlink as originalUnlink,
} from 'fs/promises';
import type { Workbook as OriginalWorkbook } from 'exceljs';
import type { createObjectCsvStringifier as originalCreateObjectCsvStringifier } from 'csv-writer';
import { prismaMock } from '../../../test/prisma-singleton';
// import PDFDocument from 'pdfkit'; // TODO: Use if needed

// Mock type definitions
interface MockPDFDocument {
  fontSize: jest.MockedFunction<any>;
  text: jest.MockedFunction<any>;
  moveDown: jest.MockedFunction<any>;
  addPage: jest.MockedFunction<any>;
  pipe: jest.MockedFunction<any>;
  end: jest.MockedFunction<any>;
}

// Use the shared prisma mock
const mockPrismaExtensions = {
  activityStream: {
    findMany: jest.fn(),
  },
  reportHistory: {
    create: jest.fn(),
  },
  scheduledReport: {
    update: jest.fn(),
  },
} as unknown as jest.Mocked<PrismaClient>;

const mockWorkbook = {
  creator: '',
  created: new Date(),
  addWorksheet: jest.fn().mockReturnValue({
    columns: [],
    addRow: jest.fn(),
    addRows: jest.fn(),
    getRow: jest.fn().mockReturnValue({
      font: {},
    }),
    autoFilter: {},
  }),
  xlsx: {
    writeFile: jest.fn(),
  },
} as unknown as jest.Mocked<OriginalWorkbook>;

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: prismaMock,
}));

jest.mock('../../../lib/queue', () => ({
  addEmailJob: jest.fn<typeof originalAddEmailJob>(),
}));

jest.mock('../../../services/file-storage.service', () => ({
  FileStorageService: jest.fn().mockImplementation(() => ({
    uploadReportFile: jest.fn().mockResolvedValue({
      id: 'file-123',
      fileSizeBytes: 1024,
    } as Awaited<ReturnType<typeof OriginalFileStorageService.prototype.uploadReportFile>>),
  })),
}));

jest.mock('fs/promises', () => ({
  readFile: jest.fn<typeof originalReadFile>(),
  stat: jest.fn<typeof originalStat>().mockResolvedValue({ size: 1024 } as Stats),
  writeFile: jest.fn<typeof originalWriteFile>(),
  mkdir: jest.fn<typeof originalMkdir>(),
  unlink: jest.fn<typeof originalUnlink>(),
}));

jest.mock('fs', () => ({
  createWriteStream: jest.fn<typeof originalCreateWriteStream>().mockReturnValue({
    on: jest.fn(),
  }),
}));

jest.mock('path', () => ({
  join: jest.fn().mockReturnValue('/tmp/reports/test-report.pdf'),
  basename: jest.fn().mockReturnValue('test-report.pdf'),
}));

jest.mock('pdfkit', () => {
  const mockPdfDoc: MockPDFDocument = {
    fontSize: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    pipe: jest.fn().mockReturnValue({
      on: jest.fn((event, callback) => {
        if (event === 'finish') {
          setTimeout(callback, 10);
        }
      }),
    }),
    end: jest.fn(),
  };
  return jest.fn<() => MockPDFDocument>().mockImplementation(() => mockPdfDoc);
});

jest.mock('csv-writer', () => ({
  createObjectCsvStringifier: jest.fn<typeof originalCreateObjectCsvStringifier>().mockReturnValue({
    getHeaderString: jest.fn().mockReturnValue('header\n'),
    stringifyRecords: jest.fn().mockReturnValue('data\n'),
  }),
}));

jest.mock('exceljs', () => ({
  Workbook: jest.fn<() => OriginalWorkbook>().mockImplementation(() => mockWorkbook),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Report Worker', () => {
  let mockJob: Job<ReportJob>;

  beforeEach(() => {
    mockJob = {
      id: 'job-123',
      data: {
        type: 'asset-report',
        userId: 'user-123',
        organizationId: 'org-123',
        reportParams: {
          filters: {
            startDate: '2023-01-01T00:00:00Z',
            endDate: '2023-12-31T23:59:59Z',
          },
        },
        format: 'pdf',
      },
      updateProgress: jest.fn(),
    } as any;

    jest.clearAllMocks();
  });

  describe('processReportJob', () => {
    it('should process asset report successfully', async () => {
      const { prisma } = await import('../../../lib/prisma');

      // Mock asset data
      (prisma.asset.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'asset-1',
          name: 'Test Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          purchasePrice: 1000,
          location: { name: 'Office' },
          components: [],
          tasks: [],
          _count: { tasks: 0, components: 0, attachments: 0 },
        },
      ]);

      (prisma.reportHistory.create as jest.Mock).mockResolvedValue({
        id: 'history-123',
      });

      const result = await processReportJob(mockJob);

      expect(result).toEqual({
        status: 'completed',
        reportPath: 'file-123',
        fileSize: 1024,
        recordCount: 1,
      });

      expect(mockJob.updateProgress).toHaveBeenCalledWith(10);
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
    });

    it('should process maintenance report successfully', async () => {
      mockJob.data.type = 'maintenance-report';

      const { prisma } = await import('../../../lib/prisma');

      // Mock task data
      (prisma.task.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'task-1',
          title: 'Maintenance Task',
          status: 'DONE',
          priority: 'HIGH',
          dueDate: new Date(),
          asset: { name: 'Test Asset', location: { name: 'Office' } },
          assignments: [],
          schedule: null,
        },
      ]);

      (prisma.reportHistory.create as jest.Mock).mockResolvedValue({
        id: 'history-123',
      });

      const result = await processReportJob(mockJob);

      expect(result.status).toBe('completed');
      expect(result.recordCount).toBe(1);
    });

    it('should process usage statistics report successfully', async () => {
      mockJob.data.type = 'usage-statistics';

      const { prisma } = await import('../../../lib/prisma');

      // Mock various statistics data
      (prisma.user.groupBy as jest.Mock).mockResolvedValue([{ role: 'MANAGER', _count: 5 }]);
      (prisma.asset.count as jest.Mock).mockResolvedValue(100);
      (prisma.asset.groupBy as jest.Mock).mockResolvedValue([
        { status: 'OPERATIONAL', _count: 90 },
      ]);
      (prisma.task.count as jest.Mock).mockResolvedValueOnce(200).mockResolvedValueOnce(180);
      (prisma.task.groupBy as jest.Mock).mockResolvedValue([{ priority: 'HIGH', _count: 50 }]);
      (prisma.task.aggregate as jest.Mock).mockResolvedValue({
        _avg: { actualCost: 100 },
      });
      (prisma.location.findMany as jest.Mock).mockResolvedValue([
        { id: 'loc-1', name: 'Office', _count: { assets: 50 } },
      ]);
      (prisma.activityStream.findMany as jest.Mock).mockResolvedValue([]);

      (prisma.reportHistory.create as jest.Mock).mockResolvedValue({
        id: 'history-123',
      });

      const result = await processReportJob(mockJob);

      expect(result.status).toBe('completed');
      expect(result.recordCount).toBeGreaterThan(0);
    });

    it('should generate CSV format report', async () => {
      mockJob.data.format = 'csv';

      const { prisma } = await import('../../../lib/prisma');

      (prisma.asset.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'asset-1',
          name: 'Test Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          serialNumber: 'SN123',
          location: { name: 'Office' },
          purchasePrice: 1000,
          components: [],
          tasks: [],
          _count: { tasks: 0, components: 0, attachments: 0 },
        },
      ]);

      (prisma.reportHistory.create as jest.Mock).mockResolvedValue({
        id: 'history-123',
      });

      const result = await processReportJob(mockJob);

      expect(result.status).toBe('completed');
    });

    it('should generate Excel format report', async () => {
      mockJob.data.format = 'xlsx';

      const { prisma } = await import('../../../lib/prisma');

      (prisma.asset.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'asset-1',
          name: 'Test Asset',
          category: 'HARDWARE',
          status: 'OPERATIONAL',
          location: { name: 'Office' },
          components: [],
          tasks: [],
          _count: { tasks: 0, components: 0, attachments: 0 },
        },
      ]);

      (prisma.reportHistory.create as jest.Mock).mockResolvedValue({
        id: 'history-123',
      });

      const result = await processReportJob(mockJob);

      expect(result.status).toBe('completed');
    });

    it('should handle scheduled reports with email delivery', async () => {
      mockJob.data.reportParams = {
        scheduled: true,
        scheduledReportId: 'scheduled-123',
        recipients: ['test@example.com'],
        filters: {},
      };

      const { prisma } = await import('../../../lib/prisma');
      const { addEmailJob } = await import('../../../lib/queue');

      (prisma.asset.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.reportHistory.create as jest.Mock).mockResolvedValue({
        id: 'history-123',
      });
      (prisma.scheduledReport.update as jest.Mock).mockResolvedValue({});

      const result = await processReportJob(mockJob);

      expect(result.status).toBe('completed');
      expect(addEmailJob).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: expect.stringContaining('Asset Report'),
        }),
      );
      expect(prisma.scheduledReport.update).toHaveBeenCalledWith({
        where: { id: 'scheduled-123' },
        data: { lastRunAt: expect.any(Date) },
      });
    });

    it('should handle errors gracefully', async () => {
      const { prisma } = await import('../../../lib/prisma');

      (prisma.asset.findMany as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(processReportJob(mockJob)).rejects.toThrow('Database error');
    });

    it('should throw error for unknown report type', async () => {
      mockJob.data.type = 'unknown-type' as any;

      await expect(processReportJob(mockJob)).rejects.toThrow('Unknown report type: unknown-type');
    });
  });
});
