import axios from 'axios';
import { logger } from '../utils/logger';

export interface AppriseNotification {
  title: string;
  body: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  tag?: string | string[];
  attach?: string | string[];
  format?: 'text' | 'markdown' | 'html';
}

export interface AppriseConfig {
  urls: string[];
  tags?: Record<string, string[]>;
  defaultFormat?: 'text' | 'markdown' | 'html';
}

export class AppriseService {
  private static instance: AppriseService;
  private appriseUrl: string;
  private config: AppriseConfig;
  private isEnabled: boolean;

  private constructor() {
    this.appriseUrl = process.env.APPRISE_API_URL || '';
    this.isEnabled = !!this.appriseUrl;

    // Parse Apprise configuration from environment
    this.config = {
      urls: this.parseUrls(process.env.APPRISE_URLS || ''),
      tags: this.parseTags(process.env.APPRISE_TAGS || ''),
      defaultFormat: (process.env.APPRISE_DEFAULT_FORMAT as any) || 'markdown',
    };

    if (this.isEnabled) {
      logger.info('Apprise service initialized', {
        apiUrl: this.appriseUrl,
        urlCount: this.config.urls.length,
        tags: Object.keys(this.config.tags || {}),
      });
    } else {
      logger.info('Apprise service disabled - no API URL configured');
    }
  }

  public static getInstance(): AppriseService {
    if (!AppriseService.instance) {
      AppriseService.instance = new AppriseService();
    }
    return AppriseService.instance;
  }

  /**
   * Parse notification URLs from environment variable
   * Format: "slack://token@channel,discord://webhook,telegram://token@chatid"
   */
  private parseUrls(urlString: string): string[] {
    if (!urlString) return [];
    return urlString
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);
  }

  /**
   * Parse tags configuration from environment variable
   * Format: "admin:slack,discord;users:telegram;alerts:*"
   */
  private parseTags(tagString: string): Record<string, string[]> {
    if (!tagString) return {};

    const tags: Record<string, string[]> = {};
    const pairs = tagString.split(';');

    for (const pair of pairs) {
      const [tag, services] = pair.split(':');
      if (tag && services) {
        tags[tag.trim()] = services.split(',').map((s) => s.trim());
      }
    }

    return tags;
  }

  /**
   * Check if Apprise service is configured and enabled
   */
  public isConfigured(): boolean {
    return this.isEnabled && this.config.urls.length > 0;
  }

  /**
   * Send notification through Apprise
   */
  public async sendNotification(notification: AppriseNotification): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.debug('Apprise notification skipped - service not configured');
      return false;
    }

    try {
      // Build the notification payload
      const payload = {
        urls: this.config.urls,
        title: notification.title,
        body: notification.body,
        type: notification.type || 'info',
        format: notification.format || this.config.defaultFormat,
        tag: notification.tag,
        attach: notification.attach,
      };

      // Send to Apprise API
      const response = await axios.post(`${this.appriseUrl}/notify`, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      });

      if (response.status === 200 || response.status === 204) {
        logger.info('Apprise notification sent successfully', {
          title: notification.title,
          type: notification.type,
          tag: notification.tag,
        });
        return true;
      } else {
        logger.warn('Apprise notification failed', {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }
    } catch (error) {
      logger.error(
        'Failed to send Apprise notification',
        error instanceof Error ? error : new Error('Unknown error'),
        {
          title: notification.title,
          apiUrl: this.appriseUrl,
        },
      );
      return false;
    }
  }

  /**
   * Send notification to specific tags/services
   */
  public async sendToTags(
    tags: string[],
    notification: Omit<AppriseNotification, 'tag'>,
  ): Promise<boolean> {
    return this.sendNotification({
      ...notification,
      tag: tags,
    });
  }

  /**
   * Send high-priority alert notification
   */
  public async sendAlert(title: string, body: string, attach?: string[]): Promise<boolean> {
    return this.sendNotification({
      title,
      body,
      type: 'error',
      tag: ['alerts', 'admin'],
      attach,
      format: 'markdown',
    });
  }

  /**
   * Send informational notification
   */
  public async sendInfo(title: string, body: string): Promise<boolean> {
    return this.sendNotification({
      title,
      body,
      type: 'info',
      format: 'markdown',
    });
  }

  /**
   * Test Apprise configuration
   */
  public async testConfiguration(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await axios.get(`${this.appriseUrl}/status`, {
        timeout: 5000,
      });

      return response.status === 200;
    } catch (error) {
      logger.error(
        'Apprise configuration test failed',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      return false;
    }
  }

  /**
   * Get configured notification services
   */
  public getConfiguredServices(): string[] {
    if (!this.isConfigured()) {
      return [];
    }

    // Extract service names from URLs
    return this.config.urls
      .map((url) => {
        const match = url.match(/^([a-zA-Z]+):\/\//);
        return match ? match[1] : 'unknown';
      })
      .filter((service): service is string => service !== undefined);
  }
}

// Export singleton instance
export const appriseService = AppriseService.getInstance();
