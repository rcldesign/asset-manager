# Asset Manager - Performance Test Plan

## Overview

This document outlines performance tests for the Asset Manager system, focusing on bulk operations, data handling, and system scalability.

## Test Environment

### Hardware Requirements
- **Application Server**: 4 vCPU, 8GB RAM
- **Database Server**: 4 vCPU, 16GB RAM, SSD storage
- **Test Client**: Modern browser, stable network

### Test Data Volumes
- Small: 1,000 assets, 10 users
- Medium: 10,000 assets, 50 users
- Large: 100,000 assets, 200 users
- X-Large: 500,000 assets, 1,000 users

## Performance Test Suite

### PT-01: Bulk Asset Import

**Objective**: Measure bulk import performance and limits

**Test Cases**:

#### CSV Import - Small Dataset
- **Data**: 1,000 assets CSV file
- **File Size**: ~200KB
- **Expected Time**: < 30 seconds
- **Success Criteria**: All assets imported, no errors

#### CSV Import - Medium Dataset
- **Data**: 10,000 assets CSV file
- **File Size**: ~2MB
- **Expected Time**: < 5 minutes
- **Success Criteria**: 95%+ success rate

#### CSV Import - Large Dataset
- **Data**: 50,000 assets CSV file
- **File Size**: ~10MB
- **Expected Time**: < 30 minutes
- **Success Criteria**: System remains responsive

**Metrics to Capture**:
- Total import time
- Records per second
- Memory usage
- CPU utilization
- Database connection pool
- Error rate

**Test Script**:
```javascript
// Generate test CSV
const generateCSV = (count) => {
  const headers = 'name,category,status,manufacturer,model,serial,location,purchase_date,price';
  const rows = [];
  
  for (let i = 1; i <= count; i++) {
    rows.push([
      `Asset-${i}`,
      'HARDWARE',
      'OPERATIONAL',
      `Manufacturer-${i % 10}`,
      `Model-${i % 20}`,
      `SN-${Date.now()}-${i}`,
      'Main Office',
      '2024-01-01',
      Math.floor(Math.random() * 5000)
    ].join(','));
  }
  
  return headers + '\n' + rows.join('\n');
};
```

### PT-02: Asset List Performance

**Objective**: Measure list view performance with filters

**Test Cases**:

#### Initial Load - No Filters
- **Dataset**: 10,000 assets
- **Expected Time**: < 2 seconds
- **Page Size**: 20 items

#### Filtered Search
- **Dataset**: 100,000 assets
- **Filter**: Category + Status + Search term
- **Expected Time**: < 3 seconds
- **Results**: Variable

#### Pagination Performance
- **Dataset**: 50,000 assets
- **Action**: Navigate pages 1 → 10 → 50 → 100
- **Expected Time**: < 1 second per page

**Metrics**:
- API response time
- Render time
- Time to interactive
- Memory usage
- Database query time

**Load Test Script**:
```javascript
// k6 load test script
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 10 },  // Ramp up
    { duration: '5m', target: 50 },  // Stay at 50 users
    { duration: '2m', target: 100 }, // Peak load
    { duration: '2m', target: 0 },   // Ramp down
  ],
};

export default function() {
  // Test asset list endpoint
  let response = http.get('https://api.example.com/assets?page=1&limit=20');
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 2000ms': (r) => r.timings.duration < 2000,
  });
  
  // Test with filters
  response = http.get('https://api.example.com/assets?category=HARDWARE&status=OPERATIONAL');
  
  check(response, {
    'filtered response < 3000ms': (r) => r.timings.duration < 3000,
  });
}
```

### PT-03: Concurrent User Load

**Objective**: Test system under concurrent user load

**Test Scenarios**:

#### Light Load
- **Users**: 10 concurrent
- **Actions**: Browse, search, view details
- **Duration**: 10 minutes
- **Expected**: No degradation

#### Normal Load
- **Users**: 50 concurrent
- **Actions**: Full CRUD operations
- **Duration**: 30 minutes
- **Expected**: < 5% increase in response time

#### Peak Load
- **Users**: 200 concurrent
- **Actions**: Mixed operations
- **Duration**: 15 minutes
- **Expected**: System stable, < 3s response

#### Stress Test
- **Users**: 500 concurrent
- **Actions**: Heavy operations
- **Duration**: 5 minutes
- **Expected**: Graceful degradation

**User Journey Script**:
```javascript
// Typical user journey
export default function() {
  // Login
  let loginRes = http.post('/api/auth/login', {
    email: 'user@example.com',
    password: 'password'
  });
  
  let token = loginRes.json('token');
  let headers = { 'Authorization': `Bearer ${token}` };
  
  // View asset list
  http.get('/api/assets', { headers });
  sleep(2);
  
  // Search assets
  http.get('/api/assets?search=laptop', { headers });
  sleep(1);
  
  // View asset details
  http.get('/api/assets/asset-123', { headers });
  sleep(3);
  
  // Create task
  http.post('/api/tasks', {
    title: 'Maintenance',
    assetId: 'asset-123'
  }, { headers });
}
```

### PT-04: File Operations

**Objective**: Test file upload/download performance

**Test Cases**:

#### Single File Upload
- **File Size**: 1MB, 10MB, 50MB
- **Expected Time**: < 1s/MB
- **Concurrent**: 1 user

#### Concurrent Uploads
- **Files**: 10 x 5MB
- **Users**: 10 concurrent
- **Expected**: Linear scaling

#### Bulk Download
- **Files**: 100 attachments
- **Total Size**: 500MB
- **Expected**: Bandwidth limited

**Metrics**:
- Upload speed (MB/s)
- Processing time
- Storage I/O
- Network utilization

### PT-05: Report Generation

**Objective**: Test report generation performance

**Test Cases**:

#### Asset Inventory Report
- **Dataset**: 10,000 assets
- **Format**: PDF
- **Expected Time**: < 30 seconds

#### Maintenance History
- **Period**: 1 year
- **Tasks**: 50,000 records
- **Expected Time**: < 1 minute

#### Export All Data
- **Format**: Excel
- **Size**: Full database
- **Expected Time**: < 5 minutes

### PT-06: Database Performance

**Objective**: Test database query performance

**Key Queries to Test**:

```sql
-- Complex asset search with joins
SELECT a.*, l.name as location_name, at.name as template_name
FROM assets a
LEFT JOIN locations l ON a.location_id = l.id
LEFT JOIN asset_templates at ON a.asset_template_id = at.id
WHERE a.organization_id = ?
  AND a.category = ?
  AND a.status = ?
  AND (a.name ILIKE ? OR a.serial_number ILIKE ?)
ORDER BY a.created_at DESC
LIMIT 20 OFFSET 0;

-- Hierarchical location query
WITH RECURSIVE location_tree AS (
  SELECT * FROM locations WHERE id = ?
  UNION ALL
  SELECT l.* FROM locations l
  JOIN location_tree lt ON l.parent_id = lt.id
)
SELECT * FROM location_tree;

-- Task generation for schedules
SELECT s.*, a.name as asset_name
FROM schedules s
JOIN assets a ON s.asset_id = a.id
WHERE s.is_active = true
  AND s.next_run_at <= NOW()
  AND s.organization_id = ?;
```

**Expected Performance**:
- Simple queries: < 50ms
- Complex queries: < 200ms
- Reports: < 5 seconds

### PT-07: Background Job Performance

**Objective**: Test scheduled task generation

**Test Cases**:

#### Task Generation Load
- **Active Schedules**: 1,000
- **Frequency**: Daily check
- **Expected Time**: < 1 minute
- **Tasks Created**: Variable

#### Queue Processing
- **Queue Size**: 10,000 jobs
- **Workers**: 4
- **Expected Rate**: 100 jobs/minute

## Performance Benchmarks

### Response Time Targets

| Operation | Excellent | Good | Acceptable | Unacceptable |
|-----------|-----------|------|------------|--------------|
| Page Load | < 1s | < 2s | < 3s | > 3s |
| API Call | < 200ms | < 500ms | < 1s | > 1s |
| Search | < 500ms | < 1s | < 2s | > 2s |
| File Upload (per MB) | < 500ms | < 1s | < 2s | > 2s |
| Report Generation | < 10s | < 30s | < 60s | > 60s |

### Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent Users | 200 |
| Requests/Second | 1000 |
| Database Connections | 100 |
| Queue Jobs/Minute | 500 |
| Import Records/Second | 100 |

### Resource Utilization

| Resource | Normal | Warning | Critical |
|----------|--------|---------|----------|
| CPU | < 50% | < 80% | > 80% |
| Memory | < 60% | < 85% | > 85% |
| Disk I/O | < 70% | < 90% | > 90% |
| Network | < 60% | < 80% | > 80% |

## Test Execution Plan

### Phase 1: Baseline Testing
1. Single user performance
2. Database query optimization
3. API endpoint timing
4. Establish baselines

### Phase 2: Load Testing
1. Gradual user increase
2. Sustained load tests
3. Peak load simulation
4. Monitor resources

### Phase 3: Stress Testing
1. Beyond peak load
2. Resource exhaustion
3. Recovery testing
4. Failure scenarios

### Phase 4: Endurance Testing
1. 24-hour sustained load
2. Memory leak detection
3. Database growth
4. Log rotation

## Monitoring Setup

### Application Metrics
```javascript
// Prometheus metrics
const promClient = require('prom-client');

// Response time histogram
const httpDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Active users gauge
const activeUsers = new promClient.Gauge({
  name: 'active_users_total',
  help: 'Total number of active users'
});

// Asset count
const assetCount = new promClient.Gauge({
  name: 'assets_total',
  help: 'Total number of assets',
  labelNames: ['organization', 'category']
});
```

### Database Monitoring
```sql
-- Slow query log
SET slow_query_log = 'ON';
SET long_query_time = 1;

-- Connection monitoring
SELECT count(*) FROM pg_stat_activity;

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## Performance Optimization Checklist

### Database
- [ ] Indexes on foreign keys
- [ ] Composite indexes for common queries
- [ ] Partition large tables
- [ ] Vacuum and analyze regularly
- [ ] Connection pooling configured

### Application
- [ ] Response caching enabled
- [ ] Pagination implemented
- [ ] Lazy loading for relations
- [ ] Batch operations for bulk actions
- [ ] Async processing for heavy tasks

### Infrastructure
- [ ] CDN for static assets
- [ ] Load balancer configured
- [ ] Auto-scaling policies
- [ ] Resource monitoring alerts
- [ ] Backup performance impact

## Reporting

### Performance Test Report Template

**Test Summary**
- Date: ___________
- Version: _________
- Environment: _____

**Results Overview**
- [ ] All benchmarks met
- [ ] Issues identified
- [ ] Recommendations made

**Detailed Results**
[Include graphs and metrics]

**Recommendations**
1. Optimization needed for...
2. Scale resources for...
3. Code changes required...

**Sign-off**
- Performance Lead: _______
- Dev Lead: _____________
- Operations: ___________