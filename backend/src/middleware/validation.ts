import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { z, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * Create validation middleware for request validation
 */
export function validateRequest(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = new ValidationError('Validation failed', {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
        next(validationError);
      } else {
        next(error);
      }
    }
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // ID validation
  id: z.string().uuid('Invalid UUID format'),

  // Email validation
  email: z.string().email('Invalid email format').max(255, 'Email too long'),

  // Password validation
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/\d/, 'Password must contain at least one number')
    .regex(
      /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/,
      'Password must contain at least one special character',
    ),

  // Name validation
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name too long')
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Name contains invalid characters'),

  // Full name validation (more permissive)
  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(255, 'Full name too long')
    .regex(/^[a-zA-Z\s\-'.]+$/, 'Full name contains invalid characters'),

  // Organization name validation
  organizationName: z
    .string()
    .min(1, 'Organization name is required')
    .max(255, 'Organization name too long')
    .regex(/^[a-zA-Z0-9\s\-_.&]+$/, 'Organization name contains invalid characters'),

  // Pagination
  pagination: z
    .object({
      page: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 1)),
      limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 20)),
    })
    .refine((data) => data.page >= 1, 'Page must be >= 1')
    .refine((data) => data.limit >= 1 && data.limit <= 100, 'Limit must be between 1 and 100'),

  // TOTP token
  totpToken: z.string().regex(/^\d{6}$/, 'TOTP token must be 6 digits'),

  // JWT refresh token
  refreshToken: z.string().min(10, 'Invalid refresh token'),

  // State parameter for OAuth/OIDC
  stateParam: z.string().min(10, 'Invalid state parameter'),

  // Boolean from string
  booleanFromString: z
    .string()
    .transform((val) => val === 'true')
    .or(z.boolean()),

  // Optional string that trims whitespace
  optionalTrimmedString: z
    .string()
    .trim()
    .optional()
    .transform((val) => (val === '' ? undefined : val)),
};

/**
 * Authentication validation schemas
 */
export const authSchemas = {
  register: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    fullName: commonSchemas.fullName.optional(),
    organizationName: commonSchemas.organizationName,
  }),

  login: z.object({
    email: commonSchemas.email,
    password: z.string().min(1, 'Password is required'),
    totpToken: commonSchemas.totpToken.optional(),
  }),

  refreshToken: z.object({
    refreshToken: commonSchemas.refreshToken,
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: commonSchemas.password,
  }),

  setupTwoFactor: z.object({
    totpToken: commonSchemas.totpToken,
  }),

  createApiToken: z.object({
    name: z
      .string()
      .min(1, 'Token name is required')
      .max(100, 'Token name too long')
      .regex(/^[a-zA-Z0-9\s\-_.]+$/, 'Token name contains invalid characters'),
    expiresAt: z.string().datetime().optional(),
  }),
};

/**
 * User validation schemas
 */
export const userSchemas = {
  create: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password.optional(),
    fullName: commonSchemas.fullName.optional(),
    role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).optional(),
  }),

  update: z.object({
    email: commonSchemas.email.optional(),
    fullName: commonSchemas.fullName.optional(),
    role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).optional(),
    isActive: z.boolean().optional(),
  }),

  params: z.object({
    userId: commonSchemas.id,
  }),
};

/**
 * Organization validation schemas
 */
export const organizationSchemas = {
  update: z.object({
    name: commonSchemas.organizationName,
  }),

  setOwner: z.object({
    userId: commonSchemas.id,
  }),

  params: z.object({
    organizationId: commonSchemas.id,
  }),
};

/**
 * OIDC validation schemas
 */
export const oidcSchemas = {
  login: z.object({
    organizationName: commonSchemas.organizationName.optional(),
  }),

  callback: z.object({
    code: z.string().min(1, 'Authorization code is required'),
    state: commonSchemas.stateParam,
    error: z.string().optional(),
  }),

  refreshTokens: z.object({
    refreshToken: commonSchemas.refreshToken,
  }),

  logout: z.object({
    idToken: z.string().optional(),
    postLogoutRedirectUri: z.string().url().optional(),
  }),
};

/**
 * Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate file upload
 */
export const fileValidation = {
  image: z.object({
    mimetype: z.string().regex(/^image\/(jpeg|jpg|png|gif|webp)$/, 'Invalid image format'),
    size: z.number().max(5 * 1024 * 1024, 'Image too large (max 5MB)'),
  }),

  document: z.object({
    mimetype: z
      .string()
      .regex(
        /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|text\/plain)$/,
        'Invalid document format',
      ),
    size: z.number().max(10 * 1024 * 1024, 'Document too large (max 10MB)'),
  }),
};

/**
 * Rate limiting validation
 */
export const rateLimitSchemas = {
  // IP-based rate limiting headers
  rateLimitHeaders: z.object({
    'x-forwarded-for': z.string().optional(),
    'x-real-ip': z.string().optional(),
  }),
};

export default validateRequest;
