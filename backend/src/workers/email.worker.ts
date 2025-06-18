import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { config } from '../config';
import type { EmailJob } from '../lib/queue';

// Mock SMTP implementation - replace with actual email service
class EmailService {
  sendEmail(emailData: EmailJob): { messageId: string; accepted: string[]; rejected: string[] } {
    // In development/test, log the email instead of sending
    if (config.env !== 'production' || !config.smtp) {
      logger.info('Email (mock):', {
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html?.substring(0, 100) + '...',
        text: emailData.text?.substring(0, 100) + '...',
      });

      return {
        messageId: `mock-${Date.now()}`,
        accepted: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
        rejected: [],
      };
    }

    // TODO: Implement actual SMTP sending using nodemailer or similar
    // For now, just mock it
    logger.warn('Email sending not yet implemented for production');
    return {
      messageId: `pending-${Date.now()}`,
      accepted: Array.isArray(emailData.to) ? emailData.to : [emailData.to],
      rejected: [],
    };
  }

  renderTemplate(template: string, data: Record<string, unknown>): { html: string; text: string } {
    // Simple template rendering - replace with proper template engine
    const templates: Record<string, { html: string; text: string }> = {
      welcome: {
        html: `
          <h2>Welcome to DumbAssets Enhanced!</h2>
          <p>Hello {{name}},</p>
          <p>Your account has been created successfully. You can now start managing your assets.</p>
          <p>Best regards,<br>DumbAssets Enhanced Team</p>
        `,
        text: `Welcome to DumbAssets Enhanced!\n\nHello {{name}},\n\nYour account has been created successfully. You can now start managing your assets.\n\nBest regards,\nDumbAssets Enhanced Team`,
      },
      'password-reset': {
        html: `
          <h2>Password Reset Request</h2>
          <p>Hello {{name}},</p>
          <p>We received a request to reset your password. Click the link below to reset it:</p>
          <p><a href="{{resetLink}}">Reset Password</a></p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>DumbAssets Enhanced Team</p>
        `,
        text: `Password Reset Request\n\nHello {{name}},\n\nWe received a request to reset your password. Visit this link to reset it:\n{{resetLink}}\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nDumbAssets Enhanced Team`,
      },
      'warranty-expiring': {
        html: `
          <h2>Warranty Expiring Soon</h2>
          <p>Hello {{name}},</p>
          <p>The warranty for your asset "{{assetName}}" is expiring on {{expiryDate}}.</p>
          <p>Please review and take necessary action if needed.</p>
          <p>Best regards,<br>DumbAssets Enhanced Team</p>
        `,
        text: `Warranty Expiring Soon\n\nHello {{name}},\n\nThe warranty for your asset "{{assetName}}" is expiring on {{expiryDate}}.\n\nPlease review and take necessary action if needed.\n\nBest regards,\nDumbAssets Enhanced Team`,
      },
    };

    const template_content = templates[template];
    if (!template_content) {
      throw new Error(`Template '${template}' not found`);
    }

    // Simple string replacement - replace with proper template engine like Handlebars
    let html = template_content.html;
    let text = template_content.text;

    Object.entries(data).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      html = html.replace(new RegExp(placeholder, 'g'), String(value));
      text = text.replace(new RegExp(placeholder, 'g'), String(value));
    });

    return { html, text };
  }
}

const emailService = new EmailService();

export async function processEmailJob(
  job: Job<EmailJob>,
): Promise<{ messageId: string; status: string }> {
  const { data } = job;

  try {
    await job.updateProgress(10);

    // Validate email data
    if (!data.to || !data.subject) {
      throw new Error('Missing required email fields: to, subject');
    }

    await job.updateProgress(20);

    // Render template if provided
    if (data.template && data.templateData) {
      const rendered = emailService.renderTemplate(data.template, data.templateData);
      data.html = data.html || rendered.html;
      data.text = data.text || rendered.text;
    }

    await job.updateProgress(50);

    // Send email
    const result = emailService.sendEmail(data);

    await job.updateProgress(100);

    logger.info(`Email sent successfully`, {
      jobId: job.id,
      messageId: result.messageId,
      to: data.to,
      subject: data.subject,
      accepted: result.accepted.length,
      rejected: result.rejected.length,
    });

    return {
      messageId: result.messageId,
      status: 'sent',
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to process email job', error, {
      jobId: job.id,
      to: data.to,
      subject: data.subject,
    });
    throw error;
  }
}
