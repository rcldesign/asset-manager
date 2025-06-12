/**
 * DumbAssets to DumbAssets Enhanced Migration System
 *
 * This module provides comprehensive migration capabilities for converting
 * DumbAssets JSON exports to the new PostgreSQL-based DumbAssets Enhanced format.
 *
 * Key Features:
 * - Asset migration with component hierarchy support
 * - Maintenance event to task conversion
 * - File attachment mapping and validation
 * - Dry run mode for testing
 * - Comprehensive error handling and reporting
 * - CLI tools for easy migration
 *
 * Usage:
 * ```typescript
 * import { dataMigrator } from './migrations';
 *
 * const result = await dataMigrator.migrate('/path/to/export.json', {
 *   dryRun: true,
 *   defaultOrganizationName: 'My Organization',
 *   defaultOwnerEmail: 'admin@example.com',
 * });
 * ```
 */

// Core migration functionality
export { DataMigrator, dataMigrator } from './migrator';
export { AssetMigrator } from './asset-migrator';
export { TaskMigrator } from './task-migrator';

// Utility functions
export {
  loadLegacyData,
  createMigrationContext,
  addMigrationError,
  addMigrationWarning,
  parseLegacyDate,
  sanitizeAssetName,
  sanitizeTags,
  generateOrPreserveId,
  normalizeFilePath,
  validateFilePath,
  createFileMapping,
  mapMaintenanceEventStatus,
  mapMaintenanceEventPriority,
  generateMigrationReport,
  logMigrationProgress,
} from './utils';

// Type definitions
export type {
  LegacyAsset,
  LegacyComponent,
  LegacyMaintenanceEvent,
  LegacyUser,
  LegacyOrganization,
  LegacyDataExport,
  MigrationContext,
  MigrationOptions,
  FileMapping,
} from './types';

/**
 * Migration CLI Commands:
 *
 * 1. Migrate data:
 *    npm run migrate -- -f /path/to/export.json --org-name "My Organization"
 *
 * 2. Dry run migration:
 *    npm run migrate -- -f /path/to/export.json --dry-run
 *
 * 3. Validate export file:
 *    npm run migrate:validate -- -f /path/to/export.json
 *
 * 4. Generate example file:
 *    npm run migrate:example -- -o example.json
 */

/**
 * Migration Process Overview:
 *
 * 1. **Data Validation**: JSON export is loaded and validated against expected schema
 * 2. **Organization Setup**: Creates or uses existing organization and owner user
 * 3. **Asset Migration**:
 *    - Converts legacy assets to new Asset entities
 *    - Migrates components as nested Component entities
 *    - Maps file attachments (photos, receipts, manuals)
 * 4. **Task Migration**:
 *    - Converts maintenance events to Task entities
 *    - Maps status and priority fields
 *    - Handles recurring event warnings
 * 5. **File Processing**:
 *    - Creates file mappings for all attachments
 *    - Validates file paths and accessibility
 * 6. **Reporting**:
 *    - Generates comprehensive migration report
 *    - Lists all errors, warnings, and statistics
 *    - Provides file mapping instructions
 *
 * Data Mapping:
 *
 * Legacy Asset → New Asset:
 * - id → id (preserved if requested)
 * - name → name
 * - manufacturer → manufacturer
 * - model → modelNumber
 * - serial → serialNumber
 * - purchaseDate → purchaseDate
 * - purchasePrice → purchasePrice
 * - description → description
 * - link → link
 * - tags → tags
 * - warranty.scope → warrantyScope
 * - warranty.expiry → warrantyExpiry
 * - warranty.lifetime → warrantyLifetime
 * - warranty.secondaryScope → secondaryWarrantyScope
 * - warranty.secondaryExpiry → secondaryWarrantyExpiry
 * - photos[0] → photoPath
 * - receipt → receiptPath
 * - manual → manualPath
 *
 * Legacy Component → New Component:
 * - Similar mapping as Asset
 * - Nested under parent Asset
 * - Supports component hierarchy
 *
 * Legacy Maintenance Event → New Task:
 * - id → id (preserved if requested)
 * - title → title
 * - description → description
 * - dueDate → dueDate
 * - status → status (mapped: pending→PLANNED, completed→DONE, etc.)
 * - priority → priority (mapped: high→HIGH, medium→MEDIUM, low→LOW)
 * - cost → estimatedCost or actualCost (based on completion status)
 * - estimatedDuration → estimatedMinutes
 * - actualDuration → actualMinutes
 * - completedDate → completedAt
 *
 * Unmigrated Data (generates warnings):
 * - Custom fields
 * - Notes (should be manually added to descriptions)
 * - Location information
 * - Condition data
 * - Valuation/depreciation data
 * - Recurring schedules (needs manual setup)
 * - User assignments (authentication system changed)
 * - Multiple organizations (only one supported per migration)
 * - Global settings (except maintenance events)
 */
