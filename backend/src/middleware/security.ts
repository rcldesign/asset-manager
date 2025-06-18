import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * Configure security headers middleware using Helmet
 */
export function securityHeaders(): ReturnType<typeof helmet> {
  return helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: true,
    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    // DNS Prefetch Control
    dnsPrefetchControl: { allow: false },
    // Frameguard
    frameguard: { action: 'deny' },
    // Hide Powered By
    hidePoweredBy: true,
    // HSTS
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    // IE No Open
    ieNoOpen: true,
    // No Sniff
    noSniff: true,
    // Origin Agent Cluster
    originAgentCluster: true,
    // Permitted Cross Domain Policies
    permittedCrossDomainPolicies: false,
    // Referrer Policy
    referrerPolicy: { policy: 'no-referrer' },
    // X-XSS-Protection
    xssFilter: true,
  });
}

/**
 * General API rate limiting
 */
export const generalRateLimit =
  process.env.DISABLE_RATE_LIMITING === 'true'
    ? (_req: Request, _res: Response, next: NextFunction): void => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        limit: 1000, // Limit each IP to 1000 requests per windowMs
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        // Skip successful requests to static assets
        skip: (req: Request) => {
          return req.url.includes('/static/') || req.url.includes('/public/');
        },
      });

/**
 * Strict rate limiting for authentication endpoints
 */
export const authRateLimit =
  process.env.DISABLE_RATE_LIMITING === 'true'
    ? (_req: Request, _res: Response, next: NextFunction): void => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        limit: 5, // Limit each IP to 5 requests per windowMs
        message: {
          error: 'Too many authentication attempts, please try again later.',
          retryAfter: 15 * 60, // 15 minutes in seconds
        },
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        // Use more aggressive rate limiting for auth
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
      });

/**
 * Rate limiting for password reset requests
 */
export const passwordResetRateLimit =
  process.env.DISABLE_RATE_LIMITING === 'true'
    ? (_req: Request, _res: Response, next: NextFunction): void => next()
    : rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        limit: 3, // Limit each IP to 3 password reset requests per hour
        message: {
          error: 'Too many password reset attempts, please try again later.',
          retryAfter: 60 * 60, // 1 hour in seconds
        },
        standardHeaders: 'draft-8',
        legacyHeaders: false,
      });

/**
 * Rate limiting for 2FA attempts
 */
export const twoFactorRateLimit =
  process.env.DISABLE_RATE_LIMITING === 'true'
    ? (_req: Request, _res: Response, next: NextFunction): void => next()
    : rateLimit({
        windowMs: 5 * 60 * 1000, // 5 minutes
        limit: 3, // Limit each IP to 3 2FA attempts per 5 minutes
        message: {
          error: 'Too many 2FA attempts, please try again later.',
          retryAfter: 5 * 60, // 5 minutes in seconds
        },
        standardHeaders: 'draft-8',
        legacyHeaders: false,
      });

/**
 * Additional security middleware for API endpoints
 */
export function apiSecurity(_req: Request, res: Response, next: NextFunction): void {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent XSS attacks
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  // Set cache control for API responses
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');

  // Set referrer policy
  res.setHeader('Referrer-Policy', 'no-referrer');

  next();
}

/**
 * CORS configuration for enhanced security
 */
export function configureCORS(): object {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
  ];

  return {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ): void => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-API-Key',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
}

/**
 * JWT Security enhancements
 */
export interface JWTSecurityOptions {
  /** Maximum age of access tokens in seconds */
  maxAccessTokenAge: number;
  /** Maximum age of refresh tokens in seconds */
  maxRefreshTokenAge: number;
  /** Whether to enforce HTTPS for JWT cookies */
  requireHTTPS: boolean;
  /** Cookie options for secure JWT storage */
  cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge: number;
  };
}

export const jwtSecurityDefaults: JWTSecurityOptions = {
  maxAccessTokenAge: 15 * 60, // 15 minutes
  maxRefreshTokenAge: 7 * 24 * 60 * 60, // 7 days
  requireHTTPS: process.env.NODE_ENV === 'production',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },
};

/**
 * Validate JWT token structure and claims
 */
export function validateJWTStructure(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const token = payload as Record<string, unknown>;

  // Check required fields
  const requiredFields = ['userId', 'organizationId', 'role', 'type', 'iat', 'exp'];
  for (const field of requiredFields) {
    if (!(field in token)) {
      return false;
    }
  }

  // Validate field types
  if (typeof token.userId !== 'string' || !token.userId) return false;
  if (typeof token.organizationId !== 'string' || !token.organizationId) return false;
  if (typeof token.role !== 'string' || !token.role) return false;
  if (typeof token.type !== 'string' || !['access', 'refresh'].includes(token.type)) return false;
  if (typeof token.iat !== 'number' || token.iat <= 0) return false;
  if (typeof token.exp !== 'number' || token.exp <= 0) return false;

  // Check token age (basic timing attack prevention)
  const now = Math.floor(Date.now() / 1000);
  if (token.exp <= now) return false;
  if (token.iat > now + 60) return false; // Allow 60 seconds clock skew

  return true;
}

/**
 * Security logging middleware
 */
export function securityLogger(req: Request, _res: Response, next: NextFunction): void {
  // Log security-relevant events
  const securityEvents = {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString(),
  };

  // Log suspicious patterns
  const suspiciousPatterns = [
    /\.\.|\/\/|\\\\/, // Path traversal attempts
    /<script|javascript:|vbscript:|onload|onerror/i, // XSS attempts
    /union.*select|select.*from|insert.*into|drop.*table/i, // SQL injection attempts
    /\${.*}|#{.*}|\[\[.*\]\]/, // Template injection attempts
  ];

  const suspiciousRequest = suspiciousPatterns.some(
    (pattern) =>
      pattern.test(req.url) ||
      pattern.test(JSON.stringify(req.query)) ||
      pattern.test(JSON.stringify(req.body)),
  );

  if (suspiciousRequest) {
    console.warn('Suspicious request detected:', securityEvents);
  }

  next();
}
