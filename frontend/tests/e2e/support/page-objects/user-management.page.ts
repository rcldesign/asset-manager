import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

export interface UserInvitationData {
  email: string;
  fullName: string;
  role: 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';
  department?: string;
  jobTitle?: string;
}

/**
 * Page Object for User Management
 */
export class UserManagementPage extends BasePage {
  // Navigation and main elements
  readonly usersList: Locator;
  readonly inviteUserButton: Locator;
  readonly bulkInviteButton: Locator;
  readonly userInvitationDialog: Locator;
  readonly bulkInvitationDialog: Locator;
  
  // User list elements
  readonly userRows: Locator;
  readonly userStatus: Locator;
  readonly userRole: Locator;
  readonly userActions: Locator;
  
  // Invitation form fields
  readonly emailField: Locator;
  readonly fullNameField: Locator;
  readonly roleSelect: Locator;
  readonly departmentField: Locator;
  readonly jobTitleField: Locator;
  readonly sendInvitationButton: Locator;
  
  // Bulk invitation
  readonly bulkEmailTextarea: Locator;
  readonly bulkRoleSelect: Locator;
  readonly processBulkButton: Locator;
  
  // User actions
  readonly revokeButton: Locator;
  readonly resendButton: Locator;
  readonly editUserButton: Locator;
  readonly deactivateButton: Locator;
  
  // Tabs and filters
  readonly activeUsersTab: Locator;
  readonly pendingInvitationsTab: Locator;
  readonly invitationRequestsTab: Locator;
  readonly analyticsTab: Locator;
  
  // Analytics elements
  readonly totalInvitationsSent: Locator;
  readonly pendingInvitations: Locator;
  readonly acceptanceRate: Locator;
  readonly invitationHistoryChart: Locator;
  
  // Search and filters
  readonly searchField: Locator;
  readonly roleFilter: Locator;
  readonly departmentFilter: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    super(page);
    
    // Main elements
    this.usersList = page.locator('[data-testid="users-list"]');
    this.inviteUserButton = page.getByRole('button', { name: /invite user|add user/i });
    this.bulkInviteButton = page.getByRole('button', { name: /bulk invite/i });
    this.userInvitationDialog = page.locator('[role="dialog"][aria-labelledby*="invite"]');
    this.bulkInvitationDialog = page.locator('[role="dialog"][aria-labelledby*="bulk"]');
    
    // User list
    this.userRows = page.locator('[data-testid="user-row"]');
    this.userStatus = page.locator('[data-testid="user-status"]');
    this.userRole = page.locator('[data-testid="user-role"]');
    this.userActions = page.locator('[data-testid="user-actions"]');
    
    // Form fields
    this.emailField = page.getByLabel(/email/i);
    this.fullNameField = page.getByLabel(/full name|name/i);
    this.roleSelect = page.getByLabel(/role/i);
    this.departmentField = page.getByLabel(/department/i);
    this.jobTitleField = page.getByLabel(/job title|title/i);
    this.sendInvitationButton = page.getByRole('button', { name: /send invitation|invite/i });
    
    // Bulk invitation
    this.bulkEmailTextarea = page.getByLabel(/email addresses|emails/i);
    this.bulkRoleSelect = page.getByLabel(/default role/i);
    this.processBulkButton = page.getByRole('button', { name: /process invitations|send all/i });
    
    // Actions
    this.revokeButton = page.getByRole('button', { name: /revoke/i });
    this.resendButton = page.getByRole('button', { name: /resend/i });
    this.editUserButton = page.getByRole('button', { name: /edit/i });
    this.deactivateButton = page.getByRole('button', { name: /deactivate/i });
    
    // Tabs
    this.activeUsersTab = page.getByRole('tab', { name: /active users/i });
    this.pendingInvitationsTab = page.getByRole('tab', { name: /pending invitations/i });
    this.invitationRequestsTab = page.getByRole('tab', { name: /invitation requests/i });
    this.analyticsTab = page.getByRole('tab', { name: /analytics|reports/i });
    
    // Analytics
    this.totalInvitationsSent = page.locator('[data-testid="total-invitations-sent"]');
    this.pendingInvitations = page.locator('[data-testid="pending-invitations"]');
    this.acceptanceRate = page.locator('[data-testid="acceptance-rate"]');
    this.invitationHistoryChart = page.locator('[data-testid="invitation-history-chart"]');
    
    // Search and filters
    this.searchField = page.getByLabel(/search users/i);
    this.roleFilter = page.getByLabel(/filter by role/i);
    this.departmentFilter = page.getByLabel(/filter by department/i);
    this.statusFilter = page.getByLabel(/filter by status/i);
  }

  /**
   * Navigate to user management page
   */
  async goto() {
    await super.goto('/users');
  }

  /**
   * Invite a single user
   */
  async inviteUser(userData: UserInvitationData) {
    await this.inviteUserButton.click();
    await expect(this.userInvitationDialog).toBeVisible();
    
    await this.emailField.fill(userData.email);
    await this.fullNameField.fill(userData.fullName);
    
    // Select role
    await this.roleSelect.click();
    await this.page.getByRole('option', { name: userData.role }).click();
    
    // Fill optional fields
    if (userData.department) {
      await this.departmentField.fill(userData.department);
    }
    
    if (userData.jobTitle) {
      await this.jobTitleField.fill(userData.jobTitle);
    }
    
    await this.sendInvitationButton.click();
    await expect(this.userInvitationDialog).not.toBeVisible();
  }

  /**
   * Bulk invite multiple users
   */
  async bulkInviteUsers(users: UserInvitationData[]) {
    await this.bulkInviteButton.click();
    await expect(this.bulkInvitationDialog).toBeVisible();
    
    // Format emails for bulk input
    const emailsWithRoles = users.map(user => 
      `${user.email},${user.fullName},${user.role}`
    ).join('\n');
    
    await this.bulkEmailTextarea.fill(emailsWithRoles);
    
    await this.processBulkButton.click();
    await expect(this.bulkInvitationDialog).not.toBeVisible();
  }

  /**
   * Search for users
   */
  async searchUsers(searchTerm: string) {
    await this.searchField.fill(searchTerm);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Filter users by role
   */
  async filterByRole(role: string) {
    await this.roleFilter.click();
    await this.page.getByRole('option', { name: role }).click();
  }

  /**
   * Filter users by status
   */
  async filterByStatus(status: 'Active' | 'Pending' | 'Inactive') {
    await this.statusFilter.click();
    await this.page.getByRole('option', { name: status }).click();
  }

  /**
   * Switch to pending invitations tab
   */
  async viewPendingInvitations() {
    await this.pendingInvitationsTab.click();
  }

  /**
   * Switch to active users tab
   */
  async viewActiveUsers() {
    await this.activeUsersTab.click();
  }

  /**
   * Switch to analytics tab
   */
  async viewAnalytics() {
    await this.analyticsTab.click();
  }

  /**
   * Revoke a pending invitation
   */
  async revokeInvitation(email: string) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByRole('button', { name: /revoke/i }).click();
  }

  /**
   * Resend an invitation
   */
  async resendInvitation(email: string) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByRole('button', { name: /resend/i }).click();
  }

  /**
   * Edit user details
   */
  async editUser(email: string, updates: Partial<UserInvitationData>) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByRole('button', { name: /edit/i }).click();
    
    const editDialog = this.page.locator('[role="dialog"][aria-labelledby*="edit"]');
    await expect(editDialog).toBeVisible();
    
    if (updates.fullName) {
      await this.fullNameField.fill(updates.fullName);
    }
    
    if (updates.role) {
      await this.roleSelect.click();
      await this.page.getByRole('option', { name: updates.role }).click();
    }
    
    if (updates.department) {
      await this.departmentField.fill(updates.department);
    }
    
    if (updates.jobTitle) {
      await this.jobTitleField.fill(updates.jobTitle);
    }
    
    await this.saveButton.click();
    await expect(editDialog).not.toBeVisible();
  }

  /**
   * Deactivate a user
   */
  async deactivateUser(email: string) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByRole('button', { name: /deactivate/i }).click();
    await this.confirmAction();
  }

  /**
   * Activate a user
   */
  async activateUser(email: string) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByRole('button', { name: /activate/i }).click();
    await this.confirmAction();
  }

  /**
   * Change user role
   */
  async changeUserRole(email: string, newRole: string) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByTestId('role-select').click();
    await this.page.getByRole('option', { name: newRole }).click();
    await this.confirmAction();
  }

  /**
   * Verify user exists in list
   */
  async verifyUserExists(email: string) {
    await expect(this.usersList.getByText(email)).toBeVisible();
  }

  /**
   * Verify user does not exist in list
   */
  async verifyUserNotExists(email: string) {
    await expect(this.usersList.getByText(email)).not.toBeVisible();
  }

  /**
   * Get user status
   */
  async getUserStatus(email: string): Promise<string> {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    return await userRow.getByTestId('user-status').textContent() || '';
  }

  /**
   * Get user role
   */
  async getUserRole(email: string): Promise<string> {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    return await userRow.getByTestId('user-role').textContent() || '';
  }

  /**
   * Get total user count
   */
  async getTotalUserCount(): Promise<number> {
    return await this.userRows.count();
  }

  /**
   * Export user list
   */
  async exportUsers(format: 'csv' | 'excel' | 'pdf') {
    await this.page.getByRole('button', { name: /export/i }).click();
    await this.page.getByRole('option', { name: format.toUpperCase() }).click();
    
    // Wait for download
    const downloadPromise = this.page.waitForEvent('download');
    await this.page.getByRole('button', { name: /download/i }).click();
    return await downloadPromise;
  }

  /**
   * Verify invitation analytics
   */
  async verifyAnalytics(expectedMetrics: {
    totalSent?: number;
    pending?: number;
    acceptanceRate?: string;
  }) {
    await this.viewAnalytics();
    
    if (expectedMetrics.totalSent !== undefined) {
      await expect(this.totalInvitationsSent).toContainText(expectedMetrics.totalSent.toString());
    }
    
    if (expectedMetrics.pending !== undefined) {
      await expect(this.pendingInvitations).toContainText(expectedMetrics.pending.toString());
    }
    
    if (expectedMetrics.acceptanceRate) {
      await expect(this.acceptanceRate).toContainText(expectedMetrics.acceptanceRate);
    }
  }

  /**
   * Set user permissions
   */
  async setUserPermissions(email: string, permissions: string[]) {
    const userRow = this.usersList.locator(`tr:has-text("${email}")`);
    await userRow.getByRole('button', { name: /permissions/i }).click();
    
    const permissionsDialog = this.page.locator('[role="dialog"][aria-labelledby*="permissions"]');
    await expect(permissionsDialog).toBeVisible();
    
    // Clear existing permissions
    await this.page.getByRole('button', { name: /clear all/i }).click();
    
    // Set new permissions
    for (const permission of permissions) {
      await this.page.getByLabel(permission).check();
    }
    
    await this.saveButton.click();
    await expect(permissionsDialog).not.toBeVisible();
  }
}