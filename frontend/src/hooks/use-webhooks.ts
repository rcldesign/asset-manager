import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  webhooksApi, 
  type CreateWebhookDto, 
  type WebhookListParams,
  type WebhookDeliveryParams
} from '../api/webhooks-api';
import { queryKeys } from '../lib/queryKeys';

export function useWebhooks(params?: WebhookListParams) {
  return useQuery({
    queryKey: queryKeys.webhooks.list(),
    queryFn: () => webhooksApi.getWebhooks(params),
  });
}

export function useWebhook(id: string) {
  return useQuery({
    queryKey: queryKeys.webhooks.detail(id),
    queryFn: () => webhooksApi.getWebhook(id),
    enabled: !!id,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (webhook: CreateWebhookDto) => webhooksApi.createWebhook(webhook),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all() });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, webhook }: { id: string; webhook: Partial<CreateWebhookDto> }) =>
      webhooksApi.updateWebhook(id, webhook),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all() });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => webhooksApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all() });
    },
  });
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: string) => webhooksApi.testWebhook(id),
  });
}

export function useWebhookDeliveries(webhookId: string, params?: WebhookDeliveryParams) {
  return useQuery({
    queryKey: queryKeys.webhooks.deliveries(webhookId),
    queryFn: () => webhooksApi.getWebhookDeliveries(webhookId, params),
    enabled: !!webhookId,
  });
}

export function useRetryWebhookDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ webhookId, deliveryId }: { webhookId: string; deliveryId: string }) =>
      webhooksApi.retryWebhookDelivery(webhookId, deliveryId),
    onSuccess: (_, { webhookId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.deliveries(webhookId) });
    },
  });
}

export function useAvailableWebhookEvents() {
  return useQuery({
    queryKey: [...queryKeys.webhooks.all(), 'events'],
    queryFn: () => webhooksApi.getAvailableEvents(),
  });
}