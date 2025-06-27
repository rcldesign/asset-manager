import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { config } from '../config';
import { emailTransporter } from '../config/email';
import type { EmailJob } from '../lib/queue';
import type { SentMessageInfo } from 'nodemailer';

export interface EmailJobData extends EmailJob {
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
    contentType?: string;
  }>;
}

/**
 * Process an email job from the queue
 */
export async function processEmailJob(
  job: Job<EmailJobData>,
): Promise<{ messageId: string; status: string; accepted?: string[]; rejected?: string[] }> {
  const { data } = job;
  const startTime = Date.now();

  try {
    await job.updateProgress(10);

    // Validate email data
    if (!data.to || !data.subject) {
      throw new Error('Missing required email fields: to, subject');
    }

    await job.updateProgress(20);

    // Check if email service is configured
    if (!emailTransporter) {
      // In development/test, log the email instead of sending
      if (config.env !== 'production') {
        logger.info('Email (mock - no transporter):', {
          to: data.to,
          subject: data.subject,
          html: data.html?.substring(0, 100) + '...',
          text: data.text?.substring(0, 100) + '...',
        });

        return {
          messageId: `mock-${Date.now()}`,
          status: 'sent-mock',
          accepted: Array.isArray(data.to) ? data.to : [data.to],
          rejected: [],
        };
      }

      throw new Error('Email service not configured');
    }

    await job.updateProgress(50);

    // Send email using nodemailer
    const info: SentMessageInfo = await emailTransporter.sendMail({
      from: data.from,
      to: Array.isArray(data.to) ? data.to.join(', ') : data.to,
      subject: data.subject,
      html: data.html,
      text: data.text || stripHtml(data.html || ''),
      replyTo: data.replyTo,
      attachments: data.attachments,
      // Add message headers for better deliverability
      headers: {
        'X-Priority': getPriorityHeader(job.opts.priority || 5),
        'X-Mailer': 'DumbAssets/1.0',
      },
    });

    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    logger.info('Email sent successfully', {
      jobId: job.id,
      messageId: info.messageId,
      to: data.to,
      subject: data.subject,
      accepted: info.accepted?.length || 0,
      rejected: info.rejected?.length || 0,
      duration,
    });

    // Store email event for tracking
    await storeEmailEvent({
      messageId: info.messageId,
      to: data.to,
      subject: data.subject,
      status: 'sent',
      sentAt: new Date(),
    });

    return {
      messageId: info.messageId,
      status: 'sent',
      accepted: info.accepted,
      rejected: info.rejected,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const duration = Date.now() - startTime;

    logger.error('Failed to process email job', error, {
      jobId: job.id,
      to: data.to,
      subject: data.subject,
      duration,
      attemptNumber: job.attemptsMade + 1,
    });

    // Store failed email event
    await storeEmailEvent({
      messageId: `failed-${job.id}`,
      to: data.to,
      subject: data.subject,
      status: 'failed',
      error: error.message,
      failedAt: new Date(),
    });

    // Determine if we should retry
    if (shouldRetryEmail(error)) {
      throw error; // BullMQ will retry based on job options
    } else {
      // Don't retry for permanent failures
      return {
        messageId: `failed-${job.id}`,
        status: 'failed-permanent',
      };
    }
  }
}

/**
 * Helper function to strip HTML tags
 */
function stripHtml(html: string): string {
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
 * Get priority header value
 */
function getPriorityHeader(priority: number): string {
  if (priority <= 2) return '1 (Highest)';
  if (priority <= 4) return '2 (High)';
  if (priority <= 6) return '3 (Normal)';
  if (priority <= 8) return '4 (Low)';
  return '5 (Lowest)';
}

/**
 * Store email event for tracking and analytics
 */
async function storeEmailEvent(event: {
  messageId: string;
  to: string | string[];
  subject: string;
  status: 'sent' | 'failed';
  error?: string;
  sentAt?: Date;
  failedAt?: Date;
}): Promise<void> {
  try {
    // TODO: Store in database for tracking
    // For now, just log it
    logger.debug('Email event', event);
  } catch (error) {
    logger.error(
      'Failed to store email event',
      error instanceof Error ? error : new Error('Unknown error'),
    );
  }
}

/**
 * Determine if an email error is retryable
 */
function shouldRetryEmail(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Don't retry for permanent failures
  const permanentErrors = [
    'invalid recipient',
    'mailbox not found',
    'user unknown',
    'domain not found',
    'blacklisted',
    'rejected',
    'invalid email',
  ];

  for (const permanentError of permanentErrors) {
    if (message.includes(permanentError)) {
      return false;
    }
  }

  // Retry for temporary failures
  const temporaryErrors = [
    'connection timeout',
    'connection refused',
    'temporarily unavailable',
    'too many connections',
    'rate limit',
    'try again later',
  ];

  for (const tempError of temporaryErrors) {
    if (message.includes(tempError)) {
      return true;
    }
  }

  // Default to retry for unknown errors
  return true;
}
