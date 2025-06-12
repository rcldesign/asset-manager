#!/usr/bin/env tsx

import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import { dataMigrator } from './migrator';
import type { MigrationOptions } from './types';

const program = new Command();

program
  .name('dumbassets-migrator')
  .description('Migrate DumbAssets JSON data to DumbAssets Enhanced PostgreSQL database')
  .version('1.0.0');

program
  .command('migrate')
  .description('Migrate DumbAssets JSON export to database')
  .requiredOption('-f, --file <path>', 'Path to DumbAssets JSON export file')
  .option('-o, --org-name <name>', 'Organization name for migration', 'Migrated Organization')
  .option('-e, --owner-email <email>', 'Owner email address', 'admin@localhost')
  .option('-n, --owner-name <name>', 'Owner full name', 'Administrator')
  .option('-u, --upload-path <path>', 'Base path for uploaded files')
  .option('-r, --report-file <path>', 'Path to save migration report')
  .option('--dry-run', 'Perform dry run without making database changes')
  .option('--preserve-ids', 'Preserve original asset/component IDs')
  .option('--skip-file-validation', 'Skip file existence validation')
  .option('--skip-duplicates', 'Skip assets with duplicate IDs')
  .option('--create-default-tasks', 'Create default maintenance tasks for assets without events')
  .option('--log-level <level>', 'Log level (error, warn, info, debug)', 'info')
  .action(async (options) => {
    try {
      console.log('🚀 Starting DumbAssets Enhanced Migration');
      console.log('=====================================\n');

      // Validate file exists
      const jsonFilePath = path.resolve(options.file);
      try {
        await fs.access(jsonFilePath);
      } catch {
        console.error(`❌ Error: JSON file not found: ${jsonFilePath}`);
        process.exit(1);
      }

      // Set log level
      if (options.logLevel) {
        // Note: This would need to be implemented in your logger configuration
        console.log(`📊 Log level: ${options.logLevel}`);
      }

      // Prepare migration options
      const migrationOptions: MigrationOptions = {
        dryRun: options.dryRun || false,
        preserveIds: options.preserveIds || false,
        defaultOrganizationName: options.orgName,
        defaultOwnerEmail: options.ownerEmail,
        defaultOwnerName: options.ownerName,
        baseUploadPath: options.uploadPath,
        skipFileValidation: options.skipFileValidation || false,
        skipDuplicateAssets: options.skipDuplicates || false,
        createDefaultTasks: options.createDefaultTasks || false,
        logLevel: options.logLevel || 'info',
      };

      console.log('📋 Migration Configuration:');
      console.log(`   File: ${jsonFilePath}`);
      console.log(`   Organization: ${migrationOptions.defaultOrganizationName}`);
      console.log(
        `   Owner: ${migrationOptions.defaultOwnerName} <${migrationOptions.defaultOwnerEmail}>`,
      );
      console.log(`   Dry Run: ${migrationOptions.dryRun ? '✅ Yes' : '❌ No'}`);
      console.log(`   Preserve IDs: ${migrationOptions.preserveIds ? '✅ Yes' : '❌ No'}`);
      console.log(`   Upload Path: ${migrationOptions.baseUploadPath || 'Not specified'}`);
      console.log(
        `   Create Default Tasks: ${migrationOptions.createDefaultTasks ? '✅ Yes' : '❌ No'}`,
      );
      console.log('');

      if (migrationOptions.dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made to the database\n');
      } else {
        console.log('⚠️  LIVE MIGRATION - Changes will be made to the database\n');
      }

      // Start migration
      console.log('🔄 Starting migration...\n');
      const startTime = Date.now();

      const result = await dataMigrator.migrate(jsonFilePath, migrationOptions);

      const duration = Date.now() - startTime;
      console.log(`\n⏱️  Migration completed in ${duration}ms\n`);

      // Display results
      if (result.success) {
        console.log('✅ Migration completed successfully!');
      } else {
        console.log('❌ Migration completed with errors');
      }

      console.log('\n📊 Migration Statistics:');
      console.log(`   Assets processed: ${result.context.stats.assetsProcessed}`);
      console.log(`   Components processed: ${result.context.stats.componentsProcessed}`);
      console.log(`   Tasks created: ${result.context.stats.tasksCreated}`);
      console.log(`   Files processed: ${result.context.stats.filesProcessed}`);
      console.log(`   Errors: ${result.context.stats.errors}`);
      console.log(`   Warnings: ${result.context.stats.warnings}`);

      // Show file mappings summary
      if (result.fileMappings.length > 0) {
        console.log(`\n📁 File Mappings: ${result.fileMappings.length} files need to be processed`);

        const filesByType = result.fileMappings.reduce(
          (acc, mapping) => {
            acc[mapping.type] = (acc[mapping.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        Object.entries(filesByType).forEach(([type, count]) => {
          console.log(`   ${type}: ${count} files`);
        });
      }

      // Save report if requested
      if (options.reportFile) {
        const reportPath = path.resolve(options.reportFile);
        await fs.writeFile(reportPath, result.report, 'utf-8');
        console.log(`\n📄 Migration report saved to: ${reportPath}`);
      } else {
        console.log('\n📄 Migration Report:');
        console.log('===================');
        console.log(result.report);
      }

      // Show next steps
      console.log('\n🎯 Next Steps:');
      if (result.fileMappings.length > 0) {
        console.log('   1. Review file mappings and copy files to appropriate locations');
      }
      if (result.context.warnings.length > 0) {
        console.log('   2. Review warnings and manually migrate unmigrated data if needed');
      }
      if (migrationOptions.dryRun) {
        console.log('   3. Run migration without --dry-run flag to apply changes');
      } else {
        console.log('   3. Verify migrated data in the application');
      }

      // Exit with appropriate code
      process.exit(result.success ? 0 : 1);
    } catch (error) {
      console.error('\n❌ Migration failed:');
      console.error(error instanceof Error ? error.message : 'Unknown error');

      if (error instanceof Error && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }

      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate DumbAssets JSON export file without migrating')
  .requiredOption('-f, --file <path>', 'Path to DumbAssets JSON export file')
  .action(async (options) => {
    try {
      console.log('🔍 Validating DumbAssets JSON export...\n');

      const jsonFilePath = path.resolve(options.file);

      // Use the loadLegacyData function for validation
      const { loadLegacyData } = await import('./utils');
      const legacyData = await loadLegacyData(jsonFilePath);

      console.log('✅ JSON file is valid!');
      console.log('\n📊 Data Summary:');
      console.log(`   Version: ${legacyData.version}`);
      console.log(`   Export Date: ${legacyData.exportDate}`);
      console.log(`   Assets: ${legacyData.assets.length}`);
      console.log(`   Users: ${legacyData.users?.length || 0}`);
      console.log(`   Organizations: ${legacyData.organizations?.length || 0}`);

      if (legacyData.metadata) {
        console.log('\n📋 Metadata:');
        Object.entries(legacyData.metadata).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }

      console.log('\n🎯 This file is ready for migration!');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Validation failed:');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

program
  .command('example')
  .description('Generate example DumbAssets JSON export file')
  .option('-o, --output <path>', 'Output file path', './example-dumbassets-export.json')
  .action(async (options) => {
    try {
      console.log('📝 Generating example DumbAssets JSON export...\n');

      const exampleData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        metadata: {
          appVersion: '1.0.0',
          totalAssets: 2,
          totalComponents: 1,
          totalMaintenanceEvents: 3,
          totalUsers: 1,
        },
        users: [
          {
            id: 'user-1',
            email: 'admin@example.com',
            name: 'Administrator',
            role: 'admin',
            createdAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        assets: [
          {
            id: 'asset-1',
            name: 'Kitchen Refrigerator',
            manufacturer: 'Samsung',
            model: 'RF28R7351SR',
            serial: 'SN123456789',
            purchaseDate: '2022-06-15T00:00:00.000Z',
            purchasePrice: 1299.99,
            description: 'French door refrigerator with water dispenser',
            link: 'https://www.samsung.com/us/home-appliances/refrigerators/',
            tags: ['appliance', 'kitchen', 'refrigerator'],
            warranty: {
              scope: 'Parts and labor',
              expiry: '2025-06-15T00:00:00.000Z',
              lifetime: false,
            },
            photos: ['./photos/refrigerator-front.jpg', './photos/refrigerator-open.jpg'],
            receipt: './receipts/refrigerator-receipt.pdf',
            manual: './manuals/refrigerator-manual.pdf',
            maintenanceEvents: [
              {
                id: 'event-1',
                title: 'Clean condenser coils',
                description: 'Clean the condenser coils on the back of the refrigerator',
                dueDate: '2024-01-15T00:00:00.000Z',
                status: 'completed',
                priority: 'medium',
                cost: 0,
                actualDuration: 30,
                completedDate: '2024-01-14T00:00:00.000Z',
                recurring: {
                  enabled: true,
                  interval: 180, // 6 months
                },
              },
              {
                id: 'event-2',
                title: 'Replace water filter',
                description: 'Replace the water filter cartridge',
                dueDate: '2024-03-01T00:00:00.000Z',
                status: 'pending',
                priority: 'high',
                estimatedDuration: 15,
                cost: 45.99,
              },
            ],
            createdAt: '2022-06-15T12:00:00.000Z',
          },
          {
            id: 'asset-2',
            name: 'Lawn Mower',
            manufacturer: 'Honda',
            model: 'HRR216VKA',
            serial: 'LM987654321',
            purchaseDate: '2023-03-20T00:00:00.000Z',
            purchasePrice: 399.99,
            description: 'Self-propelled walk-behind lawn mower',
            tags: ['outdoor', 'equipment', 'lawn', 'mower'],
            warranty: {
              scope: 'Engine and parts',
              expiry: '2026-03-20T00:00:00.000Z',
              lifetime: false,
            },
            photos: ['./photos/lawn-mower.jpg'],
            receipt: './receipts/lawn-mower-receipt.pdf',
            components: [
              {
                id: 'component-1',
                name: 'Spark Plug',
                manufacturer: 'NGK',
                model: 'BPR6ES',
                purchaseDate: '2023-05-01T00:00:00.000Z',
                purchasePrice: 3.99,
                description: 'Replacement spark plug',
                tags: ['engine', 'spark-plug'],
                warranty: {
                  scope: 'Defects',
                  expiry: '2024-05-01T00:00:00.000Z',
                  lifetime: false,
                },
              },
            ],
            maintenanceEvents: [
              {
                id: 'event-3',
                title: 'Change engine oil',
                description: 'Change engine oil and oil filter',
                dueDate: '2024-04-01T00:00:00.000Z',
                status: 'planned',
                priority: 'high',
                estimatedDuration: 45,
                cost: 25.99,
                recurring: {
                  enabled: true,
                  interval: 30, // 30 days
                },
              },
            ],
            createdAt: '2023-03-20T14:30:00.000Z',
          },
        ],
        globalSettings: {
          timezone: 'America/New_York',
          currency: 'USD',
          dateFormat: 'MM/DD/YYYY',
        },
      };

      const outputPath = path.resolve(options.output);
      await fs.writeFile(outputPath, JSON.stringify(exampleData, null, 2), 'utf-8');

      console.log(`✅ Example file generated: ${outputPath}`);
      console.log('\n📋 Example contains:');
      console.log('   • 2 assets (refrigerator and lawn mower)');
      console.log('   • 1 component (spark plug)');
      console.log('   • 3 maintenance events');
      console.log('   • 1 user');
      console.log('   • File attachments (photos, receipts, manuals)');
      console.log('\n🎯 Use this file to test the migration process!');

      process.exit(0);
    } catch (error) {
      console.error('\n❌ Failed to generate example file:');
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
