# Performance Monitoring Setup Guide

## Overview
This guide provides a comprehensive performance monitoring setup for the Asset Manager application, covering both frontend and backend monitoring, metrics collection, and optimization strategies.

## Table of Contents
1. [Backend Performance Monitoring](#backend-performance-monitoring)
2. [Frontend Performance Monitoring](#frontend-performance-monitoring)
3. [Database Performance](#database-performance)
4. [Real-time Monitoring Dashboard](#real-time-monitoring-dashboard)
5. [Performance Optimization Strategies](#performance-optimization-strategies)

## Backend Performance Monitoring

### 1. Express Performance Middleware

```typescript
// backend/src/middleware/performance.ts
import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { logger } from '@/utils/logger';
import { Counter, Histogram, register } from 'prom-client';

// Prometheus metrics
const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestTotal);

export const performanceMiddleware = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = performance.now();
    
    // Store request start time
    req.startTime = start;
    
    // Capture the original end function
    const originalEnd = res.end;
    
    // Override the end function
    res.end = function(...args: any[]) {
      const duration = (performance.now() - start) / 1000; // Convert to seconds
      const route = req.route?.path || req.path;
      
      // Log slow requests
      if (duration > 1) {
        logger.warn('Slow request detected', {
          method: req.method,
          url: req.originalUrl,
          duration: duration.toFixed(3),
          statusCode: res.statusCode,
        });
      }
      
      // Update Prometheus metrics
      httpRequestDuration
        .labels(req.method, route, res.statusCode.toString())
        .observe(duration);
      
      httpRequestTotal
        .labels(req.method, route, res.statusCode.toString())
        .inc();
      
      // Call the original end function
      return originalEnd.apply(res, args);
    };
    
    next();
  };
};

// Memory usage monitoring
export const memoryMonitoring = () => {
  setInterval(() => {
    const usage = process.memoryUsage();
    
    logger.info('Memory usage', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    });
    
    // Alert if memory usage is high
    if (usage.heapUsed / usage.heapTotal > 0.9) {
      logger.error('High memory usage detected', {
        percentage: Math.round((usage.heapUsed / usage.heapTotal) * 100),
      });
    }
  }, 60000); // Check every minute
};
```

### 2. Database Query Performance

```typescript
// backend/src/lib/prisma-performance.ts
import { PrismaClient } from '@prisma/client';
import { logger } from '@/utils/logger';

export function createPrismaClient() {
  const prisma = new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
  });

  // Log slow queries
  prisma.$on('query', (e) => {
    if (e.duration > 1000) { // Queries taking more than 1 second
      logger.warn('Slow database query', {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
        target: e.target,
      });
    }
  });

  // Track query statistics
  const queryStats = new Map<string, { count: number; totalTime: number }>();
  
  prisma.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const duration = Date.now() - start;
    
    const key = `${params.model}.${params.action}`;
    const stats = queryStats.get(key) || { count: 0, totalTime: 0 };
    stats.count++;
    stats.totalTime += duration;
    queryStats.set(key, stats);
    
    return result;
  });
  
  // Report query statistics every 5 minutes
  setInterval(() => {
    const report = Array.from(queryStats.entries()).map(([key, stats]) => ({
      operation: key,
      count: stats.count,
      avgTime: Math.round(stats.totalTime / stats.count),
      totalTime: stats.totalTime,
    }));
    
    logger.info('Database query statistics', { queries: report });
    queryStats.clear();
  }, 300000);
  
  return prisma;
}
```

### 3. API Endpoint Monitoring

```typescript
// backend/src/monitoring/api-monitor.ts
import { Router } from 'express';
import { register } from 'prom-client';
import os from 'os';

export const monitoringRouter = Router();

// Prometheus metrics endpoint
monitoringRouter.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  const metrics = await register.metrics();
  res.send(metrics);
});

// Health check endpoint
monitoringRouter.get('/health', (req, res) => {
  const healthcheck = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    status: 'OK',
    memory: process.memoryUsage(),
    cpu: os.loadavg(),
  };
  
  res.json(healthcheck);
});

// Detailed system info
monitoringRouter.get('/info', async (req, res) => {
  const systemInfo = {
    node: process.version,
    platform: os.platform(),
    architecture: os.arch(),
    cpus: os.cpus().length,
    totalMemory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
    freeMemory: `${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB`,
    uptime: `${Math.round(os.uptime() / 60 / 60)} hours`,
    loadAverage: os.loadavg(),
    // Add database connection status
    database: await checkDatabaseConnection(),
    // Add Redis connection status
    redis: await checkRedisConnection(),
  };
  
  res.json(systemInfo);
});
```

## Frontend Performance Monitoring

### 1. React Performance Profiler

```typescript
// frontend/src/components/performance/PerformanceProfiler.tsx
import React, { Profiler, ProfilerOnRenderCallback } from 'react';
import { logger } from '@/utils/logger';

const onRenderCallback: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
  interactions
) => {
  // Log render performance
  if (actualDuration > 16) { // More than one frame (60fps)
    logger.warn('Slow component render', {
      componentId: id,
      phase,
      actualDuration: actualDuration.toFixed(2),
      baseDuration: baseDuration.toFixed(2),
    });
  }
  
  // Send to analytics
  if (window.analytics) {
    window.analytics.track('Component Render Performance', {
      componentId: id,
      phase,
      duration: actualDuration,
    });
  }
};

export const PerformanceProfiler: React.FC<{
  id: string;
  children: React.ReactNode;
}> = ({ id, children }) => {
  return (
    <Profiler id={id} onRender={onRenderCallback}>
      {children}
    </Profiler>
  );
};

// Usage example
export const AssetListPage = () => {
  return (
    <PerformanceProfiler id="AssetList">
      <AssetTable />
    </PerformanceProfiler>
  );
};
```

### 2. Web Vitals Monitoring

```typescript
// frontend/src/utils/web-vitals.ts
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

interface Metric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
}

const vitalsThresholds = {
  CLS: { good: 0.1, poor: 0.25 },
  FID: { good: 100, poor: 300 },
  FCP: { good: 1800, poor: 3000 },
  LCP: { good: 2500, poor: 4000 },
  TTFB: { good: 800, poor: 1800 },
};

function sendToAnalytics(metric: Metric) {
  // Send to your analytics service
  if (window.gtag) {
    window.gtag('event', metric.name, {
      value: Math.round(metric.value),
      metric_rating: metric.rating,
      non_interaction: true,
    });
  }
  
  // Log poor performance
  if (metric.rating === 'poor') {
    console.warn(`Poor ${metric.name} performance:`, metric.value);
  }
}

export function initWebVitals() {
  getCLS(sendToAnalytics);
  getFID(sendToAnalytics);
  getFCP(sendToAnalytics);
  getLCP(sendToAnalytics);
  getTTFB(sendToAnalytics);
}

// Initialize in your app entry point
initWebVitals();
```

### 3. Bundle Size Monitoring

```javascript
// frontend/next.config.js
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const SpeedMeasurePlugin = require('speed-measure-webpack-plugin');

module.exports = {
  webpack: (config, { isServer, dev }) => {
    // Only analyze client-side bundles in production
    if (!isServer && !dev) {
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: '../bundle-report.html',
          openAnalyzer: false,
        })
      );
    }
    
    // Measure build performance
    if (process.env.MEASURE) {
      const smp = new SpeedMeasurePlugin();
      return smp.wrap(config);
    }
    
    return config;
  },
  
  // Enable production profiling
  productionBrowserSourceMaps: true,
  
  // Optimize images
  images: {
    domains: ['your-cdn.com'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96],
  },
};
```

## Database Performance

### 1. Query Optimization

```typescript
// backend/src/services/performance-optimized.service.ts
export class OptimizedAssetService {
  // Use select to limit fields
  async getAssetList(organizationId: string, page: number, pageSize: number) {
    return this.prisma.asset.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        location: {
          select: {
            id: true,
            name: true,
            path: true,
          },
        },
        updatedAt: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { updatedAt: 'desc' },
    });
  }
  
  // Use database indexes
  async searchAssets(query: string, organizationId: string) {
    // Ensure you have indexes on frequently searched fields
    // CREATE INDEX idx_asset_search ON assets(organization_id, name, serial_number);
    
    return this.prisma.$queryRaw`
      SELECT id, name, serial_number, category
      FROM assets
      WHERE organization_id = ${organizationId}
        AND (
          name ILIKE ${`%${query}%`}
          OR serial_number ILIKE ${`%${query}%`}
        )
      LIMIT 20
    `;
  }
  
  // Batch operations for better performance
  async bulkUpdateAssetStatus(assetIds: string[], status: string) {
    return this.prisma.$transaction([
      // Update in batches to avoid locking
      ...chunk(assetIds, 100).map(batch =>
        this.prisma.asset.updateMany({
          where: {
            id: { in: batch },
          },
          data: { status },
        })
      ),
    ]);
  }
}
```

### 2. Database Connection Pooling

```typescript
// backend/src/config/database.ts
export const databaseConfig = {
  // Connection pool settings
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
  },
  
  // Query timeout
  statement_timeout: 30000, // 30 seconds
  
  // Enable query logging in development
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
};
```

## Real-time Monitoring Dashboard

### 1. Grafana Dashboard Configuration

```json
{
  "dashboard": {
    "title": "Asset Manager Performance",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Database Query Time",
        "targets": [
          {
            "expr": "avg(database_query_duration_ms) by (operation)",
            "legendFormat": "{{operation}}"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "process_resident_memory_bytes / 1024 / 1024",
            "legendFormat": "RSS Memory (MB)"
          }
        ]
      }
    ]
  }
}
```

### 2. Real-time Performance Alerts

```typescript
// backend/src/monitoring/alerts.ts
export class PerformanceAlerts {
  private alertThresholds = {
    responseTime: 2000, // 2 seconds
    errorRate: 0.05, // 5%
    memoryUsage: 0.9, // 90%
    cpuUsage: 0.8, // 80%
  };
  
  checkPerformance() {
    // Check response time
    if (this.avgResponseTime > this.alertThresholds.responseTime) {
      this.sendAlert('High response time detected', {
        current: this.avgResponseTime,
        threshold: this.alertThresholds.responseTime,
      });
    }
    
    // Check error rate
    if (this.errorRate > this.alertThresholds.errorRate) {
      this.sendAlert('High error rate detected', {
        current: this.errorRate,
        threshold: this.alertThresholds.errorRate,
      });
    }
  }
  
  private sendAlert(message: string, data: any) {
    // Send to monitoring service
    logger.error(message, data);
    
    // Send to Slack/Discord/Email
    if (process.env.SLACK_WEBHOOK) {
      fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        body: JSON.stringify({
          text: `🚨 Performance Alert: ${message}`,
          attachments: [{
            fields: Object.entries(data).map(([key, value]) => ({
              title: key,
              value: String(value),
              short: true,
            })),
          }],
        }),
      });
    }
  }
}
```

## Performance Optimization Strategies

### 1. Caching Strategy

```typescript
// backend/src/lib/cache.ts
import Redis from 'ioredis';
import { logger } from '@/utils/logger';

export class CacheManager {
  private redis: Redis;
  private defaultTTL = 300; // 5 minutes
  
  constructor() {
    this.redis = new Redis({
      enableReadyCheck: true,
      enableOfflineQueue: false,
    });
  }
  
  async get<T>(key: string): Promise<T | null> {
    const start = Date.now();
    const value = await this.redis.get(key);
    
    logger.debug('Cache access', {
      key,
      hit: !!value,
      duration: Date.now() - start,
    });
    
    return value ? JSON.parse(value) : null;
  }
  
  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.redis.setex(
      key,
      ttl || this.defaultTTL,
      JSON.stringify(value)
    );
  }
  
  // Cache invalidation patterns
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}

// Usage in services
export class CachedAssetService {
  async getAsset(id: string): Promise<Asset> {
    const cacheKey = `asset:${id}`;
    
    // Try cache first
    const cached = await this.cache.get<Asset>(cacheKey);
    if (cached) return cached;
    
    // Fetch from database
    const asset = await this.prisma.asset.findUnique({
      where: { id },
      include: { location: true, template: true },
    });
    
    // Cache the result
    if (asset) {
      await this.cache.set(cacheKey, asset, 600); // 10 minutes
    }
    
    return asset;
  }
}
```

### 2. Frontend Optimization

```typescript
// frontend/src/hooks/use-optimized-assets.ts
import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';

export function useOptimizedAssets() {
  // Use infinite query for pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['assets'],
    queryFn: ({ pageParam = 1 }) => assetApi.list({ page: pageParam }),
    getNextPageParam: (lastPage) => {
      return lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  // Flatten pages
  const assets = useMemo(
    () => data?.pages.flatMap(page => page.data) || [],
    [data]
  );
  
  // Use virtualization for large lists
  const virtualizer = useVirtualizer({
    count: assets.length,
    getScrollElement: () => document.getElementById('asset-list'),
    estimateSize: () => 80, // Estimated row height
    overscan: 5,
  });
  
  return {
    assets,
    virtualizer,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  };
}
```

### 3. Image Optimization

```typescript
// frontend/src/components/OptimizedImage.tsx
import Image from 'next/image';
import { useState } from 'react';

export const OptimizedImage: React.FC<{
  src: string;
  alt: string;
  width: number;
  height: number;
}> = ({ src, alt, width, height }) => {
  const [isLoading, setIsLoading] = useState(true);
  
  return (
    <div style={{ position: 'relative', width, height }}>
      {isLoading && (
        <div className="image-skeleton" />
      )}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        quality={85}
        onLoadingComplete={() => setIsLoading(false)}
        placeholder="blur"
        blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD..."
      />
    </div>
  );
};
```

## Performance Checklist

### Backend
- [ ] Enable response compression (gzip/brotli)
- [ ] Implement request rate limiting
- [ ] Use database connection pooling
- [ ] Add database indexes on frequently queried fields
- [ ] Implement caching for expensive operations
- [ ] Use pagination for list endpoints
- [ ] Optimize N+1 queries with proper includes
- [ ] Enable HTTP/2
- [ ] Use CDN for static assets

### Frontend
- [ ] Enable code splitting
- [ ] Implement lazy loading for routes
- [ ] Optimize bundle size (tree shaking)
- [ ] Use React.memo for expensive components
- [ ] Implement virtual scrolling for long lists
- [ ] Optimize images (WebP, lazy loading)
- [ ] Enable service worker for offline support
- [ ] Minimize main thread work
- [ ] Reduce JavaScript execution time

### Monitoring
- [ ] Set up Prometheus + Grafana
- [ ] Configure alerting rules
- [ ] Track Web Vitals
- [ ] Monitor error rates
- [ ] Set up distributed tracing
- [ ] Configure log aggregation
- [ ] Create performance budgets
- [ ] Set up synthetic monitoring
- [ ] Configure real user monitoring (RUM)

## Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| First Contentful Paint | < 1.8s | < 3s |
| Largest Contentful Paint | < 2.5s | < 4s |
| Time to Interactive | < 3.8s | < 7.3s |
| API Response Time (p95) | < 200ms | < 1s |
| Database Query Time (avg) | < 50ms | < 200ms |
| Bundle Size (gzipped) | < 200KB | < 500KB |
| Memory Usage | < 512MB | < 1GB |
| Error Rate | < 0.1% | < 1% |

Remember: Performance is a feature! Monitor continuously and optimize iteratively.