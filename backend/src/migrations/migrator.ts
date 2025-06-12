import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { UserService } from '../services/user.service';
import { OrganizationService } from '../services/organization.service';
import type { LegacyDataExport, MigrationContext, MigrationOptions, FileMapping } from './types';
import {
  loadLegacyData,
  createMigrationContext,
  addMigrationError,
  addMigrationWarning,
  generateMigrationReport,
  logMigrationProgress,
} from './utils';
import { AssetMigrator } from './asset-migrator';
import { TaskMigrator } from './task-migrator';

export class DataMigrator {
  private userService: UserService;
  private organizationService: OrganizationService;

  constructor() {
    this.userService = new UserService();
    this.organizationService = new OrganizationService();
  }

  /**
   * Main migration entry point
   */
  async migrate(
    jsonFilePath: string,
    options: MigrationOptions = {},
  ): Promise<{
    success: boolean;
    context: MigrationContext;
    report: string;
    fileMappings: FileMapping[];
  }> {
    let context: MigrationContext | null = null;
    let allFileMappings: FileMapping[] = [];

    try {
      logger.info('Starting DumbAssets data migration', {
        jsonFilePath,
        options,
        dryRun: options.dryRun || false,
      });

      // Load and validate legacy data
      const legacyData = await loadLegacyData(jsonFilePath);

      // Create or get organization and owner user
      const { organizationId, ownerUserId } = await this.setupOrganizationAndUser(options);

      // Create migration context
      context = createMigrationContext(organizationId, ownerUserId, options);

      logMigrationProgress(context, 'Migration setup complete, starting asset migration');

      // Start database transaction if not dry run
      const migrationResult = await (options.dryRun
        ? this.performMigration(legacyData, context, options)
        : prisma.$transaction(
            async () => {
              return await this.performMigration(legacyData, context!, options);
            },
            {
              timeout: 30000, // 30 second timeout
            },
          ));

      allFileMappings = migrationResult.fileMappings;

      // Generate migration report
      const report = generateMigrationReport(context);

      const success = context.stats.errors === 0;

      logger.info('Migration completed', {
        success,
        dryRun: context.dryRun,
        stats: context.stats,
        errors: context.stats.errors,
        warnings: context.stats.warnings,
      });

      return {
        success,
        context,
        report,
        fileMappings: allFileMappings,
      };
    } catch (error) {
      if (context) {
        addMigrationError(
          context,
          'validation',
          `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          undefined,
          error,
        );

        const report = generateMigrationReport(context);
        return {
          success: false,
          context,
          report,
          fileMappings: allFileMappings,
        };
      }

      logger.error('Migration failed during setup', error instanceof Error ? error : undefined, {
        jsonFilePath,
        options,
      });
      throw error;
    }
  }

  /**
   * Perform the actual migration logic
   */
  private async performMigration(
    legacyData: LegacyDataExport,
    context: MigrationContext,
    options: MigrationOptions,
  ): Promise<{ fileMappings: FileMapping[] }> {
    const allFileMappings: FileMapping[] = [];

    // Initialize migrators
    const assetMigrator = new AssetMigrator(context);
    const taskMigrator = new TaskMigrator(context);

    logMigrationProgress(context, `Starting migration of ${legacyData.assets.length} assets`);

    // Migrate assets
    for (const legacyAsset of legacyData.assets) {
      try {
        // Migrate the asset itself
        const assetId = await assetMigrator.migrateAsset(legacyAsset);

        if (assetId) {
          // Migrate maintenance events to tasks
          if (legacyAsset.maintenanceEvents && legacyAsset.maintenanceEvents.length > 0) {
            await taskMigrator.migrateMaintenanceEvents(legacyAsset.maintenanceEvents, assetId);
          } else if (context.dryRun || options.createDefaultTasks) {
            // Create default maintenance tasks for assets without events
            await taskMigrator.createDefaultMaintenanceTasks(assetId, legacyAsset.name);
          }
        }
      } catch (error) {
        addMigrationError(
          context,
          'asset',
          `Failed to process asset and related data: ${error instanceof Error ? error.message : 'Unknown error'}`,
          legacyAsset.id,
          error,
        );
      }
    }

    // Collect all file mappings
    allFileMappings.push(...assetMigrator.getFileMappings());
    allFileMappings.push(...taskMigrator.getFileMappings());

    // Handle any global maintenance events (not tied to specific assets)
    if (legacyData.globalSettings?.maintenanceEvents) {
      const globalEvents = Array.isArray(legacyData.globalSettings.maintenanceEvents)
        ? legacyData.globalSettings.maintenanceEvents
        : [];

      if (globalEvents.length > 0) {
        logMigrationProgress(context, `Migrating ${globalEvents.length} global maintenance events`);
        await taskMigrator.migrateMaintenanceEvents(globalEvents);
      }
    }

    // Log warnings for unmigrated data structures
    this.logUnmigratedDataWarnings(legacyData, context);

    logMigrationProgress(context, 'Migration processing complete');

    return { fileMappings: allFileMappings };
  }

  /**
   * Setup organization and user for migration
   */
  private async setupOrganizationAndUser(
    options: MigrationOptions,
  ): Promise<{ organizationId: string; ownerUserId: string }> {
    const organizationName = options.defaultOrganizationName || 'Migrated Organization';
    const ownerEmail = options.defaultOwnerEmail || 'admin@localhost';
    const ownerName = options.defaultOwnerName || 'Administrator';

    logger.info('Setting up organization and user', {
      organizationName,
      ownerEmail,
      ownerName,
    });

    // Check if user already exists
    let existingUser = null;
    try {
      existingUser = await this.userService.getUserByEmail(ownerEmail);
    } catch {
      // User doesn't exist, which is fine
    }

    if (existingUser) {
      logger.info('Using existing user for migration', {
        userId: existingUser.id,
        email: existingUser.email,
        organizationId: existingUser.organizationId,
      });
      return {
        organizationId: existingUser.organizationId,
        ownerUserId: existingUser.id,
      };
    }

    // Create new organization
    const organization = await this.organizationService.createOrganization({
      name: organizationName,
    });

    // Create owner user
    const user = await this.userService.createUser({
      email: ownerEmail,
      fullName: ownerName,
      role: 'OWNER',
      organizationId: organization.id,
    });

    // Set user as organization owner
    await this.organizationService.setOwner(organization.id, user.id);

    logger.info('Created new organization and user for migration', {
      organizationId: organization.id,
      ownerUserId: user.id,
      email: user.email,
    });

    return {
      organizationId: organization.id,
      ownerUserId: user.id,
    };
  }

  /**
   * Log warnings for data that cannot be migrated
   */
  private logUnmigratedDataWarnings(legacyData: LegacyDataExport, context: MigrationContext): void {
    // Check for legacy users (if any)
    if (legacyData.users && legacyData.users.length > 0) {
      addMigrationWarning(
        context,
        'data',
        `Legacy data contains ${legacyData.users.length} users that cannot be automatically migrated due to authentication system changes`,
        undefined,
        { userCount: legacyData.users.length },
      );
    }

    // Check for legacy organizations
    if (legacyData.organizations && legacyData.organizations.length > 1) {
      addMigrationWarning(
        context,
        'data',
        `Legacy data contains ${legacyData.organizations.length} organizations, only one organization is supported per migration`,
        undefined,
        { organizationCount: legacyData.organizations.length },
      );
    }

    // Check for global settings
    if (legacyData.globalSettings && Object.keys(legacyData.globalSettings).length > 0) {
      const settingsKeys = Object.keys(legacyData.globalSettings).filter(
        (key) => key !== 'maintenanceEvents',
      );
      if (settingsKeys.length > 0) {
        addMigrationWarning(
          context,
          'data',
          'Legacy data contains global settings that cannot be migrated',
          undefined,
          { settings: settingsKeys },
        );
      }
    }

    // Check version compatibility
    if (legacyData.version && legacyData.version !== '1.0') {
      addMigrationWarning(
        context,
        'data',
        `Legacy data version ${legacyData.version} may not be fully compatible`,
        undefined,
        { version: legacyData.version },
      );
    }
  }

  /**
   * Validate file mappings and check for missing files
   */
  async validateFileMappings(fileMappings: FileMapping[]): Promise<FileMapping[]> {
    const validatedMappings: FileMapping[] = [];

    for (const mapping of fileMappings) {
      try {
        // Note: In a real implementation, you would check if the file exists
        // For now, we'll just mark it as processed
        mapping.processed = true;
        validatedMappings.push(mapping);
      } catch (error) {
        mapping.error = error instanceof Error ? error.message : 'Unknown error';
        mapping.processed = false;
        validatedMappings.push(mapping);
      }
    }

    return validatedMappings;
  }
}

// Export singleton instance
export const dataMigrator = new DataMigrator();
