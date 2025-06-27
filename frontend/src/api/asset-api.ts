import { apiClient } from '@/lib/api-client';
import { Asset, AssetFormData, AssetFilters, PaginatedResponse, AssetAttachment } from '@/types';

export const assetApi = {
  // Get paginated list of assets
  getAssets: async (filters: AssetFilters = {}): Promise<PaginatedResponse<Asset>> => {
    const params = new URLSearchParams();
    
    // Add filters to query params
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, v.toString()));
        } else {
          params.append(key, value.toString());
        }
      }
    });

    const response = await apiClient.get<PaginatedResponse<Asset>>('/assets', { params });
    return response.data;
  },

  // Get single asset by ID
  getAsset: async (id: string): Promise<Asset> => {
    const response = await apiClient.get<Asset>(`/assets/${id}`);
    return response.data;
  },

  // Create new asset
  createAsset: async (data: AssetFormData): Promise<Asset> => {
    const response = await apiClient.post<Asset>('/assets', data);
    return response.data;
  },

  // Update asset
  updateAsset: async (id: string, data: Partial<AssetFormData>): Promise<Asset> => {
    const response = await apiClient.put<Asset>(`/assets/${id}`, data);
    return response.data;
  },

  // Delete asset
  deleteAsset: async (id: string): Promise<void> => {
    await apiClient.delete(`/assets/${id}`);
  },

  // Generate barcode
  generateBarcode: async (): Promise<{ barcode: string }> => {
    const response = await apiClient.post<{ barcode: string }>('/assets/generate-barcode');
    return response.data;
  },

  // Get asset statistics
  getAssetStats: async (): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
  }> => {
    const response = await apiClient.get('/assets/stats');
    return response.data;
  },

  // Get asset attachments
  getAssetAttachments: async (assetId: string): Promise<AssetAttachment[]> => {
    const response = await apiClient.get<AssetAttachment[]>(`/assets/${assetId}/attachments`);
    return response.data;
  },

  // Upload asset attachment
  uploadAssetAttachment: async (assetId: string, file: File, type: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    
    const response = await apiClient.post(`/assets/${assetId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Delete asset attachment
  deleteAssetAttachment: async (assetId: string, attachmentId: string): Promise<void> => {
    await apiClient.delete(`/assets/${assetId}/attachments/${attachmentId}`);
  },

  // Set primary attachment
  setPrimaryAttachment: async (assetId: string, attachmentId: string): Promise<void> => {
    await apiClient.put(`/assets/${assetId}/attachments/${attachmentId}/primary`);
  },
};