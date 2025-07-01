# PWA Offline Sync Implementation

This document describes the offline synchronization system for the Progressive Web Application (PWA) component of the Asset Manager. The system enables users to work offline and synchronize changes when connectivity is restored.

## Architecture Overview

The offline sync system consists of several key components:

1. **Database Schema**: Models for tracking sync state, conflicts, and metadata
2. **Sync Service**: Core business logic for processing sync operations
3. **API Endpoints**: RESTful endpoints for PWA clients to sync data
4. **Background Workers**: Queue-based processing for sync operations
5. **Conflict Resolution**: Strategies for handling data conflicts
6. **Version Tracking**: Automatic versioning with Prisma middleware

## Database Models

### SyncClient
Tracks each device/client that syncs with the system.

```typescript
model SyncClient {
  id              String   @id @default(uuid())
  userId          String
  deviceId        String   // Unique device identifier from PWA
  deviceName      String?  // Human-readable device name
  lastSyncAt      DateTime?
  syncToken       String?  // Token for incremental sync
  isActive        Boolean  @default(true)
  // ... relationships
}
```

### SyncQueue
Queue for pending sync operations from offline clients.

```typescript
model SyncQueue {
  id              String          @id @default(uuid())
  clientId        String
  entityType      String          // 'asset', 'task', 'schedule', etc.
  entityId        String
  operation       SyncOperation   // CREATE, UPDATE, DELETE
  payload         Json            // The actual data to sync
  clientVersion   Int             // Version number from client
  status          SyncStatus      // PENDING, SYNCING, COMPLETED, FAILED, CONFLICT
  // ... other fields
}
```

### SyncMetadata
Tracks version and sync state for each entity.

```typescript
model SyncMetadata {
  id              String   @id @default(uuid())
  entityType      String   // 'asset', 'task', 'schedule', etc.
  entityId        String
  version         Int      @default(1)
  lastModifiedBy  String   // userId
  lastModifiedAt  DateTime @default(now())
  checksum        String?  // For integrity checking
  deletedAt       DateTime? // Soft delete tracking for sync
  // ... other fields
}
```

### SyncConflict
History of conflicts and their resolutions.

```typescript
model SyncConflict {
  id              String             @id @default(uuid())
  entityType      String
  entityId        String
  clientVersion   Int
  serverVersion   Int
  clientData      Json
  serverData      Json
  resolution      ConflictResolution // CLIENT_WINS, SERVER_WINS, MANUAL, MERGE
  resolvedBy      String?            // userId who resolved manual conflicts
  resolvedAt      DateTime?
  // ... other fields
}
```

## API Endpoints

### POST /api/sync
Main sync endpoint for processing offline changes.

**Request:**
```json
{
  "deviceId": "unique-device-id",
  "deviceName": "User's iPhone",
  "syncToken": "previous-sync-token",
  "changes": [
    {
      "entityType": "asset",
      "entityId": "asset-uuid",
      "operation": "CREATE",
      "payload": { /* entity data */ },
      "clientVersion": 1,
      "timestamp": "2023-10-01T12:00:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "syncToken": "new-sync-token",
  "changes": [
    {
      "entityType": "asset",
      "entityId": "asset-uuid",
      "operation": "UPDATE",
      "payload": { /* entity data */ },
      "clientVersion": 2,
      "timestamp": "2023-10-01T12:01:00Z"
    }
  ],
  "conflicts": [
    {
      "entityType": "asset",
      "entityId": "asset-uuid",
      "clientVersion": 1,
      "serverVersion": 2,
      "clientData": { /* client's data */ },
      "serverData": { /* server's data */ },
      "suggestedResolution": "CLIENT_WINS"
    }
  ],
  "serverTime": "2023-10-01T12:01:30Z"
}
```

### POST /api/sync/delta
Efficient endpoint for getting only changed data since last sync.

**Request:**
```json
{
  "deviceId": "unique-device-id",
  "entityTypes": ["asset", "task"],
  "lastSyncTimestamp": "2023-10-01T10:00:00Z",
  "pageSize": 100,
  "pageToken": "optional-continuation-token"
}
```

**Response:**
```json
{
  "changes": [/* array of changes */],
  "nextPageToken": "next-page-token",
  "hasMore": true
}
```

### Other Endpoints

- `GET /api/sync/status` - Get sync status for current user
- `GET /api/sync/devices` - List registered devices
- `DELETE /api/sync/devices/{deviceId}` - Unregister a device
- `GET /api/sync/conflicts` - Get unresolved conflicts
- `POST /api/sync/conflicts/resolve` - Resolve a conflict
- `POST /api/sync/queue/retry` - Retry failed sync operations
- `POST /api/sync/cache/invalidate` - Invalidate sync cache

## Conflict Resolution Strategies

### Automatic Resolution
1. **Timestamp-based**: If server was modified more recently, suggest `SERVER_WINS`
2. **Field-based**: If different fields were modified, suggest `MERGE`
3. **User preference**: Default to `CLIENT_WINS` for user-initiated changes

### Manual Resolution
Users can choose from:
- `CLIENT_WINS`: Use the client's version
- `SERVER_WINS`: Keep the server's version
- `MERGE`: Combine both versions (when possible)
- `MANUAL`: Require explicit user decision

## Service Worker Integration

The system is designed to work with service workers for background sync:

```typescript
// Register background sync
self.registration.sync.register('sync-all');

// Handle sync event
self.addEventListener('sync', event => {
  if (event.tag === 'sync-all') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  const syncService = new ServiceWorkerSyncService();
  await syncService.processSyncEvent({
    tag: 'sync-all',
    lastChance: false,
    clientId: await getClientId()
  });
}
```

## Caching Strategies

### Cache-First for Read Operations
1. Check IndexedDB for data
2. If found and fresh, return cached data
3. If stale or missing, fetch from server
4. Update cache with fresh data

### Network-First for Write Operations
1. Try to send changes to server immediately
2. If offline, queue changes for later sync
3. Update local cache optimistically
4. Mark changes as pending sync

## Data Flow

### Online Mode
1. User makes changes → Update local cache
2. Send changes to server immediately
3. Process server response
4. Update local cache with server state
5. Resolve any conflicts

### Offline Mode
1. User makes changes → Update local cache
2. Queue changes for sync
3. Show changes as "pending sync"
4. When online, process sync queue

### Sync Process
1. Client connects to internet
2. Service worker triggers background sync
3. Client sends queued changes to server
4. Server processes changes and detects conflicts
5. Server returns conflicts and server changes
6. Client resolves conflicts and updates cache

## Version Tracking

Automatic version tracking is implemented via Prisma middleware:

```typescript
// Middleware automatically increments version on updates
export const syncMiddleware: Prisma.Middleware = async (params, next) => {
  // Intercept create, update, delete operations
  // Update SyncMetadata with new version and timestamp
  // Calculate checksum for integrity verification
};
```

## Error Handling

### Sync Failures
- Temporary failures: Retry with exponential backoff
- Permanent failures: Mark as failed and notify user
- Network failures: Queue for later retry

### Conflict Detection
- Version mismatch: Compare client vs server versions
- Checksum mismatch: Data integrity issues
- Permission denied: User authorization problems

## Performance Optimizations

### Batch Processing
- Process multiple sync items together
- Reduce database roundtrips
- Optimize for bulk operations

### Delta Sync
- Only sync changed data since last sync
- Use pagination for large datasets
- Compress payload data when possible

### Background Processing
- Use Bull Queue for async processing
- Priority-based job processing
- Automatic retry with backoff

## Monitoring and Metrics

### Sync Health Metrics
- Active sync clients
- Sync backlog size
- Failure rates
- Conflict rates
- Average sync duration

### Alerts
- High conflict rates
- Large sync backlogs
- Extended offline periods
- Sync failures above threshold

## Security Considerations

### Authentication
- JWT tokens for API access
- Device registration required
- User permissions enforced

### Data Validation
- Schema validation on all inputs
- Sanitization of sync payloads
- Rate limiting on sync endpoints

### Conflict Security
- Users can only resolve conflicts for their organization
- Audit trail for all conflict resolutions
- Prevent privilege escalation through sync

## Usage Examples

### Basic Sync Implementation (Client-side)

```typescript
class OfflineSyncClient {
  async sync() {
    const changes = await this.getQueuedChanges();
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        deviceId: this.deviceId,
        syncToken: this.lastSyncToken,
        changes
      })
    });

    const result = await response.json();
    
    // Apply server changes
    await this.applyServerChanges(result.changes);
    
    // Handle conflicts
    await this.handleConflicts(result.conflicts);
    
    // Update sync token
    this.lastSyncToken = result.syncToken;
  }
}
```

### Conflict Resolution UI

```typescript
async function resolveConflict(conflictId: string, resolution: ConflictResolution) {
  await fetch('/api/sync/conflicts/resolve', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      conflictId,
      resolution
    })
  });
}
```

## Testing

The sync system includes comprehensive tests:

- **Unit Tests**: Core sync logic and conflict resolution
- **Integration Tests**: API endpoints and database operations
- **End-to-End Tests**: Full sync workflows with multiple clients

Run tests with:
```bash
npm run test:sync
```

## Deployment Considerations

### Database Migration
Run the migration to add sync tables:
```bash
npx prisma migrate deploy
```

### Worker Process
Ensure sync worker is running:
```bash
npm run worker:sync
```

### Monitoring
Set up monitoring for:
- Queue depths
- Sync success rates
- Conflict resolution times
- Client health status

## Troubleshooting

### Common Issues

1. **High Conflict Rate**
   - Check if multiple users are editing same entities
   - Review conflict resolution strategies
   - Consider entity-level locking

2. **Sync Backlog**
   - Increase worker concurrency
   - Optimize database queries
   - Consider batch processing improvements

3. **Client Not Syncing**
   - Verify device registration
   - Check authentication tokens
   - Review client-side queue management

### Debug Tools

Use the sync status endpoint to monitor health:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/sync/status
```

Check queue statistics:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/sync/queue/stats
```

## Future Enhancements

1. **Optimistic UI Updates**: Show changes immediately before sync
2. **Selective Sync**: Allow users to choose what data to sync
3. **Compression**: Compress large payloads for slower connections
4. **P2P Sync**: Direct device-to-device synchronization
5. **Real-time Sync**: WebSocket-based real-time updates
6. **Smart Conflict Resolution**: ML-based conflict resolution suggestions