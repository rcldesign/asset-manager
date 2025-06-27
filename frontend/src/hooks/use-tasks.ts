import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskApi } from '@/api/task-api';
import { TaskFilters, TaskFormData, TaskStatus, TaskPriority } from '@/types';

// Query keys
export const taskKeys = {
  all: ['tasks'] as const,
  lists: () => [...taskKeys.all, 'list'] as const,
  list: (filters: TaskFilters) => [...taskKeys.lists(), filters] as const,
  details: () => [...taskKeys.all, 'detail'] as const,
  detail: (id: string) => [...taskKeys.details(), id] as const,
  stats: () => [...taskKeys.all, 'stats'] as const,
  comments: (id: string) => [...taskKeys.all, 'comments', id] as const,
  attachments: (id: string) => [...taskKeys.all, 'attachments', id] as const,
};

// Get tasks list with filters
export const useTasks = (filters: TaskFilters = {}) => {
  return useQuery({
    queryKey: taskKeys.list(filters),
    queryFn: () => taskApi.getTasks(filters),
    placeholderData: (previousData) => previousData,
  });
};

// Get single task
export const useTask = (id: string, enabled = true) => {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskApi.getTask(id),
    enabled: enabled && !!id,
  });
};

// Get task statistics
export const useTaskStats = () => {
  return useQuery({
    queryKey: taskKeys.stats(),
    queryFn: () => taskApi.getTaskStats(),
  });
};

// Create task mutation
export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TaskFormData) => taskApi.createTask(data),
    onSuccess: () => {
      // Invalidate all task lists
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.stats() });
    },
  });
};

// Update task mutation
export const useUpdateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TaskFormData> }) =>
      taskApi.updateTask(id, data),
    onSuccess: (updatedTask) => {
      // Update the specific task in cache
      queryClient.setQueryData(taskKeys.detail(updatedTask.id), updatedTask);
      // Invalidate lists as the task data has changed
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.stats() });
    },
  });
};

// Update task status mutation
export const useUpdateTaskStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      taskApi.updateTaskStatus(id, status),
    onSuccess: (updatedTask) => {
      // Update the specific task in cache
      queryClient.setQueryData(taskKeys.detail(updatedTask.id), updatedTask);
      // Invalidate lists as the task status has changed
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.stats() });
    },
  });
};

// Update task priority mutation
export const useUpdateTaskPriority = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: TaskPriority }) =>
      taskApi.updateTaskPriority(id, priority),
    onSuccess: (updatedTask) => {
      // Update the specific task in cache
      queryClient.setQueryData(taskKeys.detail(updatedTask.id), updatedTask);
      // Invalidate lists as the task priority has changed
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.stats() });
    },
  });
};

// Assign task mutation
export const useAssignTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string | null }) =>
      taskApi.assignTask(id, userId),
    onSuccess: (updatedTask) => {
      // Update the specific task in cache
      queryClient.setQueryData(taskKeys.detail(updatedTask.id), updatedTask);
      // Invalidate lists as the task assignment has changed
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
};

// Delete task mutation
export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => taskApi.deleteTask(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: taskKeys.detail(deletedId) });
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      queryClient.invalidateQueries({ queryKey: taskKeys.stats() });
    },
  });
};

// Task comments hooks
export const useTaskComments = (taskId: string, page = 1, limit = 20, enabled = true) => {
  return useQuery({
    queryKey: [...taskKeys.comments(taskId), page, limit],
    queryFn: () => taskApi.getTaskComments(taskId, page, limit),
    enabled: enabled && !!taskId,
  });
};

export const useAddTaskComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, content }: { taskId: string; content: string }) =>
      taskApi.addTaskComment(taskId, content),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
    },
  });
};

export const useUpdateTaskComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, commentId, content }: { taskId: string; commentId: string; content: string }) =>
      taskApi.updateTaskComment(taskId, commentId, content),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
    },
  });
};

export const useDeleteTaskComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, commentId }: { taskId: string; commentId: string }) =>
      taskApi.deleteTaskComment(taskId, commentId),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
    },
  });
};

// Task attachments hooks
export const useTaskAttachments = (taskId: string, enabled = true) => {
  return useQuery({
    queryKey: taskKeys.attachments(taskId),
    queryFn: () => taskApi.getTaskAttachments(taskId),
    enabled: enabled && !!taskId,
  });
};

export const useUploadTaskAttachment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      taskApi.uploadTaskAttachment(taskId, file),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.attachments(taskId) });
    },
  });
};

export const useDeleteTaskAttachment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, attachmentId }: { taskId: string; attachmentId: string }) =>
      taskApi.deleteTaskAttachment(taskId, attachmentId),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: taskKeys.attachments(taskId) });
    },
  });
};