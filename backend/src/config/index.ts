import * as dotenv from 'dotenv';
import { z } from 'zod';
import * as path from 'path';

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
  ALLOWED_ORIGINS: z.string().refine(
    (val) => {
      // Allow '*' in non-production environments for backward compatibility
      const env = process.env.NODE_ENV;
      if (env !== 'production' && val === '*') {
        return true;
      }
      return val !== '*';
    },
    {
      message:
        "Using '*' for ALLOWED_ORIGINS is not permitted in production. Please provide a comma-separated list of allowed origins.",
    },
  ),

  // File Upload
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE: z.string().default('10485760').transform(Number), // 10MB
  UPLOADS_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  UPLOAD_TEMP_DIR: z.string().optional(),
  UPLOAD_QUARANTINE_DIR: z.string().optional(),

  // File Storage
  FILE_STORAGE_TYPE: z.enum(['local', 'smb']).default('local'),
  SMB_HOST: z.string().optional(),
  SMB_SHARE: z.string().optional(),
  SMB_USERNAME: z.string().optional(),
  SMB_PASSWORD: z.string().optional(),
  SMB_DOMAIN: z.string().optional(),

  // Security
  ENABLE_MALWARE_SCANNING: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.string().default('3310').transform(Number),
  CLAMAV_TIMEOUT: z.string().default('30000').transform(Number),
  MAX_TOTAL_UPLOAD_SIZE: z.string().default('104857600').transform(Number), // 100MB
  MAX_FIELD_SIZE: z.string().default('1048576').transform(Number), // 1MB
  MAX_HEADER_PAIRS: z.string().default('100').transform(Number),

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
    dir: path.resolve(env.UPLOAD_DIR),
    maxFileSize: env.MAX_FILE_SIZE,
    enabled: env.UPLOADS_ENABLED,
    tempDir: env.UPLOAD_TEMP_DIR
      ? path.resolve(env.UPLOAD_TEMP_DIR)
      : path.join(path.resolve(env.UPLOAD_DIR), 'temp'),
    quarantineDir: env.UPLOAD_QUARANTINE_DIR
      ? path.resolve(env.UPLOAD_QUARANTINE_DIR)
      : path.join(path.resolve(env.UPLOAD_DIR), 'quarantine'),
  },

  fileStorage: {
    type: env.FILE_STORAGE_TYPE,
    smb: env.SMB_HOST
      ? {
          host: env.SMB_HOST,
          share: env.SMB_SHARE!,
          username: env.SMB_USERNAME,
          password: env.SMB_PASSWORD,
          domain: env.SMB_DOMAIN,
        }
      : null,
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

  email: {
    enabled: !!env.SMTP_HOST,
    from: env.SMTP_FROM || 'noreply@dumbassets.local',
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT || 587,
          secure: env.SMTP_PORT === 465,
          user: env.SMTP_USER || '',
          pass: env.SMTP_PASSWORD || '',
        }
      : undefined,
  },

  app: {
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },

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

  security: {
    enableMalwareScanning: env.ENABLE_MALWARE_SCANNING,
    clamav: {
      host: env.CLAMAV_HOST,
      port: env.CLAMAV_PORT,
      timeout: env.CLAMAV_TIMEOUT,
    },
    fileUpload: {
      maxTotalUploadSize: env.MAX_TOTAL_UPLOAD_SIZE,
      maxFieldSize: env.MAX_FIELD_SIZE,
      maxHeaderPairs: env.MAX_HEADER_PAIRS,
    },
  },

  totp: {
    issuer: process.env.TOTP_ISSUER || 'DumbAssets',
  },

  // Shorthand properties for easier access
  databaseUrl:
    env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/dumbassets_enhanced',
  useEmbeddedDb: env.USE_EMBEDDED_DB,
  uploadDir: path.resolve(env.UPLOAD_DIR),
  fileStorageType: env.FILE_STORAGE_TYPE,
  smbHost: env.SMB_HOST,
  smbShare: env.SMB_SHARE,
};

/**
 * TypeScript type definition for the configuration object
 * Use this type for dependency injection and type safety
 */
export type Config = typeof config;
