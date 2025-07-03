/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Prisma } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * Prisma middleware to automatically track sync metadata for entities
 * This middleware intercepts create, update, and delete operations
 * and maintains version tracking for offline sync
 */
export const syncMiddleware: Prisma.Middleware = async (params, next) => {
  const syncableModels = ['asset', 'task', 'schedule', 'location'];
  const model = params.model?.toLowerCase();

  // Check if this is a syncable model
  if (!model || !syncableModels.includes(model)) {
    return next(params);
  }

  // Handle different operations
  switch (params.action) {
    case 'create':
      return handleCreate(params, next);

    case 'update':
    case 'updateMany':
      return handleUpdate(params, next);

    case 'delete':
    case 'deleteMany':
      return handleDelete(params, next);

    case 'upsert':
      return handleUpsert(params, next);

    default:
      return next(params);
  }
};

/**
 * Handle create operations
 */
async function handleCreate(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
): Promise<unknown> {
  const result = await next(params);

  if (result && typeof result === 'object' && 'id' in result && params.model) {
    // Create sync metadata for new entity
    await createSyncMetadata(
      params.model,
      (result as { id: string }).id,
      (params.args?.data as Record<string, unknown>) || {},
    );
  }

  return result;
}

/**
 * Handle update operations
 */
async function handleUpdate(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
): Promise<unknown> {
  // Get the entity ID(s) before update
  const entityIds = await getEntityIds(params);

  // Perform the update
  const result = await next(params);

  // Update sync metadata for each affected entity
  if (entityIds.length > 0 && params.model) {
    for (const entityId of entityIds) {
      await updateSyncMetadata(
        params.model,
        entityId,
        (params.args?.data as Record<string, unknown>) || {},
      );
    }
  }

  return result;
}

/**
 * Handle delete operations
 */
async function handleDelete(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
): Promise<unknown> {
  // Get the entity ID(s) before deletion
  const entityIds = await getEntityIds(params);

  // Perform the deletion
  const result = await next(params);

  // Mark sync metadata as deleted
  if (entityIds.length > 0 && params.model) {
    for (const entityId of entityIds) {
      await markSyncMetadataDeleted(params.model, entityId);
    }
  }

  return result;
}

/**
 * Handle upsert operations
 */
async function handleUpsert(
  params: Prisma.MiddlewareParams,
  next: (params: Prisma.MiddlewareParams) => Promise<unknown>,
): Promise<unknown> {
  const result = await next(params);

  if (result && typeof result === 'object' && 'id' in result && params.model) {
    const resultWithId = result as { id: string };
    // Check if this was a create or update
    const existingMetadata = await getSyncMetadata(params.model, resultWithId.id);

    if (existingMetadata) {
      await updateSyncMetadata(
        params.model,
        resultWithId.id,
        (params.args?.create as Record<string, unknown>) ||
          (params.args?.update as Record<string, unknown>) ||
          {},
      );
    } else {
      await createSyncMetadata(
        params.model,
        resultWithId.id,
        (params.args?.create as Record<string, unknown>) ||
          (params.args?.update as Record<string, unknown>) ||
          {},
      );
    }
  }

  return result;
}

/**
 * Get entity IDs that will be affected by the operation
 */
async function getEntityIds(params: Prisma.MiddlewareParams): Promise<string[]> {
  const { model, action, args } = params;
  const ids: string[] = [];

  if (!model || !args) {
    return ids;
  }

  // Import prisma client dynamically to avoid circular dependency
  const { prisma } = await import('./prisma');

  if (action === 'update' || action === 'delete') {
    // Single operation with where clause
    if (
      args.where &&
      typeof args.where === 'object' &&
      'id' in args.where &&
      typeof args.where.id === 'string'
    ) {
      ids.push(args.where.id);
    } else if (args.where && typeof args.where === 'object') {
      // Need to query to find the ID
      const modelClient = (prisma as Record<string, any>)[model.toLowerCase()];
      if (modelClient && typeof modelClient.findFirst === 'function') {
        const entity = (await modelClient.findFirst({
          where: args.where,
          select: { id: true },
        })) as { id: string } | null;
        if (entity && entity.id) {
          ids.push(entity.id);
        }
      }
    }
  } else if (action === 'updateMany' || action === 'deleteMany') {
    // Multiple operations
    const modelClient = (prisma as Record<string, any>)[model.toLowerCase()];
    if (modelClient && typeof modelClient.findMany === 'function') {
      const entities = (await modelClient.findMany({
        where: args.where,
        select: { id: true },
      })) as { id: string }[];
      if (Array.isArray(entities)) {
        ids.push(...entities.map((e) => e.id));
      }
    }
  }

  return ids;
}

/**
 * Get sync metadata for an entity
 */
async function getSyncMetadata(
  entityType: string,
  entityId: string,
): Promise<{
  id: string;
  entityType: string;
  entityId: string;
  version: number;
  lastModifiedBy: string;
  lastModifiedAt: Date;
  checksum: string | null;
  deletedAt: Date | null;
  clientId: string | null;
} | null> {
  const { prisma } = await import('./prisma');

  return await prisma.syncMetadata.findUnique({
    where: {
      entityType_entityId: {
        entityType,
        entityId,
      },
    },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      version: true,
      lastModifiedBy: true,
      lastModifiedAt: true,
      checksum: true,
      deletedAt: true,
      clientId: true,
    },
  });
}

/**
 * Create sync metadata for a new entity
 */
async function createSyncMetadata(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { prisma } = await import('./prisma');

  // Extract user ID from context or data
  const userId = extractUserId(data);
  const checksum = calculateChecksum({ entityType, entityId, data });

  await prisma.syncMetadata.create({
    data: {
      entityType,
      entityId,
      version: 1,
      lastModifiedBy: userId || 'system',
      checksum,
    },
  });
}

/**
 * Update sync metadata for an existing entity
 */
async function updateSyncMetadata(
  entityType: string,
  entityId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const { prisma } = await import('./prisma');

  const existing = await getSyncMetadata(entityType, entityId);
  if (!existing) {
    // Create if doesn't exist
    await createSyncMetadata(entityType, entityId, data);
    return;
  }

  const userId = extractUserId(data);
  const checksum = calculateChecksum({ entityType, entityId, data });

  await prisma.syncMetadata.update({
    where: {
      entityType_entityId: {
        entityType,
        entityId,
      },
    },
    data: {
      version: { increment: 1 },
      lastModifiedBy: userId || existing.lastModifiedBy,
      lastModifiedAt: new Date(),
      checksum,
      deletedAt: null, // Clear deleted flag if updating
    },
  });
}

/**
 * Mark sync metadata as deleted
 */
async function markSyncMetadataDeleted(entityType: string, entityId: string): Promise<void> {
  const { prisma } = await import('./prisma');

  const existing = await getSyncMetadata(entityType, entityId);
  if (!existing) {
    return; // Nothing to mark as deleted
  }

  await prisma.syncMetadata.update({
    where: {
      entityType_entityId: {
        entityType,
        entityId,
      },
    },
    data: {
      version: { increment: 1 },
      deletedAt: new Date(),
    },
  });
}

/**
 * Extract user ID from data or context
 */
function extractUserId(data: Record<string, unknown>): string | null {
  // Try to extract from common fields
  if (typeof data.updatedByUserId === 'string') return data.updatedByUserId;
  if (typeof data.createdByUserId === 'string') return data.createdByUserId;
  if (typeof data.userId === 'string') return data.userId;

  // TODO: In a real implementation, this would get the user ID from the request context
  // For now, return null and let the service handle it
  return null;
}

/**
 * Calculate checksum for integrity checking
 */
function calculateChecksum(data: Record<string, unknown>): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(data));
  return hash.digest('hex');
}

/**
 * Enhanced Prisma client with optimistic locking support
 */
export function addOptimisticLocking<T extends { version?: number }>(
  operation: () => Promise<T>,
  expectedVersion?: number,
): Promise<T> {
  return operation().then((result) => {
    if (expectedVersion !== undefined && result.version !== undefined) {
      if (result.version !== expectedVersion + 1) {
        throw new Error('Optimistic locking failed - version mismatch');
      }
    }
    return result;
  });
}
