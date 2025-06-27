import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';

import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { prisma } from './lib/prisma';
import { swaggerSpec } from './docs/swagger';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import organizationRoutes from './routes/organizations';
import oidcRoutes from './routes/oidc';
import assetRoutes from './routes/assets';
import assetAttachmentRoutes from './routes/asset-attachments';
import assetTemplateRoutes from './routes/asset-templates';
import taskRoutes from './routes/tasks';
import taskAttachmentRoutes from './routes/task-attachments';
import taskCommentRoutes from './routes/task-comments';
import scheduleRoutes from './routes/schedules';
import notificationRoutes from './routes/notifications';
import locationRoutes from './routes/locations';
import advancedScheduleRoutes from './routes/advanced-schedules';
import taskEnhancementRoutes from './routes/task-enhancements';
import collaborationRoutes from './routes/collaboration';
import activityStreamRoutes from './routes/activity-streams';
import calendarIntegrationRoutes from './routes/calendar-integration';
import googleAuthRoutes from './routes/google-auth';
import emailWebhookRoutes from './routes/email-webhooks';
import pushNotificationRoutes from './routes/push-notifications';
import appriseRoutes from './routes/apprise';
import webhookRoutes from './routes/webhooks';
import {
  securityHeaders,
  generalRateLimit,
  securityLogger,
  configureCORS,
} from './middleware/security';

const app: Express = express();

// Security middleware
app.set('trust proxy', 1); // Trust first proxy
app.use(securityLogger);
app.use(securityHeaders());
app.use(cors(configureCORS()));
app.use(generalRateLimit);

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration
app.use(
  session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'strict',
      maxAge: config.session.maxAge,
    },
  }),
);

// Rate limiting (disabled in test environment)
if (process.env.DISABLE_RATE_LIMITING !== 'true') {
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many API requests, please try again later.',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  app.use('/api/', apiLimiter);
}

// API documentation (only in development and test environments)
if (!config.isProduction) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'DumbAssets Enhanced API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
      },
    }),
  );

  // Serve swagger.json for external tools
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Check the health status of the application and its dependencies
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Application is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 *       503:
 *         description: Application is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 message:
 *                   type: string
 *                   example: Database connection failed
 */
app.get('/health', async (_req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.env,
    });
  } catch {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: 'Database connection failed',
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/oidc', oidcRoutes);
app.use('/api/users', userRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/asset-templates', assetTemplateRoutes);
app.use('/api/assets', assetAttachmentRoutes); // Asset attachment routes under /api/assets (must come first)
app.use('/api/assets', assetRoutes);
app.use('/api/tasks', taskAttachmentRoutes); // Task attachment routes under /api/tasks (must come first)
app.use('/api/tasks', taskCommentRoutes); // Task comment routes under /api/tasks
app.use('/api/tasks', taskRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/advanced-schedules', advancedScheduleRoutes);
app.use('/api/task-enhancements', taskEnhancementRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/activity-streams', activityStreamRoutes);
app.use('/api/calendar', calendarIntegrationRoutes);
app.use('/api/google', googleAuthRoutes);
app.use('/api/webhooks/email', emailWebhookRoutes);
app.use('/api/push', pushNotificationRoutes);
app.use('/api/apprise', appriseRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler - creates error and passes to error handler
app.use((req, _res, next) => {
  interface ErrorWithStatusCode extends Error {
    statusCode?: number;
  }
  const error: ErrorWithStatusCode = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.name = 'NotFoundError';
  error.statusCode = 404;
  next(error);
});

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
