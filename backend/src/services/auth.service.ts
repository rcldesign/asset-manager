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
 * Authentication service providing user authentication, token management, and 2FA functionality.
 * Handles login/logout, JWT token generation/validation, and TOTP-based two-factor authentication.
 * Integrates with session management for multi-device support.
 *
 * @class AuthService
 */
export class AuthService {
  private userService: UserService;

  /**
   * Creates an instance of AuthService.
   * Initializes UserService dependency for authentication operations.
   */
  constructor() {
    this.userService = new UserService();
  }

  /**
   * Authenticate user with email/password and optional TOTP.
   * Supports two-factor authentication flow with progressive verification.
   *
   * @param {LoginCredentials} credentials - User login credentials including email, password, and optional TOTP code
   * @param {number} [timeForTesting] - Optional time override for TOTP verification (testing only)
   * @returns {Promise<Object>} Object containing user data, auth tokens, and TOTP requirement flag
   * @throws {AuthenticationError} When credentials are invalid or account is deactivated
   *
   * @example
   * // Initial login attempt
   * const result = await authService.authenticate({
   *   email: 'user@example.com',
   *   password: 'SecurePass123!'
   * });
   *
   * if (result.requiresTOTP) {
   *   // Prompt for 2FA code and retry
   *   const finalResult = await authService.authenticate({
   *     email: 'user@example.com',
   *     password: 'SecurePass123!',
   *     totpCode: '123456'
   *   });
   * }
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
   * Generate JWT access and refresh tokens for a user.
   * Creates a new session with token pair and stores in database.
   *
   * @param {User} user - User object to generate tokens for
   * @returns {Promise<TokenPair>} Token pair containing access token, refresh token, and expiry time
   * @throws {AppError} When JWT secrets are not configured (500)
   *
   * @example
   * const tokens = await authService.generateTokens(user);
   * // Returns:
   * // {
   * //   accessToken: 'eyJ...',
   * //   refreshToken: 'eyJ...',
   * //   expiresIn: 900 // 15 minutes in seconds
   * // }
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
   * Refresh access token using a valid refresh token.
   * Validates refresh token, checks session validity, and issues new token pair.
   *
   * @param {string} refreshToken - The refresh token to use for generating new tokens
   * @returns {Promise<TokenPair>} New token pair
   * @throws {AppError} When JWT refresh secret is not configured (500)
   * @throws {AuthenticationError} When refresh token is invalid or expired
   *
   * @example
   * try {
   *   const newTokens = await authService.refreshToken(oldRefreshToken);
   *   // Use new tokens for subsequent requests
   * } catch (error) {
   *   // Refresh token expired - user must login again
   * }
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
   * Verify JWT access token and return associated user.
   * Validates token signature and expiry, then fetches user data.
   *
   * @param {string} token - JWT access token to verify
   * @returns {Promise<User>} User object if token is valid
   * @throws {AppError} When JWT secret is not configured (500)
   * @throws {AuthenticationError} When token is invalid or user is inactive
   *
   * @example
   * // In middleware or route handler
   * const authHeader = req.headers.authorization;
   * const token = authHeader?.replace('Bearer ', '');
   *
   * const user = await authService.verifyToken(token);
   * req.user = user;
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
   * Setup TOTP (Time-based One-Time Password) for a user.
   * Generates secret and QR code for authenticator app integration.
   *
   * @param {string} userId - ID of the user to setup TOTP for
   * @param {string} [appName='DumbAssets'] - Name of the application for TOTP issuer
   * @returns {Promise<TOTPSetup>} TOTP setup information including secret, QR code URL, and manual entry key
   * @throws {AppError} When user is not found (404)
   * @throws {ValidationError} When TOTP is already enabled for the user
   *
   * @example
   * const setup = await authService.setupTOTP('user-123');
   * // Display QR code to user
   * res.json({
   *   qrCode: setup.qrCodeUrl,
   *   manualKey: setup.manualEntryKey
   * });
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
   * Enable TOTP after verifying the setup code.
   * Confirms user has configured authenticator app correctly before enabling 2FA.
   *
   * @param {string} userId - ID of the user to enable TOTP for
   * @param {string} totpCode - 6-digit TOTP code for verification
   * @param {number} [timeForTesting] - Optional time override for TOTP verification (testing only)
   * @returns {Promise<void>}
   * @throws {AppError} When user is not found (404)
   * @throws {ValidationError} When TOTP setup not initiated, already enabled, or code is invalid
   *
   * @example
   * // After user scans QR code and enters verification code
   * try {
   *   await authService.enableTOTP('user-123', '123456');
   *   // 2FA now active for user
   * } catch (error) {
   *   // Invalid code - user should check authenticator app
   * }
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
   * Disable TOTP for a user after password verification.
   * Requires password confirmation for security before removing 2FA.
   *
   * @param {string} userId - ID of the user to disable TOTP for
   * @param {string} password - User's current password for verification
   * @returns {Promise<void>}
   * @throws {AppError} When user is not found (404)
   * @throws {ValidationError} When TOTP is not enabled
   * @throws {AuthenticationError} When password is invalid
   *
   * @example
   * await authService.disableTOTP('user-123', 'CurrentPassword123!');
   * // 2FA is now disabled for the user
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
   * Logout user by invalidating their refresh token.
   * Removes the session associated with the refresh token.
   *
   * @param {string} refreshToken - The refresh token to invalidate
   * @returns {Promise<void>}
   *
   * @example
   * await authService.logout(req.cookies.refreshToken);
   * res.clearCookie('refreshToken');
   * res.json({ message: 'Logged out successfully' });
   */
  async logout(refreshToken: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { refreshToken },
    });
  }

  /**
   * Logout user from all devices by invalidating all their sessions.
   * Useful for security scenarios or password changes.
   *
   * @param {string} userId - ID of the user to logout from all devices
   * @returns {Promise<void>}
   *
   * @example
   * // After password change or security breach
   * await authService.logoutAll('user-123');
   * // User must re-authenticate on all devices
   */
  async logoutAll(userId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { userId },
    });
  }

  /**
   * Generate a password reset token for a user.
   * Always returns a token to prevent email enumeration attacks.
   *
   * @param {string} email - Email address of the user requesting password reset
   * @returns {Promise<string>} Token string (always returns a value to prevent email enumeration)
   *
   * @example
   * const token = await authService.generatePasswordResetToken('user@example.com');
   * // Send token via email if user exists
   * // Note: Always show success message to prevent email enumeration
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
   * Validate a session token and return the associated user.
   * Checks session existence and expiry before returning user data.
   *
   * @param {string} sessionToken - The session token to validate
   * @returns {Promise<User | null>} User object if session is valid, null otherwise
   *
   * @example
   * const user = await authService.validateSession(sessionToken);
   * if (user) {
   *   // Session is valid, proceed with authenticated request
   * } else {
   *   // Session expired or invalid
   * }
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
   * Get all active sessions for a user.
   * Returns session metadata for device management.
   *
   * @param {string} userId - ID of the user to get sessions for
   * @returns {Promise<SessionInfo[]>} Array of session information objects
   *
   * @example
   * const sessions = await authService.getUserSessions('user-123');
   * // Display to user:
   * sessions.forEach(session => {
   *   console.log(`Device logged in at ${session.createdAt}`);
   *   console.log(`Token preview: ${session.tokenPreview}`);
   * });
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
   * Revoke a specific session for a user.
   * Allows users to logout specific devices/sessions.
   *
   * @param {string} userId - ID of the user who owns the session
   * @param {string} sessionId - ID of the session to revoke
   * @returns {Promise<void>}
   *
   * @example
   * // User can logout a specific device
   * await authService.revokeSession('user-123', 'session-456');
   * // That device will need to login again
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
