import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  advancedSchedulesApi, 
  type CreateAdvancedScheduleDto, 
  type AdvancedScheduleListParams 
} from '../api/advanced-schedules-api';
import { queryKeys } from '../lib/queryKeys';

export function useAdvancedSchedules(params?: AdvancedScheduleListParams) {
  return useQuery({
    queryKey: queryKeys.schedules.list(params),
    queryFn: () => advancedSchedulesApi.getSchedules(params),
  });
}

export function useAdvancedSchedule(id: string) {
  return useQuery({
    queryKey: queryKeys.schedules.detail(id),
    queryFn: () => advancedSchedulesApi.getSchedule(id),
    enabled: !!id,
  });
}

export function useCreateAdvancedSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (schedule: CreateAdvancedScheduleDto) => advancedSchedulesApi.createSchedule(schedule),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all() });
      if (data.assetId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail(data.assetId) });
      }
    },
  });
}

export function useUpdateAdvancedSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, schedule }: { id: string; schedule: Partial<CreateAdvancedScheduleDto> }) =>
      advancedSchedulesApi.updateSchedule(id, schedule),
    onSuccess: (data, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all() });
      if (data.assetId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail(data.assetId) });
      }
    },
  });
}

export function useDeleteAdvancedSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => advancedSchedulesApi.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.schedules.all() });
    },
  });
}

export function usePreviewSchedule(id: string, days?: number) {
  return useQuery({
    queryKey: queryKeys.schedules.preview(id),
    queryFn: () => advancedSchedulesApi.previewSchedule(id, days),
    enabled: !!id,
  });
}

export function useUpdateUsageCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, increment }: { assetId: string; increment: number }) =>
      advancedSchedulesApi.updateUsageCounter(assetId, increment),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail(assetId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });
}