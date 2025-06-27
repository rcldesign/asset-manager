import { APIRequestContext, expect } from '@playwright/test';

interface TestUser {
  id: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  organizationId: string;
}

interface TestAsset {
  id: string;
  name: string;
  description?: string;
  locationId?: string;
  templateId?: string;
}

interface TestSchedule {
  id: string;
  name: string;
  assetId: string;
  frequency: 'SEASONAL' | 'MONTHLY' | 'USAGE_BASED';
  config: any;
}

interface TestTask {
  id: string;
  title: string;
  description?: string;
  assetId: string;
  scheduleId?: string;
  assignedToId?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
}

/**
 * Helper class for E2E test data management
 * Provides methods to create and clean up test data via API calls
 */
export class ApiHelpers {
  private request: APIRequestContext;
  private baseUrl: string;
  private createdEntities: {
    users: string[];
    assets: string[];
    schedules: string[];
    tasks: string[];
    organizations: string[];
  } = {
    users: [],
    assets: [],
    schedules: [],
    tasks: [],
    organizations: []
  };

  constructor(request: APIRequestContext, baseUrl = 'http://localhost:3001') {
    this.request = request;
    this.baseUrl = baseUrl;
  }

  /**
   * Create a test organization
   */
  async createOrganization(data: { name: string; description?: string }) {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/organizations`, {
      data
    });
    expect(response.ok()).toBeTruthy();
    const organization = await response.json();
    this.createdEntities.organizations.push(organization.id);
    return organization;
  }

  /**
   * Create a test user with automatic login token
   */
  async createUser(data: {
    email: string;
    fullName: string;
    role?: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
    organizationId?: string;
  }): Promise<TestUser & { token: string }> {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/users`, {
      data: {
        email: data.email,
        fullName: data.fullName,
        role: data.role || 'MEMBER',
        organizationId: data.organizationId
      }
    });
    expect(response.ok()).toBeTruthy();
    const user = await response.json();
    this.createdEntities.users.push(user.id);
    return user;
  }

  /**
   * Create a test asset
   */
  async createAsset(data: {
    name: string;
    description?: string;
    locationId?: string;
    templateId?: string;
    organizationId: string;
  }): Promise<TestAsset> {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/assets`, {
      data
    });
    expect(response.ok()).toBeTruthy();
    const asset = await response.json();
    this.createdEntities.assets.push(asset.id);
    return asset;
  }

  /**
   * Create a test location
   */
  async createLocation(data: {
    name: string;
    description?: string;
    parentId?: string;
    organizationId: string;
  }) {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/locations`, {
      data
    });
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Create a seasonal schedule
   */
  async createSeasonalSchedule(data: {
    name: string;
    assetId: string;
    seasons: string[];
    taskTemplateId: string;
    organizationId: string;
  }): Promise<TestSchedule> {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/schedules`, {
      data: {
        name: data.name,
        assetId: data.assetId,
        frequency: 'SEASONAL',
        config: {
          seasons: data.seasons,
          taskTemplateId: data.taskTemplateId
        },
        organizationId: data.organizationId
      }
    });
    expect(response.ok()).toBeTruthy();
    const schedule = await response.json();
    this.createdEntities.schedules.push(schedule.id);
    return schedule;
  }

  /**
   * Create a usage-based schedule
   */
  async createUsageBasedSchedule(data: {
    name: string;
    assetId: string;
    counterType: 'HOURS' | 'CYCLES' | 'CUSTOM';
    threshold: number;
    taskTemplateId: string;
    organizationId: string;
  }): Promise<TestSchedule> {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/schedules`, {
      data: {
        name: data.name,
        assetId: data.assetId,
        frequency: 'USAGE_BASED',
        config: {
          counterType: data.counterType,
          usageThreshold: data.threshold,
          taskTemplateId: data.taskTemplateId
        },
        organizationId: data.organizationId
      }
    });
    expect(response.ok()).toBeTruthy();
    const schedule = await response.json();
    this.createdEntities.schedules.push(schedule.id);
    return schedule;
  }

  /**
   * Create a test task
   */
  async createTask(data: {
    title: string;
    description?: string;
    assetId: string;
    assignedToId?: string;
    status?: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
    organizationId: string;
  }): Promise<TestTask> {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/tasks`, {
      data: {
        ...data,
        status: data.status || 'PLANNED'
      }
    });
    expect(response.ok()).toBeTruthy();
    const task = await response.json();
    this.createdEntities.tasks.push(task.id);
    return task;
  }

  /**
   * Create a task with subtasks
   */
  async createTaskWithSubtasks(data: {
    title: string;
    assetId: string;
    subtasks: { title: string; description?: string }[];
    organizationId: string;
  }) {
    const task = await this.createTask({
      title: data.title,
      assetId: data.assetId,
      organizationId: data.organizationId
    });

    const subtasks = [];
    for (const subtaskData of data.subtasks) {
      const response = await this.request.post(`${this.baseUrl}/api/test-data/subtasks`, {
        data: {
          ...subtaskData,
          parentTaskId: task.id,
          organizationId: data.organizationId
        }
      });
      expect(response.ok()).toBeTruthy();
      subtasks.push(await response.json());
    }

    return { task, subtasks };
  }

  /**
   * Assign multiple users to a task
   */
  async assignUsersToTask(taskId: string, userIds: string[]) {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/task-assignments`, {
      data: { taskId, userIds }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Update asset usage counter
   */
  async updateUsageCounter(assetId: string, counterType: string, value: number) {
    const response = await this.request.patch(`${this.baseUrl}/api/test-data/assets/${assetId}/counters`, {
      data: { counterType, value }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Trigger scheduled task generation (for testing schedulers)
   */
  async runScheduler() {
    const response = await this.request.post(`${this.baseUrl}/api/test-support/run-scheduler`);
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Send test notification to verify notification channels
   */
  async sendTestNotification(userId: string, type: 'email' | 'push' | 'apprise') {
    const response = await this.request.post(`${this.baseUrl}/api/test-support/send-notification`, {
      data: { userId, type, message: 'Test notification from E2E test' }
    });
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Get notification inbox (for testing email/webhook delivery)
   */
  async getNotificationInbox(type: 'email' | 'webhook') {
    const response = await this.request.get(`${this.baseUrl}/api/test-support/inbox/${type}`);
    expect(response.ok()).toBeTruthy();
    return await response.json();
  }

  /**
   * Clean up all created test data
   * This should be called in afterEach hooks
   */
  async cleanup() {
    // Clean up in reverse dependency order
    for (const taskId of this.createdEntities.tasks) {
      await this.request.delete(`${this.baseUrl}/api/test-data/tasks/${taskId}`);
    }
    
    for (const scheduleId of this.createdEntities.schedules) {
      await this.request.delete(`${this.baseUrl}/api/test-data/schedules/${scheduleId}`);
    }
    
    for (const assetId of this.createdEntities.assets) {
      await this.request.delete(`${this.baseUrl}/api/test-data/assets/${assetId}`);
    }
    
    for (const userId of this.createdEntities.users) {
      await this.request.delete(`${this.baseUrl}/api/test-data/users/${userId}`);
    }
    
    for (const orgId of this.createdEntities.organizations) {
      await this.request.delete(`${this.baseUrl}/api/test-data/organizations/${orgId}`);
    }

    // Reset tracking
    this.createdEntities = {
      users: [],
      assets: [],
      schedules: [],
      tasks: [],
      organizations: []
    };
  }

  /**
   * Get authentication token for a user
   */
  async getUserToken(userId: string): Promise<string> {
    const response = await this.request.post(`${this.baseUrl}/api/test-data/users/${userId}/token`);
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    return result.token;
  }
}