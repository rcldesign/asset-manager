import { useQuery } from '@tanstack/react-query';
import { activityStreamsApi, type ActivityStreamParams } from '../api/activity-streams-api';
import { queryKeys } from '../lib/queryKeys';

export function useActivityStream(params?: ActivityStreamParams) {
  return useQuery({
    queryKey: queryKeys.activityStreams.list(params),
    queryFn: () => activityStreamsApi.getActivityStream(params),
  });
}

export function useAssetActivityStream(assetId: string, params?: Omit<ActivityStreamParams, 'entityId' | 'entityType'>) {
  return useQuery({
    queryKey: queryKeys.activityStreams.byAsset(assetId),
    queryFn: () => activityStreamsApi.getAssetActivityStream(assetId, params),
    enabled: !!assetId,
  });
}

export function useOrganizationActivityStream(params?: ActivityStreamParams) {
  return useQuery({
    queryKey: queryKeys.activityStreams.byOrganization(),
    queryFn: () => activityStreamsApi.getOrganizationActivityStream(params),
  });
}

export function useActivityEvent(id: string) {
  return useQuery({
    queryKey: [...queryKeys.activityStreams.all(), 'detail', id],
    queryFn: () => activityStreamsApi.getActivityEvent(id),
    enabled: !!id,
  });
}