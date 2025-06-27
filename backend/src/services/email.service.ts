import { logger } from '../utils/logger';
import { config } from '../config';
import { emailTransporter, getEmailConfig } from '../config/email';
import { EmailTemplateService } from './email-template.service';
import { addEmailJob } from '../lib/queue';
import type { Transporter } from 'nodemailer';
import type { EmailJobData } from '../workers/email.worker';

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

interface InvitationEmailOptions {
  to: string;
  inviterName: string;
  organizationName: string;
  invitationToken: string;
  customMessage?: string;
  expiresAt: Date;
}

interface TaskNotificationEmailOptions {
  to: string;
  userName: string;
  taskTitle: string;
  taskDescription?: string;
  dueDate: Date;
  priority: string;
  assetName?: string;
  assignedBy?: string;
  taskId: string;
  notificationType: 'assigned' | 'updated' | 'due-soon' | 'overdue' | 'completed';
}

export class EmailService {
  private static instance: EmailService;
  private transporter: Transporter | null;
  private templateService: EmailTemplateService;
  private emailConfig: ReturnType<typeof getEmailConfig>;

  constructor() {
    this.transporter = emailTransporter;
    this.templateService = EmailTemplateService.getInstance();
    this.emailConfig = getEmailConfig();
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Queue an email for sending
   * @param options - Email options
   * @param priority - Job priority (0-10, lower is higher priority)
   * @param delay - Delay in milliseconds before sending
   */
  async queueEmail(options: EmailOptions, priority: number = 5, delay?: number): Promise<void> {
    const emailData: EmailJobData = {
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      from: options.from || `${this.emailConfig.from.name} <${this.emailConfig.from.email}>`,
      replyTo: options.replyTo,
      attachments: options.attachments,
    };

    await addEmailJob(emailData, { priority, delay });

    logger.info('Email queued for sending', {
      to: options.to,
      subject: options.subject,
      priority,
      delay,
    });
  }

  /**
   * Send an email immediately (bypasses queue)
   * Only use for critical emails that must be sent immediately
   */
  async sendEmailDirect(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.warn('Email not sent - email service is not configured');
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: options.from || `${this.emailConfig.from.name} <${this.emailConfig.from.email}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html),
        replyTo: options.replyTo,
        attachments: options.attachments,
      });

      logger.info('Email sent successfully', {
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
      });
    } catch (error) {
      logger.error(
        'Failed to send email',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      throw error;
    }
  }

  /**
   * Send invitation email
   */
  async sendInvitationEmail(options: InvitationEmailOptions): Promise<void> {
    const invitationUrl = `${config.app.baseUrl}/accept-invitation?token=${options.invitationToken}`;
    const expiryDays = Math.ceil(
      (options.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );

    const template = await this.templateService.renderInvitation({
      recipientName: options.to.split('@')[0], // Use email prefix as name if not provided
      inviterName: options.inviterName,
      organizationName: options.organizationName,
      acceptUrl: invitationUrl,
      expiryDays,
    });

    await this.queueEmail(
      {
        to: options.to,
        subject: template.subject || `Invitation to join ${options.organizationName}`,
        html: template.html,
        text: template.text,
      },
      3,
    ); // Higher priority for invitations
  }

  /**
   * Send task notification email
   */
  async sendTaskNotificationEmail(options: TaskNotificationEmailOptions): Promise<void> {
    const taskUrl = `${config.app.baseUrl}/tasks/${options.taskId}`;

    // Determine notification title and message based on type
    let notificationTitle: string;
    let notificationMessage: string;
    let reason: string;

    switch (options.notificationType) {
      case 'assigned':
        notificationTitle = 'New Task Assignment';
        notificationMessage = options.assignedBy
          ? `${options.assignedBy} has assigned you a new task`
          : 'You have been assigned a new task';
        reason = 'assigned to this task';
        break;
      case 'updated':
        notificationTitle = 'Task Updated';
        notificationMessage = 'A task you are assigned to has been updated';
        reason = 'assigned to this task';
        break;
      case 'due-soon':
        notificationTitle = 'Task Due Soon';
        notificationMessage = 'You have a task due soon';
        reason = 'assigned to this task';
        break;
      case 'overdue':
        notificationTitle = 'Task Overdue';
        notificationMessage = 'You have an overdue task that needs attention';
        reason = 'assigned to this task';
        break;
      case 'completed':
        notificationTitle = 'Task Completed';
        notificationMessage = 'A task you were involved with has been completed';
        reason = 'involved with this task';
        break;
      default:
        notificationTitle = 'Task Notification';
        notificationMessage = 'You have a task notification';
        reason = 'subscribed to task notifications';
    }

    const template = await this.templateService.renderTaskNotification({
      userName: options.userName,
      notificationTitle,
      notificationMessage,
      taskUrl,
      reason,
      organizationName: 'DumbAssets', // Could be passed from organization context
      taskDetails: {
        title: options.taskTitle,
        description: options.taskDescription,
        dueDate: options.dueDate.toLocaleDateString(),
        priority: options.priority,
        assignedTo: options.assignedBy,
        asset: options.assetName,
      },
      additionalActions:
        options.notificationType === 'assigned'
          ? [{ label: 'View All Tasks', url: `${config.app.baseUrl}/tasks` }]
          : undefined,
    });

    const priority = options.notificationType === 'overdue' ? 2 : 5;

    await this.queueEmail(
      {
        to: options.to,
        subject: template.subject || notificationTitle,
        html: template.html,
        text: template.text,
      },
      priority,
    );
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    userName?: string,
  ): Promise<void> {
    const resetUrl = `${config.app.baseUrl}/reset-password?token=${resetToken}`;

    const userDisplayName = userName?.trim() || email.split('@')[0] || 'User';
    const template = await this.templateService.renderPasswordReset({
      userName: userDisplayName,
      resetUrl,
      expiryHours: 1,
      organizationName: 'DumbAssets',
    });

    await this.queueEmail(
      {
        to: email,
        subject: template.subject || 'Password Reset Request',
        html: template.html,
        text: template.text,
      },
      1,
    ); // Highest priority for password resets
  }

  /**
   * Send email verification email
   */
  async sendEmailVerification(
    email: string,
    verificationToken: string,
    userName?: string,
  ): Promise<void> {
    const verifyUrl = `${config.app.baseUrl}/verify-email?token=${verificationToken}`;

    // Using password reset template as base for now
    // In production, create a dedicated email verification template
    const userDisplayName = userName?.trim() || email.split('@')[0] || 'User';
    const template = await this.templateService.renderPasswordReset({
      userName: userDisplayName,
      resetUrl: verifyUrl,
      expiryHours: 24,
      organizationName: 'DumbAssets',
    });

    await this.queueEmail(
      {
        to: email,
        subject: 'Verify Your Email Address',
        html: template.html.replace(/Reset.*Password/g, 'Verify Email'),
        text: template.text.replace(/Reset.*Password/g, 'Verify Email'),
      },
      2,
    );
  }

  /**
   * Send bulk email to multiple recipients
   * Each recipient gets their own email (no CC/BCC)
   */
  async sendBulkEmail(
    recipients: Array<{ email: string; data?: any }>,
    templateName: string,
    baseData: any,
    priority: number = 5,
  ): Promise<void> {
    const jobs = recipients.map(async (recipient) => {
      const templateData = { ...baseData, ...recipient.data };
      const template = await this.templateService.renderTemplate(templateName, templateData);

      return this.queueEmail(
        {
          to: recipient.email,
          subject: template.subject || 'Notification from DumbAssets',
          html: template.html,
          text: template.text,
        },
        priority,
      );
    });

    await Promise.all(jobs);

    logger.info('Bulk email queued', {
      recipientCount: recipients.length,
      templateName,
      priority,
    });
  }

  /**
   * Convert HTML to plain text
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      logger.error(
        'Email configuration test failed',
        error instanceof Error ? error : new Error('Unknown error'),
      );
      return false;
    }
  }

  /**
   * Handle webhook from email service provider
   * Processes bounces, complaints, and other events
   */
  async handleEmailWebhook(provider: string, payload: any): Promise<void> {
    logger.info('Processing email webhook', { provider, eventType: payload.event });

    switch (provider) {
      case 'sendgrid':
        await this.handleSendGridWebhook(payload);
        break;
      case 'mailgun':
        await this.handleMailgunWebhook(payload);
        break;
      case 'ses':
        await this.handleSESWebhook(payload);
        break;
      default:
        logger.warn('Unknown email webhook provider', { provider });
    }
  }

  private async handleSendGridWebhook(events: any[]): Promise<void> {
    for (const event of events) {
      switch (event.event) {
        case 'bounce':
        case 'dropped':
          logger.warn('Email bounce detected', {
            email: event.email,
            reason: event.reason,
            type: event.type,
          });
          // TODO: Mark email as invalid in database
          break;
        case 'spamreport':
          logger.warn('Spam report received', { email: event.email });
          // TODO: Unsubscribe user from notifications
          break;
        case 'unsubscribe':
          logger.info('User unsubscribed', { email: event.email });
          // TODO: Update user notification preferences
          break;
      }
    }
  }

  private async handleMailgunWebhook(payload: any): Promise<void> {
    const eventData = payload['event-data'];

    switch (eventData.event) {
      case 'failed':
        logger.warn('Email delivery failed', {
          email: eventData.recipient,
          severity: eventData.severity,
          reason: eventData.reason,
        });
        break;
      case 'complained':
        logger.warn('Spam complaint received', {
          email: eventData.recipient,
        });
        break;
    }
  }

  private async handleSESWebhook(message: any): Promise<void> {
    const notification = JSON.parse(message.Message);

    switch (notification.notificationType) {
      case 'Bounce':
        const bounce = notification.bounce;
        for (const recipient of bounce.bouncedRecipients) {
          logger.warn('Email bounce detected', {
            email: recipient.emailAddress,
            type: bounce.bounceType,
            subType: bounce.bounceSubType,
          });
        }
        break;
      case 'Complaint':
        const complaint = notification.complaint;
        for (const recipient of complaint.complainedRecipients) {
          logger.warn('Spam complaint received', {
            email: recipient.emailAddress,
          });
        }
        break;
    }
  }
}

// Export singleton instance
export const emailService = EmailService.getInstance();
