import type { User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { prisma } from '../lib/prisma';
import { UserService } from './user.service';
import { AppError, AuthenticationError, ValidationError } from '../utils/errors';
import { generateSecureToken } from '../utils/crypto';

export interface LoginCredentials {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName?: string;
  organizationId?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TOTPSetup {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface RefreshTokenPayload {
  userId: string;
  type: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface SessionInfo {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  tokenPreview: string;
}

/**
 * Authentication service providing user authentication, token management, and 2FA functionality
 */
export class AuthService {
  private userService: UserService;

  constructor() {
    this.userService = new UserService();
  }

  /**
   * Authenticate user with email/password and optional TOTP
   * @param credentials - User login credentials including email, password, and optional TOTP code
   * @param timeForTesting - Optional time override for TOTP verification (testing only)
   * @returns Object containing user data, auth tokens, and TOTP requirement flag
   * @throws {AuthenticationError} When credentials are invalid or account is deactivated
   */
  async authenticate(
    credentials: LoginCredentials,
    timeForTesting?: number,
  ): Promise<{
    user: User;
    tokens: TokenPair;
    requiresTOTP?: boolean;
  }> {
    const { email, password, totpCode } = credentials;

    // Verify user credentials
    const user = await this.userService.verifyPassword(email, password);
    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    // Check if 2FA is enabled and TOTP code is required
    if (user.totpEnabled) {
      if (!totpCode) {
        return {
          user,
          tokens: {} as TokenPair,
          requiresTOTP: true,
        };
      }

      if (!user.totpSecret) {
        throw new AuthenticationError('TOTP not properly configured');
      }

      // Verify TOTP code
      const isValidTOTP = speakeasy.totp.verify({
        secret: user.totpSecret,
        encoding: 'base32',
        token: totpCode,
        window: 1, // Allow 1 step before/after for clock skew
        time: timeForTesting, // Will be undefined in prod, which is what we want
      });

      if (!isValidTOTP) {
        throw new AuthenticationError('Invalid 2FA code');
      }
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return { user, tokens };
  }

  /**
   * Generate JWT access and refresh tokens for a user
   * @param user - User object to generate tokens for
   * @returns Token pair containing access token, refresh token, and expiry time
   * @throws {AppError} When JWT secrets are not configured
   */
  async generateTokens(user: User): Promise<TokenPair> {
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || !jwtRefreshSecret) {
      throw new AppError('JWT secrets not configured', 500);
    }

    const accessTokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    };

    const refreshTokenPayload = {
      userId: user.id,
      type: 'refresh',
    };

    const accessToken = jwt.sign(accessTokenPayload, jwtSecret, {
      expiresIn: '15m',
      issuer: 'dumbassets',
      audience: 'dumbassets-api',
    });

    const refreshToken = jwt.sign(refreshTokenPayload, jwtRefreshSecret, {
      expiresIn: '7d',
      issuer: 'dumbassets',
      audience: 'dumbassets-api',
    });

    // Store refresh token in database
    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Refresh access token using a valid refresh token
   * @param refreshToken - The refresh token to use for generating new tokens
   * @returns New token pair
   * @throws {AppError} When JWT refresh secret is not configured
   * @throws {AuthenticationError} When refresh token is invalid or expired
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!jwtRefreshSecret) {
      throw new AppError('JWT refresh secret not configured', 500);
    }

    try {
      // Verify refresh token
      jwt.verify(refreshToken, jwtRefreshSecret) as RefreshTokenPayload;

      // Find session in database
      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true },
      });

      if (!session || session.expiresAt < new Date()) {
        throw new AuthenticationError('Invalid or expired refresh token');
      }

      if (!session.user.isActive) {
        throw new AuthenticationError('Account is deactivated');
      }

      // Generate new token pair
      const newTokens = await this.generateTokens(session.user);

      // Remove old session
      await prisma.session.delete({
        where: { id: session.id },
      });

      return newTokens;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Verify JWT access token and return associated user
   * @param token - JWT access token to verify
   * @returns User object if token is valid
   * @throws {AppError} When JWT secret is not configured
   * @throws {AuthenticationError} When token is invalid or user is inactive
   */
  async verifyToken(token: string): Promise<User> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AppError('JWT secret not configured', 500);
    }

    try {
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

      const user = await this.userService.getUserById(decoded.userId);
      if (!user || !user.isActive) {
        throw new AuthenticationError('Invalid token');
      }

      return user;
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AuthenticationError('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Setup TOTP (Time-based One-Time Password) for a user
   * @param userId - ID of the user to setup TOTP for
   * @param appName - Name of the application for TOTP issuer (defaults to 'DumbAssets')
   * @returns TOTP setup information including secret, QR code URL, and manual entry key
   * @throws {AppError} When user is not found
   * @throws {ValidationError} When TOTP is already enabled for the user
   */
  async setupTOTP(userId: string, appName: string = 'DumbAssets'): Promise<TOTPSetup> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.totpEnabled) {
      throw new ValidationError('TOTP is already enabled for this user');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${appName} (${user.email})`,
      issuer: appName,
      length: 32,
    });

    // Store secret temporarily (not enabled yet)
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret.base32 },
    });

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCodeUrl,
      manualEntryKey: secret.base32,
    };
  }

  /**
   * Enable TOTP after verifying the setup code
   * @param userId - ID of the user to enable TOTP for
   * @param totpCode - 6-digit TOTP code for verification
   * @param timeForTesting - Optional time override for TOTP verification (testing only)
   * @throws {AppError} When user is not found
   * @throws {ValidationError} When TOTP setup not initiated, already enabled, or code is invalid
   */
  async enableTOTP(userId: string, totpCode: string, timeForTesting?: number): Promise<void> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.totpSecret) {
      throw new ValidationError('TOTP setup not initiated');
    }

    if (user.totpEnabled) {
      throw new ValidationError('TOTP is already enabled');
    }

    // Verify TOTP code
    const isValid = speakeasy.totp.verify({
      secret: user.totpSecret,
      encoding: 'base32',
      token: totpCode,
      window: 2, // Allow wider window for initial setup
      time: timeForTesting, // Will be undefined in prod, which is what we want
    });

    if (!isValid) {
      throw new ValidationError('Invalid TOTP code');
    }

    // Enable TOTP
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
  }

  /**
   * Disable TOTP for a user after password verification
   * @param userId - ID of the user to disable TOTP for
   * @param password - User's current password for verification
   * @throws {AppError} When user is not found
   * @throws {ValidationError} When TOTP is not enabled
   * @throws {AuthenticationError} When password is invalid
   */
  async disableTOTP(userId: string, password: string): Promise<void> {
    const user = await this.userService.getUserById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!user.totpEnabled) {
      throw new ValidationError('TOTP is not enabled');
    }

    // Verify password before disabling 2FA
    const isValidPassword = await this.userService.verifyPassword(user.email, password);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid password');
    }

    // Disable TOTP and remove secret
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecret: null,
      },
    });
  }

  /**
   * Logout user by invalidating their refresh token
   * @param refreshToken - The refresh token to invalidate
   */
  async logout(refreshToken: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { refreshToken },
    });
  }

  /**
   * Logout user from all devices by invalidating all their sessions
   * @param userId - ID of the user to logout from all devices
   */
  async logoutAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  /**
   * Generate a password reset token for a user
   * @param email - Email address of the user requesting password reset
   * @returns Token string (always returns a value to prevent email enumeration)
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return 'token-generated';
    }

    const token = generateSecureToken(32);
    // const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token (you might want a separate table for this)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // You'll need to add resetToken and resetTokenExpiry fields to the schema
        // resetToken: token,
        // resetTokenExpiry: expiresAt
      },
    });

    return token;
  }

  /**
   * Validate a session token and return the associated user
   * @param sessionToken - The session token to validate
   * @returns User object if session is valid, null otherwise
   */
  async validateSession(sessionToken: string): Promise<User | null> {
    const session = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return session.user;
  }

  /**
   * Get all active sessions for a user
   * @param userId - ID of the user to get sessions for
   * @returns Array of session information objects
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        token: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      // Partial token for identification
      tokenPreview: session.token.slice(0, 8) + '...',
    }));
  }

  /**
   * Revoke a specific session for a user
   * @param userId - ID of the user who owns the session
   * @param sessionId - ID of the session to revoke
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: {
        id: sessionId,
        userId,
      },
    });
  }
}
