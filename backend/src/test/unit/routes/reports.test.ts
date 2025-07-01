import request from 'supertest';
import express from 'express';
import reportRoutes from '../../../routes/reports';
import { jest } from '@jest/globals';

// Mock dependencies
jest.mock('../../../lib/prisma', () => ({
  prisma: {
    scheduledReport: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
    },
    reportHistory: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock('../../../lib/queue', () => ({
  addReportJob: jest.fn().mockResolvedValue({ id: 'job-123' }),
  reportQueue: {
    add: jest.fn(),
    removeRepeatable: jest.fn(),
  },
}));

jest.mock('../../../middleware/auth', () => ({
  authenticateJWT: jest.fn((req, res, next) => {
    req.user = {
      id: 'test-user-id',
      organizationId: 'test-org-id',
      role: 'MANAGER',
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
    };
    next();
  }),
  requirePermission: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

jest.mock('../../../services/file-storage.service', () => ({
  FileStorageService: jest.fn().mockImplementation(() => ({
    downloadFile: jest.fn().mockResolvedValue({
      stream: {
        pipe: jest.fn(),
      },
    }),
  })),
}));

describe('Report Routes', () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/reports', reportRoutes);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/reports/generate', () => {
    it('should start report generation', async () => {
      const response = await request(app)
        .post('/api/reports/generate')
        .send({
          type: 'asset',
          format: 'pdf',
          filters: {
            startDate: '2023-01-01T00:00:00Z',
            endDate: '2023-12-31T23:59:59Z',
          },
        })
        .expect(202);

      expect(response.body).toHaveProperty('jobId');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('estimatedCompletionTime');
      expect(response.body.jobId).toBe('job-123');
    });

    it('should validate request body', async () => {
      await request(app)
        .post('/api/reports/generate')
        .send({
          type: 'invalid-type',
          format: 'pdf',
        })
        .expect(400);
    });
  });

  describe('GET /api/reports/scheduled', () => {
    it('should return scheduled reports', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      const mockReports = [
        {
          id: 'report-1',
          name: 'Weekly Asset Report',
          type: 'asset',
          format: 'pdf',
          enabled: true,
          createdAt: new Date(),
          createdBy: {
            id: 'user-1',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
          },
        },
      ];

      (prisma.scheduledReport.findMany as jest.Mock).mockResolvedValue(mockReports);
      (prisma.scheduledReport.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/reports/scheduled')
        .expect(200);

      expect(response.body).toHaveProperty('reports');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('totalPages');
      expect(response.body.reports).toHaveLength(1);
    });
  });

  describe('POST /api/reports/scheduled', () => {
    it('should create scheduled report', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      const mockReport = {
        id: 'report-1',
        name: 'Weekly Asset Report',
        type: 'asset',
        format: 'pdf',
        schedule: {
          frequency: 'weekly',
          dayOfWeek: 1,
          hour: 8,
        },
        recipients: ['test@example.com'],
        enabled: true,
        lastRunAt: null,
        nextRunAt: new Date(),
        createdAt: new Date(),
        createdBy: {
          id: 'user-1',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
        },
      };

      (prisma.scheduledReport.create as jest.Mock).mockResolvedValue(mockReport);

      const response = await request(app)
        .post('/api/reports/scheduled')
        .send({
          name: 'Weekly Asset Report',
          type: 'asset',
          format: 'pdf',
          schedule: {
            frequency: 'weekly',
            dayOfWeek: 1,
            hour: 8,
          },
          recipients: ['test@example.com'],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('Weekly Asset Report');
    });

    it('should validate weekly reports require dayOfWeek', async () => {
      await request(app)
        .post('/api/reports/scheduled')
        .send({
          name: 'Weekly Asset Report',
          type: 'asset',
          format: 'pdf',
          schedule: {
            frequency: 'weekly',
            hour: 8,
          },
          recipients: ['test@example.com'],
        })
        .expect(400);
    });
  });

  describe('PUT /api/reports/scheduled/:reportId', () => {
    it('should update scheduled report', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      const existingReport = {
        id: 'report-1',
        organizationId: 'test-org-id',
        enabled: true,
      };

      const updatedReport = {
        ...existingReport,
        name: 'Updated Weekly Asset Report',
        enabled: false,
        createdBy: {
          id: 'user-1',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
        },
      };

      (prisma.scheduledReport.findFirst as jest.Mock).mockResolvedValue(existingReport);
      (prisma.scheduledReport.update as jest.Mock).mockResolvedValue(updatedReport);

      const response = await request(app)
        .put('/api/reports/scheduled/report-1')
        .send({
          name: 'Updated Weekly Asset Report',
          enabled: false,
        })
        .expect(200);

      expect(response.body.name).toBe('Updated Weekly Asset Report');
      expect(response.body.enabled).toBe(false);
    });

    it('should return 404 for non-existent report', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      (prisma.scheduledReport.findFirst as jest.Mock).mockResolvedValue(null);

      await request(app)
        .put('/api/reports/scheduled/non-existent')
        .send({
          name: 'Updated Report',
        })
        .expect(404);
    });
  });

  describe('DELETE /api/reports/scheduled/:reportId', () => {
    it('should delete scheduled report', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      const existingReport = {
        id: 'report-1',
        organizationId: 'test-org-id',
      };

      (prisma.scheduledReport.findFirst as jest.Mock).mockResolvedValue(existingReport);
      (prisma.scheduledReport.delete as jest.Mock).mockResolvedValue(undefined);

      await request(app)
        .delete('/api/reports/scheduled/report-1')
        .expect(204);
    });

    it('should return 404 for non-existent report', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      (prisma.scheduledReport.findFirst as jest.Mock).mockResolvedValue(null);

      await request(app)
        .delete('/api/reports/scheduled/non-existent')
        .expect(404);
    });
  });

  describe('GET /api/reports/history', () => {
    it('should return report history', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      const mockHistory = [
        {
          id: 'history-1',
          type: 'asset',
          format: 'pdf',
          generatedAt: new Date(),
          generatedBy: {
            id: 'user-1',
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
          },
        },
      ];

      (prisma.reportHistory.findMany as jest.Mock).mockResolvedValue(mockHistory);
      (prisma.reportHistory.count as jest.Mock).mockResolvedValue(1);

      const response = await request(app)
        .get('/api/reports/history')
        .expect(200);

      expect(response.body).toHaveProperty('reports');
      expect(response.body).toHaveProperty('total');
      expect(response.body.reports).toHaveLength(1);
    });
  });

  describe('GET /api/reports/download/:reportId', () => {
    it('should download report file', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      const mockReport = {
        id: 'history-1',
        organizationId: 'test-org-id',
        type: 'asset',
        format: 'pdf',
        filePath: 'path/to/file.pdf',
        generatedAt: new Date('2023-01-01'),
      };

      (prisma.reportHistory.findFirst as jest.Mock).mockResolvedValue(mockReport);

      const response = await request(app)
        .get('/api/reports/download/history-1')
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should return 404 for non-existent report', async () => {
      const { prisma } = await import('../../../lib/prisma');
      
      (prisma.reportHistory.findFirst as jest.Mock).mockResolvedValue(null);

      await request(app)
        .get('/api/reports/download/non-existent')
        .expect(404);
    });
  });
});