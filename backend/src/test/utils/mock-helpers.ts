/**
 * Shared test mock helpers with proper TypeScript typing
 */

import type { User, UserRole } from '@prisma/client';

/**
 * Creates a properly typed mock User object with all required fields
 */
export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-123',
  email: 'test@example.com',
  passwordHash: 'hashed-password',
  fullName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: null,
  lastActiveAt: null,
  role: 'MEMBER' as UserRole,
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

/**
 * Helper to properly type Prisma mock methods
 * Usage: mockPrismaMethod(prismaMock.user.findUnique).mockResolvedValue(user);
 */
export function mockPrismaMethod<T extends jest.Mock>(mock: T): T {
  return mock;
}
