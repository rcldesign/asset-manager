import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import type { LegacyAsset, LegacyComponent, MigrationContext, FileMapping } from './types';
import {
  addMigrationError,
  addMigrationWarning,
  parseLegacyDate,
  sanitizeAssetName,
  sanitizeTags,
  generateOrPreserveId,
  normalizeFilePath,
  createFileMapping,
  logMigrationProgress,
} from './utils';

export class AssetMigrator {
  private context: MigrationContext;
  private fileMappings: FileMapping[] = [];

  constructor(context: MigrationContext) {
    this.context = context;
  }

  /**
   * Migrate a single legacy asset to the new database schema
   */
  async migrateAsset(legacyAsset: LegacyAsset): Promise<string | null> {
    try {
      logMigrationProgress(this.context, `Migrating asset: ${legacyAsset.name}`);

      // Generate or preserve asset ID
      const assetId = generateOrPreserveId(legacyAsset.id, this.context.preserveIds);

      // Validate required fields
      const name = sanitizeAssetName(legacyAsset.name);
      if (!name || name === 'Untitled Asset') {
        addMigrationWarning(
          this.context,
          'asset',
          'Asset has no name, using default',
          legacyAsset.id,
          { originalName: legacyAsset.name },
        );
      }

      // Parse dates
      const purchaseDate = parseLegacyDate(legacyAsset.purchaseDate);
      const warrantyExpiry = parseLegacyDate(legacyAsset.warranty?.expiry);
      const secondaryWarrantyExpiry = parseLegacyDate(legacyAsset.warranty?.secondaryExpiry);

      // Handle purchase price
      let purchasePrice: Decimal | null = null;
      if (legacyAsset.purchasePrice !== undefined && legacyAsset.purchasePrice !== null) {
        if (typeof legacyAsset.purchasePrice === 'number' && legacyAsset.purchasePrice >= 0) {
          purchasePrice = new Decimal(legacyAsset.purchasePrice);
        } else {
          addMigrationWarning(
            this.context,
            'asset',
            'Invalid purchase price, setting to null',
            legacyAsset.id,
            { originalPrice: legacyAsset.purchasePrice },
          );
        }
      }

      // Sanitize tags
      const tags = sanitizeTags(legacyAsset.tags);

      // Process file attachments
      const photoPath = this.processAssetFile(
        legacyAsset.photos?.[0], // Take first photo as main photo
        'photo',
        assetId,
      );
      const receiptPath = this.processAssetFile(legacyAsset.receipt, 'receipt', assetId);
      const manualPath = this.processAssetFile(legacyAsset.manual, 'manual', assetId);

      // Process additional photos (beyond the first one)
      if (legacyAsset.photos && legacyAsset.photos.length > 1) {
        legacyAsset.photos.slice(1).forEach((photo) => {
          this.processAssetFile(photo, 'photo', assetId);
        });
        addMigrationWarning(
          this.context,
          'asset',
          `Asset has ${legacyAsset.photos.length} photos, only first one migrated as main photo`,
          legacyAsset.id,
          { totalPhotos: legacyAsset.photos.length },
        );
      }

      // Prepare asset data for insertion
      const assetData: Prisma.AssetCreateInput = {
        id: assetId,
        name,
        manufacturer: legacyAsset.manufacturer || null,
        modelNumber: legacyAsset.model || null,
        serialNumber: legacyAsset.serial || null,
        purchaseDate,
        purchasePrice,
        description: legacyAsset.description || null,
        link: legacyAsset.link || null,
        tags,
        warrantyScope: legacyAsset.warranty?.scope || null,
        warrantyExpiry,
        warrantyLifetime: legacyAsset.warranty?.lifetime || false,
        secondaryWarrantyScope: legacyAsset.warranty?.secondaryScope || null,
        secondaryWarrantyExpiry,
        photoPath,
        receiptPath,
        manualPath,
        organization: {
          connect: { id: this.context.organizationId },
        },
      };

      // Insert asset if not dry run
      if (!this.context.dryRun) {
        try {
          await prisma.asset.create({
            data: assetData,
            select: { id: true },
          });
          logger.debug('Asset created successfully', { assetId, name });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
              addMigrationError(
                this.context,
                'asset',
                'Asset with this ID already exists',
                legacyAsset.id,
                { assetId, error: error.message },
              );
              return null;
            }
          }
          throw error;
        }
      }

      this.context.stats.assetsProcessed++;

      // Migrate components if any
      if (legacyAsset.components && legacyAsset.components.length > 0) {
        await this.migrateComponents(legacyAsset.components, assetId);
      }

      // Handle custom fields and notes as warnings
      if (legacyAsset.customFields && Object.keys(legacyAsset.customFields).length > 0) {
        addMigrationWarning(
          this.context,
          'asset',
          'Asset has custom fields that cannot be migrated',
          legacyAsset.id,
          { customFields: legacyAsset.customFields },
        );
      }

      if (legacyAsset.notes) {
        addMigrationWarning(
          this.context,
          'asset',
          'Asset has notes that should be manually added to description',
          legacyAsset.id,
          { notes: legacyAsset.notes },
        );
      }

      if (legacyAsset.location) {
        addMigrationWarning(
          this.context,
          'asset',
          'Asset has location information that cannot be migrated',
          legacyAsset.id,
          { location: legacyAsset.location },
        );
      }

      if (legacyAsset.condition) {
        addMigrationWarning(
          this.context,
          'asset',
          'Asset has condition information that cannot be migrated',
          legacyAsset.id,
          { condition: legacyAsset.condition },
        );
      }

      if (legacyAsset.value || legacyAsset.depreciation) {
        addMigrationWarning(
          this.context,
          'asset',
          'Asset has valuation/depreciation data that cannot be migrated',
          legacyAsset.id,
          { value: legacyAsset.value, depreciation: legacyAsset.depreciation },
        );
      }

      return assetId;
    } catch (error) {
      addMigrationError(
        this.context,
        'asset',
        `Failed to migrate asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
        legacyAsset.id,
        error,
      );
      return null;
    }
  }

  /**
   * Migrate components for an asset
   */
  private async migrateComponents(
    legacyComponents: LegacyComponent[],
    assetId: string,
    parentComponentId?: string,
  ): Promise<void> {
    for (const legacyComponent of legacyComponents) {
      try {
        logMigrationProgress(this.context, `Migrating component: ${legacyComponent.name}`);

        // Generate or preserve component ID
        const componentId = generateOrPreserveId(legacyComponent.id, this.context.preserveIds);

        // Validate required fields
        const name = sanitizeAssetName(legacyComponent.name);

        // Parse dates
        const purchaseDate = parseLegacyDate(legacyComponent.purchaseDate);
        const warrantyExpiry = parseLegacyDate(legacyComponent.warranty?.expiry);

        // Handle purchase price
        let purchasePrice: Decimal | null = null;
        if (legacyComponent.purchasePrice !== undefined && legacyComponent.purchasePrice !== null) {
          if (
            typeof legacyComponent.purchasePrice === 'number' &&
            legacyComponent.purchasePrice >= 0
          ) {
            purchasePrice = new Decimal(legacyComponent.purchasePrice);
          }
        }

        // Sanitize tags
        const tags = sanitizeTags(legacyComponent.tags);

        // Process file attachments
        const photoPath = this.processAssetFile(
          legacyComponent.photos?.[0],
          'photo',
          assetId,
          componentId,
        );
        const receiptPath = this.processAssetFile(
          legacyComponent.receipt,
          'receipt',
          assetId,
          componentId,
        );
        const manualPath = this.processAssetFile(
          legacyComponent.manual,
          'manual',
          assetId,
          componentId,
        );

        // Prepare component data for insertion
        const componentData: Prisma.ComponentCreateInput = {
          id: componentId,
          name,
          manufacturer: legacyComponent.manufacturer || null,
          modelNumber: legacyComponent.model || null,
          serialNumber: legacyComponent.serial || null,
          purchaseDate,
          purchasePrice,
          description: legacyComponent.description || null,
          link: legacyComponent.link || null,
          tags,
          warrantyScope: legacyComponent.warranty?.scope || null,
          warrantyExpiry,
          warrantyLifetime: legacyComponent.warranty?.lifetime || false,
          photoPath,
          receiptPath,
          manualPath,
          asset: {
            connect: { id: assetId },
          },
          ...(parentComponentId && {
            parent: {
              connect: { id: parentComponentId },
            },
          }),
        };

        // Insert component if not dry run
        if (!this.context.dryRun) {
          try {
            await prisma.component.create({
              data: componentData,
            });
            logger.debug('Component created successfully', { componentId, name, assetId });
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
              if (error.code === 'P2002') {
                addMigrationError(
                  this.context,
                  'component',
                  'Component with this ID already exists',
                  legacyComponent.id,
                  { componentId, error: error.message },
                );
                continue;
              }
            }
            throw error;
          }
        }

        this.context.stats.componentsProcessed++;

        // Handle warnings for unmigrated data
        if (legacyComponent.customFields && Object.keys(legacyComponent.customFields).length > 0) {
          addMigrationWarning(
            this.context,
            'component',
            'Component has custom fields that cannot be migrated',
            legacyComponent.id,
            { customFields: legacyComponent.customFields },
          );
        }

        if (legacyComponent.notes) {
          addMigrationWarning(
            this.context,
            'component',
            'Component has notes that should be manually added to description',
            legacyComponent.id,
            { notes: legacyComponent.notes },
          );
        }
      } catch (error) {
        addMigrationError(
          this.context,
          'component',
          `Failed to migrate component: ${error instanceof Error ? error.message : 'Unknown error'}`,
          legacyComponent.id,
          error,
        );
      }
    }
  }

  /**
   * Process asset file attachment and create file mapping
   */
  private processAssetFile(
    filePath: string | undefined,
    type: 'photo' | 'receipt' | 'manual',
    assetId: string,
    componentId?: string,
  ): string | null {
    if (!filePath) return null;

    const normalizedPath = normalizeFilePath(filePath, this.context.baseUploadPath);
    if (!normalizedPath) {
      addMigrationWarning(this.context, 'file', `Invalid file path: ${filePath}`, assetId, {
        filePath,
        type,
      });
      return null;
    }

    // Create file mapping for later processing
    const fileMapping = createFileMapping(
      filePath,
      type,
      this.context.baseUploadPath,
      assetId,
      componentId,
    );
    this.fileMappings.push(fileMapping);

    this.context.stats.filesProcessed++;
    return normalizedPath;
  }

  /**
   * Get all file mappings created during migration
   */
  getFileMappings(): FileMapping[] {
    return this.fileMappings;
  }

  /**
   * Clear file mappings (useful for batch processing)
   */
  clearFileMappings(): void {
    this.fileMappings = [];
  }
}
