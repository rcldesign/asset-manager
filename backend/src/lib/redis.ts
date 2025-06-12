import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

let redis: Redis | null = null;

/**
 * Get or create a Redis connection optimized for BullMQ
 */
export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: null, // Required for BullMQ workers
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        // Exponential backoff with max 20 seconds between retries
        return Math.max(Math.min(Math.exp(times), 20000), 1000);
      },
    });

    redis.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redis.on('error', (err) => {
      logger.error('Redis connection error', err);
    });

    redis.on('close', () => {
      logger.info('Redis connection closed');
    });

    redis.on('ready', () => {
      logger.info('Redis connection ready');
    });
  }

  return redis;
}

/**
 * Create a new Redis connection for BullMQ (each queue/worker should have its own)
 */
export function createRedisConnection(): Redis {
  return new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      return Math.max(Math.min(Math.exp(times), 20000), 1000);
    },
  });
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  await client.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Export a singleton instance for general use
export const redisClient = getRedis();
