import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationApi } from '@/api/location-api';

// Query keys
export const locationKeys = {
  all: ['locations'] as const,
  tree: (rootId?: string) => [...locationKeys.all, 'tree', rootId] as const,
  list: () => [...locationKeys.all, 'list'] as const,
  detail: (id: string) => [...locationKeys.all, 'detail', id] as const,
  ancestors: (id: string) => [...locationKeys.all, 'ancestors', id] as const,
  search: (query: string) => [...locationKeys.all, 'search', query] as const,
};

// Get location tree
export const useLocationTree = (rootId?: string) => {
  return useQuery({
    queryKey: locationKeys.tree(rootId),
    queryFn: () => locationApi.getLocationTree(rootId),
  });
};

// Get all locations (flat list)
export const useLocations = () => {
  return useQuery({
    queryKey: locationKeys.list(),
    queryFn: () => locationApi.getLocations(),
  });
};

// Get single location
export const useLocation = (id: string, enabled = true) => {
  return useQuery({
    queryKey: locationKeys.detail(id),
    queryFn: () => locationApi.getLocation(id),
    enabled: enabled && !!id,
  });
};

// Get location ancestors
export const useLocationAncestors = (id: string, enabled = true) => {
  return useQuery({
    queryKey: locationKeys.ancestors(id),
    queryFn: () => locationApi.getLocationAncestors(id),
    enabled: enabled && !!id,
  });
};

// Search locations
export const useSearchLocations = (query: string, enabled = true) => {
  return useQuery({
    queryKey: locationKeys.search(query),
    queryFn: () => locationApi.searchLocations(query),
    enabled: enabled && !!query && query.length >= 2,
  });
};

// Create location mutation
export const useCreateLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; description?: string; parentId?: string }) =>
      locationApi.createLocation(data),
    onSuccess: () => {
      // Invalidate all location queries to refresh the data
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    },
  });
};

// Update location mutation
export const useUpdateLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string; parentId?: string } }) =>
      locationApi.updateLocation(id, data),
    onSuccess: (updatedLocation) => {
      // Update the specific location in cache
      queryClient.setQueryData(locationKeys.detail(updatedLocation.id), updatedLocation);
      // Invalidate tree and list queries as the structure might have changed
      queryClient.invalidateQueries({ queryKey: locationKeys.tree() });
      queryClient.invalidateQueries({ queryKey: locationKeys.list() });
    },
  });
};

// Delete location mutation
export const useDeleteLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => locationApi.deleteLocation(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: locationKeys.detail(deletedId) });
      // Invalidate all location queries
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    },
  });
};

// Move location mutation
export const useMoveLocation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, newParentId }: { id: string; newParentId: string | null }) =>
      locationApi.moveLocation(id, newParentId),
    onSuccess: (updatedLocation) => {
      // Update the specific location in cache
      queryClient.setQueryData(locationKeys.detail(updatedLocation.id), updatedLocation);
      // Invalidate tree and list queries as the structure has changed
      queryClient.invalidateQueries({ queryKey: locationKeys.tree() });
      queryClient.invalidateQueries({ queryKey: locationKeys.list() });
    },
  });
};

// Get location descendants
export const useLocationDescendants = (id: string, enabled = true) => {
  return useQuery({
    queryKey: [...locationKeys.all, 'descendants', id] as const,
    queryFn: () => locationApi.getLocationDescendants(id),
    enabled: enabled && !!id,
  });
};