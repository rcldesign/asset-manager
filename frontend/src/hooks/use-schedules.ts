import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleApi } from '@/api/schedule-api';
import { ScheduleFilters } from '@/api/schedule-api';
import { ScheduleType } from '@/types';

// Query keys
export const scheduleKeys = {
  all: ['schedules'] as const,
  lists: () => [...scheduleKeys.all, 'list'] as const,
  list: (filters: ScheduleFilters) => [...scheduleKeys.lists(), filters] as const,
  simpleList: (includeInactive: boolean) => [...scheduleKeys.all, 'simple', includeInactive] as const,
  detail: (id: string) => [...scheduleKeys.all, 'detail', id] as const,
  stats: (id: string) => [...scheduleKeys.all, 'stats', id] as const,
  preview: (data: Record<string, unknown>) => [...scheduleKeys.all, 'preview', data] as const,
};

// Get paginated schedules
export const useSchedulesPaginated = (filters: ScheduleFilters = {}) => {
  return useQuery({
    queryKey: scheduleKeys.list(filters),
    queryFn: () => scheduleApi.getSchedules(filters),
    placeholderData: (previousData) => previousData,
  });
};

// Get simple list of schedules (for dropdowns)
export const useSchedules = (includeInactive = false) => {
  return useQuery({
    queryKey: scheduleKeys.simpleList(includeInactive),
    queryFn: () => scheduleApi.getSchedulesList(includeInactive),
  });
};

// Get single schedule
export const useSchedule = (id: string, enabled = true) => {
  return useQuery({
    queryKey: scheduleKeys.detail(id),
    queryFn: () => scheduleApi.getSchedule(id),
    enabled: enabled && !!id,
  });
};

// Get schedule statistics
export const useScheduleStats = (id: string, enabled = true) => {
  return useQuery({
    queryKey: scheduleKeys.stats(id),
    queryFn: () => scheduleApi.getScheduleStats(id),
    enabled: enabled && !!id,
  });
};

// Create schedule mutation
export const useCreateSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
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
    }) => scheduleApi.createSchedule(data),
    onSuccess: () => {
      // Invalidate all schedule lists
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.simpleList(true) });
    },
  });
};

// Update schedule mutation
export const useUpdateSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{
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
    }> }) => scheduleApi.updateSchedule(id, data),
    onSuccess: (updatedSchedule) => {
      // Update the specific schedule in cache
      queryClient.setQueryData(scheduleKeys.detail(updatedSchedule.id), updatedSchedule);
      // Invalidate lists as the schedule data has changed
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.simpleList(true) });
    },
  });
};

// Delete schedule mutation
export const useDeleteSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => scheduleApi.deleteSchedule(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: scheduleKeys.detail(deletedId) });
      queryClient.removeQueries({ queryKey: scheduleKeys.stats(deletedId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.simpleList(true) });
    },
  });
};

// Generate tasks mutation
export const useGenerateTasks = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, count }: { id: string; count?: number }) =>
      scheduleApi.generateTasks(id, count),
    onSuccess: (_, variables) => {
      // Invalidate schedule stats as task count may have changed
      queryClient.invalidateQueries({ queryKey: scheduleKeys.stats(variables.id) });
      // Invalidate task lists if they exist
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
};

// Validate recurrence rule
export const useValidateRecurrenceRule = () => {
  return useMutation({
    mutationFn: (rule: string) => scheduleApi.validateRecurrenceRule(rule),
  });
};

// Preview schedule occurrences
export const usePreviewOccurrences = (data: {
  scheduleType: ScheduleType;
  startDate: string;
  endDate?: string;
  recurrenceRule?: string;
  intervalDays?: number;
  count?: number;
}) => {
  return useQuery({
    queryKey: scheduleKeys.preview(data),
    queryFn: () => scheduleApi.previewOccurrences(data),
    enabled: !!data.startDate && !!data.scheduleType,
    staleTime: 30000, // Keep preview data fresh for 30 seconds
  });
};