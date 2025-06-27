import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi } from '@/api/asset-api';
import { AssetFilters, AssetFormData } from '@/types';

// Query keys
export const assetKeys = {
  all: ['assets'] as const,
  lists: () => [...assetKeys.all, 'list'] as const,
  list: (filters: AssetFilters) => [...assetKeys.lists(), filters] as const,
  details: () => [...assetKeys.all, 'detail'] as const,
  detail: (id: string) => [...assetKeys.details(), id] as const,
  stats: () => [...assetKeys.all, 'stats'] as const,
  attachments: (id: string) => [...assetKeys.all, 'attachments', id] as const,
};

// Get assets list with filters
export const useAssets = (filters: AssetFilters = {}) => {
  return useQuery({
    queryKey: assetKeys.list(filters),
    queryFn: () => assetApi.getAssets(filters),
    placeholderData: (previousData) => previousData,
  });
};

// Get single asset
export const useAsset = (id: string, enabled = true) => {
  return useQuery({
    queryKey: assetKeys.detail(id),
    queryFn: () => assetApi.getAsset(id),
    enabled: enabled && !!id,
  });
};

// Get asset statistics
export const useAssetStats = () => {
  return useQuery({
    queryKey: assetKeys.stats(),
    queryFn: () => assetApi.getAssetStats(),
  });
};

// Create asset mutation
export const useCreateAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: AssetFormData) => assetApi.createAsset(data),
    onSuccess: () => {
      // Invalidate all asset lists
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetKeys.stats() });
    },
  });
};

// Update asset mutation
export const useUpdateAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AssetFormData> }) =>
      assetApi.updateAsset(id, data),
    onSuccess: (updatedAsset) => {
      // Update the specific asset in cache
      queryClient.setQueryData(assetKeys.detail(updatedAsset.id), updatedAsset);
      // Invalidate lists as the asset data has changed
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetKeys.stats() });
    },
  });
};

// Delete asset mutation
export const useDeleteAsset = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => assetApi.deleteAsset(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: assetKeys.detail(deletedId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: assetKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetKeys.stats() });
    },
  });
};

// Generate barcode mutation
export const useGenerateBarcode = () => {
  return useMutation({
    mutationFn: () => assetApi.generateBarcode(),
  });
};

// Asset attachments hooks
export const useAssetAttachments = (assetId: string, enabled = true) => {
  return useQuery({
    queryKey: assetKeys.attachments(assetId),
    queryFn: () => assetApi.getAssetAttachments(assetId),
    enabled: enabled && !!assetId,
  });
};

export const useUploadAssetAttachment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, file, type }: { assetId: string; file: File; type: string }) =>
      assetApi.uploadAssetAttachment(assetId, file, type),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.attachments(assetId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
    },
  });
};

export const useDeleteAssetAttachment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, attachmentId }: { assetId: string; attachmentId: string }) =>
      assetApi.deleteAssetAttachment(assetId, attachmentId),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.attachments(assetId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
    },
  });
};

export const useSetPrimaryAttachment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ assetId, attachmentId }: { assetId: string; attachmentId: string }) =>
      assetApi.setPrimaryAttachment(assetId, attachmentId),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetKeys.attachments(assetId) });
      queryClient.invalidateQueries({ queryKey: assetKeys.detail(assetId) });
    },
  });
};