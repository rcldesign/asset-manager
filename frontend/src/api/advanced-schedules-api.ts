import { apiClient } from '../lib/api-client';

export interface AdvancedSchedule {
  id: string;
  name: string;
  description?: string;
  assetId: string;
  frequency: 'SEASONAL' | 'MONTHLY' | 'USAGE_BASED';
  config: {
    seasons?: string[];
    daysOfWeek?: number[];
    dayOfMonth?: number;
    usageThreshold?: number;
    dependencies?: string[];
    blackoutDates?: string[];
    businessDaysOnly?: boolean;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdvancedScheduleDto {
  name: string;
  description?: string;
  assetId: string;
  frequency: 'SEASONAL' | 'MONTHLY' | 'USAGE_BASED';
  config: {
    seasons?: string[];
    daysOfWeek?: number[];
    dayOfMonth?: number;
    usageThreshold?: number;
    dependencies?: string[];
    blackoutDates?: string[];
    businessDaysOnly?: boolean;
  };
  isActive?: boolean;
}

export interface AdvancedScheduleListParams {
  assetId?: string;
  frequency?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export const advancedSchedulesApi = {
  /**
   * Get list of advanced schedules
   */
  async getSchedules(params?: AdvancedScheduleListParams) {
    const { data } = await apiClient.get<{
      schedules: AdvancedSchedule[];
      total: number;
      page: number;
      limit: number;
    }>('/advanced-schedules', { params });
    return data;
  },

  /**
   * Get schedule by ID
   */
  async getSchedule(id: string) {
    const { data } = await apiClient.get<AdvancedSchedule>(`/advanced-schedules/${id}`);
    return data;
  },

  /**
   * Create a new advanced schedule
   */
  async createSchedule(schedule: CreateAdvancedScheduleDto) {
    const { data } = await apiClient.post<AdvancedSchedule>('/advanced-schedules', schedule);
    return data;
  },

  /**
   * Update an advanced schedule
   */
  async updateSchedule(id: string, schedule: Partial<CreateAdvancedScheduleDto>) {
    const { data } = await apiClient.put<AdvancedSchedule>(`/advanced-schedules/${id}`, schedule);
    return data;
  },

  /**
   * Delete an advanced schedule
   */
  async deleteSchedule(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/advanced-schedules/${id}`);
    return data;
  },

  /**
   * Preview tasks that would be generated
   */
  async previewSchedule(id: string, days: number = 30) {
    const { data } = await apiClient.get<{
      tasks: Array<{
        title: string;
        dueDate: string;
        estimatedMinutes?: number;
      }>;
    }>(`/advanced-schedules/${id}/preview`, { params: { days } });
    return data;
  },

  /**
   * Update usage counter for a usage-based schedule
   */
  async updateUsageCounter(assetId: string, increment: number) {
    const { data } = await apiClient.post<{
      currentValue: number;
      threshold: number;
      taskGenerated: boolean;
    }>(`/advanced-schedules/usage-counter`, { assetId, increment });
    return data;
  },
};