import { apiClient } from '@/lib/api-client';
import { Schedule, ScheduleType, PaginatedResponse } from '@/types';

export interface ScheduleFilters {
  search?: string;
  scheduleType?: ScheduleType;
  assetId?: string;
  isActive?: boolean;
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const scheduleApi = {
  // Get paginated schedules
  getSchedules: async (filters: ScheduleFilters = {}): Promise<PaginatedResponse<Schedule>> => {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const response = await apiClient.get<PaginatedResponse<Schedule>>('/schedules', { params });
    return response.data;
  },

  // Get simple list of schedules
  getSchedulesList: async (includeInactive = false): Promise<Schedule[]> => {
    const response = await apiClient.get<Schedule[]>('/schedules/simple', {
      params: { includeInactive },
    });
    return response.data;
  },

  // Get single schedule
  getSchedule: async (id: string): Promise<Schedule> => {
    const response = await apiClient.get<Schedule>(`/schedules/${id}`);
    return response.data;
  },

  // Create schedule
  createSchedule: async (data: {
    name: string;
    description?: string;
    scheduleType: ScheduleType;
    taskTemplate: Record<string, unknown>;
    startDate: string;
    endDate?: string;
    recurrenceRule?: string;
    intervalDays?: number;
    isActive?: boolean;
    assetId?: string;
  }): Promise<Schedule> => {
    const response = await apiClient.post<Schedule>('/schedules', data);
    return response.data;
  },

  // Update schedule
  updateSchedule: async (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      scheduleType: ScheduleType;
      taskTemplate: Record<string, unknown>;
      startDate: string;
      endDate: string;
      recurrenceRule: string;
      intervalDays: number;
      isActive: boolean;
      assetId: string;
    }>
  ): Promise<Schedule> => {
    const response = await apiClient.put<Schedule>(`/schedules/${id}`, data);
    return response.data;
  },

  // Delete schedule
  deleteSchedule: async (id: string): Promise<void> => {
    await apiClient.delete(`/schedules/${id}`);
  },

  // Get schedule statistics
  getScheduleStats: async (id: string): Promise<{
    taskCount: number;
    lastGenerated: string | null;
    nextOccurrence: string | null;
    isInUse: boolean;
  }> => {
    const response = await apiClient.get(`/schedules/${id}/stats`);
    return response.data;
  },

  // Generate tasks from schedule (manual trigger)
  generateTasks: async (id: string, count?: number): Promise<{
    generated: number;
    tasks: string[];
  }> => {
    const response = await apiClient.post(`/schedules/${id}/generate`, { count });
    return response.data;
  },

  // Validate recurrence rule
  validateRecurrenceRule: async (rule: string): Promise<{
    valid: boolean;
    error?: string;
    nextOccurrences?: string[];
  }> => {
    const response = await apiClient.post('/schedules/validate-rrule', { rule });
    return response.data;
  },

  // Preview schedule occurrences
  previewOccurrences: async (data: {
    scheduleType: ScheduleType;
    startDate: string;
    endDate?: string;
    recurrenceRule?: string;
    intervalDays?: number;
    count?: number;
  }): Promise<{
    occurrences: string[];
    hasMore: boolean;
  }> => {
    const response = await apiClient.post('/schedules/preview', data);
    return response.data;
  },
};