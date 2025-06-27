import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  taskEnhancementsApi, 
  type CreateSubtaskDto,
  type CompletionRequirement,
  type Subtask
} from '../api/task-enhancements-api';
import { queryKeys } from '../lib/queryKeys';

export function useAssignUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, userIds }: { taskId: string; userIds: string[] }) =>
      taskEnhancementsApi.assignUsers(taskId, userIds),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.assignments(taskId) });
    },
  });
}

export function useUnassignUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, userId }: { taskId: string; userId: string }) =>
      taskEnhancementsApi.unassignUser(taskId, userId),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.assignments(taskId) });
    },
  });
}

export function useCreateSubtask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (subtask: CreateSubtaskDto) => taskEnhancementsApi.createSubtask(subtask),
    onSuccess: (_, { parentTaskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(parentTaskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(parentTaskId) });
    },
  });
}

export function useUpdateSubtask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      taskId, 
      subtaskId, 
      updates 
    }: { 
      taskId: string; 
      subtaskId: string; 
      updates: Partial<Subtask> 
    }) => taskEnhancementsApi.updateSubtask(taskId, subtaskId, updates),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(taskId) });
    },
  });
}

export function useDeleteSubtask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, subtaskId }: { taskId: string; subtaskId: string }) =>
      taskEnhancementsApi.deleteSubtask(taskId, subtaskId),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(taskId) });
    },
  });
}

export function useUpdateCompletionRequirements() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      taskId, 
      requirements 
    }: { 
      taskId: string; 
      requirements: CompletionRequirement 
    }) => taskEnhancementsApi.updateCompletionRequirements(taskId, requirements),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
    },
  });
}

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ 
      taskId, 
      itemId, 
      completed 
    }: { 
      taskId: string; 
      itemId: string; 
      completed: boolean 
    }) => taskEnhancementsApi.updateChecklistItem(taskId, itemId, completed),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
    },
  });
}

export function useUploadCompletionPhoto() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) =>
      taskEnhancementsApi.uploadCompletionPhoto(taskId, file),
    onSuccess: (_, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.attachments(taskId) });
    },
  });
}