import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  notificationsApi, 
  type NotificationPreferences,
  type NotificationListParams 
} from '../api/notifications-api';
import { queryKeys } from '../lib/queryKeys';

export function useNotificationSettings() {
  return useQuery({
    queryKey: queryKeys.notifications.settings(),
    queryFn: () => notificationsApi.getNotificationSettings(),
  });
}

export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: Partial<NotificationPreferences>) =>
      notificationsApi.updateNotificationSettings(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.settings() });
    },
  });
}

export function useSubscribeToPushNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (subscription: PushSubscriptionJSON) =>
      notificationsApi.subscribeToPushNotifications(subscription),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.settings() });
    },
  });
}

export function useUnsubscribeFromPushNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.unsubscribeFromPushNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.settings() });
    },
  });
}

export function useNotifications(params?: NotificationListParams) {
  return useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => notificationsApi.getNotifications(params),
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsApi.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    },
  });
}

export function useTestNotificationSettings() {
  return useMutation({
    mutationFn: (channel: 'email' | 'push' | 'apprise') =>
      notificationsApi.testNotificationSettings(channel),
  });
}