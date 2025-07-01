import { test, expect } from '@playwright/test';
import { login } from '../e2e/test-utils';

test.describe('Dashboard Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should load overview dashboard within performance budget', async ({ page }) => {
    // Start measuring
    const startTime = Date.now();
    
    // Navigate to dashboard
    const response = await page.goto('/dashboard', { waitUntil: 'networkidle' });
    
    // Measure time to interactive
    await page.waitForLoadState('domcontentloaded');
    const domContentLoadedTime = Date.now() - startTime;
    
    // Wait for main content to be visible
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    await expect(page.locator('text=Total Assets')).toBeVisible();
    
    const timeToInteractive = Date.now() - startTime;
    
    // Performance assertions
    expect(response?.status()).toBe(200);
    expect(domContentLoadedTime).toBeLessThan(3000); // DOM should load within 3s
    expect(timeToInteractive).toBeLessThan(5000); // Should be interactive within 5s
    
    // Check Core Web Vitals
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        let fcp = 0;
        let lcp = 0;
        let cls = 0;
        let fid = 0;
        
        // First Contentful Paint
        const fcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              fcp = entry.startTime;
            }
          });
        });
        fcpObserver.observe({ entryTypes: ['paint'] });
        
        // Largest Contentful Paint
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            lcp = entry.startTime;
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Cumulative Layout Shift
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              cls += entry.value;
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        
        // Wait a bit to collect metrics
        setTimeout(() => {
          resolve({ fcp, lcp, cls, fid });
        }, 2000);
      });
    });
    
    // Core Web Vitals thresholds
    expect(metrics.fcp).toBeLessThan(1800); // FCP < 1.8s is good
    expect(metrics.lcp).toBeLessThan(2500); // LCP < 2.5s is good
    expect(metrics.cls).toBeLessThan(0.1); // CLS < 0.1 is good
  });

  test('should efficiently load large datasets', async ({ page }) => {
    // Navigate to dashboard with query param for large dataset
    await page.goto('/dashboard?test=large-dataset');
    
    // Measure API response times
    const apiResponses: number[] = [];
    
    page.on('response', (response) => {
      if (response.url().includes('/api/dashboard')) {
        apiResponses.push(response.timing().responseEnd);
      }
    });
    
    // Wait for dashboard to load
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Check that pagination or virtualization is used for large lists
    const activityItems = page.locator('[data-testid="activity-item"]');
    const count = await activityItems.count();
    
    // Should not render more than 50 items at once
    expect(count).toBeLessThanOrEqual(50);
    
    // Check API response times
    apiResponses.forEach((responseTime) => {
      expect(responseTime).toBeLessThan(1000); // Each API call < 1s
    });
  });

  test('should cache and reuse data efficiently', async ({ page }) => {
    // First load
    await page.goto('/dashboard');
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Navigate away and back
    await page.goto('/assets');
    await expect(page.locator('text=Assets')).toBeVisible();
    
    // Measure second load time
    const startTime = Date.now();
    await page.goto('/dashboard');
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    const secondLoadTime = Date.now() - startTime;
    
    // Second load should be faster due to caching
    expect(secondLoadTime).toBeLessThan(2000);
    
    // Check if data is served from cache
    const cachedDataUsed = await page.evaluate(() => {
      // Check if React Query or similar is caching
      return window.performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.includes('/api/dashboard'))
        .some((entry: any) => entry.transferSize === 0);
    });
    
    expect(cachedDataUsed).toBe(true);
  });

  test('should handle concurrent data loading efficiently', async ({ page }) => {
    const apiCalls: Promise<any>[] = [];
    
    // Intercept API calls
    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        apiCalls.push(
          request.response().then((response) => ({
            url: request.url(),
            status: response?.status(),
            timing: response?.timing(),
          }))
        );
      }
    });
    
    // Load dashboard
    await page.goto('/dashboard');
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Wait for all API calls to complete
    const responses = await Promise.all(apiCalls);
    
    // Check that multiple APIs are called concurrently
    const timings = responses.map((r) => r.timing?.requestTime || 0);
    const minTime = Math.min(...timings);
    const maxTime = Math.max(...timings);
    
    // Requests should start within 100ms of each other (concurrent)
    expect(maxTime - minTime).toBeLessThan(100);
    
    // All requests should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });

  test('should optimize chart rendering performance', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Wait for charts to render
    await page.waitForSelector('canvas', { timeout: 5000 });
    
    // Measure chart rendering performance
    const chartPerformance = await page.evaluate(() => {
      const charts = document.querySelectorAll('canvas');
      const measurements: any[] = [];
      
      charts.forEach((canvas, index) => {
        // Get chart instance (Chart.js stores it on the canvas)
        const chart = (canvas as any).chart;
        if (chart) {
          measurements.push({
            index,
            datasets: chart.data.datasets.length,
            dataPoints: chart.data.datasets.reduce(
              (sum: number, dataset: any) => sum + dataset.data.length,
              0
            ),
          });
        }
      });
      
      return measurements;
    });
    
    // Charts should render with reasonable data sizes
    chartPerformance.forEach((chart) => {
      expect(chart.dataPoints).toBeLessThan(1000); // Not too many points
      expect(chart.datasets).toBeLessThan(10); // Not too many datasets
    });
  });

  test('should lazy load non-critical components', async ({ page }) => {
    // Monitor network requests
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('.js') || request.url().includes('.css')) {
        requests.push(request.url());
      }
    });
    
    // Load dashboard
    await page.goto('/dashboard');
    
    // Initial bundle requests
    const initialRequests = requests.length;
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    
    // Check if additional components were loaded
    const afterScrollRequests = requests.length;
    
    // Some components should be lazy loaded
    expect(afterScrollRequests).toBeGreaterThan(initialRequests);
  });

  test('should handle slow network gracefully', async ({ page }) => {
    // Simulate slow 3G
    await page.route('**/*', (route) => {
      setTimeout(() => route.continue(), 500); // Add 500ms delay
    });
    
    const startTime = Date.now();
    await page.goto('/dashboard');
    
    // Should show loading states
    await expect(page.locator('.MuiSkeleton-root')).toBeVisible();
    
    // Should eventually load
    await expect(page.locator('text=Overview Dashboard')).toBeVisible({ timeout: 15000 });
    
    const loadTime = Date.now() - startTime;
    
    // Even on slow network, should load within 15s
    expect(loadTime).toBeLessThan(15000);
  });

  test('should optimize memory usage', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Navigate through different dashboard views
    await page.click('text=Asset View');
    await expect(page.locator('text=Asset Dashboard')).toBeVisible();
    
    await page.click('text=Calendar View');
    await expect(page.locator('text=Calendar Dashboard')).toBeVisible();
    
    await page.click('text=Task View');
    await expect(page.locator('text=Task Dashboard')).toBeVisible();
    
    // Go back to overview
    await page.click('text=Overview');
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Check memory after navigation
    const finalMemory = await page.evaluate(() => {
      if ('memory' in performance) {
        return (performance as any).memory.usedJSHeapSize;
      }
      return 0;
    });
    
    // Memory increase should be reasonable (not more than 50MB)
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
    expect(memoryIncrease).toBeLessThan(50);
  });

  test('should optimize bundle size', async ({ page }) => {
    const resources: { url: string; size: number }[] = [];
    
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('.js') || url.includes('.css')) {
        const headers = response.headers();
        const size = parseInt(headers['content-length'] || '0');
        resources.push({ url, size });
      }
    });
    
    await page.goto('/dashboard');
    await expect(page.locator('text=Overview Dashboard')).toBeVisible();
    
    // Calculate total bundle size
    const totalSize = resources.reduce((sum, r) => sum + r.size, 0);
    const totalSizeMB = totalSize / 1024 / 1024;
    
    // Total bundle size should be reasonable
    expect(totalSizeMB).toBeLessThan(5); // Less than 5MB total
    
    // Check for code splitting - should have multiple chunks
    const jsFiles = resources.filter((r) => r.url.includes('.js'));
    expect(jsFiles.length).toBeGreaterThan(5); // Should have multiple chunks
    
    // No single chunk should be too large
    jsFiles.forEach((file) => {
      const sizeMB = file.size / 1024 / 1024;
      expect(sizeMB).toBeLessThan(1); // Each chunk < 1MB
    });
  });
});