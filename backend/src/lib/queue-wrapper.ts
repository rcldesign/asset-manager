/**
 * Queue wrapper to prevent queue initialization during tests
 * This helps avoid creating Redis connections during test runs
 */

import type { Queue, QueueEvents } from 'bullmq';

let _emailQueue: Queue | undefined;
let _notificationQueue: Queue | undefined;
let _maintenanceQueue: Queue | undefined;
let _reportQueue: Queue | undefined;
let _scheduleQueue: Queue | undefined;

let _emailQueueEvents: QueueEvents | undefined;
let _notificationQueueEvents: QueueEvents | undefined;
let _maintenanceQueueEvents: QueueEvents | undefined;
let _reportQueueEvents: QueueEvents | undefined;
let _scheduleQueueEvents: QueueEvents | undefined;

/**
 * Get queues lazily - only initialize when actually needed
 */
export function getQueues() {
  // Don't initialize queues in test environment unless explicitly needed
  if (process.env.NODE_ENV === 'test') {
    return {
      emailQueue: undefined,
      notificationQueue: undefined,
      maintenanceQueue: undefined,
      reportQueue: undefined,
      scheduleQueue: undefined,
      emailQueueEvents: undefined,
      notificationQueueEvents: undefined,
      maintenanceQueueEvents: undefined,
      reportQueueEvents: undefined,
      scheduleQueueEvents: undefined,
    };
  }

  // Lazy load the actual queues only when needed
  if (!_emailQueue) {
    const queues = require('./queue');
    _emailQueue = queues.emailQueue;
    _notificationQueue = queues.notificationQueue;
    _maintenanceQueue = queues.maintenanceQueue;
    _reportQueue = queues.reportQueue;
    _scheduleQueue = queues.scheduleQueue;
    _emailQueueEvents = queues.emailQueueEvents;
    _notificationQueueEvents = queues.notificationQueueEvents;
    _maintenanceQueueEvents = queues.maintenanceQueueEvents;
    _reportQueueEvents = queues.reportQueueEvents;
    _scheduleQueueEvents = queues.scheduleQueueEvents;
  }

  return {
    emailQueue: _emailQueue,
    notificationQueue: _notificationQueue,
    maintenanceQueue: _maintenanceQueue,
    reportQueue: _reportQueue,
    scheduleQueue: _scheduleQueue,
    emailQueueEvents: _emailQueueEvents,
    notificationQueueEvents: _notificationQueueEvents,
    maintenanceQueueEvents: _maintenanceQueueEvents,
    reportQueueEvents: _reportQueueEvents,
    scheduleQueueEvents: _scheduleQueueEvents,
  };
}
