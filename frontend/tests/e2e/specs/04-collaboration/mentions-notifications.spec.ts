import { test, expect } from '@playwright/test';
import { ApiHelpers } from '../../support/helpers/api-helpers';
import { TaskPage } from '../../support/page-objects/task.page';
import { NotificationPage } from '../../support/page-objects/notification.page';

test.describe('Collaboration and Mentions @collaboration @notifications', () => {
  let apiHelpers: ApiHelpers;
  let taskPage: TaskPage;
  let notificationPage: NotificationPage;
  let testOrg: any;
  let mentioningUser: any;
  let mentionedUser: any;
  let testAsset: any;

  test.beforeEach(async ({ page, request }) => {
    // Initialize helpers
    apiHelpers = new ApiHelpers(request);
    taskPage = new TaskPage(page);
    notificationPage = new NotificationPage(page);

    // Create test organization
    testOrg = await apiHelpers.createOrganization({
      name: 'Test Org for Collaboration'
    });

    // Create users
    mentioningUser = await apiHelpers.createUser({
      email: 'mentioner@test.com',
      fullName: 'Mentioning User',
      role: 'MANAGER',
      organizationId: testOrg.id
    });

    mentionedUser = await apiHelpers.createUser({
      email: 'mentioned@test.com',
      fullName: 'Mentioned User',
      role: 'MEMBER',
      organizationId: testOrg.id
    });

    // Create test asset
    testAsset = await apiHelpers.createAsset({
      name: 'Collaborative Equipment',
      description: 'Equipment for collaboration testing',
      organizationId: testOrg.id
    });

    // Login as mentioning user
    await taskPage.loginWithToken(mentioningUser.token);
  });

  test.afterEach(async ({ request }) => {
    await apiHelpers.cleanup();
  });

  test('should trigger notification when user is mentioned in task comment @mentions', async ({ page, context }) => {
    // Create a task
    const task = await apiHelpers.createTask({
      title: 'Collaboration Test Task',
      description: 'Task for testing mentions',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Add comment with mention
    await taskPage.addCommentWithMention(
      `@${mentionedUser.fullName} please review the maintenance requirements`,
      [mentionedUser.fullName]
    );

    // Verify comment was posted with mention
    await expect(page.getByText(`@${mentionedUser.fullName} please review`)).toBeVisible();

    // Switch to mentioned user's account
    await taskPage.logout();
    await taskPage.loginWithToken(mentionedUser.token);

    // Check notifications
    await notificationPage.goto();
    
    // Verify mention notification exists
    await expect(page.getByText(`${mentioningUser.fullName} mentioned you`)).toBeVisible();
    await expect(page.getByText('Collaboration Test Task')).toBeVisible();

    // Click notification to navigate to task
    await page.getByText(`${mentioningUser.fullName} mentioned you`).click();
    
    // Verify we're redirected to the correct task
    await expect(page.getByText('Collaboration Test Task')).toBeVisible();
    await expect(page.getByText(`@${mentionedUser.fullName} please review`)).toBeVisible();
  });

  test('should handle multiple mentions in single comment @multiple-mentions', async ({ page }) => {
    // Create a third user
    const thirdUser = await apiHelpers.createUser({
      email: 'third@test.com',
      fullName: 'Third User',
      role: 'MEMBER',
      organizationId: testOrg.id
    });

    const task = await apiHelpers.createTask({
      title: 'Multi-mention Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Add comment mentioning multiple users
    await taskPage.addCommentWithMention(
      `@${mentionedUser.fullName} and @${thirdUser.fullName} need to coordinate on this`,
      [mentionedUser.fullName, thirdUser.fullName]
    );

    // Switch to first mentioned user
    await taskPage.logout();
    await taskPage.loginWithToken(mentionedUser.token);
    await notificationPage.goto();
    
    await expect(page.getByText(`${mentioningUser.fullName} mentioned you`)).toBeVisible();

    // Switch to second mentioned user
    await taskPage.logout();
    await taskPage.loginWithToken(thirdUser.token);
    await notificationPage.goto();
    
    await expect(page.getByText(`${mentioningUser.fullName} mentioned you`)).toBeVisible();
  });

  test('should send email notifications for mentions @email-notifications', async ({ page }) => {
    const task = await apiHelpers.createTask({
      title: 'Email Notification Test',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Add comment with mention
    await taskPage.addCommentWithMention(
      `@${mentionedUser.fullName} urgent: please check the equipment status`,
      [mentionedUser.fullName]
    );

    // Check that email was sent (using test helper)
    const emailInbox = await apiHelpers.getNotificationInbox('email');
    
    // Verify email was sent to mentioned user
    const mentionEmail = emailInbox.find((email: any) => 
      email.to === mentionedUser.email && 
      email.subject.includes('mentioned you')
    );
    
    expect(mentionEmail).toBeDefined();
    expect(mentionEmail.body).toContain(mentioningUser.fullName);
    expect(mentionEmail.body).toContain('Email Notification Test');
  });

  test('should support mention autocomplete in comment editor @mention-autocomplete', async ({ page }) => {
    const task = await apiHelpers.createTask({
      title: 'Autocomplete Test Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Start typing mention
    await taskPage.commentInput.click();
    await page.keyboard.type('Hey @Men');

    // Verify autocomplete suggestions appear
    await expect(page.getByTestId('mention-suggestions')).toBeVisible();
    await expect(page.getByText(mentionedUser.fullName)).toBeVisible();

    // Select from autocomplete
    await page.getByText(mentionedUser.fullName).click();

    // Verify mention was inserted
    await expect(taskPage.commentInput).toHaveValue(`Hey @${mentionedUser.fullName} `);

    // Complete and post comment
    await page.keyboard.type('how is the progress?');
    await taskPage.addCommentButton.click();

    // Verify comment appears with proper mention formatting
    await expect(page.getByText(`@${mentionedUser.fullName}`)).toHaveClass(/mention/);
  });

  test('should handle mentions in task descriptions @task-description-mentions', async ({ page }) => {
    await taskPage.goto();

    // Create task with mention in description
    await taskPage.createTaskButton.click();
    await taskPage.titleField.fill('Task with Mentioned Description');
    
    // Add mention in description field
    await taskPage.descriptionField.click();
    await page.keyboard.type(`This task requires @${mentionedUser.fullName} to review`);
    
    // Select asset
    await taskPage.assetSelect.click();
    await page.getByRole('option').first().click();
    
    await taskPage.saveButton.click();
    await taskPage.expectSuccess();

    // Switch to mentioned user and check notifications
    await taskPage.logout();
    await taskPage.loginWithToken(mentionedUser.token);
    await notificationPage.goto();

    // Verify notification for task description mention
    await expect(page.getByText(`${mentioningUser.fullName} mentioned you in a task`)).toBeVisible();
  });

  test('should handle real-time mention notifications @real-time', async ({ page, context }) => {
    // Open second browser tab/context for mentioned user
    const secondPage = await context.newPage();
    const secondTaskPage = new TaskPage(secondPage);
    const secondNotificationPage = new NotificationPage(secondPage);
    
    // Login mentioned user in second tab
    await secondTaskPage.loginWithToken(mentionedUser.token);
    await secondNotificationPage.goto();

    // Create task in first tab
    const task = await apiHelpers.createTask({
      title: 'Real-time Mention Test',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Add mention in first tab
    await taskPage.addCommentWithMention(
      `@${mentionedUser.fullName} check this out!`,
      [mentionedUser.fullName]
    );

    // Verify real-time notification appears in second tab
    await expect(secondPage.getByTestId('notification-badge')).toBeVisible({ timeout: 10000 });
    await expect(secondPage.getByText(`${mentioningUser.fullName} mentioned you`)).toBeVisible();

    await secondPage.close();
  });

  test('should support mention threading and replies @mention-threading', async ({ page }) => {
    const task = await apiHelpers.createTask({
      title: 'Threading Test Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Add initial comment with mention
    await taskPage.addCommentWithMention(
      `@${mentionedUser.fullName} what's your opinion on this approach?`,
      [mentionedUser.fullName]
    );

    // Switch to mentioned user
    await taskPage.logout();
    await taskPage.loginWithToken(mentionedUser.token);
    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Reply with mention back
    await taskPage.addCommentWithMention(
      `@${mentioningUser.fullName} I think we should proceed carefully`,
      [mentioningUser.fullName]
    );

    // Switch back to original user
    await taskPage.logout();
    await taskPage.loginWithToken(mentioningUser.token);
    await notificationPage.goto();

    // Verify reply notification
    await expect(page.getByText(`${mentionedUser.fullName} mentioned you`)).toBeVisible();
    
    // Click to view the threaded conversation
    await page.getByText(`${mentionedUser.fullName} mentioned you`).click();
    
    // Verify both comments are visible in thread
    await expect(page.getByText("what's your opinion")).toBeVisible();
    await expect(page.getByText("proceed carefully")).toBeVisible();
  });

  test('should handle mention permissions and privacy @mention-permissions', async ({ page }) => {
    // Create user from different organization
    const otherOrg = await apiHelpers.createOrganization({
      name: 'Other Organization'
    });
    
    const outsideUser = await apiHelpers.createUser({
      email: 'outside@test.com',
      fullName: 'Outside User',
      role: 'MEMBER',
      organizationId: otherOrg.id
    });

    const task = await apiHelpers.createTask({
      title: 'Permission Test Task',
      assetId: testAsset.id,
      organizationId: testOrg.id
    });

    await taskPage.goto();
    await taskPage.openTask(task.title);

    // Try to mention user from different organization
    await taskPage.commentInput.click();
    await page.keyboard.type('@Outside');

    // Verify outside user doesn't appear in suggestions
    await expect(page.getByTestId('mention-suggestions')).toBeVisible();
    await expect(page.getByText(outsideUser.fullName)).not.toBeVisible();

    // Verify only users from same organization appear
    await expect(page.getByText(mentionedUser.fullName)).toBeVisible();
  });
});