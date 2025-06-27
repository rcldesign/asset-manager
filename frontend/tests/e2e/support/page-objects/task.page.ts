import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export interface TaskRequirements {
  checklist?: string[];
  photoRequired?: boolean;
  signatureRequired?: boolean;
}

export interface TaskData {
  title: string;
  description?: string;
  assetId: string;
  requirements?: TaskRequirements;
}

/**
 * Page Object for Task Management
 */
export class TaskPage extends BasePage {
  // Navigation and main elements
  readonly tasksList: Locator;
  readonly createTaskButton: Locator;
  readonly taskFormDialog: Locator;
  readonly taskDetailPanel: Locator;
  
  // Task form fields
  readonly titleField: Locator;
  readonly descriptionField: Locator;
  readonly assetSelect: Locator;
  readonly assigneeSelect: Locator;
  readonly dueDateField: Locator;
  readonly prioritySelect: Locator;
  
  // Task actions
  readonly startButton: Locator;
  readonly completeButton: Locator;
  readonly pauseButton: Locator;
  readonly reassignButton: Locator;
  
  // Task details
  readonly statusBadge: Locator;
  readonly progressBar: Locator;
  readonly assignedUsers: Locator;
  readonly completionRequirements: Locator;
  
  // Comments and time logging
  readonly commentInput: Locator;
  readonly addCommentButton: Locator;
  readonly timeLogButton: Locator;
  readonly timeLogDialog: Locator;
  
  // Subtasks
  readonly subtasksList: Locator;
  readonly addSubtaskButton: Locator;
  readonly subtaskCheckbox: Locator;
  
  // Bulk operations
  readonly selectAllCheckbox: Locator;
  readonly bulkActionsBar: Locator;
  readonly bulkAssignButton: Locator;
  readonly bulkStatusButton: Locator;
  
  // File upload and signature
  readonly fileUploadInput: Locator;
  readonly signaturePad: Locator;
  readonly signatureConfirm: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main elements
    this.tasksList = page.locator('[data-testid="tasks-list"]');
    this.createTaskButton = page.getByRole('button', { name: /create task|add task/i });
    this.taskFormDialog = page.locator('[role="dialog"][aria-labelledby*="task"]');
    this.taskDetailPanel = page.locator('[data-testid="task-detail-panel"]');
    
    // Form fields
    this.titleField = page.getByLabel(/task title|title/i);
    this.descriptionField = page.getByLabel(/description/i);
    this.assetSelect = page.getByLabel(/asset/i);
    this.assigneeSelect = page.getByLabel(/assign to|assignee/i);
    this.dueDateField = page.getByLabel(/due date/i);
    this.prioritySelect = page.getByLabel(/priority/i);
    
    // Actions
    this.startButton = page.getByRole('button', { name: /start task|begin/i });
    this.completeButton = page.getByRole('button', { name: /complete|finish/i });
    this.pauseButton = page.getByRole('button', { name: /pause|hold/i });
    this.reassignButton = page.getByRole('button', { name: /reassign/i });
    
    // Details
    this.statusBadge = page.locator('[data-testid="task-status"]');
    this.progressBar = page.locator('[data-testid="task-progress"]');
    this.assignedUsers = page.locator('[data-testid="assigned-to"]');
    this.completionRequirements = page.locator('[data-testid="completion-requirements"]');
    
    // Comments and time
    this.commentInput = page.getByLabel(/add comment|comment/i);
    this.addCommentButton = page.getByRole('button', { name: /add comment|post/i });
    this.timeLogButton = page.getByRole('button', { name: /log time|add time/i });
    this.timeLogDialog = page.locator('[role="dialog"][aria-labelledby*="time"]');
    
    // Subtasks
    this.subtasksList = page.locator('[data-testid="subtasks-list"]');
    this.addSubtaskButton = page.getByRole('button', { name: /add subtask/i });
    
    // Bulk operations
    this.selectAllCheckbox = page.locator('[data-testid="select-all-tasks"]');
    this.bulkActionsBar = page.locator('[data-testid="bulk-actions"]');
    this.bulkAssignButton = page.getByRole('button', { name: /bulk assign/i });
    this.bulkStatusButton = page.getByRole('button', { name: /bulk status|update status/i });
    
    // File and signature
    this.fileUploadInput = page.locator('input[type="file"]');
    this.signaturePad = page.locator('[data-testid="signature-pad"]');
    this.signatureConfirm = page.getByRole('button', { name: /confirm signature/i });
  }

  /**
   * Navigate to tasks page
   */
  async goto() {
    await super.goto('/tasks');
  }

  /**
   * Open task detail view
   */
  async openTask(taskTitle: string) {
    const taskRow = this.tasksList.locator(`tr:has-text("${taskTitle}")`);
    await taskRow.click();
    await expect(this.taskDetailPanel).toBeVisible();
  }

  /**
   * Create a new task
   */
  async createTask(data: TaskData) {
    await this.createTaskButton.click();
    await expect(this.taskFormDialog).toBeVisible();
    
    await this.titleField.fill(data.title);
    if (data.description) {
      await this.descriptionField.fill(data.description);
    }
    
    // Select asset
    await this.assetSelect.click();
    await this.page.getByRole('option', { name: new RegExp(data.assetId) }).click();
    
    await this.saveButton.click();
    await expect(this.taskFormDialog).not.toBeVisible();
    await this.expectSuccess();
  }

  /**
   * Create task with completion requirements
   */
  async createTaskWithRequirements(data: TaskData) {
    await this.createTask(data);
    
    if (data.requirements) {
      // Navigate to requirements section in the task
      await this.page.getByRole('tab', { name: /requirements/i }).click();
      
      // Add checklist items
      if (data.requirements.checklist) {
        for (const item of data.requirements.checklist) {
          await this.page.getByRole('button', { name: /add checklist item/i }).click();
          await this.page.getByLabel(/checklist item/i).last().fill(item);
        }
      }
      
      // Toggle photo requirement
      if (data.requirements.photoRequired) {
        await this.page.getByLabel(/photo required/i).check();
      }
      
      // Toggle signature requirement
      if (data.requirements.signatureRequired) {
        await this.page.getByLabel(/signature required/i).check();
      }
      
      await this.saveButton.click();
      await this.expectSuccess();
    }
  }

  /**
   * Start a task
   */
  async startTask() {
    await this.startButton.click();
    await this.expectSuccess();
  }

  /**
   * Complete a task
   */
  async completeTask(completionNote?: string) {
    await this.completeButton.click();
    
    if (completionNote) {
      await this.page.getByLabel(/completion note/i).fill(completionNote);
    }
    
    await this.confirmAction();
    await this.expectSuccess();
  }

  /**
   * Click complete button (without confirmation)
   */
  async clickCompleteButton() {
    await this.completeButton.click();
  }

  /**
   * Assign multiple users to task
   */
  async assignUsers(userNames: string[]) {
    await this.page.getByRole('button', { name: /assign users/i }).click();
    
    for (const userName of userNames) {
      await this.assigneeSelect.click();
      await this.page.getByRole('option', { name: userName }).click();
    }
    
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Verify task assignees
   */
  async verifyAssignees(userNames: string[]) {
    for (const userName of userNames) {
      await expect(this.assignedUsers.getByText(userName)).toBeVisible();
    }
  }

  /**
   * Complete a subtask
   */
  async completeSubtask(subtaskTitle: string) {
    const subtaskRow = this.subtasksList.locator(`[data-testid="subtask"]:has-text("${subtaskTitle}")`);
    await subtaskRow.getByRole('checkbox').check();
    await this.expectSuccess();
  }

  /**
   * Check a completion requirement
   */
  async checkRequirement(requirementText: string) {
    const requirement = this.completionRequirements.locator(`[data-testid="requirement"]:has-text("${requirementText}")`);
    await requirement.getByRole('checkbox').check();
  }

  /**
   * Upload photo for task completion
   */
  async uploadPhoto(fileName: string) {
    // Create a test file
    const fileContent = Buffer.from('fake image content');
    await this.page.setInputFiles(this.fileUploadInput, {
      name: fileName,
      mimeType: 'image/jpeg',
      buffer: fileContent,
    });
    await this.expectSuccess();
  }

  /**
   * Add digital signature
   */
  async addDigitalSignature() {
    await this.page.getByRole('button', { name: /add signature/i }).click();
    
    // Simulate drawing on signature pad
    const box = await this.signaturePad.boundingBox();
    if (box) {
      await this.page.mouse.move(box.x + 50, box.y + 50);
      await this.page.mouse.down();
      await this.page.mouse.move(box.x + 150, box.y + 100);
      await this.page.mouse.up();
    }
    
    await this.signatureConfirm.click();
    await this.expectSuccess();
  }

  /**
   * Add comment to task
   */
  async addComment(comment: string) {
    await this.commentInput.fill(comment);
    await this.addCommentButton.click();
    await this.expectSuccess();
  }

  /**
   * Update task progress
   */
  async updateProgress(percentage: number) {
    await this.page.getByRole('button', { name: /update progress/i }).click();
    await this.page.getByLabel(/progress/i).fill(percentage.toString());
    await this.saveButton.click();
    await this.expectSuccess();
  }

  /**
   * Log time for task
   */
  async logTime(duration: string, description?: string) {
    await this.timeLogButton.click();
    await expect(this.timeLogDialog).toBeVisible();
    
    await this.page.getByLabel(/duration|time spent/i).fill(duration);
    if (description) {
      await this.page.getByLabel(/description/i).fill(description);
    }
    
    await this.saveButton.click();
    await expect(this.timeLogDialog).not.toBeVisible();
    await this.expectSuccess();
  }

  /**
   * Reassign task to different user
   */
  async reassignTask(newAssignee: string) {
    await this.reassignButton.click();
    await this.assigneeSelect.click();
    await this.page.getByRole('option', { name: newAssignee }).click();
    await this.saveButton.click();
  }

  /**
   * Select a task for bulk operations
   */
  async selectTask(taskTitle: string) {
    const taskRow = this.tasksList.locator(`tr:has-text("${taskTitle}")`);
    await taskRow.getByRole('checkbox').check();
  }

  /**
   * Clear all task selections
   */
  async clearSelection() {
    if (await this.selectAllCheckbox.isChecked()) {
      await this.selectAllCheckbox.uncheck();
    }
  }

  /**
   * Bulk assign selected tasks
   */
  async bulkAssign(assignee: string) {
    await this.bulkAssignButton.click();
    await this.assigneeSelect.click();
    await this.page.getByRole('option', { name: assignee }).click();
    await this.saveButton.click();
  }

  /**
   * Bulk update status of selected tasks
   */
  async bulkUpdateStatus(status: string) {
    await this.bulkStatusButton.click();
    await this.page.getByRole('option', { name: status }).click();
    await this.confirmAction();
  }

  /**
   * Add comment with mentions
   */
  async addCommentWithMention(comment: string, mentionedUsers: string[]) {
    await this.commentInput.fill(comment);
    
    // Handle mention autocomplete if needed
    for (const user of mentionedUsers) {
      // This would be handled by the rich text editor
      // The mention formatting is expected to be part of the comment text
    }
    
    await this.addCommentButton.click();
    await this.expectSuccess();
  }

  /**
   * Set due date for task
   */
  async setDueDate(dateTime: string) {
    await this.dueDateField.fill(dateTime);
  }

  /**
   * Bulk schedule selected tasks
   */
  async bulkSchedule(date: string) {
    await this.page.getByRole('button', { name: /bulk schedule/i }).click();
    await this.page.getByLabel(/schedule date/i).fill(date);
  }
}