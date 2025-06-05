import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  hashPassword,
  verifyPassword,
  generateTOTPSecret,
  verifyTOTPToken,
  isValidEmail,
  validatePasswordStrength,
  generateApiToken,
  hashApiToken,
} from '../utils/auth';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
} from '../utils/errors';
import { logger } from '../utils/logger';

export interface CreateUserData {
  email: string;
  password?: string; // Optional for OIDC-only users
  fullName?: string;
  role?: UserRole;
  organizationId: string;
}

export interface UpdateUserData {
  email?: string;
  fullName?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export interface CreateApiTokenData {
  name: string;
  expiresAt?: Date;
}

export class UserService {
  /**
   * Create a new user
   */
  async createUser(data: CreateUserData): Promise<{
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    organizationId: string;
    emailVerified: boolean;
    totpEnabled: boolean;
    isActive: boolean;
    createdAt: Date;
  }> {
    try {
      // Validate email
      if (!isValidEmail(data.email)) {
        throw new ValidationError('Invalid email format');
      }

      // Validate password if provided
      if (data.password) {
        const passwordValidation = validatePasswordStrength(data.password);
        if (!passwordValidation.isValid) {
          throw new ValidationError('Password requirements not met', {
            feedback: passwordValidation.feedback,
          });
        }
      }

      // Validate organization exists
      const organization = await prisma.organization.findUnique({
        where: { id: data.organizationId },
      });

      if (!organization) {
        throw new NotFoundError('Organization', data.organizationId);
      }

      // Hash password if provided
      const passwordHash = data.password ? await hashPassword(data.password) : null;

      const user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash,
          fullName: data.fullName?.trim() || null,
          role: data.role || UserRole.MEMBER,
          organizationId: data.organizationId,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          organizationId: true,
          emailVerified: true,
          totpEnabled: true,
          isActive: true,
          createdAt: true,
        },
      });

      logger.info('User created', {
        userId: user.id,
        email: user.email,
        organizationId: user.organizationId,
        role: user.role,
      });

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictError('Email already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(id: string): Promise<{
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    organizationId: string;
    emailVerified: boolean;
    totpEnabled: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        organizationId: true,
        emailVerified: true,
        totpEnabled: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<{
    id: string;
    email: string;
    passwordHash: string | null;
    fullName: string | null;
    role: UserRole;
    organizationId: string;
    totpSecret: string | null;
    totpEnabled: boolean;
    emailVerified: boolean;
    isActive: boolean;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        role: true,
        organizationId: true,
        totpSecret: true,
        totpEnabled: true,
        emailVerified: true,
        isActive: true,
      },
    });

    return user;
  }

  /**
   * Update user
   */
  async updateUser(
    id: string,
    data: UpdateUserData,
    requestingUserId?: string,
  ): Promise<{
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    isActive: boolean;
    updatedAt: Date;
  }> {
    try {
      // Get current user data for authorization checks
      const currentUser = await this.getUserById(id);
      if (!currentUser) {
        throw new NotFoundError('User', id);
      }

      // Authorization check: users can only update themselves, unless they're admin/owner
      if (requestingUserId && requestingUserId !== id) {
        const requestingUser = await this.getUserById(requestingUserId);
        if (
          !requestingUser ||
          requestingUser.organizationId !== currentUser.organizationId ||
          !['OWNER', 'MANAGER'].includes(requestingUser.role)
        ) {
          throw new AuthorizationError('Insufficient permissions to update this user');
        }

        // Only owners can change roles or activate/deactivate users
        if (
          (data.role !== undefined || data.isActive !== undefined) &&
          requestingUser.role !== 'OWNER'
        ) {
          throw new AuthorizationError('Only organization owners can change user roles or status');
        }
      }

      // Validate email if provided
      if (data.email && !isValidEmail(data.email)) {
        throw new ValidationError('Invalid email format');
      }

      const updateData: Prisma.UserUpdateInput = {};
      if (data.email !== undefined) {
        updateData.email = data.email.toLowerCase().trim();
      }
      if (data.fullName !== undefined) {
        updateData.fullName = data.fullName?.trim() || null;
      }
      if (data.role !== undefined) {
        updateData.role = data.role;
      }
      if (data.isActive !== undefined) {
        updateData.isActive = data.isActive;
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          updatedAt: true,
        },
      });

      logger.info('User updated', {
        userId: id,
        changes: Object.keys(data),
        updatedBy: requestingUserId,
      });

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundError('User', id);
        }
        if (error.code === 'P2002') {
          throw new ConflictError('Email already exists');
        }
      }
      throw error;
    }
  }

  /**
   * Authenticate user with email and password
   */
  async authenticateUser(
    email: string,
    password: string,
    totpToken?: string,
  ): Promise<{
    id: string;
    email: string;
    fullName: string | null;
    role: UserRole;
    organizationId: string;
    requiresTwoFactor: boolean;
  }> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Account is deactivated');
    }

    if (!user.passwordHash) {
      throw new AuthenticationError('Password authentication not available for this account');
    }

    // Verify password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid credentials');
    }

    // Check 2FA if enabled
    if (user.totpEnabled) {
      if (!totpToken) {
        return {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          organizationId: user.organizationId,
          requiresTwoFactor: true,
        };
      }

      if (!user.totpSecret) {
        throw new AuthenticationError('2FA configuration error');
      }

      const isTotpValid = verifyTOTPToken(totpToken, user.totpSecret);
      if (!isTotpValid) {
        throw new AuthenticationError('Invalid 2FA code');
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId: user.organizationId,
      requiresTwoFactor: false,
    };
  }

  /**
   * Change user password
   */
  async changePassword(userId: string, data: ChangePasswordData): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (!user.passwordHash) {
      throw new ValidationError('Password authentication not available for this account');
    }

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = validatePasswordStrength(data.newPassword);
    if (!passwordValidation.isValid) {
      throw new ValidationError('New password requirements not met', {
        feedback: passwordValidation.feedback,
      });
    }

    // Hash and update password
    const newPasswordHash = await hashPassword(data.newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    logger.info('User password changed', { userId });
  }

  /**
   * Setup 2FA for user
   */
  async setupTwoFactor(
    userId: string,
    userEmail: string,
  ): Promise<{
    secret: string;
    qrCodeUrl: string;
    manualEntryKey: string;
  }> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.totpEnabled) {
      throw new ValidationError('2FA is already enabled for this user');
    }

    const totpSecret = generateTOTPSecret(userEmail);

    // Store the secret but don't enable 2FA yet (user needs to verify)
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: totpSecret.secret },
    });

    logger.info('2FA setup initiated', { userId });

    return totpSecret;
  }

  /**
   * Enable 2FA after verification
   */
  async enableTwoFactor(userId: string, totpToken: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (user.totpEnabled) {
      throw new ValidationError('2FA is already enabled');
    }

    if (!user.totpSecret) {
      throw new ValidationError('2FA setup not initiated. Please setup 2FA first.');
    }

    // Verify the TOTP token
    const isTokenValid = verifyTOTPToken(totpToken, user.totpSecret);
    if (!isTokenValid) {
      throw new AuthenticationError('Invalid 2FA code');
    }

    // Enable 2FA
    await prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });

    logger.info('2FA enabled', { userId });
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactor(userId: string, totpToken: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabled: true },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (!user.totpEnabled) {
      throw new ValidationError('2FA is not enabled');
    }

    if (!user.totpSecret) {
      throw new ValidationError('2FA configuration error');
    }

    // Verify the TOTP token before disabling
    const isTokenValid = verifyTOTPToken(totpToken, user.totpSecret);
    if (!isTokenValid) {
      throw new AuthenticationError('Invalid 2FA code');
    }

    // Disable 2FA and remove secret
    await prisma.user.update({
      where: { id: userId },
      data: {
        totpEnabled: false,
        totpSecret: null,
      },
    });

    logger.info('2FA disabled', { userId });
  }

  /**
   * Create API token for user
   */
  async createApiToken(
    userId: string,
    data: CreateApiTokenData,
  ): Promise<{
    id: string;
    name: string;
    token: string; // Plain token returned only once
    expiresAt: Date | null;
  }> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }

    if (!user.isActive) {
      throw new ValidationError('Cannot create API token for inactive user');
    }

    // Generate token
    const plainToken = generateApiToken();
    const hashedToken = hashApiToken(plainToken);

    const apiToken = await prisma.apiToken.create({
      data: {
        userId,
        name: data.name.trim(),
        token: hashedToken,
        expiresAt: data.expiresAt || null,
      },
      select: {
        id: true,
        name: true,
        expiresAt: true,
      },
    });

    logger.info('API token created', {
      userId,
      tokenId: apiToken.id,
      tokenName: apiToken.name,
    });

    return {
      ...apiToken,
      token: plainToken,
    };
  }

  /**
   * Get user's API tokens
   */
  async getUserApiTokens(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      lastUsed: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
    }>
  > {
    const tokens = await prisma.apiToken.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return tokens;
  }

  /**
   * Delete API token
   */
  async deleteApiToken(userId: string, tokenId: string): Promise<void> {
    const token = await prisma.apiToken.findFirst({
      where: { id: tokenId, userId },
    });

    if (!token) {
      throw new NotFoundError('API token not found');
    }

    await prisma.apiToken.delete({
      where: { id: tokenId },
    });

    logger.info('API token deleted', { userId, tokenId });
  }

  /**
   * Verify API token and return user
   */
  async verifyApiToken(token: string): Promise<{
    id: string;
    email: string;
    role: UserRole;
    organizationId: string;
    isActive: boolean;
  } | null> {
    const hashedToken = hashApiToken(token);

    const apiToken = await prisma.apiToken.findUnique({
      where: { token: hashedToken },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            organizationId: true,
            isActive: true,
          },
        },
      },
    });

    if (!apiToken || !apiToken.user.isActive) {
      return null;
    }

    // Check if token is expired
    if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp
    await prisma.apiToken.update({
      where: { id: apiToken.id },
      data: { lastUsed: new Date() },
    });

    return apiToken.user;
  }

  /**
   * Delete user account
   */
  async deleteUser(id: string, requestingUserId?: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }

    // Authorization check
    if (requestingUserId && requestingUserId !== id) {
      const requestingUser = await this.getUserById(requestingUserId);
      if (
        !requestingUser ||
        requestingUser.organizationId !== user.organizationId ||
        requestingUser.role !== 'OWNER'
      ) {
        throw new AuthorizationError('Only organization owners can delete users');
      }
    }

    // Cannot delete organization owner
    const organization = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { ownerUserId: true },
    });

    if (organization?.ownerUserId === id) {
      throw new ValidationError('Cannot delete organization owner. Transfer ownership first.');
    }

    await prisma.user.delete({
      where: { id },
    });

    logger.info('User deleted', { userId: id, deletedBy: requestingUserId });
  }
}
