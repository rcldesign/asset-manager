import { apiClient } from '../lib/api-client';

export interface ActivityStreamEvent {
  id: string;
  action: string;
  actorId: string;
  actor?: {
    id: string;
    email: string;
    fullName?: string;
  };
  entityType: 'ASSET' | 'TASK' | 'SCHEDULE' | 'USER' | 'ORGANIZATION';
  entityId: string;
  entityName?: string;
  metadata?: Record<string, any>;
  organizationId: string;
  createdAt: string;
}

export interface ActivityStreamParams {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const activityStreamsApi = {
  /**
   * Get activity stream events
   */
  async getActivityStream(params?: ActivityStreamParams) {
    const { data } = await apiClient.get<{
      events: ActivityStreamEvent[];
      total: number;
      page: number;
      limit: number;
    }>('/activity-streams', { params });
    return data;
  },

  /**
   * Get activity stream for a specific asset
   */
  async getAssetActivityStream(assetId: string, params?: Omit<ActivityStreamParams, 'entityId' | 'entityType'>) {
    const { data } = await apiClient.get<{
      events: ActivityStreamEvent[];
      total: number;
      page: number;
      limit: number;
    }>(`/activity-streams/asset/${assetId}`, { params });
    return data;
  },

  /**
   * Get activity stream for the organization
   */
  async getOrganizationActivityStream(params?: ActivityStreamParams) {
    const { data } = await apiClient.get<{
      events: ActivityStreamEvent[];
      total: number;
      page: number;
      limit: number;
    }>('/activity-streams/organization', { params });
    return data;
  },

  /**
   * Get activity stream event by ID
   */
  async getActivityEvent(id: string) {
    const { data } = await apiClient.get<ActivityStreamEvent>(`/activity-streams/${id}`);
    return data;
  },
};