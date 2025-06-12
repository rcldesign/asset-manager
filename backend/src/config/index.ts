import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Configuration module for the DumbAssets Enhanced application
 * Loads and validates environment variables using Zod schemas
 */

// Load environment variables
dotenv.config();

// Environment variable validation schema
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3001').transform(Number),

  // Database
  DATABASE_URL: z.string().optional(),
  USE_EMBEDDED_DB: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Redis
  REDIS_URL: z.string().optional(),
  USE_EMBEDDED_REDIS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32),

  // Session
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE: z.string().default('86400000').transform(Number), // 24 hours

  // CORS
  ALLOWED_ORIGINS: z.string().default('*'),

  // File Upload
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760').transform(Number), // 10MB

  // SMTP (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined)),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),

  // OIDC (optional)
  OIDC_ISSUER_URL: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),
  OIDC_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  OIDC_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  OIDC_REDIRECT_URI: z
    .string()
    .url()
    .optional()
    .or(z.literal(''))
    .transform((v) => (v === '' ? undefined : v)),

  // Google Calendar (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Apprise (optional)
  APPRISE_URL: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  ENABLE_METRICS: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Parse and validate environment variables against the schema
 * @throws {ZodError} When required environment variables are missing or invalid
 */
const env = envSchema.parse(process.env);

/**
 * Application configuration object
 * Contains all validated and processed configuration values
 */
export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  isTest: env.NODE_ENV === 'test',

  database: {
    url: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dumbassets_enhanced',
    useEmbedded: env.USE_EMBEDDED_DB,
  },

  redis: {
    url: env.REDIS_URL || 'redis://localhost:6379',
    useEmbedded: env.USE_EMBEDDED_REDIS,
  },

  jwt: {
    accessSecret: env.JWT_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessExpiry: env.JWT_ACCESS_EXPIRY,
    refreshExpiry: env.JWT_REFRESH_EXPIRY,
  },

  encryption: {
    key: env.ENCRYPTION_KEY,
  },

  session: {
    secret: env.SESSION_SECRET,
    maxAge: env.SESSION_MAX_AGE,
  },

  cors: {
    allowedOrigins: env.ALLOWED_ORIGINS === '*' ? '*' : env.ALLOWED_ORIGINS.split(','),
  },

  upload: {
    dir: env.UPLOAD_DIR,
    maxFileSize: env.MAX_FILE_SIZE,
  },

  smtp: env.SMTP_HOST
    ? {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        from: env.SMTP_FROM || 'noreply@dumbassets.local',
      }
    : null,

  oidc: env.OIDC_ISSUER_URL
    ? {
        issuerUrl: env.OIDC_ISSUER_URL,
        clientId: env.OIDC_CLIENT_ID!,
        clientSecret: env.OIDC_CLIENT_SECRET!,
        redirectUri: env.OIDC_REDIRECT_URI!,
      }
    : null,

  google: env.GOOGLE_CLIENT_ID
    ? {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
      }
    : null,

  apprise: {
    url: env.APPRISE_URL,
  },

  logging: {
    level: env.LOG_LEVEL,
    enableMetrics: env.ENABLE_METRICS,
  },
};

/**
 * TypeScript type definition for the configuration object
 * Use this type for dependency injection and type safety
 */
export type Config = typeof config;
