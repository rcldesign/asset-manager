import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for E2E tests
 * Runs once before all tests
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test global setup...');
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for frontend to be ready
    console.log('⏳ Waiting for frontend server...');
    await page.goto('http://localhost:3000/health', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Wait for backend to be ready
    console.log('⏳ Waiting for backend server...');
    await page.goto('http://localhost:3001/health', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    console.log('✅ Frontend and backend servers are ready');
    
    // Initialize test database
    console.log('🗄️ Initializing test database...');
    const response = await page.request.post('http://localhost:3001/api/test-support/initialize-db');
    
    if (!response.ok()) {
      throw new Error(`Failed to initialize test database: ${response.status()}`);
    }
    
    console.log('✅ Test database initialized');
    
    // Set up test data
    console.log('📊 Setting up baseline test data...');
    await page.request.post('http://localhost:3001/api/test-support/seed-test-data');
    
    console.log('✅ Global setup completed successfully');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;