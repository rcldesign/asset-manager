import { apiClient } from '@/lib/api-client';
import { AssetTemplate, AssetCategory, PaginatedResponse } from '@/types';

export interface AssetTemplateFilters {
  search?: string;
  category?: AssetCategory;
  hasCustomField?: string;
  customFieldSearch?: string;
  includeInactive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const assetTemplateApi = {
  // Get paginated templates
  getTemplates: async (filters: AssetTemplateFilters = {}): Promise<PaginatedResponse<AssetTemplate>> => {
    const params = new URLSearchParams();
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value.toString());
      }
    });

    const response = await apiClient.get<PaginatedResponse<AssetTemplate>>('/asset-templates', { params });
    return response.data;
  },

  // Get simple list of templates
  getTemplatesList: async (includeInactive = false): Promise<AssetTemplate[]> => {
    const response = await apiClient.get<AssetTemplate[]>('/asset-templates/simple', {
      params: { includeInactive },
    });
    return response.data;
  },

  // Get single template
  getTemplate: async (id: string): Promise<AssetTemplate> => {
    const response = await apiClient.get<AssetTemplate>(`/asset-templates/${id}`);
    return response.data;
  },

  // Create template
  createTemplate: async (data: {
    name: string;
    description?: string;
    category: AssetCategory;
    defaultFields?: Record<string, unknown>;
    customFields?: Record<string, unknown>;
  }): Promise<AssetTemplate> => {
    const response = await apiClient.post<AssetTemplate>('/asset-templates', data);
    return response.data;
  },

  // Update template
  updateTemplate: async (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      category: AssetCategory;
      defaultFields: Record<string, unknown>;
      customFields: Record<string, unknown>;
      isActive: boolean;
    }>
  ): Promise<AssetTemplate> => {
    const response = await apiClient.put<AssetTemplate>(`/asset-templates/${id}`, data);
    return response.data;
  },

  // Delete template
  deleteTemplate: async (id: string): Promise<void> => {
    await apiClient.delete(`/asset-templates/${id}`);
  },

  // Clone template
  cloneTemplate: async (id: string, name: string, description?: string): Promise<AssetTemplate> => {
    const response = await apiClient.post<AssetTemplate>(`/asset-templates/${id}/clone`, {
      name,
      description,
    });
    return response.data;
  },

  // Validate custom field values
  validateCustomFields: async (templateId: string, values: Record<string, unknown>): Promise<{
    valid: boolean;
    errors: string[];
  }> => {
    const response = await apiClient.post(`/asset-templates/${templateId}/validate`, { values });
    return response.data;
  },

  // Get template statistics
  getTemplateStats: async (id: string): Promise<{
    assetCount: number;
    lastUsed: string | null;
    isInUse: boolean;
  }> => {
    const response = await apiClient.get(`/asset-templates/${id}/stats`);
    return response.data;
  },

  // Export templates
  exportTemplates: async (): Promise<AssetTemplate[]> => {
    const response = await apiClient.get<AssetTemplate[]>('/asset-templates/export');
    return response.data;
  },

  // Import templates
  importTemplates: async (templates: AssetTemplate[], conflictStrategy: 'fail' | 'skip' | 'rename' = 'skip'): Promise<{
    created: number;
    skipped: number;
    errors: string[];
  }> => {
    const response = await apiClient.post('/asset-templates/import', {
      templates,
      conflictStrategy,
    });
    return response.data;
  },
};