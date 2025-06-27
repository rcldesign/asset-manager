import type { Asset, AssetCategory, AssetStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { AppError, NotFoundError, ConflictError } from '../utils/errors';
import { AssetTemplateService } from './asset-template.service';
import { LocationService } from './location.service';
import { ActivityStreamService } from './activity-stream.service';
import { ActivityVerbs, ActivityObjectTypes, ActivityTargetTypes } from '../types/activity';
import { webhookService } from './webhook.service';

export interface CreateAssetData {
  name: string;
  category: AssetCategory;
  status?: AssetStatus;
  assetTemplateId?: string;
  locationId?: string;
  parentId?: string;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  purchaseDate?: Date;
  purchasePrice?: number;
  description?: string;
  link?: string;
  tags?: string[];
  warrantyScope?: string;
  warrantyExpiry?: Date;
  warrantyLifetime?: boolean;
  secondaryWarrantyScope?: string;
  secondaryWarrantyExpiry?: Date;
  customFields?: Record<string, unknown>;
  qrCode?: string;
  organizationId: string;
}

export interface UpdateAssetData {
  name?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  assetTemplateId?: string | null;
  locationId?: string | null;
  parentId?: string | null;
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  purchaseDate?: Date | null;
  purchasePrice?: number | null;
  description?: string;
  link?: string;
  tags?: string[];
  warrantyScope?: string;
  warrantyExpiry?: Date | null;
  warrantyLifetime?: boolean;
  secondaryWarrantyScope?: string;
  secondaryWarrantyExpiry?: Date | null;
  customFields?: Record<string, unknown> | null;
  qrCode?: string;
}

export interface QueryAssetOptions {
  name?: string;
  category?: AssetCategory;
  status?: AssetStatus;
  locationId?: string;
  templateId?: string;
  parentId?: string | null;
  tags?: string[];
  hasWarranty?: boolean;
  warrantyExpiring?: { before: Date };
  qrCode?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'purchaseDate' | 'purchasePrice';
  sortOrder?: 'asc' | 'desc';
  includeChildren?: boolean;
}

export interface AssetSearchResult {
  data: Asset[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
}

export interface AssetWithRelations extends Asset {
  location?: {
    id: string;
    name: string;
    path: string;
  } | null;
  assetTemplate?: {
    id: string;
    name: string;
    category: AssetCategory;
  } | null;
  parent?: {
    id: string;
    name: string;
    path: string;
  } | null;
  children?: Asset[];
  _count?: {
    children: number;
    tasks: number;
    attachments: number;
  };
}

/**
 * Service for managing assets with hierarchical structure and template integration.
 * Provides comprehensive CRUD operations, search capabilities, and relationship management
 * for assets within an organization.
 *
 * @class AssetService
 */
export class AssetService {
  private assetTemplateService: AssetTemplateService;
  private locationService: LocationService;
  private activityStreamService: ActivityStreamService;

  /**
   * Creates an instance of AssetService.
   * Initializes dependencies for asset template and location services.
   */
  constructor() {
    this.assetTemplateService = new AssetTemplateService();
    this.locationService = new LocationService();
    this.activityStreamService = new ActivityStreamService(prisma);
  }

  /**
   * Generate materialized path for an asset.
   * Used for efficient hierarchical queries and tree traversal.
   *
   * @param {string | null} parentPath - The path of the parent asset, null for root assets
   * @param {string} assetId - The ID of the current asset
   * @returns {string} The complete materialized path for the asset
   * @private
   */
  private generatePath(parentPath: string | null, assetId: string): string {
    return parentPath ? `${parentPath}/${assetId}` : `/${assetId}`;
  }

  /**
   * Generate a unique QR code for the asset.
   * If a custom code is provided, it will be used instead of generating one.
   *
   * @param {string} assetId - The ID of the asset
   * @param {string} [customCode] - Optional custom QR code to use
   * @returns {string} The generated or provided QR code
   * @private
   */
  private generateQrCode(assetId: string, customCode?: string): string {
    if (customCode) {
      return customCode;
    }
    // Generate QR code based on UUID with a prefix for easy identification
    return `AST-${assetId.substring(0, 8).toUpperCase()}`;
  }

  /**
   * Create a new asset with optional template integration and hierarchical placement.
   * Validates all relationships including organization, template, location, and parent asset.
   *
   * @param {CreateAssetData} data - The asset creation data
   * @returns {Promise<AssetWithRelations>} The created asset with all relationships loaded
   * @throws {NotFoundError} If organization, template, location, or parent asset not found
   * @throws {ConflictError} If category doesn't match template, location doesn't belong to org, or QR code exists
   * @throws {AppError} If custom fields fail validation against template schema
   *
   * @example
   * const asset = await assetService.createAsset({
   *   name: 'Laptop #123',
   *   category: 'EQUIPMENT',
   *   organizationId: 'org-123',
   *   assetTemplateId: 'template-456',
   *   locationId: 'location-789',
   *   serialNumber: 'SN123456'
   * });
   */
  async createAsset(
    data: CreateAssetData,
    createdBy?: { id: string; name: string },
  ): Promise<AssetWithRelations> {
    const {
      name,
      category,
      status = 'OPERATIONAL',
      assetTemplateId,
      locationId,
      parentId,
      organizationId,
      customFields,
      qrCode,
      ...assetData
    } = data;

    // Verify organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Organization');
    }

    // Verify and apply template if provided
    let templateDefaults: Record<string, unknown> = {};
    let finalCustomFields: Record<string, unknown> | null = customFields || null;

    if (assetTemplateId) {
      const template = await this.assetTemplateService.getTemplateById(
        assetTemplateId,
        organizationId,
      );
      if (!template) {
        throw new NotFoundError('Asset template');
      }

      if (template.category !== category) {
        throw new ConflictError('Asset category must match template category');
      }

      // Apply template defaults
      templateDefaults = (template.defaultFields as Record<string, unknown>) || {};

      // Validate custom fields against template schema
      if (customFields) {
        const validation = await this.assetTemplateService.validateCustomFieldValues(
          assetTemplateId,
          customFields,
          organizationId,
        );
        if (!validation.valid) {
          throw new AppError(`Invalid custom fields: ${validation.errors.join(', ')}`, 400);
        }
      }

      // Merge template defaults with provided custom fields
      finalCustomFields = { ...templateDefaults, ...customFields };
    }

    // Verify location if provided
    if (locationId) {
      const location = await this.locationService.getLocationById(locationId, organizationId);
      if (!location) {
        throw new NotFoundError('Location');
      }
      // Verify location belongs to organization
      if (location.organizationId !== organizationId) {
        throw new ConflictError('Location does not belong to this organization');
      }
    }

    // Handle parent-child relationship
    let parentPath: string | null = null;
    if (parentId) {
      const parent = await this.getAssetById(parentId, organizationId);
      if (!parent) {
        throw new NotFoundError('Parent asset');
      }
      parentPath = parent.path;
    }

    // Generate asset ID and path
    const assetId = uuidv4();
    const path = this.generatePath(parentPath, assetId);

    // Check for QR code uniqueness
    const generatedQrCode = this.generateQrCode(assetId, qrCode);
    if (generatedQrCode) {
      const existingAsset = await prisma.asset.findFirst({
        where: { qrCode: generatedQrCode },
      });
      if (existingAsset) {
        throw new ConflictError('QR code already exists');
      }
    }

    // Create asset
    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        name,
        category,
        status,
        path,
        assetTemplateId,
        locationId,
        parentId,
        organizationId,
        customFields: finalCustomFields as Prisma.InputJsonValue,
        qrCode: generatedQrCode,
        ...assetData,
        purchasePrice: assetData.purchasePrice
          ? new Prisma.Decimal(assetData.purchasePrice)
          : undefined,
      },
      include: {
        location: true,
        assetTemplate: true,
        parent: true,
        _count: {
          select: {
            children: true,
            tasks: true,
            attachments: true,
          },
        },
      },
    });

    // Emit activity event if creator information is provided
    if (createdBy) {
      try {
        await this.activityStreamService.emitActivity({
          organizationId: data.organizationId,
          actor: {
            type: 'User',
            id: createdBy.id,
            name: createdBy.name,
          },
          verb: ActivityVerbs.CREATED,
          object: {
            type: ActivityObjectTypes.ASSET,
            id: asset.id,
            displayName: asset.name,
          },
          target: asset.locationId
            ? {
                type: ActivityTargetTypes.ORGANIZATION, // Could be location if we add Location to target types
                id: data.organizationId,
                displayName: 'Organization',
              }
            : undefined,
          metadata: {
            category: asset.category,
            status: asset.status,
            serialNumber: asset.serialNumber,
            manufacturer: asset.manufacturer,
          },
        });
      } catch (error) {
        // Log but don't fail the primary operation
        console.error('Failed to emit asset creation activity:', error);
      }
    }

    // Emit webhook event
    try {
      await webhookService.emitEvent({
        id: `asset-created-${asset.id}-${Date.now()}`,
        type: 'asset.created',
        organizationId: data.organizationId,
        timestamp: new Date(),
        data: {
          assetId: asset.id,
          name: asset.name,
          category: asset.category,
          status: asset.status,
          locationId: asset.locationId,
          templateId: asset.assetTemplateId,
          parentId: asset.parentId,
          qrCode: asset.qrCode,
          serialNumber: asset.serialNumber,
          manufacturer: asset.manufacturer,
          modelNumber: asset.modelNumber,
        },
        userId: createdBy?.id,
        metadata: {
          source: 'asset-service',
          action: 'create',
        },
      });
    } catch (error) {
      // Log but don't fail the primary operation
      console.error('Failed to emit asset.created webhook event:', error);
    }

    return asset as AssetWithRelations;
  }

  /**
   * Get asset by ID with all relationships loaded.
   * Optionally filters by organization for access control.
   *
   * @param {string} id - The asset ID to retrieve
   * @param {string} [organizationId] - Optional organization ID for access control
   * @returns {Promise<AssetWithRelations | null>} The asset with relationships or null if not found
   *
   * @example
   * const asset = await assetService.getAssetById('asset-123', 'org-456');
   * if (asset) {
   *   console.log(`Asset ${asset.name} has ${asset._count.children} children`);
   * }
   */
  async getAssetById(id: string, organizationId?: string): Promise<AssetWithRelations | null> {
    const where: Prisma.AssetWhereInput = { id };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    return prisma.asset.findFirst({
      where,
      include: {
        location: true,
        assetTemplate: true,
        parent: true,
        children: {
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            children: true,
            tasks: true,
            attachments: true,
          },
        },
      },
    }) as Promise<AssetWithRelations | null>;
  }

  /**
   * Update an existing asset with validation of all relationships.
   * Handles complex operations like parent changes, template switches, and path updates.
   *
   * @param {string} id - The ID of the asset to update
   * @param {UpdateAssetData} data - The update data
   * @param {string} organizationId - The organization ID for access control
   * @returns {Promise<AssetWithRelations>} The updated asset with all relationships
   * @throws {NotFoundError} If asset, template, location, or parent not found
   * @throws {ConflictError} If validation fails (category mismatch, circular dependency, QR code exists)
   * @throws {AppError} If custom fields fail template validation
   *
   * @example
   * const updated = await assetService.updateAsset('asset-123', {
   *   name: 'Updated Laptop',
   *   status: 'MAINTENANCE',
   *   locationId: 'new-location-456'
   * }, 'org-789');
   */
  async updateAsset(
    id: string,
    data: UpdateAssetData,
    organizationId: string,
  ): Promise<AssetWithRelations> {
    // Get existing asset
    const asset = await this.getAssetById(id, organizationId);
    if (!asset) {
      throw new NotFoundError('Asset');
    }

    const {
      assetTemplateId,
      locationId,
      parentId,
      customFields,
      qrCode,
      purchasePrice,
      ...updateData
    } = data;

    // Validate template change if provided
    if (assetTemplateId !== undefined) {
      if (assetTemplateId === null) {
        // Removing template is allowed
      } else {
        const template = await this.assetTemplateService.getTemplateById(
          assetTemplateId,
          organizationId,
        );
        if (!template) {
          throw new NotFoundError('Asset template');
        }

        // If category is being changed, ensure it matches template
        const newCategory = data.category || asset.category;
        if (template.category !== newCategory) {
          throw new ConflictError('Asset category must match template category');
        }

        // Validate custom fields if provided
        if (customFields) {
          const validation = await this.assetTemplateService.validateCustomFieldValues(
            assetTemplateId,
            customFields,
            organizationId,
          );
          if (!validation.valid) {
            throw new AppError(`Invalid custom fields: ${validation.errors.join(', ')}`, 400);
          }
        }
      }
    }

    // Validate location change if provided
    if (locationId !== undefined && locationId !== null) {
      const location = await this.locationService.getLocationById(locationId, organizationId);
      if (!location) {
        throw new NotFoundError('Location');
      }
      // Verify location belongs to organization
      if (location.organizationId !== organizationId) {
        throw new ConflictError('Location does not belong to this organization');
      }
    }

    // Handle parent change
    let newPath = asset.path;
    if (parentId !== undefined) {
      if (parentId === null) {
        // Moving to root
        newPath = this.generatePath(null, asset.id);
      } else {
        // Validate new parent
        if (parentId === id) {
          throw new ConflictError('Asset cannot be its own parent');
        }

        const newParent = await this.getAssetById(parentId, organizationId);
        if (!newParent) {
          throw new NotFoundError('Parent asset');
        }

        // Prevent circular dependency
        if (newParent.path.startsWith(asset.path)) {
          throw new ConflictError('Cannot move asset to be a child of itself or its descendants');
        }

        newPath = this.generatePath(newParent.path, asset.id);
      }

      // If path changes, update all descendants
      if (newPath !== asset.path) {
        await this.updateDescendantPaths(asset.id, asset.path, newPath);
      }
    }

    // Validate QR code uniqueness if changing
    if (qrCode !== undefined && qrCode !== asset.qrCode) {
      const existingAsset = await prisma.asset.findFirst({
        where: {
          qrCode,
          id: { not: id },
        },
      });
      if (existingAsset) {
        throw new ConflictError('QR code already exists');
      }
    }

    // Update asset
    const updatedAsset = await prisma.asset.update({
      where: { id },
      data: {
        ...updateData,
        assetTemplateId,
        locationId,
        parentId,
        path: newPath,
        customFields:
          customFields !== undefined ? (customFields as Prisma.InputJsonValue) : undefined,
        qrCode,
        purchasePrice:
          purchasePrice !== undefined
            ? purchasePrice === null
              ? null
              : new Prisma.Decimal(purchasePrice)
            : undefined,
      },
      include: {
        location: true,
        assetTemplate: true,
        parent: true,
        children: {
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            children: true,
            tasks: true,
            attachments: true,
          },
        },
      },
    });

    // Emit webhook event
    try {
      await webhookService.emitEvent({
        id: `asset-updated-${updatedAsset.id}-${Date.now()}`,
        type: 'asset.updated',
        organizationId: updatedAsset.organizationId,
        timestamp: new Date(),
        data: {
          assetId: updatedAsset.id,
          name: updatedAsset.name,
          category: updatedAsset.category,
          status: updatedAsset.status,
          locationId: updatedAsset.locationId,
          templateId: updatedAsset.assetTemplateId,
          parentId: updatedAsset.parentId,
          qrCode: updatedAsset.qrCode,
          serialNumber: updatedAsset.serialNumber,
          manufacturer: updatedAsset.manufacturer,
          modelNumber: updatedAsset.modelNumber,
          changes: data, // Include what was changed
        },
        metadata: {
          source: 'asset-service',
          action: 'update',
        },
      });
    } catch (error) {
      // Log but don't fail the primary operation
      console.error('Failed to emit asset.updated webhook event:', error);
    }

    return updatedAsset as AssetWithRelations;
  }

  /**
   * Update paths for all descendant assets when an asset is moved.
   * Uses raw SQL for efficient bulk update of materialized paths.
   *
   * @param {string} assetId - The ID of the asset being moved
   * @param {string} oldPath - The current path of the asset
   * @param {string} newPath - The new path for the asset
   * @returns {Promise<void>}
   * @private
   */
  private async updateDescendantPaths(
    assetId: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    await prisma.$executeRawUnsafe(
      `
      UPDATE assets
      SET path = REPLACE(path, $1, $2)
      WHERE path LIKE $3 AND id != $4
    `,
      oldPath,
      newPath,
      `${oldPath}/%`,
      assetId,
    );
  }

  /**
   * Delete an asset with optional cascade delete for children.
   * Prevents deletion if asset has active tasks unless cascading.
   *
   * @param {string} id - The ID of the asset to delete
   * @param {string} organizationId - The organization ID for access control
   * @param {boolean} [cascade=false] - Whether to cascade delete to children
   * @returns {Promise<void>}
   * @throws {NotFoundError} If asset not found
   * @throws {ConflictError} If asset has children (without cascade) or active tasks
   *
   * @example
   * // Delete single asset without children
   * await assetService.deleteAsset('asset-123', 'org-456');
   *
   * // Delete asset and all its children
   * await assetService.deleteAsset('asset-123', 'org-456', true);
   */
  async deleteAsset(id: string, organizationId: string, cascade = false): Promise<void> {
    const asset = await this.getAssetById(id, organizationId);
    if (!asset) {
      throw new NotFoundError('Asset');
    }

    // Check for children
    if (asset._count?.children && asset._count.children > 0) {
      if (!cascade) {
        throw new ConflictError(
          'Cannot delete asset with children. Use cascade option or delete children first.',
        );
      }
    }

    // Check for active tasks
    if (asset._count?.tasks && asset._count.tasks > 0) {
      const activeTasks = await prisma.task.count({
        where: {
          assetId: id,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
      });

      if (activeTasks > 0) {
        throw new ConflictError('Cannot delete asset with active tasks');
      }
    }

    // Delete asset (cascade will handle children due to DB constraints)
    await prisma.asset.delete({ where: { id } });

    // Emit webhook event
    try {
      await webhookService.emitEvent({
        id: `asset-deleted-${id}-${Date.now()}`,
        type: 'asset.deleted',
        organizationId: asset.organizationId,
        timestamp: new Date(),
        data: {
          assetId: id,
          name: asset.name,
          category: asset.category,
          status: asset.status,
          locationId: asset.locationId,
          templateId: asset.assetTemplateId,
          parentId: asset.parentId,
          qrCode: asset.qrCode,
          serialNumber: asset.serialNumber,
          manufacturer: asset.manufacturer,
          modelNumber: asset.modelNumber,
        },
        metadata: {
          source: 'asset-service',
          action: 'delete',
          cascade,
        },
      });
    } catch (error) {
      // Log but don't fail the primary operation
      console.error('Failed to emit asset.deleted webhook event:', error);
    }
  }

  /**
   * Move asset to a different parent or location.
   * Convenience method that wraps updateAsset for move operations.
   *
   * @param {string} id - The ID of the asset to move
   * @param {string} organizationId - The organization ID for access control
   * @param {Object} options - Move options
   * @param {string | null} [options.newParentId] - New parent asset ID or null for root
   * @param {string | null} [options.newLocationId] - New location ID or null
   * @returns {Promise<AssetWithRelations>} The moved asset with updated relationships
   * @throws {NotFoundError} If asset, parent, or location not found
   * @throws {ConflictError} If move would create circular dependency
   *
   * @example
   * // Move to new parent
   * await assetService.moveAsset('asset-123', 'org-456', {
   *   newParentId: 'parent-789'
   * });
   *
   * // Move to root and change location
   * await assetService.moveAsset('asset-123', 'org-456', {
   *   newParentId: null,
   *   newLocationId: 'location-012'
   * });
   */
  async moveAsset(
    id: string,
    organizationId: string,
    options: { newParentId?: string | null; newLocationId?: string | null },
  ): Promise<AssetWithRelations> {
    const updateData: UpdateAssetData = {};

    if (options.newParentId !== undefined) {
      updateData.parentId = options.newParentId;
    }

    if (options.newLocationId !== undefined) {
      updateData.locationId = options.newLocationId;
    }

    return this.updateAsset(id, updateData, organizationId);
  }

  /**
   * Search and filter assets with pagination.
   * Supports multiple filter criteria and flexible sorting options.
   *
   * @param {string} organizationId - The organization ID to search within
   * @param {QueryAssetOptions} [options={}] - Search and pagination options
   * @returns {Promise<AssetSearchResult>} Paginated search results with metadata
   *
   * @example
   * // Search for equipment assets with warranty expiring soon
   * const results = await assetService.findAssets('org-123', {
   *   category: 'EQUIPMENT',
   *   hasWarranty: true,
   *   warrantyExpiring: { before: new Date('2024-12-31') },
   *   page: 1,
   *   limit: 20,
   *   sortBy: 'warrantyExpiry',
   *   sortOrder: 'asc'
   * });
   *
   * console.log(`Found ${results.meta.total} assets, showing page ${results.meta.page}`);
   */
  async findAssets(
    organizationId: string,
    options: QueryAssetOptions = {},
  ): Promise<AssetSearchResult> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeChildren = false,
      ...filters
    } = options;

    const skip = (page - 1) * limit;

    const whereConditions: Prisma.AssetWhereInput[] = [{ organizationId }];

    // Apply filters
    if (filters.name) {
      whereConditions.push({ name: { contains: filters.name, mode: 'insensitive' } });
    }

    if (filters.category) {
      whereConditions.push({ category: filters.category });
    }

    if (filters.status) {
      whereConditions.push({ status: filters.status });
    }

    if (filters.locationId) {
      whereConditions.push({ locationId: filters.locationId });
    }

    if (filters.templateId) {
      whereConditions.push({ assetTemplateId: filters.templateId });
    }

    if (filters.parentId !== undefined) {
      whereConditions.push({ parentId: filters.parentId });
    }

    if (filters.tags && filters.tags.length > 0) {
      whereConditions.push({ tags: { hasSome: filters.tags } });
    }

    if (filters.hasWarranty) {
      whereConditions.push({
        OR: [{ warrantyExpiry: { not: null } }, { warrantyLifetime: true }],
      });
    }

    if (filters.warrantyExpiring) {
      whereConditions.push({
        warrantyExpiry: {
          lte: filters.warrantyExpiring.before,
          gte: new Date(),
        },
        warrantyLifetime: false,
      });
    }

    if (filters.qrCode) {
      whereConditions.push({ qrCode: filters.qrCode });
    }

    const where: Prisma.AssetWhereInput = { AND: whereConditions };

    // Execute query
    const [assets, total] = await prisma.$transaction([
      prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: includeChildren ? { children: true } : undefined,
      }),
      prisma.asset.count({ where }),
    ]);

    return {
      data: assets,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get asset tree structure starting from root or specific asset.
   * Returns hierarchical structure with all descendants properly nested.
   *
   * @param {string} organizationId - The organization ID
   * @param {string} [rootId] - Optional root asset ID to get subtree
   * @returns {Promise<AssetWithRelations[]>} Array of root assets with nested children
   * @throws {NotFoundError} If specified root asset not found
   *
   * @example
   * // Get entire asset tree
   * const tree = await assetService.getAssetTree('org-123');
   *
   * // Get subtree starting from specific asset
   * const subtree = await assetService.getAssetTree('org-123', 'asset-456');
   */
  async getAssetTree(organizationId: string, rootId?: string): Promise<AssetWithRelations[]> {
    let assets: Asset[];

    if (rootId) {
      // Get specific subtree
      const root = await this.getAssetById(rootId, organizationId);
      if (!root) {
        throw new NotFoundError('Root asset');
      }
      assets = await prisma.asset.findMany({
        where: {
          organizationId,
          path: { startsWith: root.path },
        },
        orderBy: [{ path: 'asc' }, { name: 'asc' }],
        include: {
          location: true,
          assetTemplate: true,
          _count: {
            select: {
              children: true,
              tasks: true,
              attachments: true,
            },
          },
        },
      });
    } else {
      // Get all assets for the organization to build the complete tree
      assets = await prisma.asset.findMany({
        where: { organizationId },
        orderBy: [{ path: 'asc' }, { name: 'asc' }],
        include: {
          location: true,
          assetTemplate: true,
          _count: {
            select: {
              children: true,
              tasks: true,
              attachments: true,
            },
          },
        },
      });
    }

    // Build tree structure
    return this.buildTreeFromFlatList(assets as AssetWithRelations[], rootId);
  }

  /**
   * Build tree structure from flat list of assets.
   * Efficiently constructs parent-child relationships using a map.
   *
   * @param {AssetWithRelations[]} assets - Flat list of assets to organize
   * @param {string} [rootId] - Optional root ID to filter tree
   * @returns {AssetWithRelations[]} Array of root assets with nested children
   * @private
   */
  private buildTreeFromFlatList(
    assets: AssetWithRelations[],
    rootId?: string,
  ): AssetWithRelations[] {
    const assetMap = new Map<string, AssetWithRelations>();
    const roots: AssetWithRelations[] = [];

    // First pass: create map
    for (const asset of assets) {
      assetMap.set(asset.id, { ...asset, children: [] });
    }

    // Second pass: build tree
    for (const asset of assets) {
      const node = assetMap.get(asset.id)!;

      if (asset.parentId && assetMap.has(asset.parentId)) {
        const parent = assetMap.get(asset.parentId)!;
        parent.children = parent.children || [];
        parent.children.push(node);
      } else if (!asset.parentId && !rootId) {
        // No parent and no specific root requested - this is a root asset
        roots.push(node);
      } else if (rootId && asset.id === rootId) {
        // Specific root requested and this is it
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get all assets at a specific location.
   *
   * @param {string} locationId - The location ID to filter by
   * @param {string} organizationId - The organization ID for access control
   * @returns {Promise<Asset[]>} Array of assets at the location
   *
   * @example
   * const assets = await assetService.getAssetsByLocation('location-123', 'org-456');
   * console.log(`Found ${assets.length} assets at this location`);
   */
  async getAssetsByLocation(locationId: string, organizationId: string): Promise<Asset[]> {
    return prisma.asset.findMany({
      where: {
        locationId,
        organizationId,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get all assets using a specific template.
   *
   * @param {string} templateId - The template ID to filter by
   * @param {string} organizationId - The organization ID for access control
   * @returns {Promise<Asset[]>} Array of assets using the template
   *
   * @example
   * const assets = await assetService.getAssetsByTemplate('template-123', 'org-456');
   * console.log(`Found ${assets.length} assets using this template`);
   */
  async getAssetsByTemplate(templateId: string, organizationId: string): Promise<Asset[]> {
    return prisma.asset.findMany({
      where: {
        assetTemplateId: templateId,
        organizationId,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Update asset status with validation of allowed transitions.
   * Enforces business rules for status changes.
   *
   * @param {string} id - The asset ID
   * @param {AssetStatus} status - The new status
   * @param {string} organizationId - The organization ID for access control
   * @returns {Promise<Asset>} The updated asset
   * @throws {NotFoundError} If asset not found
   * @throws {ConflictError} If status transition is not allowed
   *
   * @example
   * // Move asset to maintenance
   * await assetService.updateAssetStatus('asset-123', 'MAINTENANCE', 'org-456');
   *
   * // Valid transitions:
   * // OPERATIONAL -> MAINTENANCE, REPAIR, RETIRED, LOST
   * // MAINTENANCE -> OPERATIONAL, REPAIR, RETIRED
   * // REPAIR -> OPERATIONAL, MAINTENANCE, RETIRED, DISPOSED
   * // RETIRED -> DISPOSED
   * // DISPOSED -> (none)
   * // LOST -> OPERATIONAL
   */
  async updateAssetStatus(id: string, status: AssetStatus, organizationId: string): Promise<Asset> {
    const asset = await this.getAssetById(id, organizationId);
    if (!asset) {
      throw new NotFoundError('Asset');
    }

    // Validate status transitions (can be expanded with business rules)
    const validTransitions: Record<AssetStatus, AssetStatus[]> = {
      OPERATIONAL: ['MAINTENANCE', 'REPAIR', 'RETIRED', 'LOST'],
      MAINTENANCE: ['OPERATIONAL', 'REPAIR', 'RETIRED'],
      REPAIR: ['OPERATIONAL', 'MAINTENANCE', 'RETIRED', 'DISPOSED'],
      RETIRED: ['DISPOSED'],
      DISPOSED: [],
      LOST: ['OPERATIONAL'], // Found again
    };

    if (!validTransitions[asset.status].includes(status)) {
      throw new ConflictError(`Invalid status transition from ${asset.status} to ${status}`);
    }

    return prisma.asset.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Get assets with warranties expiring within specified days.
   * Includes both primary and secondary warranties.
   *
   * @param {string} organizationId - The organization ID
   * @param {number} [daysBefore=30] - Number of days before expiry to check
   * @returns {Promise<Asset[]>} Array of assets with expiring warranties
   *
   * @example
   * // Get assets with warranties expiring in next 30 days
   * const expiring = await assetService.getWarrantyExpiringAssets('org-123');
   *
   * // Get assets with warranties expiring in next 90 days
   * const expiringQuarter = await assetService.getWarrantyExpiringAssets('org-123', 90);
   */
  async getWarrantyExpiringAssets(organizationId: string, daysBefore = 30): Promise<Asset[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysBefore);

    return prisma.asset.findMany({
      where: {
        organizationId,
        warrantyLifetime: false,
        OR: [
          {
            warrantyExpiry: {
              gte: new Date(),
              lte: expiryDate,
            },
          },
          {
            secondaryWarrantyExpiry: {
              gte: new Date(),
              lte: expiryDate,
            },
          },
        ],
      },
      orderBy: [{ warrantyExpiry: 'asc' }, { secondaryWarrantyExpiry: 'asc' }],
    });
  }

  /**
   * Get comprehensive asset statistics for an organization.
   * Provides aggregated data for reporting and dashboards.
   *
   * @param {string} organizationId - The organization ID
   * @returns {Promise<Object>} Statistics object containing:
   *   - total: Total number of assets
   *   - byCategory: Count of assets grouped by category
   *   - byStatus: Count of assets grouped by status
   *   - byLocation: Array of location counts with names
   *   - warrantyExpiringSoon: Count of warranties expiring in 30 days
   *   - totalValue: Sum of all asset purchase prices
   *
   * @example
   * const stats = await assetService.getAssetStatistics('org-123');
   * console.log(`Total assets: ${stats.total}`);
   * console.log(`Total value: $${stats.totalValue.toLocaleString()}`);
   * console.log(`Equipment count: ${stats.byCategory.EQUIPMENT}`);
   * console.log(`Warranties expiring soon: ${stats.warrantyExpiringSoon}`);
   */
  async getAssetStatistics(organizationId: string): Promise<{
    total: number;
    byCategory: Record<AssetCategory, number>;
    byStatus: Record<AssetStatus, number>;
    byLocation: Array<{ locationId: string; locationName: string; count: number }>;
    warrantyExpiringSoon: number;
    totalValue: number;
  }> {
    const [total, byCategory, byStatus, byLocation, warrantyExpiring, totalValue] =
      await Promise.all([
        // Total count
        prisma.asset.count({ where: { organizationId } }),

        // Count by category
        prisma.asset.groupBy({
          by: ['category'],
          where: { organizationId },
          _count: true,
        }),

        // Count by status
        prisma.asset.groupBy({
          by: ['status'],
          where: { organizationId },
          _count: true,
        }),

        // Count by location
        prisma.asset.groupBy({
          by: ['locationId'],
          where: { organizationId, locationId: { not: null } },
          _count: true,
        }),

        // Warranty expiring in 30 days
        this.getWarrantyExpiringAssets(organizationId, 30),

        // Total value
        prisma.asset.aggregate({
          where: { organizationId },
          _sum: { purchasePrice: true },
        }),
      ]);

    // Get location names
    const locationIds = byLocation.map((l) => l.locationId).filter(Boolean) as string[];
    const locations = await prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true },
    });
    const locationMap = new Map(locations.map((l) => [l.id, l.name]));

    return {
      total,
      byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count])) as Record<
        AssetCategory,
        number
      >,
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) as Record<
        AssetStatus,
        number
      >,
      byLocation: byLocation.map((l) => ({
        locationId: l.locationId!,
        locationName: locationMap.get(l.locationId!) || 'Unknown',
        count: l._count,
      })),
      warrantyExpiringSoon: warrantyExpiring.length,
      totalValue: totalValue._sum.purchasePrice?.toNumber() || 0,
    };
  }
}
