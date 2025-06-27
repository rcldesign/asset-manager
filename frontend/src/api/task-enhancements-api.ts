import { apiClient } from '../lib/api-client';

export interface TaskAssignment {
  id: string;
  taskId: string;
  userId: string;
  user?: {
    id: string;
    email: string;
    fullName?: string;
  };
  createdAt: string;
}

export interface Subtask {
  id: string;
  parentTaskId: string;
  title: string;
  description?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompletionRequirement {
  checklist?: Array<{
    id: string;
    label: string;
    completed: boolean;
  }>;
  photoRequired?: boolean;
  signatureRequired?: boolean;
  notes?: string;
}

export interface EnhancedTask {
  id: string;
  title: string;
  description?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: string;
  assignments: TaskAssignment[];
  subtasks: Subtask[];
  completionRequirements?: CompletionRequirement;
  parentTaskId?: string;
  assetId?: string;
  scheduleId?: string;
  estimatedMinutes?: number;
  estimatedCost?: number;
  completedAt?: string;
  skippedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnhancedTaskDto {
  title: string;
  description?: string;
  status?: 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'SKIPPED';
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: string;
  assetId?: string;
  scheduleId?: string;
  parentTaskId?: string;
  estimatedMinutes?: number;
  estimatedCost?: number;
  assigneeIds?: string[];
  completionRequirements?: CompletionRequirement;
}

export interface CreateSubtaskDto {
  title: string;
  description?: string;
  parentTaskId: string;
}

export const taskEnhancementsApi = {
  /**
   * Assign users to a task
   */
  async assignUsers(taskId: string, userIds: string[]) {
    const { data } = await apiClient.post<TaskAssignment[]>(
      `/task-enhancements/${taskId}/assignments`,
      { userIds }
    );
    return data;
  },

  /**
   * Remove user assignment from a task
   */
  async unassignUser(taskId: string, userId: string) {
    const { data } = await apiClient.delete<{ message: string }>(
      `/task-enhancements/${taskId}/assignments/${userId}`
    );
    return data;
  },

  /**
   * Create a subtask
   */
  async createSubtask(subtask: CreateSubtaskDto) {
    const { data } = await apiClient.post<Subtask>(
      `/task-enhancements/${subtask.parentTaskId}/subtasks`,
      subtask
    );
    return data;
  },

  /**
   * Update a subtask
   */
  async updateSubtask(taskId: string, subtaskId: string, updates: Partial<Subtask>) {
    const { data } = await apiClient.put<Subtask>(
      `/task-enhancements/${taskId}/subtasks/${subtaskId}`,
      updates
    );
    return data;
  },

  /**
   * Delete a subtask
   */
  async deleteSubtask(taskId: string, subtaskId: string) {
    const { data } = await apiClient.delete<{ message: string }>(
      `/task-enhancements/${taskId}/subtasks/${subtaskId}`
    );
    return data;
  },

  /**
   * Update completion requirements
   */
  async updateCompletionRequirements(taskId: string, requirements: CompletionRequirement) {
    const { data } = await apiClient.put<EnhancedTask>(
      `/task-enhancements/${taskId}/completion-requirements`,
      requirements
    );
    return data;
  },

  /**
   * Update checklist item
   */
  async updateChecklistItem(taskId: string, itemId: string, completed: boolean) {
    const { data } = await apiClient.patch<EnhancedTask>(
      `/task-enhancements/${taskId}/checklist/${itemId}`,
      { completed }
    );
    return data;
  },

  /**
   * Upload completion photo
   */
  async uploadCompletionPhoto(taskId: string, file: File) {
    const formData = new FormData();
    formData.append('photo', file);
    
    const { data } = await apiClient.post<{
      photoUrl: string;
      uploadedAt: string;
    }>(`/task-enhancements/${taskId}/completion-photo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return data;
  },
};