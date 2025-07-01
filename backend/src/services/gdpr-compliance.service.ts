import { prisma } from '../lib/prisma';
import { AppError, NotFoundError, ForbiddenError } from '../utils/errors';
import { IRequestContext } from '../interfaces/context.interface';
import { TransactionPrismaClient } from '../types/prisma.types';
import { AuditService } from './audit.service';
import { ActionType } from '@prisma/client';
import { dataExportService } from './data-export.service';
import { webhookService } from './webhook.service';
import type { GDPRExportRequestedPayload, GDPRDeletionRequestedPayload } from '../types/webhook-payloads';
import * as crypto from 'crypto';

export interface GDPRRequest {
  type: 'export' | 'delete' | 'anonymize';
  userId: string;
  requestedBy: string;
  reason?: string;
  verificationToken?: string;
}

export interface DataExportRequest extends GDPRRequest {
  type: 'export';
  format?: 'json' | 'csv';
  includeFiles?: boolean;
}

export interface DataDeletionRequest extends GDPRRequest {
  type: 'delete' | 'anonymize';
  keepAuditTrail?: boolean;
  confirmationRequired?: boolean;
}

export interface GDPRRequestResult {
  requestId: string;
  status: 'pending' | 'completed' | 'failed';
  type: string;
  userId: string;
  completedAt?: Date;
  exportPath?: string;
  details?: any;
}

export interface AnonymizationConfig {
  preserveStructure: boolean;
  anonymizeFields: string[];
  deleteFields: string[];
}

/**
 * Service for handling GDPR compliance requests including data export,
 * deletion, and anonymization with proper audit trails.
 */
export class GDPRComplianceService {
  private auditService: AuditService;
  private pendingRequests: Map<string, GDPRRequest> = new Map();

  constructor() {
    this.auditService = new AuditService();
  }

  /**
   * Generate a verification token for GDPR requests
   */
  generateVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Initiate a GDPR request (requires verification)
   */
  async initiateRequest(
    context: IRequestContext,
    request: GDPRRequest
  ): Promise<{ requestId: string; verificationRequired: boolean }> {
    // Verify the user exists and belongs to the organization
    const user = await prisma.user.findFirst({
      where: {
        id: request.userId,
        organizationId: context.organizationId,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    // Check permissions - only the user themselves or an admin can make requests
    if (context.userId !== request.userId && context.userRole !== 'OWNER' && context.userRole !== 'MANAGER') {
      throw new ForbiddenError('You can only request GDPR actions for your own account');
    }

    const requestId = crypto.randomBytes(16).toString('hex');
    this.pendingRequests.set(requestId, request);

    // Log the request initiation
    await this.auditService.log(prisma, {
      context,
      model: 'User',
      recordId: request.userId,
      action: ActionType.CREATE,
      newValue: {
        type: 'GDPR_REQUEST_INITIATED',
        requestType: request.type,
        requestId,
        requestedBy: request.requestedBy,
        reason: request.reason,
      },
    });

    // For sensitive operations, require email verification
    const verificationRequired = request.type === 'delete' || request.type === 'anonymize';

    if (verificationRequired) {
      // In a real implementation, send verification email here
      // For now, we'll just note it in the response
    }

    return {
      requestId,
      verificationRequired,
    };
  }

  /**
   * Process a verified GDPR request
   */
  async processRequest(
    context: IRequestContext,
    requestId: string,
    verificationToken?: string
  ): Promise<GDPRRequestResult> {
    const request = this.pendingRequests.get(requestId);
    
    if (!request) {
      throw new NotFoundError('GDPR request');
    }

    // For delete/anonymize, verify the token
    if ((request.type === 'delete' || request.type === 'anonymize') && 
        request.verificationToken !== verificationToken) {
      throw new ForbiddenError('Invalid verification token');
    }

    let result: GDPRRequestResult;

    try {
      switch (request.type) {
        case 'export':
          result = await this.processExportRequest(context, request);
          break;
        case 'delete':
          result = await this.processDeleteRequest(context, request);
          break;
        case 'anonymize':
          result = await this.processAnonymizeRequest(context, request);
          break;
        default:
          throw new AppError(`Unknown GDPR request type: ${request.type}`, 400);
      }

      // Clean up the pending request
      this.pendingRequests.delete(requestId);

      return result;
    } catch (error) {
      // Log the failure
      await this.auditService.log(prisma, {
        context,
        model: 'User',
        recordId: request.userId,
        action: ActionType.UPDATE,
        newValue: {
          type: 'GDPR_REQUEST_FAILED',
          requestType: request.type,
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }

  /**
   * Process data export request
   */
  private async processExportRequest(
    context: IRequestContext,
    request: GDPRRequest
  ): Promise<GDPRRequestResult> {
    const exportResult = await dataExportService.exportUserData(context, request.userId);

    await this.auditService.log(prisma, {
      context,
      model: 'User',
      recordId: request.userId,
      action: ActionType.UPDATE,
      newValue: {
        type: 'GDPR_EXPORT_COMPLETED',
        exportPath: exportResult.filePath,
        recordCount: exportResult.recordCount,
      },
    });

    // Emit webhook event for GDPR export
    try {
      const payload: GDPRExportRequestedPayload = {
        request: {
          id: crypto.randomBytes(16).toString('hex'),
          userId: request.userId,
          requestedAt: new Date(),
          status: 'completed'
        },
        requestedBy: {
          id: context.userId,
          email: '', // Will be populated by createEnhancedEvent
          name: '',  // Will be populated by createEnhancedEvent
          role: context.userRole || 'VIEWER'
        },
        dataCategories: [
          'profile',
          'tasks',
          'comments',
          'attachments',
          'activities',
          'sessions'
        ]
      };

      const enhancedEvent = await webhookService.createEnhancedEvent(
        'gdpr.export_requested',
        context.organizationId,
        context.userId,
        payload
      );

      await webhookService.emitEvent(enhancedEvent);
    } catch (error) {
      console.error('Failed to emit GDPR export webhook event:', error);
    }

    return {
      requestId: crypto.randomBytes(16).toString('hex'),
      status: 'completed',
      type: 'export',
      userId: request.userId,
      completedAt: new Date(),
      exportPath: exportResult.filePath,
      details: {
        fileName: exportResult.fileName,
        format: exportResult.format,
      },
    };
  }

  /**
   * Process data deletion request
   */
  private async processDeleteRequest(
    context: IRequestContext,
    request: GDPRRequest
  ): Promise<GDPRRequestResult> {
    // Use a transaction to ensure all data is deleted atomically
    const deletedData = await prisma.$transaction(async (tx: TransactionPrismaClient) => {
      const counts = {
        taskComments: 0,
        taskAssignments: 0,
        taskAttachments: 0,
        sessions: 0,
        apiTokens: 0,
        notifications: 0,
        activities: 0,
        calendarIntegrations: 0,
        pushSubscriptions: 0,
      };

      // Delete task comments
      const taskComments = await tx.taskComment.deleteMany({
        where: { userId: request.userId },
      });
      counts.taskComments = taskComments.count;

      // Delete task assignments
      const taskAssignments = await tx.taskAssignment.deleteMany({
        where: { userId: request.userId },
      });
      counts.taskAssignments = taskAssignments.count;

      // Delete task attachments
      const taskAttachments = await tx.taskAttachment.deleteMany({
        where: { uploadedByUserId: request.userId },
      });
      counts.taskAttachments = taskAttachments.count;

      // Delete sessions
      const sessions = await tx.session.deleteMany({
        where: { userId: request.userId },
      });
      counts.sessions = sessions.count;

      // Delete API tokens
      const apiTokens = await tx.apiToken.deleteMany({
        where: { userId: request.userId },
      });
      counts.apiTokens = apiTokens.count;

      // Delete notifications
      const notifications = await tx.notification.deleteMany({
        where: { userId: request.userId },
      });
      counts.notifications = notifications.count;

      // Delete activity streams
      const activities = await tx.activityStream.deleteMany({
        where: { userId: request.userId },
      });
      counts.activities = activities.count;

      // Delete calendar integrations
      const calendarIntegrations = await tx.calendarIntegration.deleteMany({
        where: { userId: request.userId },
      });
      counts.calendarIntegrations = calendarIntegrations.count;

      // Delete push subscriptions
      const pushSubscriptions = await tx.pushSubscription.deleteMany({
        where: { userId: request.userId },
      });
      counts.pushSubscriptions = pushSubscriptions.count;

      // Finally, delete the user
      await tx.user.delete({
        where: { id: request.userId },
      });

      // Log the deletion in audit trail (before deletion completes)
      await this.auditService.log(tx, {
        context,
        model: 'User',
        recordId: request.userId,
        action: ActionType.DELETE,
        oldValue: {
          type: 'GDPR_USER_DELETED',
          deletedRecords: counts,
          reason: request.reason,
          requestedBy: request.requestedBy,
        },
        newValue: null,
      });

      return counts;
    });

    // Emit webhook event for GDPR deletion
    try {
      const payload: GDPRDeletionRequestedPayload = {
        request: {
          id: crypto.randomBytes(16).toString('hex'),
          userId: request.userId,
          requestedAt: new Date(),
          status: 'completed',
          scheduledDeletionDate: new Date()
        },
        requestedBy: {
          id: context.userId,
          email: '', // Will be populated by createEnhancedEvent
          name: '',  // Will be populated by createEnhancedEvent
          role: context.userRole || 'VIEWER'
        },
        affectedData: {
          assets: 0, // User deletion doesn't delete assets, just removes associations
          tasks: deletedData.taskAssignments,
          comments: deletedData.taskComments,
          attachments: deletedData.taskAttachments
        }
      };

      const enhancedEvent = await webhookService.createEnhancedEvent(
        'gdpr.deletion_requested',
        context.organizationId,
        context.userId,
        payload
      );

      await webhookService.emitEvent(enhancedEvent);
    } catch (error) {
      console.error('Failed to emit GDPR deletion webhook event:', error);
    }

    return {
      requestId: crypto.randomBytes(16).toString('hex'),
      status: 'completed',
      type: 'delete',
      userId: request.userId,
      completedAt: new Date(),
      details: {
        deletedRecords: deletedData,
        permanent: true,
      },
    };
  }

  /**
   * Process data anonymization request
   */
  private async processAnonymizeRequest(
    context: IRequestContext,
    request: GDPRRequest
  ): Promise<GDPRRequestResult> {
    const anonymizationConfig: AnonymizationConfig = {
      preserveStructure: true,
      anonymizeFields: ['email', 'fullName', 'totpSecret'],
      deleteFields: ['passwordHash', 'googleCredentials'],
    };

    const result = await prisma.$transaction(async (tx: TransactionPrismaClient) => {
      // Generate anonymous identifiers
      const anonymousId = `anon_${crypto.randomBytes(8).toString('hex')}`;
      const anonymousEmail = `${anonymousId}@anonymized.local`;
      
      // Update user record
      await tx.user.update({
        where: { id: request.userId },
        data: {
          email: anonymousEmail,
          fullName: 'Anonymous User',
          passwordHash: null,
          totpSecret: null,
          emailVerified: false,
          isActive: false,
        },
      });

      // Anonymize task comments
      await tx.taskComment.updateMany({
        where: { userId: request.userId },
        data: {
          content: '[Content removed for privacy]',
        },
      });

      // Delete sensitive sessions and tokens
      await tx.session.deleteMany({
        where: { userId: request.userId },
      });

      await tx.apiToken.deleteMany({
        where: { userId: request.userId },
      });

      // Delete calendar integrations (contain tokens)
      await tx.calendarIntegration.deleteMany({
        where: { userId: request.userId },
      });

      // Delete push subscriptions
      await tx.pushSubscription.deleteMany({
        where: { userId: request.userId },
      });

      // Log the anonymization
      await this.auditService.log(tx, {
        context,
        model: 'User',
        recordId: request.userId,
        action: ActionType.UPDATE,
        oldValue: {
          type: 'GDPR_USER_ANONYMIZED',
          reason: request.reason,
          requestedBy: request.requestedBy,
        },
        newValue: {
          anonymousId,
          preservedData: ['tasks', 'assets', 'basic_activity'],
        },
      });

      return {
        anonymousId,
        fieldsAnonymized: anonymizationConfig.anonymizeFields,
        fieldsDeleted: anonymizationConfig.deleteFields,
      };
    });

    return {
      requestId: crypto.randomBytes(16).toString('hex'),
      status: 'completed',
      type: 'anonymize',
      userId: request.userId,
      completedAt: new Date(),
      details: result,
    };
  }

  /**
   * Get the status of a GDPR request
   */
  async getRequestStatus(requestId: string): Promise<GDPRRequest | null> {
    return this.pendingRequests.get(requestId) || null;
  }

  /**
   * Get data retention policy information
   */
  getDataRetentionPolicy(): Record<string, any> {
    return {
      userData: {
        retentionPeriod: '3 years after account closure',
        deletionMethod: 'Complete removal from all systems',
        exceptions: ['Legal holds', 'Regulatory requirements'],
      },
      activityLogs: {
        retentionPeriod: '1 year',
        deletionMethod: 'Automatic purge',
        anonymization: 'User identifiers replaced after 6 months',
      },
      backups: {
        retentionPeriod: '30 days',
        deletionMethod: 'Rotation with complete overwrite',
        note: 'Deleted data may persist in backups for up to 30 days',
      },
      exports: {
        retentionPeriod: '7 days',
        deletionMethod: 'Automatic cleanup',
        note: 'User exports are automatically deleted after download',
      },
    };
  }

  /**
   * Generate a GDPR compliance report for the organization
   */
  async generateComplianceReport(
    context: IRequestContext,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    // Only admins can generate compliance reports
    if (context.userRole !== 'OWNER' && context.userRole !== 'MANAGER') {
      throw new ForbiddenError('Only administrators can generate compliance reports');
    }

    // Query audit trails for GDPR-related actions
    const gdprActions = await prisma.auditTrail.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        OR: [
          { newValue: { path: ['type'], equals: 'GDPR_REQUEST_INITIATED' } },
          { newValue: { path: ['type'], equals: 'GDPR_EXPORT_COMPLETED' } },
          { newValue: { path: ['type'], equals: 'GDPR_USER_DELETED' } },
          { newValue: { path: ['type'], equals: 'GDPR_USER_ANONYMIZED' } },
          { newValue: { path: ['type'], equals: 'GDPR_REQUEST_FAILED' } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Summarize the actions
    const summary = {
      totalRequests: 0,
      exportRequests: 0,
      deletionRequests: 0,
      anonymizationRequests: 0,
      failedRequests: 0,
      averageProcessingTime: 0,
    };

    const requestsByUser = new Map<string, number>();
    const requestsByType = new Map<string, number>();

    gdprActions.forEach(action => {
      const actionType = action.newValue as any;
      const type = actionType?.type || '';

      if (type.includes('INITIATED')) {
        summary.totalRequests++;
        const requestType = actionType?.requestType || 'unknown';
        requestsByType.set(requestType, (requestsByType.get(requestType) || 0) + 1);
        
        if (requestType === 'export') summary.exportRequests++;
        if (requestType === 'delete') summary.deletionRequests++;
        if (requestType === 'anonymize') summary.anonymizationRequests++;
      }

      if (type.includes('FAILED')) {
        summary.failedRequests++;
      }

      const userId = action.userId;
      requestsByUser.set(userId, (requestsByUser.get(userId) || 0) + 1);
    });

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      summary,
      requestsByUser: Array.from(requestsByUser.entries()).map(([userId, count]) => ({
        userId,
        count,
      })),
      requestsByType: Array.from(requestsByType.entries()).map(([type, count]) => ({
        type,
        count,
      })),
      recentActions: gdprActions.slice(0, 50), // Last 50 actions
      dataRetentionPolicy: this.getDataRetentionPolicy(),
      generatedAt: new Date(),
    };
  }
}

export const gdprComplianceService = new GDPRComplianceService();