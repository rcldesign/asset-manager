import { apiClient } from '../lib/api-client';

export interface NotificationPreferences {
  email: {
    enabled: boolean;
    taskAssigned: boolean;
    taskDue: boolean;
    taskOverdue: boolean;
    assetWarrantyExpiring: boolean;
    scheduleChanged: boolean;
    mentioned: boolean;
  };
  push: {
    enabled: boolean;
    taskAssigned: boolean;
    taskDue: boolean;
    taskOverdue: boolean;
    assetWarrantyExpiring: boolean;
    scheduleChanged: boolean;
    mentioned: boolean;
  };
  apprise: {
    enabled: boolean;
    urls?: string[];
  };
  webhooks: {
    enabled: boolean;
  };
}

export interface NotificationSettings {
  id: string;
  userId: string;
  preferences: NotificationPreferences;
  pushSubscription?: PushSubscription;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationListParams {
  read?: boolean;
  type?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const notificationsApi = {
  /**
   * Get user's notification preferences
   */
  async getNotificationSettings() {
    const { data } = await apiClient.get<NotificationSettings>('/notifications/settings');
    return data;
  },

  /**
   * Update notification preferences
   */
  async updateNotificationSettings(preferences: Partial<NotificationPreferences>) {
    const { data } = await apiClient.put<NotificationSettings>('/notifications/settings', {
      preferences,
    });
    return data;
  },

  /**
   * Subscribe to push notifications
   */
  async subscribeToPushNotifications(subscription: PushSubscriptionJSON) {
    const { data } = await apiClient.post<{ message: string }>('/notifications/push/subscribe', {
      subscription,
    });
    return data;
  },

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribeFromPushNotifications() {
    const { data } = await apiClient.post<{ message: string }>('/notifications/push/unsubscribe');
    return data;
  },

  /**
   * Get list of notifications
   */
  async getNotifications(params?: NotificationListParams) {
    const { data } = await apiClient.get<{
      notifications: Notification[];
      total: number;
      page: number;
      limit: number;
      unreadCount: number;
    }>('/notifications', { params });
    return data;
  },

  /**
   * Mark notification as read
   */
  async markNotificationAsRead(id: string) {
    const { data } = await apiClient.patch<Notification>(`/notifications/${id}/read`);
    return data;
  },

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsAsRead() {
    const { data } = await apiClient.post<{ message: string; count: number }>('/notifications/read-all');
    return data;
  },

  /**
   * Delete notification
   */
  async deleteNotification(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/notifications/${id}`);
    return data;
  },

  /**
   * Test notification settings
   */
  async testNotificationSettings(channel: 'email' | 'push' | 'apprise') {
    const { data } = await apiClient.post<{ message: string; success: boolean }>(
      `/notifications/test/${channel}`
    );
    return data;
  },
};