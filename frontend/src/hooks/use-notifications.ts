import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationApi, NotificationFilters } from '@/api/notification-api';

// Query keys
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (filters: NotificationFilters) => [...notificationKeys.lists(), filters] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
};

// Get notifications list
export const useNotifications = (filters: NotificationFilters = {}) => {
  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: () => notificationApi.getNotifications(filters),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

// Get unread notification count
export const useUnreadNotificationCount = () => {
  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationApi.getUnreadCount(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

// Mark notification as read
export const useMarkNotificationAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
};

// Mark all notifications as read
export const useMarkAllNotificationsAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
};

// Delete notification
export const useDeleteNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationApi.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
};

// Clear all notifications
export const useClearAllNotifications = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationApi.clearAll(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
};