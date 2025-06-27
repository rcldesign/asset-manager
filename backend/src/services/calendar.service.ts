import type { PrismaClient, CalendarIntegration } from '@prisma/client';
import { google } from 'googleapis';
import * as ical from 'ical-generator';
import { logger } from '../utils/logger';
import { config } from '../config';
import { NotFoundError, ValidationError } from '../utils/errors';
import { randomBytes } from 'crypto';
import { addDays, subDays } from 'date-fns';

interface GoogleCalendarConfig {
  calendarId?: string;
  syncPastDays: number;
  syncFutureDays: number;
}

interface ICalFeedOptions {
  assetId?: string;
  userId?: string;
  daysAhead: number;
  daysBehind: number;
}

export class CalendarService {
  private oauth2Client;

  constructor(private prisma: PrismaClient) {
    if (config.google) {
      this.oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        `${config.app.baseUrl}/api/calendar/google/callback`,
      );
    }
  }

  /**
   * Get Google OAuth authorization URL
   */
  async getGoogleAuthUrl(userId: string, redirectUrl?: string): Promise<string> {
    if (!this.oauth2Client) {
      throw new ValidationError('Google Calendar integration is not configured');
    }

    const scopes = [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ];

    const state = JSON.stringify({
      userId,
      redirectUrl: redirectUrl || `${config.app.baseUrl}/settings/calendar`,
    });

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: Buffer.from(state).toString('base64'),
      prompt: 'consent',
    });

    return authUrl;
  }

  /**
   * Handle Google OAuth callback
   */
  async handleGoogleCallback(
    userId: string,
    code: string,
    state?: string,
  ): Promise<{ success: boolean; redirectUrl?: string }> {
    if (!this.oauth2Client) {
      throw new ValidationError('Google Calendar integration is not configured');
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      // Store tokens in database
      await this.prisma.calendarIntegration.upsert({
        where: {
          userId_provider: {
            userId,
            provider: 'google',
          },
        },
        create: {
          userId,
          provider: 'google',
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token!,
          tokenExpiresAt: new Date(tokens.expiry_date!),
          syncEnabled: true,
        },
        update: {
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token || undefined,
          tokenExpiresAt: new Date(tokens.expiry_date!),
          syncEnabled: true,
        },
      });

      // Parse redirect URL from state
      let redirectUrl = `${config.app.baseUrl}/settings/calendar`;
      if (state) {
        try {
          const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
          redirectUrl = stateData.redirectUrl || redirectUrl;
        } catch (error) {
          logger.error('Failed to parse OAuth state', error as Error);
        }
      }

      return { success: true, redirectUrl };
    } catch (error) {
      logger.error('Google OAuth callback failed', error as Error);
      throw new ValidationError('Failed to authenticate with Google');
    }
  }

  /**
   * Sync tasks with Google Calendar
   */
  async syncWithGoogleCalendar(
    userId: string,
    organizationId: string,
    config: GoogleCalendarConfig,
  ): Promise<{ synced: number; errors: number }> {
    const integration = await this.getActiveGoogleIntegration(userId);

    if (!integration) {
      throw new ValidationError('Google Calendar is not connected');
    }

    // Set up OAuth client with tokens
    this.oauth2Client!.setCredentials({
      access_token: integration.accessToken,
      refresh_token: integration.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    const calendarId = config.calendarId || 'primary';

    // Get tasks to sync
    const startDate = subDays(new Date(), config.syncPastDays);
    const endDate = addDays(new Date(), config.syncFutureDays);

    const tasks = await this.prisma.task.findMany({
      where: {
        organizationId,
        OR: [
          { assignments: { some: { userId } } },
          // Add other conditions as needed
        ],
        dueDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        asset: true,
        assignments: {
          include: { user: true },
        },
      },
    });

    let synced = 0;
    let errors = 0;

    for (const task of tasks) {
      try {
        const event = {
          summary: task.title,
          description: this.formatTaskDescription(task),
          start: {
            dateTime: task.dueDate.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: new Date(task.dueDate.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour duration
            timeZone: 'UTC',
          },
          attendees: task.assignments.map((a) => ({
            email: a.user.email,
            displayName: a.user.fullName || a.user.email,
          })),
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'email', minutes: 24 * 60 }, // 1 day before
              { method: 'popup', minutes: 60 }, // 1 hour before
            ],
          },
        };

        // Check if event already exists
        if (task.googleEventId) {
          // Update existing event
          await calendar.events.update({
            calendarId,
            eventId: task.googleEventId,
            requestBody: event,
          });
        } else {
          // Create new event
          const response = await calendar.events.insert({
            calendarId,
            requestBody: event,
          });

          // Store Google event ID
          await this.prisma.task.update({
            where: { id: task.id },
            data: { googleEventId: response.data.id },
          });
        }

        synced++;
      } catch (error) {
        logger.error('Failed to sync task to Google Calendar', error as Error);
        logger.debug('Task sync error details', { taskId: task.id });
        errors++;
      }
    }

    // Update last sync time
    await this.prisma.calendarIntegration.update({
      where: {
        userId_provider: {
          userId,
          provider: 'google',
        },
      },
      data: { lastSyncAt: new Date() },
    });

    return { synced, errors };
  }

  /**
   * Disconnect Google Calendar integration
   */
  async disconnectGoogleCalendar(userId: string): Promise<void> {
    await this.prisma.calendarIntegration.updateMany({
      where: {
        userId,
        provider: 'google',
      },
      data: {
        syncEnabled: false,
      },
    });
  }

  /**
   * Get Google Calendar connection status
   */
  async getGoogleCalendarStatus(userId: string): Promise<{
    connected: boolean;
    lastSyncAt?: Date;
    email?: string;
  }> {
    const integration = await this.getActiveGoogleIntegration(userId);

    if (!integration) {
      return { connected: false };
    }

    // Try to get user info
    let email: string | undefined;
    try {
      this.oauth2Client!.setCredentials({
        access_token: integration.accessToken,
        refresh_token: integration.refreshToken,
      });

      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      email = userInfo.data.email || undefined;
    } catch (error) {
      logger.error('Failed to get Google user info', error as Error);
    }

    return {
      connected: true,
      lastSyncAt: integration.lastSyncAt || undefined,
      email,
    };
  }

  /**
   * Generate iCalendar feed token
   */
  async generateICalToken(userId: string, organizationId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');

    await this.prisma.calendarIntegration.upsert({
      where: {
        userId_provider: {
          userId,
          provider: 'ical',
        },
      },
      create: {
        userId,
        provider: 'ical',
        accessToken: token,
        refreshToken: '',
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        syncEnabled: true,
        settings: {
          organizationId,
        },
      },
      update: {
        accessToken: token,
        tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        syncEnabled: true,
        settings: {
          organizationId,
        },
      },
    });

    return token;
  }

  /**
   * Get iCalendar feed
   */
  async getICalFeed(token: string, options: ICalFeedOptions): Promise<string> {
    const integration = await this.prisma.calendarIntegration.findFirst({
      where: {
        accessToken: token,
        provider: 'ical',
        syncEnabled: true,
      },
    });

    if (!integration) {
      throw new NotFoundError('Invalid or expired calendar token');
    }

    const organizationId = (integration.settings as any).organizationId;
    const startDate = subDays(new Date(), options.daysBehind);
    const endDate = addDays(new Date(), options.daysAhead);

    // Build query conditions
    const whereConditions: any = {
      organizationId,
      dueDate: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (options.userId) {
      whereConditions.assignments = { some: { userId: options.userId } };
    }

    if (options.assetId) {
      whereConditions.assetId = options.assetId;
    }

    const tasks = await this.prisma.task.findMany({
      where: whereConditions,
      include: {
        asset: true,
        assignments: {
          include: { user: true },
        },
      },
    });

    // Create iCalendar
    const calendar = ical.default({
      name: 'DumbAssets Tasks',
      prodId: '//DumbAssets//Task Calendar//EN',
      timezone: 'UTC',
    });

    for (const task of tasks) {
      calendar.createEvent({
        id: task.id,
        start: task.dueDate,
        end: new Date(task.dueDate.getTime() + 60 * 60 * 1000), // 1 hour duration
        summary: task.title,
        description: this.formatTaskDescription(task),
        location: task.asset ? task.asset.name : undefined,
        // status: this.mapTaskStatusToICalStatus(task.status),
        // categories: [task.priority],
        organizer: {
          name: 'DumbAssets',
          email: 'noreply@dumbassets.app',
        },
        // attendees: task.assignments.map(a => ({
        //   email: a.user.email,
        //   name: a.user.fullName || a.user.email,
        //   role: 'REQ-PARTICIPANT',
        // })),
      });
    }

    return calendar.toString();
  }

  /**
   * Revoke iCalendar feed token
   */
  async revokeICalToken(userId: string): Promise<void> {
    await this.prisma.calendarIntegration.updateMany({
      where: {
        userId,
        provider: 'ical',
      },
      data: {
        syncEnabled: false,
      },
    });
  }

  /**
   * Get iCalendar feed status
   */
  async getICalStatus(userId: string): Promise<{
    enabled: boolean;
    feedUrl?: string;
  }> {
    const integration = await this.prisma.calendarIntegration.findFirst({
      where: {
        userId,
        provider: 'ical',
        syncEnabled: true,
      },
    });

    if (!integration) {
      return { enabled: false };
    }

    return {
      enabled: true,
      feedUrl: `${config.app.baseUrl}/api/calendar/ical/feed/${integration.accessToken}`,
    };
  }

  /**
   * Get active Google integration for a user
   */
  private async getActiveGoogleIntegration(userId: string): Promise<CalendarIntegration | null> {
    return this.prisma.calendarIntegration.findFirst({
      where: {
        userId,
        provider: 'google',
        syncEnabled: true,
      },
    });
  }

  /**
   * Format task description for calendar
   */
  private formatTaskDescription(task: any): string {
    const lines = [];

    if (task.description) {
      lines.push(task.description);
      lines.push('');
    }

    lines.push(`Priority: ${task.priority}`);
    lines.push(`Status: ${task.status}`);

    if (task.asset) {
      lines.push(`Asset: ${task.asset.name}`);
    }

    if (task.estimatedMinutes) {
      lines.push(`Estimated Duration: ${task.estimatedMinutes} minutes`);
    }

    if (task.estimatedCost) {
      lines.push(`Estimated Cost: $${task.estimatedCost}`);
    }

    return lines.join('\n');
  }

  /**
   * Map task status to iCal status
   */
  // private mapTaskStatusToICalStatus(taskStatus: string): string {
  //   switch (taskStatus) {
  //     case 'DONE':
  //       return 'COMPLETED';
  //     case 'IN_PROGRESS':
  //       return 'IN-PROCESS';
  //     case 'SKIPPED':
  //       return 'CANCELLED';
  //     default:
  //       return 'NEEDS-ACTION';
  //   }
  // }
}
