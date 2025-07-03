import type { PrismaClient, ActionType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { IRequestContext } from '../interfaces/context.interface';
import type { TransactionPrismaClient } from '../types/prisma.types';
import { webhookService } from './webhook.service';
import type { AuditCreatedPayload } from '../types/webhook-payloads';

export const BULK_OPERATION_RECORD_ID = 'BULK_OPERATION';

export interface IAuditLogData {
  context: IRequestContext;
  model: string;
  recordId: string;
  action: ActionType;
  oldValue?: any;
  newValue?: any;
}

export interface IBulkAuditLogData {
  context: IRequestContext;
  action: ActionType; // Now uses proper ActionType (UPDATE_MANY, DELETE_MANY)
  model: string;
  details: any; // Contains the where clause and data for bulk operations
}

/**
 * Service for handling audit trail logging with transactional support.
 * Follows the Service-Level Contextual Auditing pattern for reliable audit trails.
 */
export class AuditService {
  constructor() {}

  /**
   * Log a single record change to the audit trail.
   * Accepts either the main PrismaClient or a TransactionPrismaClient
   * for use within transactions.
   */
  async log(prisma: PrismaClient | TransactionPrismaClient, logData: IAuditLogData): Promise<void> {
    const auditRecord = await prisma.auditTrail.create({
      data: {
        model: logData.model,
        recordId: logData.recordId,
        action: logData.action,
        oldValue: logData.oldValue ?? Prisma.JsonNull,
        newValue: logData.newValue ?? Prisma.JsonNull,
        userId: logData.context.userId,
      },
    });

    // Emit webhook event for audit trail creation
    try {
      const payload: AuditCreatedPayload = {
        audit: {
          id: auditRecord.id,
          model: auditRecord.model,
          recordId: auditRecord.recordId,
          action: auditRecord.action,
          userId: auditRecord.userId,
          timestamp: auditRecord.createdAt,
        },
        user: {
          id: logData.context.userId,
          email: '', // Will be populated by createEnhancedEvent
          name: '', // Will be populated by createEnhancedEvent
          role: logData.context.userRole || 'VIEWER',
        },
        changes:
          logData.oldValue || logData.newValue
            ? {
                oldValue: logData.oldValue,
                newValue: logData.newValue,
              }
            : undefined,
        affectedEntity: {
          type: logData.model,
          id: logData.recordId,
        },
      };

      const enhancedEvent = await webhookService.createEnhancedEvent(
        'audit.created',
        logData.context.organizationId,
        logData.context.userId,
        payload,
      );

      await webhookService.emitEvent(enhancedEvent);
    } catch (error) {
      // Log but don't fail the audit operation
      console.error('Failed to emit audit webhook event:', error);
    }
  }

  /**
   * Log bulk operations that don't track individual record changes.
   * This logs the intent of the bulk operation rather than each individual change.
   */
  async logBulk(
    prisma: PrismaClient | TransactionPrismaClient,
    logData: IBulkAuditLogData,
  ): Promise<void> {
    await prisma.auditTrail.create({
      data: {
        model: logData.model,
        recordId: BULK_OPERATION_RECORD_ID,
        action: logData.action, // Now uses proper ActionType (UPDATE_MANY, DELETE_MANY)
        oldValue: Prisma.JsonNull,
        newValue: {
          details: logData.details,
        },
        userId: logData.context.userId,
      },
    });
  }

  /**
   * Query audit trail entries with filtering support.
   * This method uses the main PrismaClient for read operations.
   */
  async queryAuditTrail(
    prisma: PrismaClient,
    filters: {
      model?: string;
      recordId?: string;
      userId?: string;
      action?: ActionType;
      fromDate?: Date;
      toDate?: Date;
    },
    pagination: {
      page: number;
      limit: number;
    } = { page: 1, limit: 50 },
  ) {
    const where: any = {};

    if (filters.model) where.model = filters.model;
    if (filters.recordId) where.recordId = filters.recordId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = filters.fromDate;
      if (filters.toDate) where.createdAt.lte = filters.toDate;
    }

    const skip = (pagination.page - 1) * pagination.limit;

    const [entries, total] = await Promise.all([
      prisma.auditTrail.findMany({
        where,
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
        skip,
        take: pagination.limit,
      }),
      prisma.auditTrail.count({ where }),
    ]);

    return {
      entries,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }
}
