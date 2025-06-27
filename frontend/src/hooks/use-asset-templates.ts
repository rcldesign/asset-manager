import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetTemplateApi } from '@/api/asset-template-api';
import { AssetTemplateFilters } from '@/api/asset-template-api';
import { AssetCategory, AssetTemplate } from '@/types';

// Query keys
export const assetTemplateKeys = {
  all: ['assetTemplates'] as const,
  lists: () => [...assetTemplateKeys.all, 'list'] as const,
  list: (filters: AssetTemplateFilters) => [...assetTemplateKeys.lists(), filters] as const,
  simpleList: (includeInactive: boolean) => [...assetTemplateKeys.all, 'simple', includeInactive] as const,
  detail: (id: string) => [...assetTemplateKeys.all, 'detail', id] as const,
  stats: (id: string) => [...assetTemplateKeys.all, 'stats', id] as const,
};

// Get paginated templates
export const useAssetTemplatesPaginated = (filters: AssetTemplateFilters = {}) => {
  return useQuery({
    queryKey: assetTemplateKeys.list(filters),
    queryFn: () => assetTemplateApi.getTemplates(filters),
    placeholderData: (previousData) => previousData,
  });
};

// Get simple list of templates (for dropdowns)
export const useAssetTemplates = (includeInactive = false) => {
  return useQuery({
    queryKey: assetTemplateKeys.simpleList(includeInactive),
    queryFn: () => assetTemplateApi.getTemplatesList(includeInactive),
  });
};

// Get single template
export const useAssetTemplate = (id: string, enabled = true) => {
  return useQuery({
    queryKey: assetTemplateKeys.detail(id),
    queryFn: () => assetTemplateApi.getTemplate(id),
    enabled: enabled && !!id,
  });
};

// Get template statistics
export const useAssetTemplateStats = (id: string, enabled = true) => {
  return useQuery({
    queryKey: assetTemplateKeys.stats(id),
    queryFn: () => assetTemplateApi.getTemplateStats(id),
    enabled: enabled && !!id,
  });
};

// Create template mutation
export const useCreateAssetTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      category: AssetCategory;
      defaultFields?: Record<string, unknown>;
      customFields?: Record<string, unknown>;
    }) => assetTemplateApi.createTemplate(data),
    onSuccess: () => {
      // Invalidate all template lists
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(true) });
    },
  });
};

// Update template mutation
export const useUpdateAssetTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{
      name: string;
      description: string;
      category: AssetCategory;
      defaultFields: Record<string, unknown>;
      customFields: Record<string, unknown>;
      isActive: boolean;
    }> }) => assetTemplateApi.updateTemplate(id, data),
    onSuccess: (updatedTemplate) => {
      // Update the specific template in cache
      queryClient.setQueryData(assetTemplateKeys.detail(updatedTemplate.id), updatedTemplate);
      // Invalidate lists as the template data has changed
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(true) });
    },
  });
};

// Delete template mutation
export const useDeleteAssetTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => assetTemplateApi.deleteTemplate(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: assetTemplateKeys.detail(deletedId) });
      queryClient.removeQueries({ queryKey: assetTemplateKeys.stats(deletedId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(true) });
    },
  });
};

// Clone template mutation
export const useCloneAssetTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description?: string }) =>
      assetTemplateApi.cloneTemplate(id, name, description),
    onSuccess: () => {
      // Invalidate lists to show the new cloned template
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.lists() });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(false) });
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.simpleList(true) });
    },
  });
};

// Validate custom fields mutation
export const useValidateCustomFields = () => {
  return useMutation({
    mutationFn: ({ templateId, values }: { templateId: string; values: Record<string, unknown> }) =>
      assetTemplateApi.validateCustomFields(templateId, values),
  });
};

// Export templates
export const useExportTemplates = () => {
  return useQuery({
    queryKey: ['assetTemplates', 'export'],
    queryFn: () => assetTemplateApi.exportTemplates(),
    enabled: false, // Only run when explicitly triggered
  });
};

// Import templates mutation
export const useImportTemplates = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templates, conflictStrategy }: {
      templates: AssetTemplate[];
      conflictStrategy?: 'fail' | 'skip' | 'rename';
    }) => assetTemplateApi.importTemplates(templates, conflictStrategy),
    onSuccess: () => {
      // Invalidate all template queries
      queryClient.invalidateQueries({ queryKey: assetTemplateKeys.all });
    },
  });
};