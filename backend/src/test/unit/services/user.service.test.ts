import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UserService } from '../../../services/user.service';
import { PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../utils/errors';
import bcrypt from 'bcrypt';
import speakeasy from 'speakeasy';

// Mock Prisma Client
jest.mock('@prisma/client');
jest.mock('bcrypt');
jest.mock('speakeasy');

const mockPrisma = {
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  apiToken: {
    create: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
} as any;

// Mock bcrypt
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
mockBcrypt.hash = jest.fn();
mockBcrypt.compare = jest.fn();

// Mock speakeasy
const mockSpeakeasy = speakeasy as jest.Mocked<typeof speakeasy>;
mockSpeakeasy.generateSecret = jest.fn();
mockSpeakeasy.totp = jest.fn();
mockSpeakeasy.totp.verify = jest.fn();

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create new instance with mocked prisma
    userService = new UserService();
    (userService as any).prisma = mockPrisma;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createUser', () => {
    test('should create a user with password', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        role: 'MEMBER' as const,
        organizationId: 'org-123',
      };

      const hashedPassword = 'hashed-password';
      const createdUser = {
        id: 'user-123',
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        organizationId: userData.organizationId,
        passwordHash: hashedPassword,
        emailVerified: false,
        totpEnabled: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockBcrypt.hash.mockResolvedValue(hashedPassword);
      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await userService.createUser(userData);

      expect(mockBcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          passwordHash: hashedPassword,
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
          emailVerified: false,
          totpEnabled: false,
          isActive: true,
        },
      });
      expect(result).toEqual(createdUser);
    });

    test('should create a user without password for OIDC', async () => {
      const userData = {
        email: 'test@example.com',
        fullName: 'Test User',
        role: 'MEMBER' as const,
        organizationId: 'org-123',
      };

      const createdUser = {
        id: 'user-123',
        email: userData.email,
        fullName: userData.fullName,
        role: userData.role,
        organizationId: userData.organizationId,
        passwordHash: null,
        emailVerified: true, // OIDC users are pre-verified
        totpEnabled: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.create.mockResolvedValue(createdUser);

      const result = await userService.createUser(userData);

      expect(mockBcrypt.hash).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email,
          passwordHash: null,
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
          emailVerified: true,
          totpEnabled: false,
          isActive: true,
        },
      });
      expect(result).toEqual(createdUser);
    });

    test('should throw validation error for invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'password123',
        organizationId: 'org-123',
      };

      await expect(userService.createUser(userData)).rejects.toThrow(ValidationError);
    });

    test('should throw validation error for weak password', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123', // Too weak
        organizationId: 'org-123',
      };

      await expect(userService.createUser(userData)).rejects.toThrow(ValidationError);
    });
  });

  describe('authenticateUser', () => {
    test('should authenticate user with valid credentials', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        totpEnabled: false,
        isActive: true,
        role: 'MEMBER',
        organizationId: 'org-123',
        fullName: 'Test User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await userService.authenticateUser(email, password);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, user.passwordHash);
      expect(result).toEqual({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        requiresTwoFactor: false,
      });
    });

    test('should require 2FA when enabled', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        totpEnabled: true,
        totpSecret: 'secret',
        isActive: true,
        role: 'MEMBER',
        organizationId: 'org-123',
        fullName: 'Test User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await userService.authenticateUser(email, password);

      expect(result).toEqual({
        requiresTwoFactor: true,
      });
    });

    test('should authenticate with valid 2FA token', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const totpToken = '123456';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        totpEnabled: true,
        totpSecret: 'secret',
        isActive: true,
        role: 'MEMBER',
        organizationId: 'org-123',
        fullName: 'Test User',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);
      mockSpeakeasy.totp.verify.mockReturnValue(true);

      const result = await userService.authenticateUser(email, password, totpToken);

      expect(mockSpeakeasy.totp.verify).toHaveBeenCalledWith({
        secret: user.totpSecret,
        encoding: 'base32',
        token: totpToken,
        window: 2,
      });
      expect(result).toEqual({
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        organizationId: user.organizationId,
        requiresTwoFactor: false,
      });
    });

    test('should throw error for invalid credentials', async () => {
      const email = 'test@example.com';
      const password = 'wrong-password';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.authenticateUser(email, password)).rejects.toThrow(ValidationError);
    });

    test('should throw error for inactive user', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        isActive: false,
        totpEnabled: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(userService.authenticateUser(email, password)).rejects.toThrow(ValidationError);
    });

    test('should throw error for invalid 2FA token', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const totpToken = 'invalid';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        totpEnabled: true,
        totpSecret: 'secret',
        isActive: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);
      mockSpeakeasy.totp.verify.mockReturnValue(false);

      await expect(userService.authenticateUser(email, password, totpToken)).rejects.toThrow(ValidationError);
    });
  });

  describe('setupTwoFactor', () => {
    test('should generate TOTP secret for user', async () => {
      const userId = 'user-123';
      const userEmail = 'test@example.com';
      const secret = 'generated-secret';
      const qrCodeUrl = 'otpauth://totp/...';

      const user = {
        id: userId,
        email: userEmail,
        totpEnabled: false,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockSpeakeasy.generateSecret.mockReturnValue({
        base32: secret,
        otpauth_url: qrCodeUrl,
      });
      mockPrisma.user.update.mockResolvedValue({ ...user, totpSecret: secret });

      const result = await userService.setupTwoFactor(userId, userEmail);

      expect(mockSpeakeasy.generateSecret).toHaveBeenCalledWith({
        name: userEmail,
        issuer: 'DumbAssets Enhanced',
        length: 32,
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { totpSecret: secret },
      });
      expect(result).toEqual({
        secret,
        qrCodeUrl,
        manualEntryKey: secret,
      });
    });

    test('should throw error if user not found', async () => {
      const userId = 'nonexistent';
      const userEmail = 'test@example.com';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(userService.setupTwoFactor(userId, userEmail)).rejects.toThrow(ValidationError);
    });

    test('should throw error if 2FA already enabled', async () => {
      const userId = 'user-123';
      const userEmail = 'test@example.com';

      const user = {
        id: userId,
        email: userEmail,
        totpEnabled: true,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(userService.setupTwoFactor(userId, userEmail)).rejects.toThrow(ValidationError);
    });
  });

  describe('enableTwoFactor', () => {
    test('should enable 2FA with valid token', async () => {
      const userId = 'user-123';
      const totpToken = '123456';

      const user = {
        id: userId,
        totpEnabled: false,
        totpSecret: 'secret',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockSpeakeasy.totp.verify.mockReturnValue(true);
      mockPrisma.user.update.mockResolvedValue({ ...user, totpEnabled: true });

      await userService.enableTwoFactor(userId, totpToken);

      expect(mockSpeakeasy.totp.verify).toHaveBeenCalledWith({
        secret: user.totpSecret,
        encoding: 'base32',
        token: totpToken,
        window: 2,
      });
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { totpEnabled: true },
      });
    });

    test('should throw error for invalid token', async () => {
      const userId = 'user-123';
      const totpToken = 'invalid';

      const user = {
        id: userId,
        totpEnabled: false,
        totpSecret: 'secret',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockSpeakeasy.totp.verify.mockReturnValue(false);

      await expect(userService.enableTwoFactor(userId, totpToken)).rejects.toThrow(ValidationError);
    });
  });

  describe('createApiToken', () => {
    test('should create API token for user', async () => {
      const userId = 'user-123';
      const tokenData = {
        name: 'Test Token',
        expiresAt: new Date('2024-12-31'),
      };

      const createdToken = {
        id: 'token-123',
        name: tokenData.name,
        token: 'generated-token',
        userId,
        expiresAt: tokenData.expiresAt,
        createdAt: new Date(),
      };

      mockPrisma.apiToken.create.mockResolvedValue(createdToken);

      const result = await userService.createApiToken(userId, tokenData);

      expect(mockPrisma.apiToken.create).toHaveBeenCalledWith({
        data: {
          name: tokenData.name,
          token: expect.any(String),
          userId,
          expiresAt: tokenData.expiresAt,
        },
      });
      expect(result).toEqual(createdToken);
      expect(result.token).toMatch(/^[a-zA-Z0-9_-]+$/); // Base64 URL pattern
    });

    test('should create API token without expiration', async () => {
      const userId = 'user-123';
      const tokenData = {
        name: 'Permanent Token',
      };

      const createdToken = {
        id: 'token-123',
        name: tokenData.name,
        token: 'generated-token',
        userId,
        expiresAt: null,
        createdAt: new Date(),
      };

      mockPrisma.apiToken.create.mockResolvedValue(createdToken);

      const result = await userService.createApiToken(userId, tokenData);

      expect(mockPrisma.apiToken.create).toHaveBeenCalledWith({
        data: {
          name: tokenData.name,
          token: expect.any(String),
          userId,
          expiresAt: undefined,
        },
      });
      expect(result).toEqual(createdToken);
    });
  });

  describe('changePassword', () => {
    test('should change password with valid current password', async () => {
      const userId = 'user-123';
      const passwordData = {
        currentPassword: 'old-password',
        newPassword: 'new-password',
      };

      const user = {
        id: userId,
        passwordHash: 'old-hashed-password',
      };

      const newHashedPassword = 'new-hashed-password';

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);
      mockBcrypt.hash.mockResolvedValue(newHashedPassword);

      await userService.changePassword(userId, passwordData);

      expect(mockBcrypt.compare).toHaveBeenCalledWith(passwordData.currentPassword, user.passwordHash);
      expect(mockBcrypt.hash).toHaveBeenCalledWith(passwordData.newPassword, 12);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: newHashedPassword },
      });
    });

    test('should throw error for invalid current password', async () => {
      const userId = 'user-123';
      const passwordData = {
        currentPassword: 'wrong-password',
        newPassword: 'new-password',
      };

      const user = {
        id: userId,
        passwordHash: 'old-hashed-password',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(false);

      await expect(userService.changePassword(userId, passwordData)).rejects.toThrow(ValidationError);
    });
  });
});