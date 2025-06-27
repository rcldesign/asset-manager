import { apiClient } from '@/lib/api-client';
import { Location } from '@/types';

export const locationApi = {
  // Get location tree
  getLocationTree: async (rootId?: string): Promise<Location[]> => {
    const params = rootId ? { rootId } : {};
    const response = await apiClient.get<Location[]>('/locations/tree', { params });
    return response.data;
  },

  // Get all locations (flat list)
  getLocations: async (): Promise<Location[]> => {
    const response = await apiClient.get<Location[]>('/locations');
    return response.data;
  },

  // Get single location
  getLocation: async (id: string): Promise<Location> => {
    const response = await apiClient.get<Location>(`/locations/${id}`);
    return response.data;
  },

  // Create location
  createLocation: async (data: {
    name: string;
    description?: string;
    parentId?: string;
  }): Promise<Location> => {
    const response = await apiClient.post<Location>('/locations', data);
    return response.data;
  },

  // Update location
  updateLocation: async (
    id: string,
    data: {
      name?: string;
      description?: string;
      parentId?: string;
    }
  ): Promise<Location> => {
    const response = await apiClient.put<Location>(`/locations/${id}`, data);
    return response.data;
  },

  // Delete location
  deleteLocation: async (id: string): Promise<void> => {
    await apiClient.delete(`/locations/${id}`);
  },

  // Get location ancestors
  getLocationAncestors: async (id: string): Promise<Location[]> => {
    const response = await apiClient.get<Location[]>(`/locations/${id}/ancestors`);
    return response.data;
  },

  // Search locations
  searchLocations: async (query: string): Promise<Location[]> => {
    const response = await apiClient.get<Location[]>('/locations/search', {
      params: { q: query },
    });
    return response.data;
  },

  // Move location to new parent
  moveLocation: async (id: string, newParentId: string | null): Promise<Location> => {
    const response = await apiClient.put<Location>(`/locations/${id}/move`, {
      newParentId
    });
    return response.data;
  },

  // Get location descendants
  getLocationDescendants: async (id: string): Promise<Location[]> => {
    const response = await apiClient.get<Location[]>(`/locations/${id}/descendants`);
    return response.data;
  },
};