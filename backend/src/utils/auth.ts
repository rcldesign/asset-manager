import bcrypt from 'bcrypt';
import type { SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { config } from '../config';
import { AuthenticationError } from './errors';

// Password utilities using bcrypt best practices
export async function hashPassword(password: string): Promise<string> {
  // Use 12 rounds for strong security
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT utilities
export interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  type: 'access' | 'refresh';
}

export function generateTokens(payload: Omit<JWTPayload, 'type'>): {
  accessToken: string;
  refreshToken: string;
} {
  const accessPayload = { ...payload, type: 'access' as const };
  const refreshPayload = { ...payload, type: 'refresh' as const };

  const accessToken = jwt.sign(accessPayload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiry,
  } as SignOptions);

  const refreshToken = jwt.sign(refreshPayload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiry,
  } as SignOptions);

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as JWTPayload;
    if (payload.type !== 'access') {
      throw new AuthenticationError('Invalid token type');
    }
    return payload;
  } catch {
    throw new AuthenticationError('Invalid access token');
  }
}

export function verifyRefreshToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
    if (payload.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }
    return payload;
  } catch {
    throw new AuthenticationError('Invalid refresh token');
  }
}

// 2FA TOTP utilities
export interface TOTPSecret {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

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

export async function generateQRCode(otpAuthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpAuthUrl);
}

export function verifyTOTPToken(token: string, secret: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps tolerance (±60 seconds)
  });
}

// API token utilities
export function generateApiToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashApiToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Session utilities
export function generateSessionToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

// Email validation
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

// Constant-time string comparison for security
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
