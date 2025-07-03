import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { UserRole } from '@prisma/client';

// Enable automatic mocking for Prisma
jest.mock('../../../lib/prisma');
jest.mock('bcrypt');
jest.mock('../../../utils/crypto');
jest.mock('../../../lib/queue', () => ({
  emailQueue: { add: jest.fn() },
  notificationQueue: { add: jest.fn() },
  maintenanceQueue: { add: jest.fn() },
  reportQueue: { add: jest.fn() },
  scheduleQueue: { add: jest.fn() },
  activityQueue: { add: jest.fn() },
  pushNotificationQueue: { add: jest.fn() },
  webhookQueue: { add: jest.fn() },
  syncQueue: { add: jest.fn() },
  addEmailJob: jest.fn(),
  addNotificationJob: jest.fn(),
  addMaintenanceJob: jest.fn(),
  addReportJob: jest.fn(),
  addScheduleJob: jest.fn(),
  addActivityJob: jest.fn(),
  addPushNotificationJob: jest.fn(),
  addWebhookJob: jest.fn(),
  addSyncJob: jest.fn(),
}));
jest.mock('../../../lib/redis', () => ({
  getRedis: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
  })),
  createRedisConnection: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
  })),
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
  redisClient: {
    on: jest.fn(),
    connect: jest.fn(),
    quit: jest.fn(),
  },
}));
jest.mock('crypto', () => {
  const actual = jest.requireActual('crypto') as any;
  return {
    ...actual,
    createHash: jest.fn(() => ({
      update: jest.fn(() => ({
        digest: jest.fn(() => 'sha256-hash'),
      })),
    })),
  };
});

// Import modules after mocking
import { UserService } from '../../../services/user.service';
import { prisma } from '../../../lib/prisma';
import * as crypto from '../../../utils/crypto';

// Type the mocked modules
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;

// Helper function to create a mock user with all required fields
const createMockUser = (overrides: Partial<any> = {}) => ({
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  fullName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  lastActiveAt: null,
  role: UserRole.MEMBER,
  organizationId: 'org-123',
  emailVerified: true,
  isActive: true,
  totpEnabled: false,
  totpSecret: null,
  notificationPreferences: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Simplified test to check if Prisma mock works without other mocks
describe('Prisma Mock Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('prisma should be defined and mockable', async () => {
    expect(mockPrisma).toBeDefined();
    expect(mockPrisma.user).toBeDefined();
    expect(mockPrisma.user.findUnique).toBeDefined();

    // Try to mock a simple response
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const result = await mockPrisma.user.findUnique({ where: { id: 'test' } });
    expect(result).toBeNull();
  });

  test('service should use the same prisma instance as our mock', async () => {
    // Import the service's prisma module to verify it's the same as our mock
    const { prisma: servicePrisma } = await import('../../../lib/prisma');
    expect(servicePrisma).toBe(mockPrisma);
    expect(servicePrisma.organization.findUnique).toBe(mockPrisma.organization.findUnique);
  });
});

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set up crypto mocks
    mockCrypto.generateSecureToken.mockReturnValue('ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12wx34yz56');
    
    // Reset mock calls
    jest.clearAllMocks();
    
    userService = new UserService(mockPrisma);
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
      const orgData = {
        id: userData.organizationId,
        name: 'Test Organization',
        ownerUserId: 'owner-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createdUser = {
        ...createMockUser({
          email: userData.email,
          passwordHash: hashedPassword,
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
          emailVerified: false,
        }),
        organization: orgData,
      };

      // Set up mocks for crypto functions
      mockCrypto.generateSecureToken.mockReturnValue('ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12wx34yz56');

      // Use jest.spyOn instead of direct mocking
      jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue(null as any);
      jest.spyOn(mockPrisma.organization, 'findUnique').mockResolvedValue(orgData as any);
      jest.spyOn(mockPrisma.user, 'create').mockResolvedValue(createdUser as any);
      
      const result = await userService.createUser(userData);

      expect(result).toEqual(createdUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email.toLowerCase() },
      });
      
      // Check that user.create was called
      expect(mockPrisma.user.create).toHaveBeenCalled();
      const createCall = (mockPrisma.user.create as jest.Mock).mock.calls[0]?.[0] as any;
      
      // Check the structure of the call
      expect(createCall).toBeDefined();
      expect(createCall).toMatchObject({
        data: {
          email: userData.email.toLowerCase(),
          fullName: userData.fullName,
          role: userData.role,
          organizationId: userData.organizationId,
        },
        include: {
          organization: true,
        },
      });
      
      // Check that a password hash was created (should be our mocked value)
      expect(createCall.data.passwordHash).toBe('$2b$12$mocked-hash-value');
    });

    test('should throw error if user already exists', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        fullName: 'Test User',
        organizationId: 'org-123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(
        createMockUser({
          id: 'existing-user',
          email: userData.email,
          passwordHash: 'hashed',
          fullName: userData.fullName,
          organizationId: userData.organizationId,
          emailVerified: false,
        }),
      );
      // Even though user exists, we still need org mock in case it gets called
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: userData.organizationId,
        name: 'Test Organization',
        ownerUserId: 'owner-123',
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

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(userService.createUser(userData)).rejects.toThrow('Organization not found');
    });
  });

  describe('getUserById', () => {
    test('should return user if found', async () => {
      const userId = 'user-123';
      const user = {
        ...createMockUser({ id: userId }),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await userService.getUserById(userId);

      expect(result).toEqual(user);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        include: {
          organization: true,
        },
      });
    });

    test('should return null if user not found', async () => {
      const userId = 'non-existent';
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.getUserById(userId);

      expect(result).toBeNull();
    });
  });

  describe('verifyPassword', () => {
    test('should return user if password is valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        ...createMockUser({
          email,
          passwordHash: 'hashed-password',
        }),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await userService.verifyPassword(email, password);

      expect(result).toEqual(user);
    });

    test('should return null if password is invalid', async () => {
      const email = 'test@example.com';
      const password = 'wrong-password';
      const user = {
        ...createMockUser({
          email,
          passwordHash: 'hashed-password',
        }),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await userService.verifyPassword(email, password);

      expect(result).toBeNull();
    });

    test('should return null if user not found', async () => {
      const email = 'nonexistent@example.com';
      const password = 'password123';

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await userService.verifyPassword(email, password);

      expect(result).toBeNull();
    });

    test('should return null if user is inactive', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        ...createMockUser({
          email,
          passwordHash: 'hashed-password',
          isActive: false, // User is inactive
        }),
        organization: {
          id: 'org-123',
          name: 'Test Organization',
          ownerUserId: 'owner-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await userService.verifyPassword(email, password);

      expect(result).toBeNull();
    });
  });

  describe('updatePassword', () => {
    test('should update password successfully', async () => {
      const userId = 'user-123';
      const currentPassword = 'oldpassword';
      const newPassword = 'newpassword';
      const user = createMockUser({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'old-hashed-password',
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockResolvedValue({
        ...user,
        passwordHash: '$2b$12$mocked-hash-value',
      });

      await userService.updatePassword(userId, currentPassword, newPassword);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { passwordHash: '$2b$12$mocked-hash-value' },
      });
    });

    test('should throw error if current password is incorrect', async () => {
      const userId = 'user-123';
      const currentPassword = 'wrongpassword';
      const newPassword = 'newpassword';
      const user = createMockUser({
        id: userId,
        email: 'test@example.com',
        passwordHash: 'old-hashed-password',
      });

      mockPrisma.user.findUnique.mockResolvedValue(user);

      await expect(
        userService.updatePassword(userId, currentPassword, newPassword),
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('findByOrganization', () => {
    test('should return paginated users', async () => {
      const organizationId = 'org-123';
      const users = [
        createMockUser({
          id: 'user-1',
          email: 'user1@example.com',
          fullName: 'User 1',
          organizationId,
        }),
        createMockUser({
          id: 'user-2',
          email: 'user2@example.com',
          fullName: 'User 2',
          organizationId,
        }),
      ];

      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(2);

      const result = await userService.findByOrganization(organizationId);

      expect(result).toEqual({ users, total: 2 });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
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
        tokenPrefix: 'testpref',
        expiresAt: null,
        lastUsed: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.apiToken.create.mockResolvedValue(apiToken);

      const result = await userService.generateApiToken(userId, name);

      expect(result).toMatch(/^[A-Za-z0-9+/=]+$/); // Base64-like pattern
      expect(mockPrisma.apiToken.create).toHaveBeenCalledWith({
        data: {
          userId,
          name,
          token: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hash
          tokenPrefix: expect.stringMatching(/^.{8}$/), // 8 character prefix
          expiresAt: undefined,
        },
      });
    });
  });

  describe('validateApiToken', () => {
    test('should return user if token is valid', async () => {
      const token = 'valid-token';
      const apiToken = {
        id: 'token-123',
        userId: 'user-123',
        name: 'Test Token',
        token: 'sha256-hash', // This should match what our mocked crypto returns
        tokenPrefix: 'testpref',
        expiresAt: null,
        lastUsed: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          ...createMockUser({
            id: 'user-123',
            email: 'test@example.com',
            organizationId: 'org-123',
          }),
          organization: {
            id: 'org-123',
            name: 'Test Organization',
            ownerUserId: 'owner-123',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      };

      mockPrisma.apiToken.findFirst.mockResolvedValue(apiToken);
      mockPrisma.apiToken.update.mockResolvedValue(apiToken);

      const result = await userService.validateApiToken(token);

      expect(result).toEqual(apiToken.user);
      expect(mockPrisma.apiToken.findFirst).toHaveBeenCalledWith({
        where: {
          token: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hash
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
        include: {
          user: {
            include: {
              organization: true,
            },
          },
        },
      });
      expect(mockPrisma.apiToken.update).toHaveBeenCalledWith({
        where: { id: 'token-123' },
        data: { lastUsed: expect.any(Date) },
      });
    });

    test('should return null if token is invalid', async () => {
      const token = 'invalid-token';

      mockPrisma.apiToken.findFirst.mockResolvedValue(null);
      mockPrisma.apiToken.findMany
        .mockResolvedValueOnce([]) // First call for tokenPrefix
        .mockResolvedValueOnce([]); // Second call for null tokenPrefix fallback

      const result = await userService.validateApiToken(token);

      expect(result).toBeNull();
      expect(mockPrisma.apiToken.findFirst).toHaveBeenCalledWith({
        where: {
          token: expect.stringMatching(/^[a-f0-9]{64}$/), // SHA-256 hash
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
        include: {
          user: {
            include: {
              organization: true,
            },
          },
        },
      });
      // Should try bcrypt fallback with tokenPrefix first, then null tokenPrefix
      expect(mockPrisma.apiToken.findMany).toHaveBeenCalledTimes(2);
    });
  });
});
