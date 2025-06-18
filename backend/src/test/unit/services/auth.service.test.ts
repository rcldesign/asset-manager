import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import * as speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { AuthService } from '../../../services/auth.service';
import { UserService } from '../../../services/user.service';
import { prisma } from '../../../lib/prisma';
import { AppError, AuthenticationError, ValidationError } from '../../../utils/errors';
import * as crypto from '../../../utils/crypto';
import type { User } from '@prisma/client';
import { UserRole } from '@prisma/client';

// Mock dependencies
jest.mock('../../../lib/prisma');
jest.mock('../../../services/user.service');
jest.mock('jsonwebtoken');
jest.mock('speakeasy');
jest.mock('qrcode');
jest.mock('../../../utils/crypto');

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockUserService = UserService as jest.MockedClass<typeof UserService>;
const mockJwt = jwt as jest.Mocked<typeof jwt>;
const mockSpeakeasy = speakeasy as jest.Mocked<typeof speakeasy>;
const mockQrcode = qrcode as jest.Mocked<typeof qrcode>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

describe('AuthService', () => {
  let authService: AuthService;
  let userServiceInstance: jest.Mocked<UserService>;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashedPassword',
    fullName: 'Test User',
    role: UserRole.MEMBER,
    organizationId: 'org-123',
    isActive: true,
    totpEnabled: false,
    totpSecret: null,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEnvironment = {
    JWT_SECRET: 'test-jwt-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup environment variables
    process.env.JWT_SECRET = mockEnvironment.JWT_SECRET;
    process.env.JWT_REFRESH_SECRET = mockEnvironment.JWT_REFRESH_SECRET;

    // Setup mocked UserService instance
    userServiceInstance = {
      verifyPassword: jest.fn(),
      getUserById: jest.fn(),
      findByEmail: jest.fn(),
    } as any;

    mockUserService.mockImplementation(() => userServiceInstance);
    authService = new AuthService();
  });

  describe('authenticate', () => {
    const credentials = {
      email: 'test@example.com',
      password: 'password123',
    };

    it('should authenticate user successfully without 2FA', async () => {
      userServiceInstance.verifyPassword.mockResolvedValue(mockUser);
      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      mockPrisma.session.create.mockResolvedValue({
        id: 'session-123',
        userId: mockUser.id,
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.authenticate(credentials);

      expect(result.user).toEqual(mockUser);
      expect(result.tokens.accessToken).toBe('access-token');
      expect(result.tokens.refreshToken).toBe('refresh-token');
      expect(result.requiresTOTP).toBeUndefined();
      expect(userServiceInstance.verifyPassword).toHaveBeenCalledWith(
        credentials.email,
        credentials.password,
      );
    });

    it('should throw error for invalid credentials', async () => {
      userServiceInstance.verifyPassword.mockResolvedValue(null);

      await expect(authService.authenticate(credentials)).rejects.toThrow(
        new AuthenticationError('Invalid email or password'),
      );
    });

    it('should throw error for inactive user', async () => {
      const inactiveUser = { ...mockUser, isActive: false };
      userServiceInstance.verifyPassword.mockResolvedValue(inactiveUser);

      await expect(authService.authenticate(credentials)).rejects.toThrow(
        new AuthenticationError('Account is deactivated'),
      );
    });

    it('should require TOTP when enabled but not provided', async () => {
      const totpUser = { ...mockUser, totpEnabled: true, totpSecret: 'secret' };
      userServiceInstance.verifyPassword.mockResolvedValue(totpUser);

      const result = await authService.authenticate(credentials);

      expect(result.user).toEqual(totpUser);
      expect(result.requiresTOTP).toBe(true);
      expect(result.tokens).toEqual({});
    });

    it('should authenticate with valid TOTP', async () => {
      const totpUser = { ...mockUser, totpEnabled: true, totpSecret: 'secret' };
      const credentialsWithTOTP = { ...credentials, totpCode: '123456' };

      userServiceInstance.verifyPassword.mockResolvedValue(totpUser);
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      mockPrisma.session.create.mockResolvedValue({
        id: 'session-123',
        userId: totpUser.id,
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.authenticate(credentialsWithTOTP);

      expect(result.user).toEqual(totpUser);
      expect(result.tokens.accessToken).toBe('access-token');
      expect(mockSpeakeasy.totp.verify).toHaveBeenCalledWith({
        secret: 'secret',
        encoding: 'base32',
        token: '123456',
        window: 1,
      });
    });

    it('should throw error for invalid TOTP', async () => {
      const totpUser = { ...mockUser, totpEnabled: true, totpSecret: 'secret' };
      const credentialsWithTOTP = { ...credentials, totpCode: '123456' };

      userServiceInstance.verifyPassword.mockResolvedValue(totpUser);
      mockSpeakeasy.totp.verify.mockReturnValue(false);

      await expect(authService.authenticate(credentialsWithTOTP)).rejects.toThrow(
        new AuthenticationError('Invalid 2FA code'),
      );
    });

    it('should throw error for TOTP enabled but no secret', async () => {
      const totpUser = { ...mockUser, totpEnabled: true, totpSecret: null };
      const credentialsWithTOTP = { ...credentials, totpCode: '123456' };

      userServiceInstance.verifyPassword.mockResolvedValue(totpUser);

      await expect(authService.authenticate(credentialsWithTOTP)).rejects.toThrow(
        new AuthenticationError('TOTP not properly configured'),
      );
    });
  });

  describe('generateTokens', () => {
    it('should generate valid token pair', async () => {
      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      mockPrisma.session.create.mockResolvedValue({
        id: 'session-123',
        userId: mockUser.id,
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.generateTokens(mockUser);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.expiresIn).toBe(15 * 60);

      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          organizationId: mockUser.organizationId,
        },
        mockEnvironment.JWT_SECRET,
        {
          expiresIn: '15m',
          issuer: 'dumbassets',
          audience: 'dumbassets-api',
        },
      );

      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          type: 'refresh',
        },
        mockEnvironment.JWT_REFRESH_SECRET,
        {
          expiresIn: '7d',
          issuer: 'dumbassets',
          audience: 'dumbassets-api',
        },
      );
    });

    it('should throw error when JWT secrets not configured', async () => {
      process.env.JWT_SECRET = '';

      await expect(authService.generateTokens(mockUser)).rejects.toThrow(
        new AppError('JWT secrets not configured', 500),
      );
    });

    it('should throw error when JWT refresh secret not configured', async () => {
      process.env.JWT_REFRESH_SECRET = '';

      await expect(authService.generateTokens(mockUser)).rejects.toThrow(
        new AppError('JWT secrets not configured', 500),
      );
    });
  });

  describe('refreshToken', () => {
    const refreshToken = 'refresh-token';
    const mockSession = {
      id: 'session-123',
      userId: mockUser.id,
      token: 'old-access-token',
      refreshToken,
      expiresAt: new Date(Date.now() + 86400000), // 1 day from now
      createdAt: new Date(),
      user: mockUser,
    };

    it('should refresh token successfully', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({ userId: mockUser.id, type: 'refresh' });
      mockPrisma.session.findUnique.mockResolvedValue(mockSession);
      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce('new-access-token')
        .mockReturnValueOnce('new-refresh-token');
      mockPrisma.session.delete.mockResolvedValue(mockSession);
      mockPrisma.session.create.mockResolvedValue({
        id: 'new-session-123',
        userId: mockUser.id,
        token: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await authService.refreshToken(refreshToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(mockJwt.verify).toHaveBeenCalledWith(refreshToken, mockEnvironment.JWT_REFRESH_SECRET);
      expect(mockPrisma.session.delete).toHaveBeenCalledWith({ where: { id: mockSession.id } });
    });

    it('should throw error for invalid refresh token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        new AuthenticationError('Invalid refresh token'),
      );
    });

    it('should throw error for non-existent session', async () => {
      (mockJwt.verify as jest.Mock).mockReturnValue({ userId: mockUser.id, type: 'refresh' });
      mockPrisma.session.findUnique.mockResolvedValue(null);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        new AuthenticationError('Invalid or expired refresh token'),
      );
    });

    it('should throw error for expired session', async () => {
      const expiredSession = { ...mockSession, expiresAt: new Date(Date.now() - 86400000) };
      (mockJwt.verify as jest.Mock).mockReturnValue({ userId: mockUser.id, type: 'refresh' });
      mockPrisma.session.findUnique.mockResolvedValue(expiredSession);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        new AuthenticationError('Invalid or expired refresh token'),
      );
    });

    it('should throw error for inactive user', async () => {
      const inactiveUserSession = { ...mockSession, user: { ...mockUser, isActive: false } };
      (mockJwt.verify as jest.Mock).mockReturnValue({ userId: mockUser.id, type: 'refresh' });
      mockPrisma.session.findUnique.mockResolvedValue(inactiveUserSession);

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        new AuthenticationError('Account is deactivated'),
      );
    });

    it('should throw error when JWT refresh secret not configured', async () => {
      process.env.JWT_REFRESH_SECRET = '';

      await expect(authService.refreshToken(refreshToken)).rejects.toThrow(
        new AppError('JWT refresh secret not configured', 500),
      );
    });
  });

  describe('verifyToken', () => {
    const accessToken = 'access-token';

    it('should verify token successfully', async () => {
      const jwtPayload = {
        userId: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        organizationId: mockUser.organizationId,
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(jwtPayload);
      userServiceInstance.getUserById.mockResolvedValue(mockUser);

      const result = await authService.verifyToken(accessToken);

      expect(result).toEqual(mockUser);
      expect(mockJwt.verify).toHaveBeenCalledWith(accessToken, mockEnvironment.JWT_SECRET);
      expect(userServiceInstance.getUserById).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw error for invalid token', async () => {
      mockJwt.verify.mockImplementation(() => {
        throw new jwt.JsonWebTokenError('Invalid token');
      });

      await expect(authService.verifyToken(accessToken)).rejects.toThrow(
        new AuthenticationError('Invalid token'),
      );
    });

    it('should throw error for non-existent user', async () => {
      const jwtPayload = { userId: 'nonexistent-user' };
      (mockJwt.verify as jest.Mock).mockReturnValue(jwtPayload);
      userServiceInstance.getUserById.mockResolvedValue(null);

      await expect(authService.verifyToken(accessToken)).rejects.toThrow(
        new AuthenticationError('Invalid token'),
      );
    });

    it('should throw error for inactive user', async () => {
      const jwtPayload = { userId: mockUser.id };
      const inactiveUser = { ...mockUser, isActive: false };

      (mockJwt.verify as jest.Mock).mockReturnValue(jwtPayload);
      userServiceInstance.getUserById.mockResolvedValue(inactiveUser);

      await expect(authService.verifyToken(accessToken)).rejects.toThrow(
        new AuthenticationError('Invalid token'),
      );
    });

    it('should throw error when JWT secret not configured', async () => {
      process.env.JWT_SECRET = '';

      await expect(authService.verifyToken(accessToken)).rejects.toThrow(
        new AppError('JWT secret not configured', 500),
      );
    });
  });

  describe('setupTOTP', () => {
    const userId = 'user-123';
    const appName = 'TestApp';

    it('should setup TOTP successfully', async () => {
      const mockSecret = {
        base32: 'SECRET123',
        otpauth_url: 'otpauth://totp/TestApp%20(test@example.com)?secret=SECRET123&issuer=TestApp',
      };

      userServiceInstance.getUserById.mockResolvedValue(mockUser);
      mockSpeakeasy.generateSecret.mockReturnValue(mockSecret as any);
      (mockQrcode.toDataURL as jest.Mock<any>).mockResolvedValue('data:image/png;base64,qrcode');
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, totpSecret: mockSecret.base32 });

      const result = await authService.setupTOTP(userId, appName);

      expect(result.secret).toBe(mockSecret.base32);
      expect(result.qrCodeUrl).toBe('data:image/png;base64,qrcode');
      expect(result.manualEntryKey).toBe(mockSecret.base32);

      expect(mockSpeakeasy.generateSecret).toHaveBeenCalledWith({
        name: `${appName} (${mockUser.email})`,
        issuer: appName,
        length: 32,
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { totpSecret: mockSecret.base32 },
      });
    });

    it('should throw error for non-existent user', async () => {
      userServiceInstance.getUserById.mockResolvedValue(null);

      await expect(authService.setupTOTP(userId)).rejects.toThrow(
        new AppError('User not found', 404),
      );
    });

    it('should throw error if TOTP already enabled', async () => {
      const totpEnabledUser = { ...mockUser, totpEnabled: true };
      userServiceInstance.getUserById.mockResolvedValue(totpEnabledUser);

      await expect(authService.setupTOTP(userId)).rejects.toThrow(
        new ValidationError('TOTP is already enabled for this user'),
      );
    });
  });

  describe('enableTOTP', () => {
    const userId = 'user-123';
    const totpCode = '123456';

    it('should enable TOTP successfully', async () => {
      const userWithSecret = { ...mockUser, totpSecret: 'SECRET123' };
      userServiceInstance.getUserById.mockResolvedValue(userWithSecret);
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      mockPrisma.user.update.mockResolvedValue({ ...userWithSecret, totpEnabled: true });

      await authService.enableTOTP(userId, totpCode);

      expect(mockSpeakeasy.totp.verify).toHaveBeenCalledWith({
        secret: 'SECRET123',
        encoding: 'base32',
        token: totpCode,
        window: 2,
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { totpEnabled: true },
      });
    });

    it('should throw error for non-existent user', async () => {
      userServiceInstance.getUserById.mockResolvedValue(null);

      await expect(authService.enableTOTP(userId, totpCode)).rejects.toThrow(
        new AppError('User not found', 404),
      );
    });

    it('should throw error if TOTP setup not initiated', async () => {
      const userWithoutSecret = { ...mockUser, totpSecret: null };
      userServiceInstance.getUserById.mockResolvedValue(userWithoutSecret);

      await expect(authService.enableTOTP(userId, totpCode)).rejects.toThrow(
        new ValidationError('TOTP setup not initiated'),
      );
    });

    it('should throw error if TOTP already enabled', async () => {
      const totpEnabledUser = { ...mockUser, totpEnabled: true, totpSecret: 'SECRET123' };
      userServiceInstance.getUserById.mockResolvedValue(totpEnabledUser);

      await expect(authService.enableTOTP(userId, totpCode)).rejects.toThrow(
        new ValidationError('TOTP is already enabled'),
      );
    });

    it('should throw error for invalid TOTP code', async () => {
      const userWithSecret = { ...mockUser, totpSecret: 'SECRET123' };
      userServiceInstance.getUserById.mockResolvedValue(userWithSecret);
      mockSpeakeasy.totp.verify.mockReturnValue(false);

      await expect(authService.enableTOTP(userId, totpCode)).rejects.toThrow(
        new ValidationError('Invalid TOTP code'),
      );
    });
  });

  describe('disableTOTP', () => {
    const userId = 'user-123';
    const password = 'password123';

    it('should disable TOTP successfully', async () => {
      const totpEnabledUser = { ...mockUser, totpEnabled: true, totpSecret: 'SECRET123' };
      userServiceInstance.getUserById.mockResolvedValue(totpEnabledUser);
      userServiceInstance.verifyPassword.mockResolvedValue(totpEnabledUser);
      mockPrisma.user.update.mockResolvedValue({
        ...totpEnabledUser,
        totpEnabled: false,
        totpSecret: null,
      });

      await authService.disableTOTP(userId, password);

      expect(userServiceInstance.verifyPassword).toHaveBeenCalledWith(
        totpEnabledUser.email,
        password,
      );
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          totpEnabled: false,
          totpSecret: null,
        },
      });
    });

    it('should throw error for non-existent user', async () => {
      userServiceInstance.getUserById.mockResolvedValue(null);

      await expect(authService.disableTOTP(userId, password)).rejects.toThrow(
        new AppError('User not found', 404),
      );
    });

    it('should throw error if TOTP not enabled', async () => {
      const userWithoutTOTP = { ...mockUser, totpEnabled: false };
      userServiceInstance.getUserById.mockResolvedValue(userWithoutTOTP);

      await expect(authService.disableTOTP(userId, password)).rejects.toThrow(
        new ValidationError('TOTP is not enabled'),
      );
    });

    it('should throw error for invalid password', async () => {
      const totpEnabledUser = { ...mockUser, totpEnabled: true };
      userServiceInstance.getUserById.mockResolvedValue(totpEnabledUser);
      userServiceInstance.verifyPassword.mockResolvedValue(null);

      await expect(authService.disableTOTP(userId, password)).rejects.toThrow(
        new AuthenticationError('Invalid password'),
      );
    });
  });

  describe('logout', () => {
    const refreshToken = 'refresh-token';

    it('should logout successfully', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await authService.logout(refreshToken);

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { refreshToken },
      });
    });
  });

  describe('logoutAll', () => {
    const userId = 'user-123';

    it('should logout from all devices successfully', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 3 });

      await authService.logoutAll(userId);

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });

  describe('generatePasswordResetToken', () => {
    const email = 'test@example.com';

    it('should generate password reset token for existing user', async () => {
      userServiceInstance.findByEmail.mockResolvedValue(mockUser);
      mockCrypto.generateSecureToken.mockReturnValue('reset-token-123');
      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.generatePasswordResetToken(email);

      expect(result).toBe('reset-token-123');
      expect(userServiceInstance.findByEmail).toHaveBeenCalledWith(email);
      expect(mockCrypto.generateSecureToken).toHaveBeenCalledWith(32);
    });

    it('should return generic response for non-existent user', async () => {
      userServiceInstance.findByEmail.mockResolvedValue(null);

      const result = await authService.generatePasswordResetToken(email);

      expect(result).toBe('token-generated');
      expect(mockCrypto.generateSecureToken).not.toHaveBeenCalled();
    });
  });

  describe('validateSession', () => {
    const sessionToken = 'session-token';

    it('should validate session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        userId: mockUser.id,
        token: sessionToken,
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 86400000), // 1 day from now
        createdAt: new Date(),
        user: mockUser,
      };

      mockPrisma.session.findUnique.mockResolvedValue(mockSession);

      const result = await authService.validateSession(sessionToken);

      expect(result).toEqual(mockUser);
      expect(mockPrisma.session.findUnique).toHaveBeenCalledWith({
        where: { token: sessionToken },
        include: { user: true },
      });
    });

    it('should return null for non-existent session', async () => {
      mockPrisma.session.findUnique.mockResolvedValue(null);

      const result = await authService.validateSession(sessionToken);

      expect(result).toBeNull();
    });

    it('should return null for expired session', async () => {
      const expiredSession = {
        id: 'session-123',
        userId: mockUser.id,
        token: sessionToken,
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
        createdAt: new Date(),
        user: mockUser,
      };

      mockPrisma.session.findUnique.mockResolvedValue(expiredSession);

      const result = await authService.validateSession(sessionToken);

      expect(result).toBeNull();
    });
  });

  describe('getUserSessions', () => {
    const userId = 'user-123';

    it('should get user sessions successfully', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          userId: mockUser.id,
          createdAt: new Date('2023-01-01'),
          expiresAt: new Date('2023-01-08'),
          token: 'long-session-token-1',
          refreshToken: 'refresh-token-1',
        },
        {
          id: 'session-2',
          userId: mockUser.id,
          createdAt: new Date('2023-01-02'),
          expiresAt: new Date('2023-01-09'),
          token: 'long-session-token-2',
          refreshToken: 'refresh-token-2',
        },
      ];

      mockPrisma.session.findMany.mockResolvedValue(mockSessions);

      const result = await authService.getUserSessions(userId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'session-1',
        createdAt: new Date('2023-01-01'),
        expiresAt: new Date('2023-01-08'),
        tokenPreview: 'long-ses...',
      });

      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        where: { userId },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          token: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('revokeSession', () => {
    const userId = 'user-123';
    const sessionId = 'session-123';

    it('should revoke session successfully', async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await authService.revokeSession(userId, sessionId);

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          id: sessionId,
          userId,
        },
      });
    });
  });
});
