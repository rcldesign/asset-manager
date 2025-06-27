import { test, expect } from '@playwright/test';
import { ApiHelpers } from '../../support/helpers/api-helpers';
import { UserManagementPage } from '../../support/page-objects/user-management.page';

test.describe('User Invitations and Onboarding @user-management @critical', () => {
  let apiHelpers: ApiHelpers;
  let userManagementPage: UserManagementPage;
  let testOrg: any;
  let adminUser: any;

  test.beforeEach(async ({ page, request }) => {
    // Initialize helpers
    apiHelpers = new ApiHelpers(request);
    userManagementPage = new UserManagementPage(page);

    // Create test organization
    testOrg = await apiHelpers.createOrganization({
      name: 'Test Org for User Management'
    });

    // Create admin user
    adminUser = await apiHelpers.createUser({
      email: 'admin@test.com',
      fullName: 'Admin User',
      role: 'OWNER',
      organizationId: testOrg.id
    });

    // Login as admin
    await userManagementPage.loginWithToken(adminUser.token);
  });

  test.afterEach(async ({ request }) => {
    await apiHelpers.cleanup();
  });

  test('should invite new user and complete onboarding flow @user-invitation', async ({ page, context }) => {
    const newUserEmail = 'newuser@test.com';
    const newUserName = 'New User';

    // Navigate to user management
    await userManagementPage.goto();

    // Send invitation
    await userManagementPage.inviteUser({
      email: newUserEmail,
      fullName: newUserName,
      role: 'MEMBER'
    });

    // Verify invitation was sent
    await userManagementPage.expectSuccess('Invitation sent successfully');
    
    // Verify pending invitation appears in list
    await expect(page.getByText(newUserEmail)).toBeVisible();
    await expect(page.getByText('Pending')).toBeVisible();

    // Check that invitation email was sent
    const emailInbox = await apiHelpers.getNotificationInbox('email');
    const invitationEmail = emailInbox.find((email: any) => 
      email.to === newUserEmail && 
      email.subject.includes('invitation')
    );
    
    expect(invitationEmail).toBeDefined();
    expect(invitationEmail.body).toContain(testOrg.name);

    // Extract invitation token from email
    const tokenMatch = invitationEmail.body.match(/token=([a-zA-Z0-9-_]+)/);
    expect(tokenMatch).toBeDefined();
    const invitationToken = tokenMatch[1];

    // Open new browser context for invited user
    const newUserContext = await context.browser().newContext();
    const newUserPage = await newUserContext.newPage();

    // Navigate to invitation acceptance page
    await newUserPage.goto(`/accept-invitation?token=${invitationToken}`);

    // Complete onboarding form
    await newUserPage.getByLabel(/password/i).fill('NewUser123!');
    await newUserPage.getByLabel(/confirm password/i).fill('NewUser123!');
    await newUserPage.getByLabel(/phone/i).fill('+1234567890');
    
    // Accept terms and conditions
    await newUserPage.getByLabel(/terms.*conditions/i).check();
    
    // Submit onboarding
    await newUserPage.getByRole('button', { name: /complete setup/i }).click();

    // Verify successful onboarding
    await expect(newUserPage.getByText('Welcome to')).toBeVisible();
    await expect(newUserPage.getByText(testOrg.name)).toBeVisible();

    // Verify user is redirected to dashboard
    await newUserPage.waitForURL('/dashboard');

    // Switch back to admin view and verify user is now active
    await userManagementPage.goto();
    await page.reload();
    
    const userRow = page.locator(`tr:has-text("${newUserEmail}")`);
    await expect(userRow.getByTestId('user-status')).toContainText('Active');

    await newUserContext.close();
  });

  test('should handle invitation expiration @invitation-expiration', async ({ page, context }) => {
    const expiredUserEmail = 'expired@test.com';

    // Create an expired invitation via API
    const expiredInvitation = await apiHelpers.request.post(`${apiHelpers['baseUrl']}/api/test-data/invitations`, {
      data: {
        email: expiredUserEmail,
        organizationId: testOrg.id,
        role: 'MEMBER',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
      }
    });
    
    const invitation = await expiredInvitation.json();

    // Try to access expired invitation
    const newUserContext = await context.browser().newContext();
    const newUserPage = await newUserContext.newPage();
    
    await newUserPage.goto(`/accept-invitation?token=${invitation.token}`);

    // Verify expiration message
    await expect(newUserPage.getByText('invitation has expired')).toBeVisible();
    await expect(newUserPage.getByRole('button', { name: /request new invitation/i })).toBeVisible();

    // Request new invitation
    await newUserPage.getByRole('button', { name: /request new invitation/i }).click();
    await expect(newUserPage.getByText('New invitation request sent')).toBeVisible();

    // Admin should see the request
    await userManagementPage.goto();
    await page.getByRole('tab', { name: /invitation requests/i }).click();
    await expect(page.getByText(expiredUserEmail)).toBeVisible();

    // Admin can approve the request
    const requestRow = page.locator(`tr:has-text("${expiredUserEmail}")`);
    await requestRow.getByRole('button', { name: /approve/i }).click();
    await userManagementPage.expectSuccess('New invitation sent');

    await newUserContext.close();
  });

  test('should support bulk user invitations @bulk-invitations', async ({ page }) => {
    const bulkUsers = [
      { email: 'user1@test.com', fullName: 'User One', role: 'MEMBER' },
      { email: 'user2@test.com', fullName: 'User Two', role: 'MEMBER' },
      { email: 'user3@test.com', fullName: 'User Three', role: 'MANAGER' }
    ];

    await userManagementPage.goto();

    // Open bulk invitation dialog
    await userManagementPage.bulkInviteUsers(bulkUsers);

    // Verify all invitations are sent
    await userManagementPage.expectSuccess('3 invitations sent successfully');

    // Verify all users appear in pending list
    for (const user of bulkUsers) {
      await expect(page.getByText(user.email)).toBeVisible();
    }

    // Verify correct role assignments
    const managerRow = page.locator(`tr:has-text("user3@test.com")`);
    await expect(managerRow.getByTestId('user-role')).toContainText('MANAGER');
  });

  test('should handle role-based invitation permissions @role-permissions', async ({ page, context }) => {
    // Create a MEMBER user who shouldn't be able to invite others
    const memberUser = await apiHelpers.createUser({
      email: 'member@test.com',
      fullName: 'Member User',
      role: 'MEMBER',
      organizationId: testOrg.id
    });

    // Switch to member user
    await userManagementPage.logout();
    await userManagementPage.loginWithToken(memberUser.token);
    await userManagementPage.goto();

    // Verify invite button is not visible for MEMBER role
    await expect(page.getByRole('button', { name: /invite user/i })).not.toBeVisible();

    // Try direct navigation to invite page
    await page.goto('/users/invite');
    await expect(page.getByText('Access denied')).toBeVisible();

    // Switch back to admin
    await userManagementPage.logout();
    await userManagementPage.loginWithToken(adminUser.token);

    // Create a MANAGER user who should be able to invite MEMBER users but not other MANAGERS
    const managerUser = await apiHelpers.createUser({
      email: 'manager@test.com',
      fullName: 'Manager User',
      role: 'MANAGER',
      organizationId: testOrg.id
    });

    await userManagementPage.logout();
    await userManagementPage.loginWithToken(managerUser.token);
    await userManagementPage.goto();

    // Verify manager can invite users
    await expect(page.getByRole('button', { name: /invite user/i })).toBeVisible();

    // Open invitation form
    await page.getByRole('button', { name: /invite user/i }).click();

    // Verify role options are limited for MANAGER
    await page.getByLabel(/role/i).click();
    await expect(page.getByRole('option', { name: 'MEMBER' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'VIEWER' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'MANAGER' })).not.toBeVisible();
    await expect(page.getByRole('option', { name: 'OWNER' })).not.toBeVisible();
  });

  test('should revoke pending invitations @revoke-invitations', async ({ page }) => {
    const userToRevoke = 'revoke@test.com';

    await userManagementPage.goto();

    // Send invitation
    await userManagementPage.inviteUser({
      email: userToRevoke,
      fullName: 'User To Revoke',
      role: 'MEMBER'
    });

    // Find the pending invitation
    const invitationRow = page.locator(`tr:has-text("${userToRevoke}")`);
    await expect(invitationRow.getByTestId('user-status')).toContainText('Pending');

    // Revoke the invitation
    await invitationRow.getByRole('button', { name: /revoke/i }).click();
    await userManagementPage.confirmAction();
    await userManagementPage.expectSuccess('Invitation revoked');

    // Verify invitation is removed from list
    await expect(page.getByText(userToRevoke)).not.toBeVisible();
  });

  test('should resend invitation reminders @resend-invitations', async ({ page }) => {
    const userForReminder = 'reminder@test.com';

    await userManagementPage.goto();

    // Send initial invitation
    await userManagementPage.inviteUser({
      email: userForReminder,
      fullName: 'Reminder User',
      role: 'MEMBER'
    });

    // Find pending invitation
    const invitationRow = page.locator(`tr:has-text("${userForReminder}")`);
    
    // Resend invitation
    await invitationRow.getByRole('button', { name: /resend/i }).click();
    await userManagementPage.expectSuccess('Invitation resent');

    // Verify multiple emails were sent
    const emailInbox = await apiHelpers.getNotificationInbox('email');
    const invitationEmails = emailInbox.filter((email: any) => 
      email.to === userForReminder && 
      email.subject.includes('invitation')
    );
    
    expect(invitationEmails.length).toBeGreaterThanOrEqual(2);
  });

  test('should handle user profile completion during onboarding @profile-completion', async ({ page, context }) => {
    const profileUserEmail = 'profile@test.com';

    await userManagementPage.goto();

    // Send invitation
    await userManagementPage.inviteUser({
      email: profileUserEmail,
      fullName: 'Profile User',
      role: 'MEMBER'
    });

    // Get invitation token
    const emailInbox = await apiHelpers.getNotificationInbox('email');
    const invitationEmail = emailInbox.find((email: any) => 
      email.to === profileUserEmail
    );
    const tokenMatch = invitationEmail.body.match(/token=([a-zA-Z0-9-_]+)/);
    const invitationToken = tokenMatch[1];

    // New user context
    const newUserContext = await context.browser().newContext();
    const newUserPage = await newUserContext.newPage();

    await newUserPage.goto(`/accept-invitation?token=${invitationToken}`);

    // Complete detailed profile
    await newUserPage.getByLabel(/password/i).fill('ProfileUser123!');
    await newUserPage.getByLabel(/confirm password/i).fill('ProfileUser123!');
    await newUserPage.getByLabel(/job title/i).fill('Equipment Technician');
    await newUserPage.getByLabel(/department/i).fill('Maintenance');
    await newUserPage.getByLabel(/phone/i).fill('+1234567890');
    await newUserPage.getByLabel(/emergency contact/i).fill('Emergency Contact');
    await newUserPage.getByLabel(/emergency phone/i).fill('+0987654321');
    
    // Upload profile picture
    await newUserPage.setInputFiles('input[type="file"]', {
      name: 'profile.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake image content'),
    });

    // Set notification preferences
    await newUserPage.getByLabel(/email notifications/i).check();
    await newUserPage.getByLabel(/push notifications/i).check();
    await newUserPage.getByLabel(/sms notifications/i).uncheck();

    await newUserPage.getByLabel(/terms.*conditions/i).check();
    await newUserPage.getByRole('button', { name: /complete setup/i }).click();

    // Verify profile completion
    await expect(newUserPage.getByText('Profile completed successfully')).toBeVisible();

    // Navigate to profile page and verify all data is saved
    await newUserPage.goto('/profile');
    await expect(newUserPage.getByDisplayValue('Equipment Technician')).toBeVisible();
    await expect(newUserPage.getByDisplayValue('Maintenance')).toBeVisible();

    await newUserContext.close();
  });

  test('should track invitation analytics @invitation-analytics', async ({ page }) => {
    await userManagementPage.goto();

    // Navigate to analytics tab
    await page.getByRole('tab', { name: /analytics|reports/i }).click();

    // Send multiple invitations for testing
    const testUsers = [
      'analytics1@test.com',
      'analytics2@test.com',
      'analytics3@test.com'
    ];

    for (const email of testUsers) {
      await userManagementPage.inviteUser({
        email,
        fullName: `Analytics User for ${email}`,
        role: 'MEMBER'
      });
    }

    // Refresh analytics
    await page.getByRole('button', { name: /refresh/i }).click();

    // Verify invitation metrics
    await expect(page.getByTestId('total-invitations-sent')).toContainText('3');
    await expect(page.getByTestId('pending-invitations')).toContainText('3');
    await expect(page.getByTestId('acceptance-rate')).toBeVisible();

    // Verify invitation history chart
    await expect(page.getByTestId('invitation-history-chart')).toBeVisible();

    // Test date range filtering
    await page.getByLabel(/date range/i).click();
    await page.getByRole('option', { name: /last 7 days/i }).click();
    
    await expect(page.getByTestId('filtered-results')).toBeVisible();
  });
});