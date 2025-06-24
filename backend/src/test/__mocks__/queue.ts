/**
 * Mock implementation of queue module for tests
 * Prevents actual Redis connections and queue operations during testing
 */

// Mock job object
export const mockJob = {
  id: 'mock-job-id',
  name: 'mock-job',
  data: {},
  opts: {},
  timestamp: Date.now(),
  finishedOn: undefined,
  processedOn: undefined,
  progress: 0,
};

// Mock queue functions that return promises
export const addEmailJob = jest.fn().mockResolvedValue(mockJob);
export const addNotificationJob = jest.fn().mockResolvedValue(mockJob);
export const addMaintenanceJob = jest.fn().mockResolvedValue(mockJob);
export const addReportJob = jest.fn().mockResolvedValue(mockJob);
export const addScheduleJob = jest.fn().mockResolvedValue(mockJob);

// Mock queue instances
const createMockQueue = (name: string) => ({
  name,
  add: jest.fn().mockResolvedValue(mockJob),
  close: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  getWaiting: jest.fn().mockResolvedValue([]),
  getActive: jest.fn().mockResolvedValue([]),
  getCompleted: jest.fn().mockResolvedValue([]),
  getFailed: jest.fn().mockResolvedValue([]),
  getDelayed: jest.fn().mockResolvedValue([]),
  getWaitingCount: jest.fn().mockResolvedValue(0),
  getActiveCount: jest.fn().mockResolvedValue(0),
  obliterate: jest.fn().mockResolvedValue(undefined),
});

export const emailQueue = createMockQueue('email');
export const notificationQueue = createMockQueue('notifications');
export const maintenanceQueue = createMockQueue('maintenance-tasks');
export const reportQueue = createMockQueue('reports');
export const scheduleQueue = createMockQueue('schedules');

// Mock queue events
const createMockQueueEvents = () => ({
  on: jest.fn(),
  off: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
});

export const emailQueueEvents = createMockQueueEvents();
export const notificationQueueEvents = createMockQueueEvents();
export const maintenanceQueueEvents = createMockQueueEvents();
export const reportQueueEvents = createMockQueueEvents();
export const scheduleQueueEvents = createMockQueueEvents();

// Mock health check
export const getQueueHealth = jest.fn().mockResolvedValue({
  queues: [
    { name: 'email', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'notifications', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'maintenance-tasks', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'reports', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
    { name: 'schedules', waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
  ],
});

// Mock management functions
export const pauseAllQueues = jest.fn().mockResolvedValue(undefined);
export const resumeAllQueues = jest.fn().mockResolvedValue(undefined);
export const closeQueues = jest.fn().mockResolvedValue(undefined);

// Export queues object
export const queues = {
  email: emailQueue,
  notifications: notificationQueue,
  maintenance: maintenanceQueue,
  reports: reportQueue,
  schedules: scheduleQueue,
};

// Reset all mocks utility
export const resetQueueMocks = () => {
  addEmailJob.mockClear();
  addNotificationJob.mockClear();
  addMaintenanceJob.mockClear();
  addReportJob.mockClear();
  addScheduleJob.mockClear();
  
  Object.values(queues).forEach(queue => {
    queue.add.mockClear();
    queue.close.mockClear();
    queue.pause.mockClear();
    queue.resume.mockClear();
    queue.getWaiting.mockClear();
    queue.getActive.mockClear();
    queue.getCompleted.mockClear();
    queue.getFailed.mockClear();
    queue.getDelayed.mockClear();
    queue.getWaitingCount.mockClear();
    queue.getActiveCount.mockClear();
    queue.obliterate.mockClear();
  });
  
  getQueueHealth.mockClear();
  pauseAllQueues.mockClear();
  resumeAllQueues.mockClear();
  closeQueues.mockClear();
};