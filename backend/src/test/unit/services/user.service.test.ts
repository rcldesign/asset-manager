import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { UserService } from '../../../services/user.service';
import { UserRole } from '@prisma/client';
import { prismaMock } from '../../prisma-singleton';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

// Type the mocked bcrypt correctly
const bcrypt = require('bcrypt');
const mockBcrypt = bcrypt as {
  hash: jest.MockedFunction<typeof bcrypt.hash>;
  compare: jest.MockedFunction<typeof bcrypt.compare>;
};

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  describe('createUser', () => {
    test('should create a user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        fullName: 'Test User',
        organizationId: 'org-123',
        role: UserRole.MEMBER,
      };

      const hashedPassword = 'hashed-password';
      mockBcrypt.hash.mockResolvedValue(hashedPassword);

      const createdUser = {
        id: 'user-123',
        email: userData.email,
        passwordHash: hashedPassword,
        fullName: userData.fullName,
        role: userData.role,
        organizationId: userData.organizationId,
        emailVerified: false,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: userData.organizationId,
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.organization.findUnique.mockResolvedValue({
        id: userData.organizationId,
        name: 'Test Organization',
        ownerUserId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prismaMock.user.create.mockResolvedValue(createdUser);

      const result = await userService.createUser(userData);

      expect(result).toEqual(createdUser);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email.toLowerCase() },
      });
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          email: userData.email.toLowerCase(),
          passwordHash: hashedPassword,
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
        },
        include: {
          organization: true,
        },
      });
      expect(mockBcrypt.hash).toHaveBeenCalledWith(userData.password, 12);
    });

    test('should throw error if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        fullName: 'Test User',
        organizationId: 'org-123',
      };

      prismaMock.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        email: userData.email,
        passwordHash: 'hashed',
        fullName: userData.fullName,
        role: UserRole.MEMBER,
        organizationId: userData.organizationId,
        emailVerified: false,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(userService.createUser(userData)).rejects.toThrow(
        'User with this email already exists',
      );
    });

    test('should throw error if organization does not exist', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        organizationId: 'non-existent-org',
      };

      prismaMock.user.findUnique.mockResolvedValue(null);
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(userService.createUser(userData)).rejects.toThrow('Organization not found');
    });
  });

  describe('getUserById', () => {
    test('should return user if found', async () => {
      const userId = 'user-123';
      const user = {
        id: userId,
        email: 'test@example.com',
        passwordHash: 'hashed',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId: 'org-123',
        emailVerified: true,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      prismaMock.user.findUnique.mockResolvedValue(user);

      const result = await userService.getUserById(userId);

      expect(result).toEqual(user);
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: {
          organization: true,
        },
      });
    });

    test('should return null if user not found', async () => {
      const userId = 'non-existent';
      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await userService.getUserById(userId);

      expect(result).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    test('should return user if password is valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId: 'org-123',
        emailVerified: true,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      prismaMock.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);

      const result = await userService.verifyPassword(email, password);

      expect(result).toEqual(user);
      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, user.passwordHash);
    });

    test('should return null if password is invalid', async () => {
      const email = 'test@example.com';
      const password = 'wrong-password';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId: 'org-123',
        emailVerified: true,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      prismaMock.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(false);

      const result = await userService.verifyPassword(email, password);

      expect(result).toBeNull();
    });

    test('should return null if user not found', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      prismaMock.user.findUnique.mockResolvedValue(null);

      const result = await userService.verifyPassword(email, password);

      expect(result).toBeNull();
    });

    test('should return null if user is inactive', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId: 'org-123',
        emailVerified: true,
        isActive: false, // User is inactive
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      prismaMock.user.findUnique.mockResolvedValue(user);

      const result = await userService.verifyPassword(email, password);

      expect(result).toBeNull();
    });
  });

  describe('updatePassword', () => {
    test('should update password successfully', async () => {
      const userId = 'user-123';
      const currentPassword = 'oldpassword';
      const newPassword = 'newpassword';
      const user = {
        id: userId,
        email: 'test@example.com',
        passwordHash: 'old-hashed-password',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId: 'org-123',
        emailVerified: true,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(true);
      mockBcrypt.hash.mockResolvedValue('new-hashed-password');
      prismaMock.user.update.mockResolvedValue({
        ...user,
        passwordHash: 'new-hashed-password',
      });

      await userService.updatePassword(userId, currentPassword, newPassword);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: 'new-hashed-password' },
      });
    });

    test('should throw error if current password is incorrect', async () => {
      const userId = 'user-123';
      const currentPassword = 'wrongpassword';
      const newPassword = 'newpassword';
      const user = {
        id: userId,
        email: 'test@example.com',
        passwordHash: 'old-hashed-password',
        fullName: 'Test User',
        role: UserRole.MEMBER,
        organizationId: 'org-123',
        emailVerified: true,
        isActive: true,
        totpEnabled: false,
        totpSecret: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.user.findUnique.mockResolvedValue(user);
      mockBcrypt.compare.mockResolvedValue(false);

      await expect(
        userService.updatePassword(userId, currentPassword, newPassword),
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('findByOrganization', () => {
    test('should return paginated users', async () => {
      const organizationId = 'org-123';
      const users = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          passwordHash: 'hashed',
          fullName: 'User 1',
          role: UserRole.MEMBER,
          organizationId,
          emailVerified: true,
          isActive: true,
          totpEnabled: false,
          totpSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          passwordHash: 'hashed',
          fullName: 'User 2',
          role: UserRole.MEMBER,
          organizationId,
          emailVerified: true,
          isActive: true,
          totpEnabled: false,
          totpSecret: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      prismaMock.user.findMany.mockResolvedValue(users);
      prismaMock.user.count.mockResolvedValue(2);

      const result = await userService.findByOrganization(organizationId);

      expect(result).toEqual({ users, total: 2 });
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        skip: undefined,
        take: undefined,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('generateApiToken', () => {
    test('should generate and hash API token', async () => {
      const userId = 'user-123';
      const name = 'Test Token';
      const apiToken = {
        id: 'token-123',
        userId,
        name,
        token: 'hashed-token',
        expiresAt: null,
        lastUsed: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockBcrypt.hash.mockResolvedValue('hashed-token');
      prismaMock.apiToken.create.mockResolvedValue(apiToken);

      const result = await userService.generateApiToken(userId, name);

      expect(result).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64-like pattern
      expect(prismaMock.apiToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          name,
          token: 'hashed-token',
          expiresAt: undefined,
        },
      });
    });
  });

  describe('validateApiToken', () => {
    test('should return user if token is valid', async () => {
      const token = 'valid-token';
      const apiTokens = [
        {
          id: 'token-123',
          userId: 'user-123',
          name: 'Test Token',
          token: 'hashed-token',
          expiresAt: null,
          lastUsed: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: 'user-123',
            email: 'test@example.com',
            passwordHash: 'hashed',
            fullName: 'Test User',
            role: UserRole.MEMBER,
            organizationId: 'org-123',
            emailVerified: true,
            isActive: true,
            totpEnabled: false,
            totpSecret: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            organization: {
              id: 'org-123',
              name: 'Test Organization',
              ownerUserId: 'owner-123',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        },
      ];

      prismaMock.apiToken.findMany.mockResolvedValue(apiTokens);
      mockBcrypt.compare.mockResolvedValue(true);
      prismaMock.apiToken.update.mockResolvedValue(apiTokens[0]!);

      const result = await userService.validateApiToken(token);

      expect(result).toEqual(apiTokens[0]!.user);
      expect(prismaMock.apiToken.update).toHaveBeenCalledWith({
        where: { id: 'token-123' },
        data: { lastUsed: expect.any(Date) },
      });
    });

    test('should return null if token is invalid', async () => {
      const token = 'invalid-token';
      const apiTokens = [
        {
          id: 'token-123',
          userId: 'user-123',
          name: 'Test Token',
          token: 'hashed-token',
          expiresAt: null,
          lastUsed: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          user: {
            id: 'user-123',
            email: 'test@example.com',
            passwordHash: 'hashed',
            fullName: 'Test User',
            role: UserRole.MEMBER,
            organizationId: 'org-123',
            emailVerified: true,
            isActive: true,
            totpEnabled: false,
            totpSecret: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            organization: {
              id: 'org-123',
              name: 'Test Organization',
              ownerUserId: 'owner-123',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        },
      ];

      prismaMock.apiToken.findMany.mockResolvedValue(apiTokens);
      mockBcrypt.compare.mockResolvedValue(false);

      const result = await userService.validateApiToken(token);

      expect(result).toBeNull();
    });
  });
});
