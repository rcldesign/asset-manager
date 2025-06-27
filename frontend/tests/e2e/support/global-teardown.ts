import { chromium, FullConfig } from '@playwright/test';

/**
 * Global teardown for E2E tests
 * Runs once after all tests
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test global teardown...');
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Clean up test database
    console.log('🗄️ Cleaning up test database...');
    const response = await page.request.post('http://localhost:3001/api/test-support/cleanup-db');
    
    if (response.ok()) {
      console.log('✅ Test database cleaned up successfully');
    } else {
      console.warn('⚠️ Failed to clean up test database:', response.status());
    }
    
    // Reset time to current time (in case any tests left it modified)
    console.log('⏰ Resetting server time...');
    await page.request.post('http://localhost:3001/api/test-support/time-reset');
    
    console.log('✅ Global teardown completed');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - teardown failures shouldn't fail the test run
  } finally {
    await browser.close();
  }
}

export default globalTeardown;