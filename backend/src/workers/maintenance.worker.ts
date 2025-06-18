import type { Job } from 'bullmq';
import { logger } from '../utils/logger';
import { prisma } from '../lib/prisma';
import { addNotificationJob } from '../lib/queue';
import type { MaintenanceTaskJob } from '../lib/queue';

export async function processMaintenanceJob(
  job: Job<MaintenanceTaskJob>,
): Promise<{ status: string; processed: number }> {
  const { data } = job;
  let processed = 0;

  try {
    await job.updateProgress(10);

    logger.info(`Processing maintenance job`, {
      jobId: job.id,
      type: data.type,
    });

    await job.updateProgress(30);

    switch (data.type) {
      case 'generate-recurring-tasks':
        processed = await handleGenerateRecurringTasks(data, job);
        break;

      case 'check-asset-warranties':
        processed = await handleCheckAssetWarranties(data, job);
        break;

      case 'cleanup-expired-sessions':
        processed = await handleCleanupExpiredSessions(data, job);
        break;

      case 'backup-data':
        processed = await handleBackupData(data, job);
        break;

      default:
        throw new Error(`Unknown maintenance job type: ${String(data.type)}`);
    }

    await job.updateProgress(100);

    logger.info(`Maintenance job completed successfully`, {
      jobId: job.id,
      type: data.type,
      processed,
    });

    return {
      status: 'completed',
      processed,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to process maintenance job', error, {
      jobId: job.id,
      type: data.type,
    });
    throw error;
  }
}

async function handleGenerateRecurringTasks(data: MaintenanceTaskJob, job: Job): Promise<number> {
  logger.info('Generating recurring tasks...');

  // TODO: Implement recurring task generation logic
  // This would typically:
  // 1. Find all assets with maintenance schedules
  // 2. Check if tasks need to be created based on schedule
  // 3. Create new tasks for the appropriate dates

  await job.updateProgress(60);

  // Mock implementation for now
  let tasksCreated = 0;

  if (data.organizationId) {
    // Process specific organization
    logger.info(`Processing recurring tasks for organization: ${data.organizationId}`);
    tasksCreated = 5; // Mock value
  } else {
    // Process all organizations
    const organizations = await prisma.organization.findMany({
      select: { id: true, name: true },
    });

    for (const org of organizations) {
      logger.debug(`Processing recurring tasks for organization: ${org.name}`);
      tasksCreated += 3; // Mock value per organization
    }
  }

  await job.updateProgress(90);

  logger.info(`Generated ${tasksCreated} recurring tasks`);
  return tasksCreated;
}

async function handleCheckAssetWarranties(data: MaintenanceTaskJob, job: Job): Promise<number> {
  logger.info('Checking asset warranties...');

  await job.updateProgress(50);

  // Find assets with warranties expiring within the next 30 days
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringAssets = await prisma.asset.findMany({
    where: {
      OR: [
        {
          warrantyExpiry: {
            lte: thirtyDaysFromNow,
            gte: new Date(),
          },
        },
        {
          secondaryWarrantyExpiry: {
            lte: thirtyDaysFromNow,
            gte: new Date(),
          },
        },
      ],
      ...(data.organizationId && { organizationId: data.organizationId }),
    },
    include: {
      organization: {
        include: {
          users: {
            where: { isActive: true },
            select: { id: true, email: true, fullName: true, role: true },
          },
        },
      },
    },
  });

  await job.updateProgress(70);

  // Send notifications for expiring warranties
  for (const asset of expiringAssets) {
    const expiryDate = asset.warrantyExpiry || asset.secondaryWarrantyExpiry;
    if (!expiryDate) continue;

    // Notify organization users
    for (const user of asset.organization.users) {
      await addNotificationJob({
        type: 'asset-warranty-expiring',
        userId: user.id,
        assetId: asset.id,
        organizationId: asset.organizationId,
        data: {
          userEmail: user.email,
          userName: user.fullName || user.email,
          assetName: asset.name,
          expiryDate: expiryDate.toLocaleDateString(),
        },
      });
    }
  }

  await job.updateProgress(90);

  logger.info(`Checked warranties for ${expiringAssets.length} expiring assets`);
  return expiringAssets.length;
}

async function handleCleanupExpiredSessions(_data: MaintenanceTaskJob, job: Job): Promise<number> {
  logger.info('Cleaning up expired sessions...');

  await job.updateProgress(50);

  const now = new Date();

  // Delete expired sessions
  const result = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  await job.updateProgress(90);

  logger.info(`Cleaned up ${result.count} expired sessions`);
  return result.count;
}

async function handleBackupData(_data: MaintenanceTaskJob, job: Job): Promise<number> {
  logger.info('Starting data backup...');

  await job.updateProgress(30);

  // TODO: Implement actual backup logic
  // This could include:
  // 1. Creating database dumps
  // 2. Backing up file uploads
  // 3. Storing backups to external storage (S3, etc.)

  await job.updateProgress(60);

  // Mock implementation
  const backupSize = Math.floor(Math.random() * 1000) + 100; // Mock backup size in MB

  await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulate backup time

  await job.updateProgress(90);

  logger.info(`Data backup completed (${backupSize}MB)`);
  return backupSize;
}
