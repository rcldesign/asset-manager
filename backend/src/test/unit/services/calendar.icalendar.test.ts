// Mock dependencies first, before any imports
const mockToken = 'e925b80fdc6417506656749eaf83d8f7158b759ca68df535fecb3dc2bba8badb';

// Mock crypto.randomBytes to return a deterministic result
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn().mockImplementation((size: number) => {
    // For 32 bytes, we need 64 hex characters
    // mockToken is exactly 64 characters, so return the buffer from it
    const buffer = Buffer.from(mockToken, 'hex');
    // Return only the requested number of bytes
    return buffer.subarray(0, size);
  }),
}));

import { CalendarService } from '../../../services/calendar.service';
import type { PrismaClient } from '@prisma/client';
import { prismaMock } from '../../../test/prisma-singleton';
import { NotFoundError } from '../../../utils/errors';
import * as ical from 'ical-generator';
import { Decimal } from '@prisma/client/runtime/library';

jest.mock('ical-generator');

describe('CalendarService - iCalendar', () => {
  let calendarService: CalendarService;
  const mockCalendar = {
    createEvent: jest.fn(),
    toString: jest.fn().mockReturnValue('BEGIN:VCALENDAR\nEND:VCALENDAR'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    calendarService = new CalendarService(prismaMock as unknown as PrismaClient);
    (ical.default as jest.Mock).mockReturnValue(mockCalendar);
  });

  describe('generateICalToken', () => {
    it('should generate a new iCalendar token', async () => {
      const userId = 'user-123';
      const organizationId = 'org-123';

      prismaMock.calendarIntegration.upsert.mockResolvedValue({
        id: 'integration-123',
        userId,
        provider: 'ical',
        accessToken: 'any-token-string', // This doesn't matter since we're not testing the token value
        refreshToken: '',
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        syncEnabled: true,
        settings: { organizationId },
        lastSyncAt: null,
        calendarId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const token = await calendarService.generateICalToken(userId, organizationId);

      expect(token).toHaveLength(64); // 32 bytes = 64 hex characters
      expect(typeof token).toBe('string');
      expect(prismaMock.calendarIntegration.upsert).toHaveBeenCalledWith({
        where: {
          userId_provider: {
            userId,
            provider: 'ical',
          },
        },
        create: expect.objectContaining({
          userId,
          provider: 'ical',
          accessToken: expect.any(String),
          syncEnabled: true,
          settings: { organizationId },
        }),
        update: expect.objectContaining({
          accessToken: expect.any(String),
          syncEnabled: true,
          settings: { organizationId },
        }),
      });
    });
  });

  describe('getICalFeed', () => {
    it('should generate iCalendar feed for valid token', async () => {
      const token = 'valid-token';
      const options = {
        assetId: 'asset-123',
        userId: 'user-123',
        daysAhead: 30,
        daysBehind: 7,
      };

      // Mock calendar integration
      prismaMock.calendarIntegration.findFirst.mockResolvedValue({
        id: 'integration-123',
        userId: 'user-123',
        provider: 'ical',
        accessToken: token,
        refreshToken: '',
        tokenExpiresAt: new Date(Date.now() + 1000000),
        syncEnabled: true,
        settings: { organizationId: 'org-123' },
        lastSyncAt: null,
        calendarId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock tasks
      const mockTask = {
        id: 'task-123',
        title: 'Test Task',
        description: 'Test Description',
        status: 'PLANNED' as const,
        priority: 'MEDIUM' as const,
        dueDate: new Date(),
        estimatedMinutes: 60,
        estimatedCost: new Decimal(100),
        organizationId: 'org-123',
        assetId: 'asset-123',
        scheduleId: null,
        parentTaskId: null,
        completionRequirements: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: null,
        skippedAt: null,
        googleEventId: null,
      };

      const mockAsset = {
        id: 'asset-123',
        name: 'Test Asset',
        organizationId: 'org-123',
        locationId: 'loc-123',
        assetTemplateId: null,
        description: null,
        serialNumber: null,
        purchaseDate: null,
        purchasePrice: null,
        warrantyExpirationDate: null,
        assetTagId: null,
        status: 'ACTIVE' as const,
        condition: 'GOOD' as const,
        fields: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAssignment = {
        id: 'assignment-123',
        taskId: 'task-123',
        userId: 'user-123',
        createdAt: new Date(),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          fullName: 'Test User',
          passwordHash: null,
          role: 'USER' as const,
          organizationId: 'org-123',
          emailVerified: true,
          isActive: true,
          notificationPreferences: {},
          totpSecret: null,
          totpEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      prismaMock.task.findMany.mockResolvedValue([
        { ...mockTask, asset: mockAsset, assignments: [mockAssignment] } as any,
      ]);

      const result = await calendarService.getICalFeed(token, options);

      expect(result).toBe('BEGIN:VCALENDAR\nEND:VCALENDAR');
      expect(prismaMock.calendarIntegration.findFirst).toHaveBeenCalledWith({
        where: {
          accessToken: token,
          provider: 'ical',
          syncEnabled: true,
        },
      });
      expect(mockCalendar.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'task-123',
          summary: 'Test Task',
          description: expect.stringContaining('Test Description'),
          location: 'Test Asset',
        }),
      );
    });

    it('should throw NotFoundError for invalid token', async () => {
      prismaMock.calendarIntegration.findFirst.mockResolvedValue(null);

      await expect(
        calendarService.getICalFeed('invalid-token', {
          daysAhead: 30,
          daysBehind: 7,
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('revokeICalToken', () => {
    it('should revoke iCalendar token for user', async () => {
      const userId = 'user-123';

      prismaMock.calendarIntegration.updateMany.mockResolvedValue({
        count: 1,
      });

      await calendarService.revokeICalToken(userId);

      expect(prismaMock.calendarIntegration.updateMany).toHaveBeenCalledWith({
        where: {
          userId,
          provider: 'ical',
        },
        data: {
          syncEnabled: false,
        },
      });
    });
  });

  describe('getICalStatus', () => {
    it('should return enabled status with feed URL', async () => {
      const userId = 'user-123';
      const token = 'test-token';

      prismaMock.calendarIntegration.findFirst.mockResolvedValue({
        id: 'integration-123',
        userId,
        provider: 'ical',
        accessToken: token,
        refreshToken: '',
        tokenExpiresAt: new Date(Date.now() + 1000000),
        syncEnabled: true,
        settings: {},
        lastSyncAt: null,
        calendarId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await calendarService.getICalStatus(userId);

      expect(result).toEqual({
        enabled: true,
        feedUrl: expect.stringContaining(`/api/calendar/ical/feed/${token}`),
      });
    });

    it('should return disabled status when not configured', async () => {
      prismaMock.calendarIntegration.findFirst.mockResolvedValue(null);

      const result = await calendarService.getICalStatus('user-123');

      expect(result).toEqual({
        enabled: false,
      });
    });
  });
});
