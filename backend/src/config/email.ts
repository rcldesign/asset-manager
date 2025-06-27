import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from '../utils/logger';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: {
    name: string;
    email: string;
  };
}

/**
 * Get email configuration from environment variables
 */
export function getEmailConfig(): EmailConfig {
  const config: EmailConfig = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from: {
      name: process.env.EMAIL_FROM_NAME || 'DumbAssets',
      email: process.env.EMAIL_FROM_EMAIL || 'noreply@dumbassets.com',
    },
  };

  // Development defaults for MailHog
  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    config.host = 'localhost';
    config.port = 1025;
    config.secure = false;
    config.auth = { user: '', pass: '' };
  }

  return config;
}

/**
 * Create and configure email transporter
 */
export function createEmailTransporter(): Transporter | null {
  try {
    const config = getEmailConfig();

    // Skip email setup if no host is configured
    if (!config.host || config.host === 'disabled') {
      logger.info('Email service disabled - no SMTP host configured');
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth.user ? config.auth : undefined,
      // Additional options for better reliability
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 20000,
      rateLimit: 5,
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development',
    });

    // Verify configuration on startup
    if (process.env.NODE_ENV !== 'test') {
      transporter.verify((error) => {
        if (error) {
          logger.error('Email transporter verification failed', error);
        } else {
          logger.info('Email transporter ready', {
            host: config.host,
            port: config.port,
            secure: config.secure,
          });
        }
      });
    }

    return transporter;
  } catch (error) {
    logger.error(
      'Failed to create email transporter',
      error instanceof Error ? error : new Error('Unknown error'),
    );
    return null;
  }
}

// Export singleton transporter instance
export const emailTransporter = createEmailTransporter();
