# Webhook Enhancements Documentation

## Overview

This document describes the enhancements made to the webhook event system in Phase 4, including new event types, enhanced payloads, and backward compatibility features.

## New Webhook Event Types

### Audit Trail Events
- **audit.created** - Triggered when any audit trail record is created

### Reporting Events
- **report.generated** - Triggered when a report is generated
- **report.scheduled** - Triggered when a scheduled report is created

### Backup/Restore Events
- **backup.created** - Triggered when a backup is created
- **backup.restored** - Triggered when data is restored from a backup

### Sync Events
- **sync.completed** - Triggered when offline PWA data sync completes

### GDPR Events
- **gdpr.export_requested** - Triggered when a GDPR data export is requested
- **gdpr.deletion_requested** - Triggered when a GDPR data deletion is requested

### Additional Events
- **task.deleted** - Triggered when a task is deleted
- **task.overdue** - Triggered when a task becomes overdue
- **schedule.created** - Triggered when a schedule is created
- **schedule.updated** - Triggered when a schedule is updated
- **schedule.deleted** - Triggered when a schedule is deleted
- **user.invited** - Triggered when a user is invited
- **user.joined** - Triggered when an invited user joins
- **user.deactivated** - Triggered when a user is deactivated
- **maintenance.started** - Triggered when maintenance begins
- **maintenance.completed** - Triggered when maintenance completes
- **warranty.expiring** - Triggered when warranty is about to expire
- **warranty.expired** - Triggered when warranty has expired

## Enhanced Payload Format

### Version 2.0 Format

All new webhook events use the enhanced format with additional context:

```json
{
  "id": "event-unique-id",
  "type": "event.type",
  "timestamp": "2024-01-01T00:00:00Z",
  "organization": {
    "id": "org-id",
    "name": "Organization Name"
  },
  "triggeredBy": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "User Name",
    "role": "MANAGER"
  },
  "data": {
    // Event-specific payload
  },
  "metadata": {
    "version": "2.0",
    "source": "asset-manager-backend"
  }
}
```

### Legacy Format Support

For backward compatibility, webhooks can still receive events in the legacy format:

```json
{
  "id": "event-unique-id",
  "type": "event.type",
  "timestamp": "2024-01-01T00:00:00Z",
  "organizationId": "org-id",
  "data": {
    // Event-specific payload
  },
  "metadata": {
    "source": "service-name"
  }
}
```

## Event-Specific Payloads

### Asset Events

#### asset.created
```typescript
{
  asset: {
    id: string;
    name: string;
    category: AssetCategory;
    status: AssetStatus;
    qrCode?: string;
    serialNumber?: string;
    locationId?: string;
    locationName?: string;
    assetTemplateId?: string;
    assetTemplateName?: string;
  };
  location?: {
    id: string;
    name: string;
    path: string;
  };
  parentAsset?: {
    id: string;
    name: string;
  };
  customFields?: Record<string, any>;
}
```

#### asset.updated
```typescript
{
  asset: WebhookAsset;
  changes: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  location?: WebhookLocation;
  previousLocation?: WebhookLocation;
}
```

### Audit Events

#### audit.created
```typescript
{
  audit: {
    id: string;
    model: string;
    recordId: string;
    action: ActionType;
    userId: string;
    timestamp: Date;
  };
  user: WebhookUser;
  changes?: {
    oldValue: any;
    newValue: any;
  };
  affectedEntity?: {
    type: string;
    id: string;
    name?: string;
  };
}
```

### Report Events

#### report.generated
```typescript
{
  report: {
    id: string;
    type: ReportType;
    name: string;
    format: string;
    status: ReportStatus;
    generatedAt: Date;
  };
  requestedBy: WebhookUser;
  downloadUrl?: string;
  expiresAt?: Date;
}
```

### Sync Events

#### sync.completed
```typescript
{
  sync: {
    id: string;
    deviceId: string;
    deviceName?: string;
    syncToken: string;
    startedAt: Date;
    completedAt: Date;
  };
  user: WebhookUser;
  summary: {
    uploaded: number;
    downloaded: number;
    conflicts: number;
    conflictResolution?: ConflictResolution;
  };
}
```

### GDPR Events

#### gdpr.export_requested
```typescript
{
  request: {
    id: string;
    userId: string;
    requestedAt: Date;
    status: 'pending' | 'processing' | 'completed';
  };
  requestedBy: WebhookUser;
  dataCategories: string[];
}
```

#### gdpr.deletion_requested
```typescript
{
  request: {
    id: string;
    userId: string;
    requestedAt: Date;
    status: 'pending' | 'processing' | 'completed';
    scheduledDeletionDate?: Date;
  };
  requestedBy: WebhookUser;
  affectedData: {
    assets: number;
    tasks: number;
    comments: number;
    attachments: number;
  };
}
```

## Implementation Details

### WebhookService Enhancements

The `WebhookService` now includes:

1. **createEnhancedEvent()** - Creates webhook events with full context including organization and user details
2. **Enhanced payload support** - Automatically detects and handles both legacy and enhanced formats
3. **Backward compatibility** - Existing webhooks continue to work without modification

### Service Integration

Each service that emits webhook events has been updated to:

1. Include comprehensive event data with related entities
2. Capture before/after values for update events
3. Provide user context for all events
4. Include relevant metadata

### Error Handling

Webhook emissions are wrapped in try-catch blocks to ensure:
- Primary operations succeed even if webhook delivery fails
- Errors are logged but don't interrupt the main flow
- Failed webhook deliveries can be retried

## Migration Guide

### For Webhook Consumers

1. **Check payload version** - Look for `metadata.version` to determine format
2. **Handle both formats** - Support both legacy and enhanced formats during transition
3. **Use typed payloads** - Import TypeScript types for type-safe webhook handling

### For Developers

1. **Use enhanced events** - When adding new webhook emissions, use `createEnhancedEvent()`
2. **Include context** - Always provide user and organization context
3. **Track changes** - For update events, include before/after values
4. **Test compatibility** - Ensure webhooks work with both payload formats

## Example Webhook Handler

```typescript
import { WebhookEventPayloadMap } from './types/webhook-payloads';

function handleWebhook(event: any) {
  // Check if it's an enhanced event
  const isEnhanced = event.metadata?.version === '2.0';
  
  if (isEnhanced) {
    // Handle enhanced format
    console.log(`Event ${event.type} triggered by ${event.triggeredBy.email}`);
    console.log(`Organization: ${event.organization.name}`);
  } else {
    // Handle legacy format
    console.log(`Event ${event.type} for org ${event.organizationId}`);
  }
  
  // Process event data
  switch (event.type) {
    case 'asset.updated':
      handleAssetUpdate(event.data);
      break;
    case 'audit.created':
      handleAuditCreation(event.data);
      break;
    // ... other event types
  }
}
```

## Security Considerations

1. **Webhook signatures** - All webhooks are signed with HMAC-SHA256
2. **User context** - Enhanced events include user information for audit trails
3. **Data filtering** - Sensitive data is excluded from webhook payloads
4. **Rate limiting** - Webhook deliveries are rate-limited to prevent abuse