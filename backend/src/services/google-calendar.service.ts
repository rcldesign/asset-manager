import type { calendar_v3 } from 'googleapis';
import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import { prisma } from '../lib/prisma';
import { EncryptionService } from './encryption.service';
import { logger } from '../utils/logger';
import { NotFoundError } from '../utils/errors';

/**
 * Service for managing Google Calendar OAuth and API interactions
 * Handles token storage, automatic refresh, and calendar operations
 */
export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;
  private encryptionService: EncryptionService;

  constructor(private userId: string) {
    this.encryptionService = EncryptionService.getInstance();

    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    // Listen for token refresh events
    this.oauth2Client.on('tokens', async (tokens: Credentials) => {
      try {
        // This listener fires when the library successfully refreshes tokens
        const dataToUpdate: {
          accessToken: string;
          expiryDate: Date;
          refreshToken?: string;
        } = {
          accessToken: this.encryptionService.encrypt(tokens.access_token!),
          expiryDate: new Date(tokens.expiry_date!),
        };

        if (tokens.refresh_token) {
          // Rare, but if a new refresh token is issued, we must save it
          logger.info(`Received new refresh token for user ${this.userId}`);
          dataToUpdate.refreshToken = this.encryptionService.encrypt(tokens.refresh_token);
        }

        await prisma.googleCredentials.update({
          where: { userId: this.userId },
          data: dataToUpdate,
        });

        logger.debug(`Updated Google tokens for user ${this.userId}`);
      } catch (error) {
        logger.error(
          'Failed to update Google tokens on refresh',
          error instanceof Error ? error : new Error('Unknown error'),
        );
      }
    });
  }

  /**
   * Generate authorization URL for OAuth flow
   * @param state - Optional state parameter for security
   * @returns Authorization URL
   */
  static generateAuthUrl(state?: string): string {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required for refresh token
      prompt: 'consent', // Force consent to ensure refresh token
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      state,
    });
  }

  /**
   * Exchange authorization code for tokens
   * @param code - Authorization code from OAuth callback
   * @returns Tokens
   */
  async exchangeCodeForTokens(code: string): Promise<Credentials> {
    const { tokens } = await this.oauth2Client.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token || !tokens.expiry_date) {
      throw new Error('Incomplete token response from Google');
    }

    // Store encrypted tokens
    const encryptedAccessToken = this.encryptionService.encrypt(tokens.access_token);
    const encryptedRefreshToken = this.encryptionService.encrypt(tokens.refresh_token);

    await prisma.googleCredentials.upsert({
      where: { userId: this.userId },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiryDate: new Date(tokens.expiry_date),
        scope: tokens.scope || '',
      },
      create: {
        userId: this.userId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiryDate: new Date(tokens.expiry_date),
        scope: tokens.scope || '',
      },
    });

    return tokens;
  }

  /**
   * Get authenticated calendar client
   * @returns Google Calendar API client
   * @throws Error if user is not authenticated or tokens are invalid
   */
  async getCalendarClient(): Promise<calendar_v3.Calendar> {
    const credentials = await this.getAndSetCredentials();

    if (!credentials) {
      throw new NotFoundError('User is not authenticated with Google Calendar');
    }

    return google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Fetch, decrypt, and set credentials on the OAuth client
   * @returns Google credentials or null if not found
   */
  private async getAndSetCredentials() {
    const credentials = await prisma.googleCredentials.findUnique({
      where: { userId: this.userId },
    });

    if (!credentials) {
      return null;
    }

    try {
      const accessToken = this.encryptionService.decrypt(credentials.accessToken);
      const refreshToken = this.encryptionService.decrypt(credentials.refreshToken);

      this.oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: credentials.expiryDate.getTime(),
        scope: credentials.scope,
      });

      return credentials;
    } catch (error) {
      logger.error(
        'Failed to decrypt Google credentials',
        error instanceof Error ? error : new Error('Unknown error'),
      );

      // If decryption fails, the credentials are corrupted
      // Delete them to force re-authentication
      await this.deleteCredentials();
      return null;
    }
  }

  /**
   * Check if user has valid Google credentials
   * @returns True if credentials exist
   */
  async hasValidCredentials(): Promise<boolean> {
    const credentials = await prisma.googleCredentials.findUnique({
      where: { userId: this.userId },
    });

    return !!credentials;
  }

  /**
   * Revoke Google access and delete stored credentials
   */
  async revokeAccess(): Promise<void> {
    const credentials = await prisma.googleCredentials.findUnique({
      where: { userId: this.userId },
    });

    if (!credentials) {
      return; // No credentials to revoke
    }

    try {
      const refreshToken = this.encryptionService.decrypt(credentials.refreshToken);
      await this.oauth2Client.revokeToken(refreshToken);
      logger.info(`Revoked Google access for user ${this.userId}`);
    } catch (error) {
      // Google may throw an error if the token is already invalid
      // We should log this but proceed with deleting our record
      logger.warn(`Failed to revoke Google token for user ${this.userId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      // Always remove the credentials from our database
      await this.deleteCredentials();
    }
  }

  /**
   * Delete stored Google credentials
   */
  private async deleteCredentials(): Promise<void> {
    await prisma.googleCredentials
      .delete({
        where: { userId: this.userId },
      })
      .catch(() => {
        // Ignore delete errors (e.g., already deleted)
      });
  }

  /**
   * Create a calendar event from a task
   * @param task - Task data to sync
   * @returns Created event ID
   */
  async createTaskEvent(task: {
    id: string;
    title: string;
    description?: string;
    dueDate: Date;
    estimatedMinutes?: number;
  }): Promise<string> {
    const calendar = await this.getCalendarClient();

    // Calculate event times
    const startTime = new Date(task.dueDate);
    const endTime = new Date(task.dueDate);

    if (task.estimatedMinutes) {
      endTime.setMinutes(endTime.getMinutes() + task.estimatedMinutes);
    } else {
      // Default to 30 minutes if no estimate
      endTime.setMinutes(endTime.getMinutes() + 30);
    }

    const event: calendar_v3.Schema$Event = {
      summary: `Task: ${task.title}`,
      description: task.description || '',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC', // TODO: Use user's timezone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC', // TODO: Use user's timezone
      },
      // Add custom properties to link back to our task
      extendedProperties: {
        private: {
          taskId: task.id,
          source: 'dumbassets',
        },
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
    });

    if (!response.data.id) {
      throw new Error('Failed to create calendar event');
    }

    return response.data.id;
  }

  /**
   * Update a calendar event from a task
   * @param eventId - Google Calendar event ID
   * @param task - Updated task data
   */
  async updateTaskEvent(
    eventId: string,
    task: {
      id: string;
      title: string;
      description?: string;
      dueDate: Date;
      estimatedMinutes?: number;
    },
  ): Promise<void> {
    const calendar = await this.getCalendarClient();

    // Calculate event times
    const startTime = new Date(task.dueDate);
    const endTime = new Date(task.dueDate);

    if (task.estimatedMinutes) {
      endTime.setMinutes(endTime.getMinutes() + task.estimatedMinutes);
    } else {
      endTime.setMinutes(endTime.getMinutes() + 30);
    }

    const event: calendar_v3.Schema$Event = {
      summary: `Task: ${task.title}`,
      description: task.description || '',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
      extendedProperties: {
        private: {
          taskId: task.id,
          source: 'dumbassets',
        },
      },
    };

    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: event,
    });
  }

  /**
   * Delete a calendar event
   * @param eventId - Google Calendar event ID
   */
  async deleteTaskEvent(eventId: string): Promise<void> {
    const calendar = await this.getCalendarClient();

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
  }

  /**
   * List upcoming events
   * @param options - Query options
   * @returns List of calendar events
   */
  async listUpcomingEvents(
    options: {
      maxResults?: number;
      timeMin?: Date;
      timeMax?: Date;
    } = {},
  ): Promise<calendar_v3.Schema$Event[]> {
    const calendar = await this.getCalendarClient();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: (options.timeMin || new Date()).toISOString(),
      timeMax: options.timeMax?.toISOString(),
      maxResults: options.maxResults || 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  }
}
