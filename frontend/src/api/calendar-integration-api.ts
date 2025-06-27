import { apiClient } from '../lib/api-client';

export interface GoogleCalendarStatus {
  connected: boolean;
  lastSyncAt?: string;
  email?: string;
}

export interface GoogleCalendarSyncOptions {
  calendarId?: string;
  syncPastDays?: number;
  syncFutureDays?: number;
}

export interface ICalendarStatus {
  enabled: boolean;
  feedUrl?: string;
}

export interface CalendarSyncResult {
  synced: number;
  errors: number;
}

export const calendarIntegrationApi = {
  /**
   * Get Google Calendar authorization URL
   */
  async getGoogleAuthUrl(redirectUrl?: string) {
    const { data } = await apiClient.get<{ authUrl: string }>('/calendar-integration/google/auth-url', {
      params: { redirectUrl },
    });
    return data;
  },

  /**
   * Handle Google Calendar OAuth callback
   */
  async handleGoogleCallback(code: string, state?: string) {
    const { data } = await apiClient.get<{
      success: boolean;
      redirectUrl?: string;
    }>('/calendar-integration/google/callback', {
      params: { code, state },
    });
    return data;
  },

  /**
   * Sync tasks with Google Calendar
   */
  async syncWithGoogleCalendar(options?: GoogleCalendarSyncOptions) {
    const { data } = await apiClient.post<CalendarSyncResult>(
      '/calendar-integration/google/sync',
      options
    );
    return data;
  },

  /**
   * Get Google Calendar connection status
   */
  async getGoogleCalendarStatus() {
    const { data } = await apiClient.get<GoogleCalendarStatus>('/calendar-integration/google/status');
    return data;
  },

  /**
   * Disconnect Google Calendar
   */
  async disconnectGoogleCalendar() {
    const { data } = await apiClient.delete<{ message: string }>('/calendar-integration/google/disconnect');
    return data;
  },

  /**
   * Generate iCalendar feed token
   */
  async generateICalToken() {
    const { data } = await apiClient.post<{
      token: string;
      feedUrl: string;
    }>('/calendar-integration/ical/generate-token');
    return data;
  },

  /**
   * Get iCalendar feed status
   */
  async getICalStatus() {
    const { data } = await apiClient.get<ICalendarStatus>('/calendar-integration/ical/status');
    return data;
  },

  /**
   * Revoke iCalendar feed token
   */
  async revokeICalToken() {
    const { data } = await apiClient.delete<{ message: string }>('/calendar-integration/ical/revoke-token');
    return data;
  },
};