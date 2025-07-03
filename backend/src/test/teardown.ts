/**
 * Global teardown for Jest tests
 * Closes all Redis/BullMQ connections to prevent open handles
 */

import {
  emailQueue,
  notificationQueue,
  maintenanceQueue,
  reportQueue,
  scheduleQueue,
  activityQueue,
  pushNotificationQueue,
  webhookQueue,
  syncQueue,
  emailQueueEvents,
  notificationQueueEvents,
  maintenanceQueueEvents,
  reportQueueEvents,
  scheduleQueueEvents,
  activityQueueEvents,
  webhookQueueEvents,
  syncQueueEvents,
} from '../lib/queue';

export default async function teardown() {
  console.log('Closing BullMQ connections...');

  // Close all queues
  await Promise.all([
    emailQueue.close(),
    notificationQueue.close(),
    maintenanceQueue.close(),
    reportQueue.close(),
    scheduleQueue.close(),
    activityQueue.close(),
    pushNotificationQueue.close(),
    webhookQueue.close(),
    syncQueue.close(),
  ]);

  // Close all queue events
  await Promise.all([
    emailQueueEvents.close(),
    notificationQueueEvents.close(),
    maintenanceQueueEvents.close(),
    reportQueueEvents.close(),
    scheduleQueueEvents.close(),
    activityQueueEvents.close(),
    webhookQueueEvents.close(),
    syncQueueEvents.close(),
  ]);

  console.log('BullMQ connections closed.');
}
