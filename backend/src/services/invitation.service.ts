import { prisma } from '../lib/prisma';
import { encryptionService } from './encryption.service';
import { addNotificationJob } from '../lib/queue';
import { logger } from '../utils/logger';
import type { UserRole, InvitationStatus } from '@prisma/client';

export interface CreateInvitationData {
  organizationId: string;
  email: string;
  role: UserRole;
  invitedByUserId: string;
  expirationHours?: number; // Default: 72 hours
}

export interface AcceptInvitationData {
  token: string;
  fullName: string;
  password: string;
}

export class InvitationService {
  private readonly defaultExpirationHours = 72; // 3 days

  /**
   * Create a new user invitation
   */
  async createInvitation(data: CreateInvitationData) {
    const { organizationId, email, role, invitedByUserId, expirationHours } = data;

    try {
      // Check if user already exists in the organization
      const existingUser = await prisma.user.findFirst({
        where: {
          email: email.toLowerCase(),
          organizationId,
        },
      });

      if (existingUser) {
        throw new Error('User is already a member of this organization');
      }

      // Check if there's already a pending invitation
      const existingInvitation = await prisma.userInvitation.findFirst({
        where: {
          email: email.toLowerCase(),
          organizationId,
          status: 'PENDING',
        },
      });

      if (existingInvitation) {
        throw new Error('A pending invitation already exists for this email');
      }

      // Generate secure token
      const token = encryptionService.generateSecureToken(48);

      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (expirationHours || this.defaultExpirationHours));

      // Create invitation
      const invitation = await prisma.userInvitation.create({
        data: {
          organizationId,
          email: email.toLowerCase(),
          role,
          invitedByUserId,
          token,
          expiresAt,
        },
        include: {
          organization: true,
          invitedBy: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });

      // Queue invitation email
      await addNotificationJob({
        type: 'invitation',
        organizationId,
        data: {
          email: invitation.email,
          invitedByName: invitation.invitedBy.fullName || invitation.invitedBy.email,
          organizationName: invitation.organization.name,
          role: invitation.role,
          invitationToken: token,
          expiresAt: invitation.expiresAt.toISOString(),
        },
      });

      logger.info('User invitation created', {
        invitationId: invitation.id,
        email: invitation.email,
        organizationId,
        invitedBy: invitedByUserId,
      });

      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };
    } catch (error) {
      logger.error('Failed to create invitation', error instanceof Error ? error : undefined, {
        email,
        organizationId,
        invitedBy: invitedByUserId,
      });
      throw error;
    }
  }

  /**
   * Accept an invitation and create the user account
   */
  async acceptInvitation(data: AcceptInvitationData) {
    const { token, fullName, password } = data;

    try {
      // Find the invitation
      const invitation = await prisma.userInvitation.findUnique({
        where: { token },
        include: {
          organization: true,
        },
      });

      if (!invitation) {
        throw new Error('Invalid invitation token');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Invitation has already been processed');
      }

      if (invitation.expiresAt < new Date()) {
        await this.expireInvitation(invitation.id);
        throw new Error('Invitation has expired');
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          email: invitation.email,
          organizationId: invitation.organizationId,
        },
      });

      if (existingUser) {
        throw new Error('User already exists in this organization');
      }

      // Hash password
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user and mark invitation as accepted in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create the user
        const user = await tx.user.create({
          data: {
            email: invitation.email,
            passwordHash,
            fullName,
            role: invitation.role,
            organizationId: invitation.organizationId,
            emailVerified: true, // Auto-verify for invited users
            isActive: true,
            notificationPreferences: {
              emailNotifications: true,
              taskReminders: true,
              warrantyAlerts: true,
            },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            organizationId: true,
            emailVerified: true,
            isActive: true,
            createdAt: true,
          },
        });

        // Mark invitation as accepted
        await tx.userInvitation.update({
          where: { id: invitation.id },
          data: {
            status: 'ACCEPTED',
            acceptedAt: new Date(),
          },
        });

        return user;
      });

      // Queue welcome notification
      await addNotificationJob({
        type: 'welcome-user',
        userId: result.id,
        organizationId: result.organizationId,
        data: {
          email: result.email,
          name: result.fullName,
          organizationName: invitation.organization.name,
        },
      });

      logger.info('User invitation accepted', {
        invitationId: invitation.id,
        userId: result.id,
        email: result.email,
        organizationId: result.organizationId,
      });

      return result;
    } catch (error) {
      logger.error('Failed to accept invitation', error instanceof Error ? error : undefined, {
        token: token.substring(0, 8) + '...', // Log partial token for debugging
      });
      throw error;
    }
  }

  /**
   * Get invitation details by token (for invitation page)
   */
  async getInvitationByToken(token: string) {
    try {
      const invitation = await prisma.userInvitation.findUnique({
        where: { token },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          invitedBy: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Invitation is no longer valid');
      }

      if (invitation.expiresAt < new Date()) {
        await this.expireInvitation(invitation.id);
        throw new Error('Invitation has expired');
      }

      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        organization: invitation.organization,
        invitedBy: invitation.invitedBy,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      };
    } catch (error) {
      logger.error('Failed to get invitation by token', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * List invitations for an organization
   */
  async getOrganizationInvitations(
    organizationId: string,
    options?: {
      status?: InvitationStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    const { status, limit = 50, offset = 0 } = options || {};

    try {
      const where: any = { organizationId };
      if (status) {
        where.status = status;
      }

      const [invitations, total] = await Promise.all([
        prisma.userInvitation.findMany({
          where,
          include: {
            invitedBy: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        prisma.userInvitation.count({ where }),
      ]);

      return {
        invitations: invitations.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          invitedBy: inv.invitedBy,
          expiresAt: inv.expiresAt,
          acceptedAt: inv.acceptedAt,
          createdAt: inv.createdAt,
        })),
        total,
        hasMore: offset + invitations.length < total,
      };
    } catch (error) {
      logger.error(
        'Failed to get organization invitations',
        error instanceof Error ? error : undefined,
        {
          organizationId,
        },
      );
      throw error;
    }
  }

  /**
   * Cancel/revoke an invitation
   */
  async cancelInvitation(invitationId: string, cancelledByUserId: string) {
    try {
      const invitation = await prisma.userInvitation.findUnique({
        where: { id: invitationId },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Cannot cancel non-pending invitation');
      }

      await prisma.userInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date(),
        },
      });

      logger.info('Invitation cancelled', {
        invitationId,
        email: invitation.email,
        cancelledBy: cancelledByUserId,
      });

      return { success: true };
    } catch (error) {
      logger.error('Failed to cancel invitation', error instanceof Error ? error : undefined, {
        invitationId,
        cancelledBy: cancelledByUserId,
      });
      throw error;
    }
  }

  /**
   * Resend an invitation (creates new token and extends expiration)
   */
  async resendInvitation(invitationId: string, resentByUserId: string) {
    try {
      const invitation = await prisma.userInvitation.findUnique({
        where: { id: invitationId },
        include: {
          organization: true,
          invitedBy: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new Error('Invitation not found');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Cannot resend non-pending invitation');
      }

      // Generate new token and extend expiration
      const newToken = encryptionService.generateSecureToken(48);
      const newExpiresAt = new Date();
      newExpiresAt.setHours(newExpiresAt.getHours() + this.defaultExpirationHours);

      const updatedInvitation = await prisma.userInvitation.update({
        where: { id: invitationId },
        data: {
          token: newToken,
          expiresAt: newExpiresAt,
          updatedAt: new Date(),
        },
      });

      // Queue new invitation email
      await addNotificationJob({
        type: 'invitation',
        organizationId: invitation.organizationId,
        data: {
          email: invitation.email,
          invitedByName: invitation.invitedBy.fullName || invitation.invitedBy.email,
          organizationName: invitation.organization.name,
          role: invitation.role,
          invitationToken: newToken,
          expiresAt: updatedInvitation.expiresAt.toISOString(),
          isResend: true,
        },
      });

      logger.info('Invitation resent', {
        invitationId,
        email: invitation.email,
        resentBy: resentByUserId,
      });

      return {
        id: updatedInvitation.id,
        expiresAt: updatedInvitation.expiresAt,
      };
    } catch (error) {
      logger.error('Failed to resend invitation', error instanceof Error ? error : undefined, {
        invitationId,
        resentBy: resentByUserId,
      });
      throw error;
    }
  }

  /**
   * Clean up expired invitations (called by maintenance worker)
   */
  async cleanupExpiredInvitations() {
    try {
      const result = await prisma.userInvitation.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: {
            lt: new Date(),
          },
        },
        data: {
          status: 'EXPIRED',
          updatedAt: new Date(),
        },
      });

      logger.info('Cleaned up expired invitations', {
        count: result.count,
      });

      return { expired: result.count };
    } catch (error) {
      logger.error(
        'Failed to cleanup expired invitations',
        error instanceof Error ? error : undefined,
      );
      throw error;
    }
  }

  /**
   * Mark a specific invitation as expired
   */
  private async expireInvitation(invitationId: string) {
    await prisma.userInvitation.update({
      where: { id: invitationId },
      data: {
        status: 'EXPIRED',
        updatedAt: new Date(),
      },
    });
  }
}

// Export singleton instance
export const invitationService = new InvitationService();
