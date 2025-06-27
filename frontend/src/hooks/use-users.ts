import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { User, PaginatedResponse } from '@/types';

// Query keys
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
};

interface UserFilters {
  search?: string;
  role?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Get users list
export const useUsers = (filters: UserFilters = {}) => {
  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      });

      const response = await apiClient.get<PaginatedResponse<User>>('/users', { params });
      return response.data;
    },
  });
};

// Get single user
export const useUser = (id: string, enabled = true) => {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<User>(`/users/${id}`);
      return response.data;
    },
    enabled: enabled && !!id,
  });
};