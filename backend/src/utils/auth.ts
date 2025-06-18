import bcrypt from 'bcrypt';
import type { SignOptions, VerifyOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { config } from '../config';
import { AuthenticationError } from './errors';
import { validateJWTStructure } from '../middleware/security';

// Password utilities using bcrypt best practices

/**
 * Hash a password using bcrypt with 12 rounds for strong security
 * @param password - The plain text password to hash
 * @returns Promise resolving to the hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  // Use 12 rounds for strong security
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against its bcrypt hash
 * @param password - The plain text password to verify
 * @param hash - The bcrypt hash to verify against
 * @returns Promise resolving to true if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT utilities with enhanced security
export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string; // JWT ID for token revocation
}

export interface SecureTokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiry: number;
  refreshTokenExpiry: number;
  tokenId: string; // For tracking and revocation
}

/**
 * Generate a secure access and refresh token pair
 * @param payload - JWT payload containing user information (excluding 'type' field)
 * @returns Object containing access token, refresh token, and expiry information
 */
export function generateTokens(payload: Omit<JWTPayload, 'type'>): SecureTokenPair {
  const tokenId = crypto.randomBytes(16).toString('hex');
  const issuer = 'dumbassets-enhanced';
  const audience = 'dumbassets-api';

  const now = Math.floor(Date.now() / 1000);
  const accessExpiry = now + 15 * 60; // 15 minutes
  const refreshExpiry = now + 7 * 24 * 60 * 60; // 7 days

  const accessPayload: JWTPayload = {
    ...payload,
    type: 'access',
    jti: `${tokenId}-access`,
  };

  const refreshPayload: JWTPayload = {
    ...payload,
    type: 'refresh',
    jti: `${tokenId}-refresh`,
  };

  const signOptions: SignOptions = {
    issuer,
    audience,
    algorithm: 'HS256',
  };

  const accessToken = jwt.sign(accessPayload, config.jwt.accessSecret, {
    ...signOptions,
    expiresIn: config.jwt.accessExpiry,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
    ...signOptions,
    expiresIn: config.jwt.refreshExpiry,
  } as jwt.SignOptions);

  return {
    accessToken,
    refreshToken,
    accessTokenExpiry: accessExpiry,
    refreshTokenExpiry: refreshExpiry,
    tokenId,
  };
}

/**
 * Verify and decode a JWT access token
 * @param token - The JWT access token to verify
 * @returns Decoded JWT payload
 * @throws {AuthenticationError} When token is invalid, expired, or malformed
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('Invalid token format');
    }

    const verifyOptions: VerifyOptions = {
      issuer: 'dumbassets-enhanced',
      audience: 'dumbassets-api',
      algorithms: ['HS256'],
      clockTolerance: 60, // Allow 60 seconds clock skew
    };

    const payload = jwt.verify(token, config.jwt.accessSecret, verifyOptions) as JWTPayload;

    // Additional payload validation
    if (!validateJWTStructure(payload)) {
      throw new AuthenticationError('Invalid token structure');
    }

    if (payload.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Access token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid access token');
    }
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Token verification failed');
  }
}

/**
 * Verify and decode a JWT refresh token
 * @param token - The JWT refresh token to verify
 * @returns Decoded JWT payload
 * @throws {AuthenticationError} When token is invalid, expired, or malformed
 */
export function verifyRefreshToken(token: string): JWTPayload {
  try {
    if (!token || typeof token !== 'string') {
      throw new AuthenticationError('Invalid token format');
    }

    const verifyOptions: VerifyOptions = {
      issuer: 'dumbassets-enhanced',
      audience: 'dumbassets-api',
      algorithms: ['HS256'],
      clockTolerance: 60, // Allow 60 seconds clock skew
    };

    const payload = jwt.verify(token, config.jwt.refreshSecret, verifyOptions) as JWTPayload;

    // Additional payload validation
    if (!validateJWTStructure(payload)) {
      throw new AuthenticationError('Invalid token structure');
    }

    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Refresh token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid refresh token');
    }
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('Token verification failed');
  }
}

// 2FA TOTP utilities
export interface TOTPSecret {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

/**
 * Generate a TOTP secret for two-factor authentication
 * @param userEmail - User's email address for the TOTP label
 * @param serviceName - Name of the service for the TOTP issuer (defaults to 'DumbAssets Enhanced')
 * @returns Object containing the secret, QR code URL, and manual entry key
 */
export function generateTOTPSecret(
  userEmail: string,
  serviceName: string = 'DumbAssets Enhanced',
): TOTPSecret {
  const secret = speakeasy.generateSecret({
    name: userEmail,
    issuer: serviceName,
    length: 32,
  });

  return {
    secret: secret.base32,
    qrCodeUrl: secret.otpauth_url!,
    manualEntryKey: secret.base32,
  };
}

/**
 * Generate a QR code data URL from an OTP auth URL
 * @param otpAuthUrl - The OTP auth URL to encode in the QR code
 * @returns Promise resolving to a data URL of the QR code image
 */
export async function generateQRCode(otpAuthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpAuthUrl);
}

/**
 * Verify a TOTP token against a secret
 * @param token - The 6-digit TOTP token to verify
 * @param secret - The base32-encoded TOTP secret
 * @param timeForTesting - Optional time override for testing (Unix timestamp in seconds)
 * @returns True if the token is valid, false otherwise
 */
export function verifyTOTPToken(token: string, secret: string, timeForTesting?: number): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps tolerance (±60 seconds)
    time: timeForTesting, // Will be undefined in prod, which is what we want
  });
}

// API token utilities

/**
 * Generate a secure API token
 * @returns A 64-character hexadecimal API token
 */
export function generateApiToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash an API token using SHA256
 * @param token - The API token to hash
 * @returns SHA256 hash of the token in hexadecimal format
 */
export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Session utilities

/**
 * Generate a secure session token
 * @returns A base64url-encoded session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

// Email validation

/**
 * Validate email address format using regex
 * @param email - Email address to validate
 * @returns True if email format is valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Password strength validation
export interface PasswordStrength {
  isValid: boolean;
  score: number; // 0-4
  feedback: string[];
}

/**
 * Validate password strength and provide feedback
 * @param password - Password to validate
 * @returns Object containing validation result, strength score (0-4), and feedback messages
 */
export function validatePasswordStrength(password: string): PasswordStrength {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  } else if (password.length >= 12) {
    score += 1;
  }

  // Complexity checks
  if (!/[a-z]/.test(password)) {
    feedback.push('Password must contain at least one lowercase letter');
  } else {
    score += 1;
  }

  if (!/[A-Z]/.test(password)) {
    feedback.push('Password must contain at least one uppercase letter');
  } else {
    score += 1;
  }

  if (!/\d/.test(password)) {
    feedback.push('Password must contain at least one number');
  } else {
    score += 1;
  }

  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    feedback.push('Password must contain at least one special character');
  } else {
    score += 1;
  }

  // Common password patterns
  const commonPatterns = [
    /(.)\1{2,}/, // Repeated characters
    /123|abc|qwe/i, // Sequential patterns
    /password|admin|user/i, // Common words
  ];

  if (commonPatterns.some((pattern) => pattern.test(password))) {
    feedback.push('Password contains common patterns that are easy to guess');
    score = Math.max(0, score - 1);
  }

  const isValid = password.length >= 8 && feedback.length === 0;

  return {
    isValid,
    score: Math.min(score, 4),
    feedback,
  };
}

/**
 * Perform constant-time string comparison to prevent timing attacks
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns True if strings are equal, false otherwise
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
