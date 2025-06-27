import mjml2html from 'mjml';
import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

export interface EmailTemplateData {
  [key: string]: any;
}

export interface CompiledTemplate {
  html: string;
  text: string;
  subject?: string;
}

/**
 * Service for managing and rendering email templates
 * Uses MJML for responsive email design and Handlebars for templating
 */
export class EmailTemplateService {
  private static instance: EmailTemplateService;
  private templateCache: Map<string, Handlebars.TemplateDelegate> = new Map();
  private mjmlCache: Map<string, string> = new Map();
  private baseTemplatePath: string;

  private constructor() {
    this.baseTemplatePath = path.join(__dirname, '../templates/email');
    this.registerHelpers();
  }

  public static getInstance(): EmailTemplateService {
    if (!EmailTemplateService.instance) {
      EmailTemplateService.instance = new EmailTemplateService();
    }
    return EmailTemplateService.instance;
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Format date helper
    Handlebars.registerHelper('formatDate', (date: Date | string, format?: string) => {
      const d = new Date(date);
      if (format === 'short') {
        return d.toLocaleDateString();
      }
      return d.toLocaleString();
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Conditional helpers
    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('lte', (a: any, b: any) => a <= b);
    Handlebars.registerHelper('gte', (a: any, b: any) => a >= b);

    // Priority color helper
    Handlebars.registerHelper('priorityColor', (priority: string) => {
      switch (priority?.toUpperCase()) {
        case 'HIGH':
          return '#ef4444';
        case 'MEDIUM':
          return '#f59e0b';
        case 'LOW':
          return '#10b981';
        default:
          return '#6b7280';
      }
    });
  }

  /**
   * Load and compile a template
   * @param templateName - Name of the template file (without extension)
   * @returns Compiled template function
   */
  private async loadTemplate(templateName: string): Promise<Handlebars.TemplateDelegate> {
    const cacheKey = templateName;

    // Check cache first
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    try {
      const templatePath = path.join(this.baseTemplatePath, `${templateName}.mjml`);
      const mjmlContent = await fs.readFile(templatePath, 'utf-8');

      // Store MJML content for base template inclusion
      this.mjmlCache.set(templateName, mjmlContent);

      // Pre-compile with Handlebars
      const template = Handlebars.compile(mjmlContent);
      this.templateCache.set(cacheKey, template);

      return template;
    } catch (error) {
      logger.error(
        `Failed to load email template: ${templateName}`,
        error instanceof Error ? error : new Error('Unknown error'),
      );
      throw new Error(`Email template not found: ${templateName}`);
    }
  }

  /**
   * Register a partial for base template
   */
  private async registerBasePartial(): Promise<void> {
    if (!Handlebars.partials['base']) {
      const baseTemplate = await this.loadTemplate('base');
      Handlebars.registerPartial('base', baseTemplate);
    }
  }

  /**
   * Render an email template with data
   * @param templateName - Name of the template
   * @param data - Template data
   * @returns Compiled HTML and text versions
   */
  public async renderTemplate(
    templateName: string,
    data: EmailTemplateData,
  ): Promise<CompiledTemplate> {
    try {
      // Register base partial
      await this.registerBasePartial();

      // Load and compile template
      const template = await this.loadTemplate(templateName);

      // Add default data
      const templateData = {
        ...data,
        currentYear: new Date().getFullYear(),
        appName: 'DumbAssets',
        appUrl: process.env.APP_URL || 'http://localhost:3000',
      };

      // Render template with Handlebars
      const mjmlWithData = template(templateData);

      // Compile MJML to HTML
      const result = mjml2html(mjmlWithData, {
        validationLevel: 'soft',
        filePath: this.baseTemplatePath,
      });

      if (result.errors && result.errors.length > 0) {
        logger.warn('MJML compilation warnings', {
          template: templateName,
          errors: result.errors,
        });
      }

      return {
        html: result.html,
        text: this.generateTextVersion(result.html),
        subject: data.subject,
      };
    } catch (error) {
      logger.error(
        `Failed to render email template: ${templateName}`,
        error instanceof Error ? error : new Error('Unknown error'),
      );
      throw error;
    }
  }

  /**
   * Generate plain text version from HTML
   * Simple conversion - in production, consider using a library like html-to-text
   */
  private generateTextVersion(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Clear template caches
   * Useful for development or when templates are updated
   */
  public clearCache(): void {
    this.templateCache.clear();
    this.mjmlCache.clear();
  }

  /**
   * Render password reset email
   */
  public async renderPasswordReset(data: {
    userName: string;
    resetUrl: string;
    expiryHours: number;
    organizationName: string;
  }): Promise<CompiledTemplate> {
    return this.renderTemplate('password-reset', {
      ...data,
      subject: 'Reset Your Password',
    });
  }

  /**
   * Render invitation email
   */
  public async renderInvitation(data: {
    recipientName?: string;
    inviterName: string;
    organizationName: string;
    acceptUrl: string;
    expiryDays: number;
  }): Promise<CompiledTemplate> {
    return this.renderTemplate('invitation', {
      ...data,
      subject: `You're invited to join ${data.organizationName}`,
    });
  }

  /**
   * Render task notification email
   */
  public async renderTaskNotification(data: {
    userName: string;
    notificationTitle: string;
    notificationMessage: string;
    taskUrl: string;
    reason: string;
    organizationName: string;
    taskDetails?: {
      title: string;
      description?: string;
      dueDate: string;
      priority: string;
      assignedTo?: string;
      asset?: string;
    };
    additionalActions?: Array<{
      label: string;
      url: string;
    }>;
  }): Promise<CompiledTemplate> {
    return this.renderTemplate('task-notification', {
      ...data,
      subject: data.notificationTitle,
    });
  }
}
