# Frontend API Integration Patterns Guide

## Overview
This guide documents the standardized patterns for integrating the frontend with backend APIs in the Asset Manager application. It covers authentication, data fetching, mutations, error handling, and optimization techniques.

## Core Technologies
- **React Query (TanStack Query)** - Data fetching and caching
- **Axios** - HTTP client with interceptors
- **TypeScript** - Type-safe API contracts
- **React Hook Form** - Form state management

## 1. API Client Setup

### Base Configuration (`/src/lib/api-client.ts`)

```typescript
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'react-hot-toast';

// Types
interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
  statusCode: number;
}

interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token management
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  
  failedQueue = [];
};

// Request interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      
      if (!refreshToken) {
        // No refresh token, redirect to login
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<RefreshTokenResponse>(
          `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
          { refreshToken }
        );
        
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        
        processQueue(null, data.accessToken);
        
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle other errors
    if (error.response?.data?.message) {
      toast.error(error.response.data.message);
    } else if (error.message) {
      toast.error(error.message);
    }

    return Promise.reject(error);
  }
);

export { apiClient };
export type { ApiError };
```

## 2. API Service Pattern

### Base Service Class (`/src/api/base.api.ts`)

```typescript
import { apiClient } from '@/lib/api-client';
import { PaginatedResponse, QueryParams } from '@/types';

export abstract class BaseApiService<T, CreateDTO = Partial<T>, UpdateDTO = Partial<T>> {
  protected abstract readonly endpoint: string;

  async list(params?: QueryParams): Promise<PaginatedResponse<T>> {
    const { data } = await apiClient.get<PaginatedResponse<T>>(this.endpoint, {
      params,
    });
    return data;
  }

  async get(id: string): Promise<T> {
    const { data } = await apiClient.get<T>(`${this.endpoint}/${id}`);
    return data;
  }

  async create(dto: CreateDTO): Promise<T> {
    const { data } = await apiClient.post<T>(this.endpoint, dto);
    return data;
  }

  async update(id: string, dto: UpdateDTO): Promise<T> {
    const { data } = await apiClient.put<T>(`${this.endpoint}/${id}`, dto);
    return data;
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`${this.endpoint}/${id}`);
  }

  // Batch operations
  async batchCreate(items: CreateDTO[]): Promise<T[]> {
    const { data } = await apiClient.post<T[]>(`${this.endpoint}/batch`, {
      items,
    });
    return data;
  }

  async batchUpdate(updates: Array<{ id: string; data: UpdateDTO }>): Promise<T[]> {
    const { data } = await apiClient.put<T[]>(`${this.endpoint}/batch`, {
      updates,
    });
    return data;
  }

  async batchDelete(ids: string[]): Promise<void> {
    await apiClient.delete(`${this.endpoint}/batch`, {
      data: { ids },
    });
  }
}
```

### Specific Service Implementation (`/src/api/asset-api.ts`)

```typescript
import { BaseApiService } from './base.api';
import { Asset, AssetCreateDTO, AssetUpdateDTO, AssetFilters } from '@/types';
import { apiClient } from '@/lib/api-client';

class AssetApiService extends BaseApiService<Asset, AssetCreateDTO, AssetUpdateDTO> {
  protected readonly endpoint = '/assets';

  // Additional asset-specific methods
  async getByLocation(locationId: string): Promise<Asset[]> {
    const { data } = await apiClient.get<Asset[]>(`/locations/${locationId}/assets`);
    return data;
  }

  async getByTemplate(templateId: string): Promise<Asset[]> {
    const { data } = await apiClient.get<Asset[]>(`/templates/${templateId}/assets`);
    return data;
  }

  async uploadAttachment(assetId: string, file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    
    await apiClient.post(`${this.endpoint}/${assetId}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  async deleteAttachment(assetId: string, fileId: string): Promise<void> {
    await apiClient.delete(`${this.endpoint}/${assetId}/files/${fileId}`);
  }

  async getHistory(assetId: string): Promise<any[]> {
    const { data } = await apiClient.get(`${this.endpoint}/${assetId}/history`);
    return data;
  }

  // Complex filtering
  async search(filters: AssetFilters): Promise<PaginatedResponse<Asset>> {
    const { data } = await apiClient.post<PaginatedResponse<Asset>>(
      `${this.endpoint}/search`,
      filters
    );
    return data;
  }

  // Bulk operations
  async bulkUpdateStatus(
    assetIds: string[], 
    status: Asset['status']
  ): Promise<Asset[]> {
    const { data } = await apiClient.put<Asset[]>(`${this.endpoint}/bulk/status`, {
      assetIds,
      status,
    });
    return data;
  }
}

export const assetApi = new AssetApiService();
```

## 3. React Query Hooks Pattern

### Base Query Hook (`/src/hooks/api/use-base-query.ts`)

```typescript
import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
} from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

interface UseApiQueryOptions<T> {
  queryKey: any[];
  queryFn: () => Promise<T>;
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
}

export function useApiQuery<T>({
  queryKey,
  queryFn,
  options,
  onSuccess,
  onError,
}: UseApiQueryOptions<T>) {
  return useQuery({
    queryKey,
    queryFn,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
    onSuccess,
    onError: (error: any) => {
      console.error('Query error:', error);
      onError?.(error);
    },
  });
}

interface UseApiMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  invalidateKeys?: any[][];
  options?: Omit<UseMutationOptions<TData, any, TVariables>, 'mutationFn'>;
  successMessage?: string;
  errorMessage?: string;
}

export function useApiMutation<TData = any, TVariables = any>({
  mutationFn,
  invalidateKeys = [],
  options,
  successMessage,
  errorMessage,
}: UseApiMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables, context) => {
      if (successMessage) {
        toast.success(successMessage);
      }
      
      // Invalidate related queries
      invalidateKeys.forEach(key => {
        queryClient.invalidateQueries({ queryKey: key });
      });
      
      options?.onSuccess?.(data, variables, context);
    },
    onError: (error: any, variables, context) => {
      const message = error?.response?.data?.message || errorMessage || 'An error occurred';
      toast.error(message);
      
      options?.onError?.(error, variables, context);
    },
    ...options,
  });
}
```

### Specific Hook Implementation (`/src/hooks/use-assets.ts`)

```typescript
import { useState, useMemo } from 'react';
import { useApiQuery, useApiMutation } from './api/use-base-query';
import { assetApi } from '@/api/asset-api';
import { Asset, AssetCreateDTO, AssetUpdateDTO, AssetFilters } from '@/types';

interface UseAssetsOptions {
  filters?: AssetFilters;
  locationId?: string;
  templateId?: string;
}

export function useAssets(options?: UseAssetsOptions) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const queryKey = useMemo(
    () => ['assets', { page, pageSize, sortBy, sortOrder, ...options }],
    [page, pageSize, sortBy, sortOrder, options]
  );

  const { data, isLoading, error, refetch } = useApiQuery({
    queryKey,
    queryFn: () => {
      if (options?.locationId) {
        return assetApi.getByLocation(options.locationId);
      }
      if (options?.templateId) {
        return assetApi.getByTemplate(options.templateId);
      }
      return assetApi.list({
        page,
        pageSize,
        sortBy,
        sortOrder,
        ...options?.filters,
      });
    },
  });

  const createAsset = useApiMutation({
    mutationFn: (dto: AssetCreateDTO) => assetApi.create(dto),
    invalidateKeys: [['assets']],
    successMessage: 'Asset created successfully',
  });

  const updateAsset = useApiMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetUpdateDTO }) => 
      assetApi.update(id, data),
    invalidateKeys: [['assets']],
    successMessage: 'Asset updated successfully',
  });

  const deleteAsset = useApiMutation({
    mutationFn: (id: string) => assetApi.delete(id),
    invalidateKeys: [['assets']],
    successMessage: 'Asset deleted successfully',
  });

  const bulkUpdateStatus = useApiMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: Asset['status'] }) =>
      assetApi.bulkUpdateStatus(ids, status),
    invalidateKeys: [['assets']],
    successMessage: 'Assets updated successfully',
  });

  return {
    // Data
    assets: Array.isArray(data) ? data : data?.data || [],
    total: Array.isArray(data) ? data.length : data?.total || 0,
    page: Array.isArray(data) ? 1 : data?.page || 1,
    pageSize: Array.isArray(data) ? data.length : data?.pageSize || 20,
    
    // State
    loading: isLoading,
    error,
    
    // Pagination
    setPage,
    setPageSize,
    
    // Sorting
    sortBy,
    sortOrder,
    setSortBy,
    setSortOrder,
    
    // Actions
    refetch,
    createAsset,
    updateAsset,
    deleteAsset,
    bulkUpdateStatus,
  };
}

// Single asset hook
export function useAsset(id: string) {
  const { data, isLoading, error } = useApiQuery({
    queryKey: ['assets', id],
    queryFn: () => assetApi.get(id),
    options: {
      enabled: !!id,
    },
  });

  const uploadAttachment = useApiMutation({
    mutationFn: (file: File) => assetApi.uploadAttachment(id, file),
    invalidateKeys: [['assets', id]],
    successMessage: 'File uploaded successfully',
  });

  const deleteAttachment = useApiMutation({
    mutationFn: (fileId: string) => assetApi.deleteAttachment(id, fileId),
    invalidateKeys: [['assets', id]],
    successMessage: 'File deleted successfully',
  });

  return {
    asset: data,
    loading: isLoading,
    error,
    uploadAttachment,
    deleteAttachment,
  };
}
```

## 4. Form Integration Pattern

### Form with API Integration (`/src/components/assets/AssetForm.tsx`)

```typescript
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAssets } from '@/hooks/use-assets';
import { AssetCreateDTO } from '@/types';

const assetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['Equipment', 'Vehicle', 'Property', 'Tool', 'Furniture', 'Electronics', 'Other']),
  locationId: z.string().optional(),
  templateId: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

type AssetFormData = z.infer<typeof assetSchema>;

export function AssetForm({ onSuccess }: { onSuccess?: () => void }) {
  const { createAsset } = useAssets();
  
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
  } = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: '',
      category: 'Equipment',
      customFields: {},
    },
  });

  const onSubmit = async (data: AssetFormData) => {
    try {
      await createAsset.mutateAsync(data as AssetCreateDTO);
      reset();
      onSuccess?.();
    } catch (error) {
      // Error is handled by mutation hook
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        name="name"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            label="Asset Name"
            error={!!errors.name}
            helperText={errors.name?.message}
            fullWidth
            margin="normal"
          />
        )}
      />
      
      <Controller
        name="category"
        control={control}
        render={({ field }) => (
          <FormControl fullWidth margin="normal">
            <InputLabel>Category</InputLabel>
            <Select {...field} label="Category">
              <MenuItem value="Equipment">Equipment</MenuItem>
              <MenuItem value="Vehicle">Vehicle</MenuItem>
              {/* ... other options */}
            </Select>
          </FormControl>
        )}
      />
      
      <Button
        type="submit"
        variant="contained"
        disabled={isSubmitting || createAsset.isLoading}
        fullWidth
      >
        {isSubmitting ? 'Creating...' : 'Create Asset'}
      </Button>
    </form>
  );
}
```

## 5. Optimistic Updates Pattern

```typescript
export function useOptimisticAssets() {
  const queryClient = useQueryClient();
  const { assets, ...rest } = useAssets();

  const updateAsset = useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssetUpdateDTO }) =>
      assetApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel in-flight queries
      await queryClient.cancelQueries({ queryKey: ['assets'] });
      
      // Snapshot previous value
      const previousAssets = queryClient.getQueryData(['assets']);
      
      // Optimistically update
      queryClient.setQueryData(['assets'], (old: any) => {
        if (Array.isArray(old)) {
          return old.map(asset => 
            asset.id === id ? { ...asset, ...data } : asset
          );
        }
        return {
          ...old,
          data: old.data.map((asset: Asset) => 
            asset.id === id ? { ...asset, ...data } : asset
          ),
        };
      });
      
      return { previousAssets };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousAssets) {
        queryClient.setQueryData(['assets'], context.previousAssets);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });

  return {
    assets,
    updateAsset,
    ...rest,
  };
}
```

## 6. Real-time Updates Pattern

```typescript
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket;

export function useRealtimeAssets() {
  const queryClient = useQueryClient();
  const { assets, ...rest } = useAssets();

  useEffect(() => {
    // Initialize socket connection
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
        auth: {
          token: localStorage.getItem('accessToken'),
        },
      });
    }

    // Join asset updates room
    socket.emit('join', 'assets');

    // Listen for updates
    socket.on('asset:created', (asset: Asset) => {
      queryClient.setQueryData(['assets'], (old: any) => {
        if (Array.isArray(old)) {
          return [asset, ...old];
        }
        return {
          ...old,
          data: [asset, ...old.data],
          total: old.total + 1,
        };
      });
    });

    socket.on('asset:updated', (asset: Asset) => {
      queryClient.setQueryData(['assets'], (old: any) => {
        if (Array.isArray(old)) {
          return old.map(a => a.id === asset.id ? asset : a);
        }
        return {
          ...old,
          data: old.data.map((a: Asset) => a.id === asset.id ? asset : a),
        };
      });
    });

    socket.on('asset:deleted', (assetId: string) => {
      queryClient.setQueryData(['assets'], (old: any) => {
        if (Array.isArray(old)) {
          return old.filter(a => a.id !== assetId);
        }
        return {
          ...old,
          data: old.data.filter((a: Asset) => a.id !== assetId),
          total: old.total - 1,
        };
      });
    });

    return () => {
      socket.emit('leave', 'assets');
      socket.off('asset:created');
      socket.off('asset:updated');
      socket.off('asset:deleted');
    };
  }, [queryClient]);

  return {
    assets,
    ...rest,
  };
}
```

## 7. Error Handling Patterns

### Global Error Boundary

```typescript
import { Component, ReactNode } from 'react';
import { Alert, Button, Container } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Send to error reporting service
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container maxWidth="sm" sx={{ mt: 4 }}>
          <Alert 
            severity="error"
            action={
              <Button 
                color="inherit" 
                size="small"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            }
          >
            Something went wrong. Please try reloading the page.
          </Alert>
        </Container>
      );
    }

    return this.props.children;
  }
}
```

### Query Error Handling

```typescript
export function useErrorHandler() {
  const navigate = useNavigate();
  
  return (error: any) => {
    const status = error?.response?.status;
    
    switch (status) {
      case 401:
        // Handled by axios interceptor
        break;
      case 403:
        toast.error('You do not have permission to perform this action');
        break;
      case 404:
        toast.error('Resource not found');
        navigate('/404');
        break;
      case 422:
        // Validation errors - handled by form
        break;
      case 500:
        toast.error('Server error. Please try again later.');
        break;
      default:
        toast.error(error?.message || 'An unexpected error occurred');
    }
  };
}
```

## 8. Performance Optimization Patterns

### Prefetching

```typescript
export function useAssetPrefetch() {
  const queryClient = useQueryClient();
  
  const prefetchAsset = (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['assets', id],
      queryFn: () => assetApi.get(id),
      staleTime: 10 * 60 * 1000, // 10 minutes
    });
  };
  
  const prefetchAssets = (filters?: AssetFilters) => {
    queryClient.prefetchQuery({
      queryKey: ['assets', filters],
      queryFn: () => assetApi.list(filters),
    });
  };
  
  return { prefetchAsset, prefetchAssets };
}
```

### Infinite Query for Large Lists

```typescript
export function useInfiniteAssets(filters?: AssetFilters) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['assets', 'infinite', filters],
    queryFn: ({ pageParam = 1 }) => 
      assetApi.list({ 
        ...filters, 
        page: pageParam, 
        pageSize: 20 
      }),
    getNextPageParam: (lastPage, pages) => {
      const currentPage = lastPage.page;
      const totalPages = Math.ceil(lastPage.total / lastPage.pageSize);
      return currentPage < totalPages ? currentPage + 1 : undefined;
    },
  });
  
  const assets = data?.pages.flatMap(page => page.data) || [];
  
  return {
    assets,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  };
}
```

## Best Practices Summary

1. **Always use TypeScript** for type safety
2. **Centralize API configuration** in a single client
3. **Use React Query** for server state management
4. **Implement proper error handling** at all levels
5. **Add loading states** for better UX
6. **Use optimistic updates** for instant feedback
7. **Implement proper authentication flow** with token refresh
8. **Cache aggressively** but invalidate appropriately
9. **Prefetch data** when possible
10. **Handle offline scenarios** gracefully