import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';
import { connectRedis, disconnectRedis } from './lib/redis';
import { closeQueues } from './lib/queue';

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    // Close database connections

    await prisma.$disconnect();
    logger.info('Database connection closed');

    // Close Redis connection
    await disconnectRedis();
    logger.info('Redis connection closed');

    // Close Bull queues
    await closeQueues();
    logger.info('Job queues closed');

    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', error instanceof Error ? error : undefined);
    process.exit(1);
  }
}

// Start server
const server = app.listen(config.port, () => {
  // Connect to Redis asynchronously
  connectRedis()
    .then(() => {
      logger.info(`Server running on port ${config.port} in ${config.env} mode`);
      logger.info(`Database: ${config.database.useEmbedded ? 'Embedded' : 'External'}`);
      logger.info(`Redis: ${config.redis.useEmbedded ? 'Embedded' : 'External'}`);
    })
    .catch((error: Error) => {
      logger.error('Failed to start server', error);
      process.exit(1);
    });
});

// Handle shutdown signals
process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(() => process.exit(1));
});
process.on('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(() => process.exit(1));
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', undefined, { reason });
  process.exit(1);
});
