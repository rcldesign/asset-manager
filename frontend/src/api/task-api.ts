import { apiClient } from '@/lib/api-client';
import { Task, TaskFormData, TaskFilters, PaginatedResponse, TaskStatus, TaskPriority } from '@/types';

export const taskApi = {
  // Get paginated list of tasks
  getTasks: async (filters: TaskFilters = {}): Promise<PaginatedResponse<Task>> => {
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

    const response = await apiClient.get<PaginatedResponse<Task>>('/tasks', { params });
    return response.data;
  },

  // Get single task by ID
  getTask: async (id: string): Promise<Task> => {
    const response = await apiClient.get<Task>(`/tasks/${id}`);
    return response.data;
  },

  // Create new task
  createTask: async (data: TaskFormData): Promise<Task> => {
    const response = await apiClient.post<Task>('/tasks', data);
    return response.data;
  },

  // Update task
  updateTask: async (id: string, data: Partial<TaskFormData>): Promise<Task> => {
    const response = await apiClient.put<Task>(`/tasks/${id}`, data);
    return response.data;
  },

  // Update task status
  updateTaskStatus: async (id: string, status: TaskStatus): Promise<Task> => {
    const response = await apiClient.patch<Task>(`/tasks/${id}/status`, { status });
    return response.data;
  },

  // Update task priority
  updateTaskPriority: async (id: string, priority: TaskPriority): Promise<Task> => {
    const response = await apiClient.patch<Task>(`/tasks/${id}/priority`, { priority });
    return response.data;
  },

  // Assign task to user
  assignTask: async (id: string, userId: string | null): Promise<Task> => {
    const response = await apiClient.patch<Task>(`/tasks/${id}/assign`, { userId });
    return response.data;
  },

  // Delete task
  deleteTask: async (id: string): Promise<void> => {
    await apiClient.delete(`/tasks/${id}`);
  },

  // Get task statistics
  getTaskStats: async (): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
  }> => {
    const response = await apiClient.get('/tasks/stats');
    return response.data;
  },

  // Get task comments
  getTaskComments: async (taskId: string, page = 1, limit = 20) => {
    const response = await apiClient.get(`/tasks/${taskId}/comments`, {
      params: { page, limit },
    });
    return response.data;
  },

  // Add task comment
  addTaskComment: async (taskId: string, content: string) => {
    const response = await apiClient.post(`/tasks/${taskId}/comments`, { content });
    return response.data;
  },

  // Update task comment
  updateTaskComment: async (taskId: string, commentId: string, content: string) => {
    const response = await apiClient.put(`/tasks/${taskId}/comments/${commentId}`, { content });
    return response.data;
  },

  // Delete task comment
  deleteTaskComment: async (taskId: string, commentId: string): Promise<void> => {
    await apiClient.delete(`/tasks/${taskId}/comments/${commentId}`);
  },

  // Get task attachments
  getTaskAttachments: async (taskId: string) => {
    const response = await apiClient.get(`/tasks/${taskId}/attachments`);
    return response.data;
  },

  // Upload task attachment
  uploadTaskAttachment: async (taskId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post(`/tasks/${taskId}/attachments`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Delete task attachment
  deleteTaskAttachment: async (taskId: string, attachmentId: string): Promise<void> => {
    await apiClient.delete(`/tasks/${taskId}/attachments/${attachmentId}`);
  },
};