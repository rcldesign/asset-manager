# DumbAssets Data Migration System

This migration system provides comprehensive functionality to migrate data from the original DumbAssets JSON format to the new DumbAssets Enhanced PostgreSQL database schema.

## Overview

The migration system handles:
- **Assets**: Complete asset data including components, warranties, and file attachments
- **Maintenance Events**: Converted to tasks with proper status and priority mapping
- **File Attachments**: Photos, receipts, manuals, and other documents
- **Data Validation**: Comprehensive validation and error reporting
- **Dry Run Mode**: Test migrations without making database changes

## Quick Start

### 1. Generate Example Data
```bash
npm run migrate:example -- -o example-export.json
```

### 2. Validate Export File
```bash
npm run migrate:validate -- -f export.json
```

### 3. Perform Dry Run Migration
```bash
npm run migrate -- -f export.json --dry-run --org-name "My Organization"
```

### 4. Perform Live Migration
```bash
npm run migrate -- -f export.json --org-name "My Organization" --owner-email "admin@example.com"
```

## Command Line Options

### `migrate` command
- `-f, --file <path>`: Path to DumbAssets JSON export file (required)
- `-o, --org-name <name>`: Organization name for migration (default: "Migrated Organization")
- `-e, --owner-email <email>`: Owner email address (default: "admin@localhost")
- `-n, --owner-name <name>`: Owner full name (default: "Administrator")
- `-u, --upload-path <path>`: Base path for uploaded files
- `-r, --report-file <path>`: Path to save migration report
- `--dry-run`: Perform dry run without making database changes
- `--preserve-ids`: Preserve original asset/component IDs
- `--skip-file-validation`: Skip file existence validation
- `--skip-duplicates`: Skip assets with duplicate IDs
- `--create-default-tasks`: Create default maintenance tasks for assets without events
- `--log-level <level>`: Log level (error, warn, info, debug)

### `validate` command
- `-f, --file <path>`: Path to DumbAssets JSON export file (required)

### `example` command
- `-o, --output <path>`: Output file path (default: "./example-dumbassets-export.json")

## Data Mapping

### Assets
| Legacy Field | New Field | Notes |
|--------------|-----------|-------|
| `id` | `id` | Preserved if `--preserve-ids` used |
| `name` | `name` | Required field |
| `manufacturer` | `manufacturer` | Optional |
| `model` | `modelNumber` | Optional |
| `serial` | `serialNumber` | Optional |
| `purchaseDate` | `purchaseDate` | Parsed as ISO date |
| `purchasePrice` | `purchasePrice` | Converted to Decimal |
| `description` | `description` | Optional |
| `link` | `link` | Optional |
| `tags` | `tags` | Array of strings |
| `warranty.scope` | `warrantyScope` | Optional |
| `warranty.expiry` | `warrantyExpiry` | Parsed as ISO date |
| `warranty.lifetime` | `warrantyLifetime` | Boolean |
| `warranty.secondaryScope` | `secondaryWarrantyScope` | Optional |
| `warranty.secondaryExpiry` | `secondaryWarrantyExpiry` | Parsed as ISO date |
| `photos[0]` | `photoPath` | First photo becomes main photo |
| `receipt` | `receiptPath` | Optional |
| `manual` | `manualPath` | Optional |

### Components
Components are migrated similarly to assets but are nested under their parent asset. The component hierarchy is preserved.

### Maintenance Events → Tasks
| Legacy Field | New Field | Notes |
|--------------|-----------|-------|
| `title` | `title` | Required |
| `description` | `description` | Optional |
| `dueDate` | `dueDate` | Defaults to current date if missing |
| `status` | `status` | Mapped: pending→PLANNED, completed→DONE, etc. |
| `priority` | `priority` | Mapped: high→HIGH, medium→MEDIUM, low→LOW |
| `cost` | `estimatedCost`/`actualCost` | Based on completion status |
| `estimatedDuration` | `estimatedMinutes` | Converted to minutes |
| `actualDuration` | `actualMinutes` | Converted to minutes |
| `completedDate` | `completedAt` | Parsed as ISO date |

## File Handling

The migration system creates file mappings for all attachments but does not automatically copy files. After migration, you need to manually copy files according to the file mappings provided in the migration report.

File types handled:
- **Photos**: Asset and component photos
- **Receipts**: Purchase receipts
- **Manuals**: Product manuals
- **Attachments**: Task attachments

## Unmigrated Data

The following data types generate warnings and require manual migration:

### Asset/Component Level
- Custom fields
- Notes (should be added to descriptions)
- Location information
- Condition data
- Valuation/depreciation data
- Multiple photos (only first photo migrated as main)

### Maintenance Event Level
- Recurring schedules (requires manual setup in new system)
- User assignments (authentication system changed)
- Custom fields
- Notes (should be added to descriptions)

### System Level
- Multiple organizations (only one supported per migration)
- Legacy users (authentication system changed)
- Global settings (except maintenance events)

## Error Handling

The migration system provides comprehensive error handling:

- **Validation Errors**: Invalid JSON format or schema violations
- **Database Errors**: Constraint violations, connection issues
- **File Errors**: Invalid file paths or missing files
- **Data Errors**: Invalid data types or formats

All errors and warnings are collected and included in the migration report.

## Migration Report

After migration, a detailed report is generated containing:

- **Statistics**: Number of assets, components, tasks, and files processed
- **Errors**: Complete list of errors with details
- **Warnings**: List of warnings for unmigrated data
- **File Mappings**: Instructions for copying files

## Best Practices

1. **Always run a dry run first** to identify potential issues
2. **Validate your export file** before migration
3. **Review the migration report** carefully
4. **Test with a small dataset** before migrating large amounts of data
5. **Backup your database** before running live migrations
6. **Prepare file storage** for attachments before migration

## Troubleshooting

### Database Connection Issues
Ensure PostgreSQL is running and accessible:
```bash
# Check database connection
npm run prisma:studio
```

### Memory Issues with Large Datasets
For large datasets, consider:
- Breaking migration into smaller chunks
- Increasing Node.js memory limit: `NODE_OPTIONS="--max-old-space-size=4096"`

### File Path Issues
- Use absolute paths when possible
- Ensure file permissions allow read access
- Use `--skip-file-validation` for testing without files

## API Usage

For programmatic usage:

```typescript
import { dataMigrator } from './migrations';

const result = await dataMigrator.migrate('export.json', {
  dryRun: true,
  defaultOrganizationName: 'My Organization',
  defaultOwnerEmail: 'admin@example.com',
  preserveIds: false,
  createDefaultTasks: true,
});

console.log(`Migration ${result.success ? 'succeeded' : 'failed'}`);
console.log(`Processed ${result.context.stats.assetsProcessed} assets`);
console.log(`Created ${result.context.stats.tasksCreated} tasks`);
```

## Support

For issues or questions:
1. Check the migration report for detailed error information
2. Use `--log-level debug` for detailed logging
3. Test with the provided example data first
4. Review this documentation for data mapping details