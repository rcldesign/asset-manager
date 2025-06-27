import { apiClient } from '@/lib/api-client';
import { Notification, PaginatedResponse } from '@/types';

export interface NotificationFilters {
  isRead?: boolean;
  type?: string;
  page?: number;
  limit?: number;
}

export const notificationApi = {
  // Get notifications for the current user
  getNotifications: async (filters: NotificationFilters = {}): Promise<PaginatedResponse<Notification>> => {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const response = await apiClient.get<PaginatedResponse<Notification>>('/notifications', { params });
    return response.data;
  },

  // Get unread notification count
  getUnreadCount: async (): Promise<{ count: number }> => {
    const response = await apiClient.get<{ count: number }>('/notifications/unread-count');
    return response.data;
  },

  // Mark notification as read
  markAsRead: async (id: string): Promise<Notification> => {
    const response = await apiClient.patch<Notification>(`/notifications/${id}/read`);
    return response.data;
  },

  // Mark all notifications as read
  markAllAsRead: async (): Promise<void> => {
    await apiClient.patch('/notifications/read-all');
  },

  // Delete notification
  deleteNotification: async (id: string): Promise<void> => {
    await apiClient.delete(`/notifications/${id}`);
  },

  // Clear all notifications
  clearAll: async (): Promise<void> => {
    await apiClient.delete('/notifications/clear-all');
  },
};