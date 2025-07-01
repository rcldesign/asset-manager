import { test, expect, Page } from '@playwright/test';
import { login } from './test-utils';

test.describe('Dashboard Functionality', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test('should load overview dashboard with all components', async () => {
    await page.goto('/dashboard');
    
    // Check main dashboard sections
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Check stat cards
    await expect(page.locator('text=Total Assets')).toBeVisible();
    await expect(page.locator('text=Active Tasks')).toBeVisible();
    await expect(page.locator('text=Maintenance Schedules')).toBeVisible();
    await expect(page.locator('text=Upcoming Tasks')).toBeVisible();
    
    // Check quick actions
    await expect(page.locator('text=Quick Actions')).toBeVisible();
    await expect(page.locator('button:has-text("New Asset")')).toBeVisible();
    await expect(page.locator('button:has-text("New Task")')).toBeVisible();
    await expect(page.locator('button:has-text("New Schedule")')).toBeVisible();
    await expect(page.locator('button:has-text("Invite User")')).toBeVisible();
    
    // Check activity feed
    await expect(page.locator('text=Recent Activity')).toBeVisible();
    
    // Check mini calendar
    await expect(page.locator('text=Upcoming Schedule')).toBeVisible();
  });

  test('should navigate between dashboard views', async () => {
    await page.goto('/dashboard');
    
    // Navigate to Asset-Centric view
    await page.click('text=Asset View');
    await expect(page.locator('text=Asset Dashboard')).toBeVisible();
    await expect(page.locator('text=Asset Distribution')).toBeVisible();
    
    // Navigate to Calendar-Centric view
    await page.click('text=Calendar View');
    await expect(page.locator('text=Calendar Dashboard')).toBeVisible();
    await expect(page.locator('.fc-view-harness')).toBeVisible(); // FullCalendar
    
    // Navigate to Task-Centric view
    await page.click('text=Task View');
    await expect(page.locator('text=Task Dashboard')).toBeVisible();
    await expect(page.locator('text=Task Board')).toBeVisible();
  });

  test('should use quick actions to navigate', async () => {
    await page.goto('/dashboard');
    
    // Test New Asset quick action
    await page.click('button:has-text("New Asset")');
    await expect(page).toHaveURL(/.*\/assets\/new/);
    await expect(page.locator('text=Create New Asset')).toBeVisible();
    
    // Go back to dashboard
    await page.goto('/dashboard');
    
    // Test New Task quick action
    await page.click('button:has-text("New Task")');
    await expect(page).toHaveURL(/.*\/tasks\/new/);
    await expect(page.locator('text=Create New Task')).toBeVisible();
    
    // Go back to dashboard
    await page.goto('/dashboard');
    
    // Test New Schedule quick action
    await page.click('button:has-text("New Schedule")');
    await expect(page).toHaveURL(/.*\/schedules/);
    await expect(page.locator('text=Maintenance Schedules')).toBeVisible();
  });

  test('should display charts and visualizations', async () => {
    await page.goto('/dashboard');
    
    // Check for chart containers
    const chartContainers = page.locator('canvas');
    await expect(chartContainers).toHaveCount(3); // Assuming 3 charts on overview
    
    // Navigate to Asset view for more charts
    await page.click('text=Asset View');
    
    // Check for asset-specific charts
    await expect(page.locator('text=Asset Age Distribution')).toBeVisible();
    await expect(page.locator('text=Assets by Category')).toBeVisible();
    await expect(page.locator('text=Warranty Status')).toBeVisible();
  });

  test('should show real-time updates in activity feed', async () => {
    await page.goto('/dashboard');
    
    // Check activity feed exists
    const activityFeed = page.locator('[data-testid="activity-feed"]');
    await expect(activityFeed).toBeVisible();
    
    // Create a new asset to generate activity
    await page.click('button:has-text("New Asset")');
    await page.fill('input[name="name"]', 'Test Dashboard Asset');
    await page.fill('input[name="serialNumber"]', 'TEST-DASH-001');
    await page.selectOption('select[name="category"]', 'IT_EQUIPMENT');
    await page.click('button[type="submit"]');
    
    // Go back to dashboard
    await page.goto('/dashboard');
    
    // Check if new activity appears
    await expect(page.locator('text=created asset "Test Dashboard Asset"')).toBeVisible({ timeout: 10000 });
  });

  test('should filter and interact with calendar view', async () => {
    await page.goto('/dashboard');
    await page.click('text=Calendar View');
    
    // Wait for calendar to load
    await expect(page.locator('.fc-view-harness')).toBeVisible();
    
    // Test calendar navigation
    await page.click('.fc-next-button');
    await page.click('.fc-prev-button');
    await page.click('.fc-today-button');
    
    // Test view switching
    await page.click('.fc-dayGridMonth-button');
    await expect(page.locator('.fc-daygrid')).toBeVisible();
    
    await page.click('.fc-timeGridWeek-button');
    await expect(page.locator('.fc-timegrid')).toBeVisible();
    
    // Test task filters
    await page.click('text=All Tasks');
    await page.click('text=Maintenance Only');
    await page.click('text=My Tasks');
  });

  test('should drag and drop tasks in kanban board', async () => {
    await page.goto('/dashboard');
    await page.click('text=Task View');
    
    // Wait for kanban board
    await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible();
    
    // Find a task in TODO column
    const todoTask = page.locator('[data-testid="kanban-column-TODO"] [data-testid="task-card"]').first();
    const inProgressColumn = page.locator('[data-testid="kanban-column-IN_PROGRESS"]');
    
    if (await todoTask.isVisible()) {
      // Drag task to IN_PROGRESS
      await todoTask.dragTo(inProgressColumn);
      
      // Verify task moved
      await expect(inProgressColumn.locator('[data-testid="task-card"]')).toContainText(
        await todoTask.textContent() || ''
      );
    }
  });

  test('should export dashboard data', async () => {
    await page.goto('/dashboard');
    
    // Look for export button
    const exportButton = page.locator('button:has-text("Export")');
    await expect(exportButton).toBeVisible();
    
    // Click export
    await exportButton.click();
    
    // Check export options
    await expect(page.locator('text=Export as PDF')).toBeVisible();
    await expect(page.locator('text=Export as Excel')).toBeVisible();
    await expect(page.locator('text=Export as CSV')).toBeVisible();
    
    // Test PDF export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Export as PDF')
    ]);
    
    // Verify download
    expect(download.suggestedFilename()).toMatch(/dashboard.*\.pdf/i);
  });

  test('should handle dashboard loading states', async () => {
    // Slow down network to see loading states
    await page.route('**/api/dashboard/**', route => {
      setTimeout(() => route.continue(), 1000);
    });
    
    await page.goto('/dashboard');
    
    // Check for loading skeletons
    await expect(page.locator('.MuiSkeleton-root')).toBeVisible();
    
    // Wait for data to load
    await expect(page.locator('.MuiSkeleton-root')).not.toBeVisible({ timeout: 10000 });
    
    // Check data is displayed
    await expect(page.locator('text=Total Assets')).toBeVisible();
  });

  test('should be responsive on mobile viewport', async () => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/dashboard');
    
    // Check mobile layout
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Quick actions should stack vertically
    const quickActions = page.locator('[data-testid="quick-actions"] button');
    const firstAction = await quickActions.first().boundingBox();
    const secondAction = await quickActions.nth(1).boundingBox();
    
    if (firstAction && secondAction) {
      // Buttons should be stacked (different Y positions)
      expect(secondAction.y).toBeGreaterThan(firstAction.y);
    }
    
    // Charts should be full width
    const charts = page.locator('canvas');
    const chartBox = await charts.first().boundingBox();
    if (chartBox) {
      expect(chartBox.width).toBeCloseTo(375 - 32, 50); // Full width minus padding
    }
  });
});