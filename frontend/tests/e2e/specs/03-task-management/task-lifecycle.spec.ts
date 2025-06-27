import { test, expect } from '@playwright/test';
import { ApiHelpers } from '../../support/helpers/api-helpers';
import { createTimeTravel } from '../../support/helpers/time-travel';
import { TaskPage } from '../../support/page-objects/task.page';

test.describe('Task Lifecycle Management @task-management @critical', () => {
  let apiHelpers: ApiHelpers;
  let timeTravel: any;
  let taskPage: TaskPage;
  let testUser: any;
  let testOrg: any;
  let testAsset: any;
  let secondUser: any;

  test.beforeEach(async ({ page, request }) => {
    // Initialize helpers
    apiHelpers = new ApiHelpers(request);
    timeTravel = createTimeTravel(request);
    taskPage = new TaskPage(page);

    // Reset time
    await timeTravel.reset();

    // Create test organization
    testOrg = await apiHelpers.createOrganization({
      name: 'Test Org for Task Management'
    });

    // Create test users
    testUser = await apiHelpers.createUser({
      email: 'taskmanager@test.com',
      fullName: 'Task Manager',
      role: 'MANAGER',
      organizationId: testOrg.id
    });

    secondUser = await apiHelpers.createUser({
      email: 'worker@test.com',
      fullName: 'Worker User',
      role: 'MEMBER',
      organizationId: testOrg.id
    });

    // Create test asset
    testAsset = await apiHelpers.createAsset({
      name: 'Test Equipment',
      description: 'Equipment for task testing',
      organizationId: testOrg.id
    });

    // Login as test user
    await taskPage.loginWithToken(testUser.token);
  });

  test.afterEach(async ({ request }) => {
    await timeTravel.reset();
    await apiHelpers.cleanup();
  });

  test('should assign task to multiple users @multi-assignment', async ({ page }) => {
    // Create a task
    const taskData = await apiHelpers.createTask({
      title: 'Multi-user Maintenance Task',
      description: 'Task that requires multiple people',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    // Navigate to tasks page
    await taskPage.goto();
    
    // Find and open the task
    await taskPage.openTask(taskData.title);

    // Assign multiple users
    await taskPage.assignUsers([testUser.fullName, secondUser.fullName]);

    // Verify both users are assigned
    await taskPage.verifyAssignees([testUser.fullName, secondUser.fullName]);

    // Switch to second user and verify they can see the task
    await taskPage.logout();
    await taskPage.loginWithToken(secondUser.token);
    await taskPage.goto();
    
    await expect(page.getByText('Multi-user Maintenance Task')).toBeVisible();
  });

  test('should handle subtasks functionality @subtasks', async ({ page }) => {
    // Create task with subtasks via API
    const { task, subtasks } = await apiHelpers.createTaskWithSubtasks({
      title: 'Complex Maintenance with Subtasks',
      assetId: testAsset.id,
      subtasks: [
        { title: 'Check fluid levels', description: 'Verify all fluid levels are adequate' },
        { title: 'Inspect belts', description: 'Look for wear and proper tension' },
        { title: 'Test emergency stops', description: 'Verify all e-stops function correctly' }
      ],
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Verify subtasks are visible
    for (const subtask of subtasks) {
      await expect(page.getByText(subtask.title)).toBeVisible();
    }

    // Complete subtasks one by one
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      await taskPage.completeSubtask(subtask.title);
      
      // Verify progress updates
      const progress = ((i + 1) / subtasks.length) * 100;
      await expect(page.getByTestId('task-progress')).toContainText(`${progress}%`);
    }

    // Verify main task shows as ready for completion
    await expect(page.getByTestId('task-status')).toContainText('Ready for completion');
  });

  test('should handle completion requirements checklist @completion-requirements', async ({ page }) => {
    await taskPage.goto();

    // Create a task with completion requirements
    await taskPage.createTaskWithRequirements({
      title: 'Safety Inspection with Requirements',
      assetId: testAsset.id,
      requirements: {
        checklist: [
          'Verify all safety systems',
          'Document any issues found',
          'Update maintenance log'
        ],
        photoRequired: true,
        signatureRequired: true
      }
    });

    await taskPage.openTask('Safety Inspection with Requirements');

    // Try to complete without meeting requirements
    await taskPage.clickCompleteButton();
    await taskPage.expectError('Please complete all requirements');

    // Complete checklist items
    await taskPage.checkRequirement('Verify all safety systems');
    await taskPage.checkRequirement('Document any issues found');
    await taskPage.checkRequirement('Update maintenance log');

    // Upload required photo
    await taskPage.uploadPhoto('test-photo.jpg');

    // Add digital signature
    await taskPage.addDigitalSignature();

    // Now completion should work
    await taskPage.clickCompleteButton();
    await taskPage.confirmAction();
    await taskPage.expectSuccess('Task completed successfully');

    // Verify task status changed
    await expect(page.getByTestId('task-status')).toContainText('DONE');
  });

  test('should support task lifecycle from planned to done @full-lifecycle', async ({ page }) => {
    // Create a task
    const task = await apiHelpers.createTask({
      title: 'Full Lifecycle Test Task',
      description: 'Testing complete task lifecycle',
      assetId: testAsset.id,
      status: 'PLANNED',
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Verify initial status
    await expect(page.getByTestId('task-status')).toContainText('PLANNED');

    // Start the task
    await taskPage.startTask();
    await expect(page.getByTestId('task-status')).toContainText('IN_PROGRESS');

    // Add some comments
    await taskPage.addComment('Starting the maintenance work');
    await expect(page.getByText('Starting the maintenance work')).toBeVisible();

    // Update progress
    await taskPage.updateProgress(50);
    await expect(page.getByTestId('task-progress')).toContainText('50%');

    // Add time log
    await taskPage.logTime('2 hours', 'Initial inspection and setup');

    // Complete the task
    await taskPage.completeTask('Maintenance completed successfully');
    await expect(page.getByTestId('task-status')).toContainText('DONE');

    // Verify completion timestamp
    await expect(page.getByTestId('completion-date')).toBeVisible();
  });

  test('should handle task dependencies correctly @task-dependencies', async ({ page }) => {
    // Create two tasks where second depends on first
    const primaryTask = await apiHelpers.createTask({
      title: 'Primary Setup Task',
      description: 'Must be completed first',
      assetId: testAsset.id,
      status: 'PLANNED',
      organizationId: testOrg.id
    });

    const dependentTask = await apiHelpers.createTask({
      title: 'Dependent Maintenance Task',
      description: 'Can only start after primary task',
      assetId: testAsset.id,
      status: 'PLANNED',
      organizationId: testOrg.id
    });

    // Set up dependency via API
    await apiHelpers.request.post(`${apiHelpers['baseUrl']}/api/test-data/task-dependencies`, {
      data: {
        taskId: dependentTask.id,
        dependsOnId: primaryTask.id
      }
    });

    await taskPage.goto();

    // Verify dependent task shows as blocked
    const dependentRow = page.locator(`tr:has-text("${dependentTask.title}")`);
    await expect(dependentRow.getByTestId('dependency-status')).toContainText('Blocked');

    // Complete primary task
    await taskPage.openTask(primaryTask.title);
    await taskPage.completeTask('Primary task finished');
    
    // Navigate back to task list
    await taskPage.goto();

    // Verify dependent task is now available
    await expect(dependentRow.getByTestId('dependency-status')).toContainText('Ready');

    // Start dependent task
    await taskPage.openTask(dependentTask.title);
    await taskPage.startTask();
    await expect(page.getByTestId('task-status')).toContainText('IN_PROGRESS');
  });

  test('should handle task reassignment and notifications @reassignment', async ({ page }) => {
    // Create a task assigned to first user
    const task = await apiHelpers.createTask({
      title: 'Reassignment Test Task',
      assetId: testAsset.id,
      assignedToId: testUser.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Verify current assignment
    await expect(page.getByTestId('assigned-to')).toContainText(testUser.fullName);

    // Reassign to second user
    await taskPage.reassignTask(secondUser.fullName);
    await taskPage.expectSuccess('Task reassigned successfully');

    // Verify assignment changed
    await expect(page.getByTestId('assigned-to')).toContainText(secondUser.fullName);

    // Switch to second user and verify they can see the task
    await taskPage.logout();
    await taskPage.loginWithToken(secondUser.token);
    await taskPage.goto();

    // Verify task appears in second user's list
    await expect(page.getByText(task.title)).toBeVisible();
    
    // Verify task shows as assigned to them
    await taskPage.openTask(task.title);
    await expect(page.getByTestId('assigned-to')).toContainText(secondUser.fullName);
  });

  test('should support task bulk operations @bulk-operations', async ({ page }) => {
    // Create multiple tasks
    const tasks = [];
    for (let i = 1; i <= 5; i++) {
      const task = await apiHelpers.createTask({
        title: `Bulk Operation Test Task ${i}`,
        assetId: testAsset.id,
        status: 'PLANNED',
        organizationId: testOrg.id
      });
      tasks.push(task);
    }

    await taskPage.goto();

    // Select multiple tasks
    for (const task of tasks.slice(0, 3)) {
      await taskPage.selectTask(task.title);
    }

    // Verify bulk action bar appears
    await expect(page.getByTestId('bulk-actions')).toBeVisible();
    await expect(page.getByText('3 tasks selected')).toBeVisible();

    // Perform bulk assignment
    await taskPage.bulkAssign(secondUser.fullName);
    await taskPage.expectSuccess('3 tasks assigned successfully');

    // Verify all selected tasks are now assigned
    for (const task of tasks.slice(0, 3)) {
      const taskRow = page.locator(`tr:has-text("${task.title}")`);
      await expect(taskRow.getByTestId('assignee')).toContainText(secondUser.fullName);
    }

    // Select different tasks and bulk update status
    await taskPage.clearSelection();
    for (const task of tasks.slice(2, 5)) {
      await taskPage.selectTask(task.title);
    }

    await taskPage.bulkUpdateStatus('IN_PROGRESS');
    await taskPage.expectSuccess('3 tasks updated successfully');

    // Verify status updates
    for (const task of tasks.slice(2, 5)) {
      const taskRow = page.locator(`tr:has-text("${task.title}")`);
      await expect(taskRow.getByTestId('status')).toContainText('IN_PROGRESS');
    }
  });
});