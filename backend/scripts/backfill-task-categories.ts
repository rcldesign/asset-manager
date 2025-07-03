#!/usr/bin/env tsx

/**
 * Script to backfill task categories based on business logic
 * 
 * Rules:
 * 1. Tasks with scheduleId -> MAINTENANCE
 * 2. Tasks created from migrations (imported maintenance events) -> MAINTENANCE  
 * 3. All other tasks -> GENERAL
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();

interface BackfillStats {
  totalTasks: number;
  maintenanceTasks: number;
  generalTasks: number;
  errors: number;
}

async function backfillTaskCategories(): Promise<BackfillStats> {
  const stats: BackfillStats = {
    totalTasks: 0,
    maintenanceTasks: 0,
    generalTasks: 0,
    errors: 0,
  };

  try {
    // Get all tasks that don't have a category set
    const tasksToUpdate = await prisma.task.findMany({
      where: {
        category: null,
      },
      select: {
        id: true,
        scheduleId: true,
        title: true,
        createdAt: true,
      },
    });

    stats.totalTasks = tasksToUpdate.length;
    logger.info(`Found ${stats.totalTasks} tasks to categorize`);

    if (stats.totalTasks === 0) {
      logger.info('No tasks need categorization');
      return stats;
    }

    // Process tasks in batches
    const batchSize = 100;
    for (let i = 0; i < tasksToUpdate.length; i += batchSize) {
      const batch = tasksToUpdate.slice(i, i + batchSize);
      
      await prisma.$transaction(async (tx) => {
        for (const task of batch) {
          try {
            let category: 'MAINTENANCE' | 'GENERAL';
            
            // Rule 1: Tasks with scheduleId are maintenance tasks
            if (task.scheduleId) {
              category = 'MAINTENANCE';
              stats.maintenanceTasks++;
            } else {
              // Rule 2: Check if task title suggests maintenance (common patterns)
              const maintenanceKeywords = [
                'maintenance', 'repair', 'replace', 'service', 'inspect',
                'clean', 'lubricate', 'calibrate', 'test', 'check',
                'filter', 'oil change', 'preventive', 'pm'
              ];
              
              const titleLower = task.title.toLowerCase();
              const isMaintenanceTask = maintenanceKeywords.some(keyword => 
                titleLower.includes(keyword)
              );
              
              if (isMaintenanceTask) {
                category = 'MAINTENANCE';
                stats.maintenanceTasks++;
              } else {
                category = 'GENERAL';
                stats.generalTasks++;
              }
            }

            await tx.task.update({
              where: { id: task.id },
              data: { category },
            });

            logger.debug(`Updated task ${task.id} with category ${category}`, {
              taskId: task.id,
              title: task.title,
              category,
              hasSchedule: !!task.scheduleId,
            });

          } catch (error) {
            stats.errors++;
            logger.error(`Failed to update task ${task.id}:`, error);
          }
        }
      });

      logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(tasksToUpdate.length / batchSize)}`);
    }

    logger.info('Task category backfill completed', {
      totalTasks: stats.totalTasks,
      maintenanceTasks: stats.maintenanceTasks,
      generalTasks: stats.generalTasks,
      errors: stats.errors,
    });

    return stats;

  } catch (error) {
    logger.error('Task category backfill failed:', error);
    throw error;
  }
}

async function validateBackfill(): Promise<void> {
  const tasksWithoutCategory = await prisma.task.count({
    where: { category: null },
  });

  const maintenanceCount = await prisma.task.count({
    where: { category: 'MAINTENANCE' },
  });

  const generalCount = await prisma.task.count({
    where: { category: 'GENERAL' },
  });

  logger.info('Backfill validation results:', {
    tasksWithoutCategory,
    maintenanceCount,
    generalCount,
  });

  if (tasksWithoutCategory > 0) {
    logger.warn(`${tasksWithoutCategory} tasks still without category`);
  } else {
    logger.info('All tasks now have categories assigned');
  }
}

async function main() {
  try {
    logger.info('Starting task category backfill...');
    
    const stats = await backfillTaskCategories();
    await validateBackfill();

    if (stats.errors > 0) {
      logger.warn(`Completed with ${stats.errors} errors`);
      process.exit(1);
    } else {
      logger.info('Backfill completed successfully');
      process.exit(0);
    }
  } catch (error) {
    logger.error('Backfill script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { backfillTaskCategories, validateBackfill };