import { Router, type Response, type NextFunction } from 'express';
import { logger } from '../utils/logger';
import { emailService } from '../services/email.service';
import { EncryptionService } from '../services/encryption.service';
import { z } from 'zod';
import type { Request } from 'express';

const router = Router();
const encryptionService = EncryptionService.getInstance();

// SendGrid webhook schema
const sendGridWebhookSchema = z.array(
  z.object({
    email: z.string().email(),
    event: z.enum(['bounce', 'dropped', 'spamreport', 'unsubscribe', 'delivered', 'open', 'click']),
    reason: z.string().optional(),
    type: z.string().optional(),
    timestamp: z.number(),
  }),
);

// Mailgun webhook schema
const mailgunWebhookSchema = z.object({
  'event-data': z.object({
    event: z.enum(['failed', 'delivered', 'complained', 'unsubscribed']),
    recipient: z.string().email(),
    severity: z.string().optional(),
    reason: z.string().optional(),
    timestamp: z.number(),
  }),
  signature: z.object({
    timestamp: z.string(),
    token: z.string(),
    signature: z.string(),
  }),
});

// AWS SES webhook schema (SNS notification)
const sesWebhookSchema = z.object({
  Type: z.string(),
  MessageId: z.string(),
  Message: z.string(), // JSON string that needs to be parsed
  Timestamp: z.string(),
  Signature: z.string(),
  SigningCertURL: z.string(),
});

/**
 * Verify SendGrid webhook signature
 */
function verifySendGridSignature(req: Request): boolean {
  const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
  const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

  if (!signature || !timestamp) {
    return false;
  }

  const webhookSecret = process.env.SENDGRID_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.warn('SendGrid webhook secret not configured');
    return false;
  }

  const payload = timestamp + JSON.stringify(req.body);

  return encryptionService.verifyWebhookSignature(payload, signature, webhookSecret);
}

/**
 * Verify Mailgun webhook signature
 */
function verifyMailgunSignature(data: any): boolean {
  const { timestamp, token, signature } = data.signature;
  const webhookKey = process.env.MAILGUN_WEBHOOK_KEY;

  if (!webhookKey) {
    logger.warn('Mailgun webhook key not configured');
    return false;
  }

  const payload = timestamp + token;
  const expectedSignature = encryptionService.generateWebhookSignature(payload, webhookKey);

  return signature === expectedSignature;
}

/**
 * @swagger
 * /api/webhooks/email/sendgrid:
 *   post:
 *     summary: Handle SendGrid email webhook
 *     description: Process bounce, complaint, and delivery events from SendGrid
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                 event:
 *                   type: string
 *                 reason:
 *                   type: string
 *                 timestamp:
 *                   type: number
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/sendgrid', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify signature
    if (process.env.NODE_ENV === 'production' && !verifySendGridSignature(req)) {
      logger.warn('Invalid SendGrid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Validate payload
    const events = sendGridWebhookSchema.parse(req.body);

    // Process events
    await emailService.handleEmailWebhook('sendgrid', events);

    res.status(200).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Invalid SendGrid webhook payload', error);
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/webhooks/email/mailgun:
 *   post:
 *     summary: Handle Mailgun email webhook
 *     description: Process bounce, complaint, and delivery events from Mailgun
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event-data:
 *                 type: object
 *               signature:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/mailgun', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate payload
    const data = mailgunWebhookSchema.parse(req.body);

    // Verify signature
    if (process.env.NODE_ENV === 'production' && !verifyMailgunSignature(data)) {
      logger.warn('Invalid Mailgun webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Process event
    await emailService.handleEmailWebhook('mailgun', data);

    res.status(200).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Invalid Mailgun webhook payload', error);
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/webhooks/email/ses:
 *   post:
 *     summary: Handle AWS SES email webhook
 *     description: Process bounce, complaint, and delivery events from AWS SES via SNS
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Type:
 *                 type: string
 *               Message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       401:
 *         description: Invalid signature
 */
router.post('/ses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate SNS message structure
    const snsMessage = sesWebhookSchema.parse(req.body);

    // Handle subscription confirmation
    if (snsMessage.Type === 'SubscriptionConfirmation') {
      logger.info('SES SNS subscription confirmation received', {
        topicArn: req.body.TopicArn,
        subscribeURL: req.body.SubscribeURL,
      });
      // In production, you would fetch the SubscribeURL to confirm the subscription
      res.status(200).send();
      return;
    }

    // Process notification
    if (snsMessage.Type === 'Notification') {
      await emailService.handleEmailWebhook('ses', snsMessage);
    }

    res.status(200).send();
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('Invalid SES webhook payload', error);
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }
    next(error);
  }
});

/**
 * @swagger
 * /api/webhooks/email/test:
 *   post:
 *     summary: Test email webhook endpoint
 *     description: Test endpoint for email webhook processing (development only)
 *     tags: [Webhooks]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [sendgrid, mailgun, ses]
 *               event:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Test webhook processed
 *       403:
 *         description: Only available in development
 */
router.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({ error: 'Test endpoint only available in development' });
      return;
    }

    const { provider, event, email } = req.body;

    logger.info('Test email webhook received', { provider, event, email });

    // Create test payload based on provider
    let testPayload: any;

    switch (provider) {
      case 'sendgrid':
        testPayload = [
          {
            email,
            event,
            reason: 'Test reason',
            timestamp: Date.now() / 1000,
          },
        ];
        break;
      case 'mailgun':
        testPayload = {
          'event-data': {
            event,
            recipient: email,
            reason: 'Test reason',
            timestamp: Date.now() / 1000,
          },
        };
        break;
      case 'ses':
        testPayload = {
          Message: JSON.stringify({
            notificationType: event === 'bounce' ? 'Bounce' : 'Complaint',
            bounce:
              event === 'bounce'
                ? {
                    bounceType: 'Permanent',
                    bounceSubType: 'General',
                    bouncedRecipients: [{ emailAddress: email }],
                  }
                : undefined,
            complaint:
              event === 'complaint'
                ? {
                    complainedRecipients: [{ emailAddress: email }],
                  }
                : undefined,
          }),
        };
        break;
      default:
        res.status(400).json({ error: 'Invalid provider' });
        return;
    }

    await emailService.handleEmailWebhook(provider, testPayload);

    res.json({
      message: 'Test webhook processed',
      provider,
      event,
      email,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
