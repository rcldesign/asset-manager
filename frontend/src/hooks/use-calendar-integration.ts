import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  calendarIntegrationApi, 
  type GoogleCalendarSyncOptions 
} from '../api/calendar-integration-api';
import { queryKeys } from '../lib/queryKeys';

export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: queryKeys.calendar.google.status(),
    queryFn: () => calendarIntegrationApi.getGoogleCalendarStatus(),
  });
}

export function useGoogleAuthUrl(redirectUrl?: string) {
  return useQuery({
    queryKey: queryKeys.calendar.google.authUrl(),
    queryFn: () => calendarIntegrationApi.getGoogleAuthUrl(redirectUrl),
    enabled: false, // Only fetch when explicitly triggered
  });
}

export function useHandleGoogleCallback() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ code, state }: { code: string; state?: string }) =>
      calendarIntegrationApi.handleGoogleCallback(code, state),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.google.status() });
    },
  });
}

export function useSyncWithGoogleCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: GoogleCalendarSyncOptions) =>
      calendarIntegrationApi.syncWithGoogleCalendar(options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.google.status() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
    },
  });
}

export function useDisconnectGoogleCalendar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => calendarIntegrationApi.disconnectGoogleCalendar(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.google.status() });
    },
  });
}

export function useICalStatus() {
  return useQuery({
    queryKey: queryKeys.calendar.ical.status(),
    queryFn: () => calendarIntegrationApi.getICalStatus(),
  });
}

export function useGenerateICalToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => calendarIntegrationApi.generateICalToken(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.ical.status() });
    },
  });
}

export function useRevokeICalToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => calendarIntegrationApi.revokeICalToken(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.ical.status() });
    },
  });
}