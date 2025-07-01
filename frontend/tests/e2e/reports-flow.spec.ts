import { test, expect, Page } from '@playwright/test';
import { login } from './test-utils';

test.describe('Reports Functionality', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await login(page);
  });

  test('should navigate to reports page and see all report types', async () => {
    await page.goto('/reports');
    
    // Check page title
    await expect(page.locator('h1:has-text("Reports")')).toBeVisible();
    
    // Check report categories
    await expect(page.locator('text=Asset Reports')).toBeVisible();
    await expect(page.locator('text=Task Reports')).toBeVisible();
    await expect(page.locator('text=User Reports')).toBeVisible();
    await expect(page.locator('text=Custom Reports')).toBeVisible();
    
    // Check specific report types
    await expect(page.locator('text=Asset Age Analysis')).toBeVisible();
    await expect(page.locator('text=Warranty Status')).toBeVisible();
    await expect(page.locator('text=Maintenance History')).toBeVisible();
    await expect(page.locator('text=Task Completion')).toBeVisible();
    await expect(page.locator('text=Cost Analysis')).toBeVisible();
    await expect(page.locator('text=User Workload')).toBeVisible();
  });

  test('should generate asset age analysis report', async () => {
    await page.goto('/reports');
    
    // Click on Asset Age Analysis
    await page.click('text=Asset Age Analysis');
    
    // Wait for report form
    await expect(page.locator('text=Generate Asset Age Analysis Report')).toBeVisible();
    
    // Set date range
    await page.fill('input[name="startDate"]', '2024-01-01');
    await page.fill('input[name="endDate"]', '2024-12-31');
    
    // Select categories
    await page.click('text=Select Categories');
    await page.click('text=IT Equipment');
    await page.click('text=Furniture');
    
    // Generate report
    await page.click('button:has-text("Generate Report")');
    
    // Wait for report to load
    await expect(page.locator('text=Report Results')).toBeVisible({ timeout: 10000 });
    
    // Check report sections
    await expect(page.locator('text=Summary')).toBeVisible();
    await expect(page.locator('text=Age Distribution')).toBeVisible();
    await expect(page.locator('text=By Category')).toBeVisible();
    await expect(page.locator('text=Depreciation')).toBeVisible();
    
    // Check for charts
    await expect(page.locator('canvas')).toHaveCount(2); // Age distribution and category charts
  });

  test('should export report in different formats', async () => {
    await page.goto('/reports');
    await page.click('text=Asset Age Analysis');
    await page.click('button:has-text("Generate Report")');
    
    // Wait for report
    await expect(page.locator('text=Report Results')).toBeVisible({ timeout: 10000 });
    
    // Test PDF export
    const exportButton = page.locator('button:has-text("Export")');
    await exportButton.click();
    
    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Export as PDF')
    ]);
    
    expect(pdfDownload.suggestedFilename()).toMatch(/asset.*age.*\.pdf/i);
    
    // Test Excel export
    await exportButton.click();
    
    const [excelDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Export as Excel')
    ]);
    
    expect(excelDownload.suggestedFilename()).toMatch(/asset.*age.*\.xlsx/i);
    
    // Test CSV export
    await exportButton.click();
    
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.click('text=Export as CSV')
    ]);
    
    expect(csvDownload.suggestedFilename()).toMatch(/asset.*age.*\.csv/i);
  });

  test('should create and save custom report', async () => {
    await page.goto('/reports');
    
    // Navigate to custom reports
    await page.click('text=Custom Reports');
    await page.click('button:has-text("Create Custom Report")');
    
    // Fill custom report form
    await page.fill('input[name="reportName"]', 'High Value Assets Report');
    await page.fill('textarea[name="description"]', 'Report showing all assets above $10,000');
    
    // Select entity
    await page.selectOption('select[name="entity"]', 'asset');
    
    // Select fields
    await page.click('text=Select Fields');
    await page.click('text=Name');
    await page.click('text=Serial Number');
    await page.click('text=Purchase Price');
    await page.click('text=Current Value');
    await page.click('text=Location');
    await page.keyboard.press('Escape'); // Close dropdown
    
    // Add filter
    await page.click('button:has-text("Add Filter")');
    await page.selectOption('select[name="filterField"]', 'purchasePrice');
    await page.selectOption('select[name="filterOperator"]', 'greater_than');
    await page.fill('input[name="filterValue"]', '10000');
    
    // Save report
    await page.click('button:has-text("Save & Generate")');
    
    // Check saved report appears
    await expect(page.locator('text=High Value Assets Report')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Report saved successfully')).toBeVisible();
  });

  test('should schedule a report for email delivery', async () => {
    await page.goto('/reports');
    
    // Click on a report type
    await page.click('text=Task Completion');
    
    // Generate report first
    await page.click('button:has-text("Generate Report")');
    await expect(page.locator('text=Report Results')).toBeVisible({ timeout: 10000 });
    
    // Click schedule button
    await page.click('button:has-text("Schedule Report")');
    
    // Fill schedule form
    await expect(page.locator('text=Schedule Report Delivery')).toBeVisible();
    
    // Set frequency
    await page.selectOption('select[name="frequency"]', 'weekly');
    
    // Set day
    await page.selectOption('select[name="dayOfWeek"]', 'monday');
    
    // Set time
    await page.fill('input[name="time"]', '09:00');
    
    // Add recipients
    await page.fill('input[name="recipients"]', 'manager@example.com, team@example.com');
    
    // Select format
    await page.click('input[value="pdf"]');
    await page.click('input[value="excel"]');
    
    // Save schedule
    await page.click('button:has-text("Save Schedule")');
    
    // Verify schedule created
    await expect(page.locator('text=Report scheduled successfully')).toBeVisible();
    await expect(page.locator('text=Weekly on Monday at 09:00')).toBeVisible();
  });

  test('should filter report data', async () => {
    await page.goto('/reports');
    
    // Navigate to user workload report
    await page.click('text=User Workload');
    
    // Apply filters
    await page.click('text=Add Filter');
    
    // Filter by department
    await page.selectOption('select[name="filterType"]', 'department');
    await page.selectOption('select[name="department"]', 'maintenance');
    
    // Filter by date range
    await page.click('text=Add Filter');
    await page.selectOption('select[name="filterType"]', 'dateRange');
    await page.fill('input[name="startDate"]', '2024-01-01');
    await page.fill('input[name="endDate"]', '2024-03-31');
    
    // Generate filtered report
    await page.click('button:has-text("Apply Filters")');
    
    // Verify filtered results
    await expect(page.locator('text=Filtered Results')).toBeVisible();
    await expect(page.locator('text=Department: Maintenance')).toBeVisible();
    await expect(page.locator('text=Q1 2024')).toBeVisible();
  });

  test('should compare multiple reports', async () => {
    await page.goto('/reports');
    
    // Enable comparison mode
    await page.click('button:has-text("Compare Reports")');
    
    // Select first report
    await page.click('text=Task Completion');
    await page.selectOption('select[name="period1"]', '2024-Q1');
    await page.click('button:has-text("Add to Comparison")');
    
    // Select second report
    await page.click('text=Task Completion');
    await page.selectOption('select[name="period2"]', '2024-Q2');
    await page.click('button:has-text("Add to Comparison")');
    
    // Generate comparison
    await page.click('button:has-text("Generate Comparison")');
    
    // Check comparison view
    await expect(page.locator('text=Comparison Results')).toBeVisible();
    await expect(page.locator('text=Q1 2024 vs Q2 2024')).toBeVisible();
    
    // Check for comparison metrics
    await expect(page.locator('text=Change')).toBeVisible();
    await expect(page.locator('text=%')).toBeVisible();
  });

  test('should handle report errors gracefully', async () => {
    await page.goto('/reports');
    
    // Try to generate report with invalid parameters
    await page.click('text=Asset Age Analysis');
    
    // Set invalid date range (end before start)
    await page.fill('input[name="startDate"]', '2024-12-31');
    await page.fill('input[name="endDate"]', '2024-01-01');
    
    // Try to generate
    await page.click('button:has-text("Generate Report")');
    
    // Check error message
    await expect(page.locator('text=Invalid date range')).toBeVisible();
    
    // Fix dates and generate successfully
    await page.fill('input[name="startDate"]', '2024-01-01');
    await page.fill('input[name="endDate"]', '2024-12-31');
    await page.click('button:has-text("Generate Report")');
    
    // Should work now
    await expect(page.locator('text=Report Results')).toBeVisible({ timeout: 10000 });
  });

  test('should save report preferences', async () => {
    await page.goto('/reports');
    
    // Go to report settings
    await page.click('button:has-text("Report Settings")');
    
    // Set preferences
    await page.click('text=Default Export Format');
    await page.click('text=Excel');
    
    await page.click('text=Include Charts');
    await page.click('input[name="includeCharts"]');
    
    await page.click('text=Timezone');
    await page.selectOption('select[name="timezone"]', 'America/New_York');
    
    // Save preferences
    await page.click('button:has-text("Save Preferences")');
    
    // Verify saved
    await expect(page.locator('text=Preferences saved')).toBeVisible();
    
    // Generate a report and check defaults
    await page.click('text=Asset Age Analysis');
    await page.click('button:has-text("Generate Report")');
    
    // Check that Excel is default export
    const exportButton = page.locator('button:has-text("Export")').first();
    await expect(exportButton).toContainText('Excel');
  });
});