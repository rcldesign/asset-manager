import { apiClient } from '../lib/api-client';

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  organizationId: string;
  lastTriggeredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  payload: Record<string, any>;
  status: 'pending' | 'success' | 'failed';
  attempts: number;
  lastAttemptAt: string;
  nextRetryAt?: string;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  createdAt: string;
}

export interface CreateWebhookDto {
  url: string;
  events: string[];
  secret?: string;
  isActive?: boolean;
}

export interface WebhookListParams {
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface WebhookDeliveryParams {
  status?: 'pending' | 'success' | 'failed';
  eventType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const webhooksApi = {
  /**
   * Get list of webhooks
   */
  async getWebhooks(params?: WebhookListParams) {
    const { data } = await apiClient.get<{
      webhooks: Webhook[];
      total: number;
      page: number;
      limit: number;
    }>('/webhooks', { params });
    return data;
  },

  /**
   * Get webhook by ID
   */
  async getWebhook(id: string) {
    const { data } = await apiClient.get<Webhook>(`/webhooks/${id}`);
    return data;
  },

  /**
   * Create a new webhook
   */
  async createWebhook(webhook: CreateWebhookDto) {
    const { data } = await apiClient.post<Webhook>('/webhooks', webhook);
    return data;
  },

  /**
   * Update a webhook
   */
  async updateWebhook(id: string, webhook: Partial<CreateWebhookDto>) {
    const { data } = await apiClient.put<Webhook>(`/webhooks/${id}`, webhook);
    return data;
  },

  /**
   * Delete a webhook
   */
  async deleteWebhook(id: string) {
    const { data } = await apiClient.delete<{ message: string }>(`/webhooks/${id}`);
    return data;
  },

  /**
   * Test a webhook
   */
  async testWebhook(id: string) {
    const { data } = await apiClient.post<{
      success: boolean;
      message: string;
      deliveryId?: string;
    }>(`/webhooks/${id}/test`);
    return data;
  },

  /**
   * Get webhook deliveries
   */
  async getWebhookDeliveries(webhookId: string, params?: WebhookDeliveryParams) {
    const { data } = await apiClient.get<{
      deliveries: WebhookDelivery[];
      total: number;
      page: number;
      limit: number;
    }>(`/webhooks/${webhookId}/deliveries`, { params });
    return data;
  },

  /**
   * Retry webhook delivery
   */
  async retryWebhookDelivery(webhookId: string, deliveryId: string) {
    const { data } = await apiClient.post<{
      success: boolean;
      message: string;
    }>(`/webhooks/${webhookId}/deliveries/${deliveryId}/retry`);
    return data;
  },

  /**
   * Get available webhook events
   */
  async getAvailableEvents() {
    const { data } = await apiClient.get<{
      events: Array<{
        name: string;
        description: string;
        category: string;
      }>;
    }>('/webhooks/events');
    return data;
  },
};