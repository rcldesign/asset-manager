# Webhook Implementation Documentation

## Overview

The webhook system allows external services to receive real-time notifications when specific events occur in the DumbAssets Enhanced application. This implementation provides:

- Configurable webhook endpoints with custom headers and retry policies
- Event-based notifications for assets, tasks, schedules, and users
- Secure payload delivery with HMAC signatures
- Automatic retry with exponential backoff
- Comprehensive delivery history tracking

## Architecture

### Components

1. **WebhookService** (`src/services/webhook.service.ts`)
   - Manages webhook configurations (CRUD operations)
   - Emits events when significant actions occur
   - Handles webhook delivery with retry logic
   - Generates HMAC signatures for payload verification

2. **Webhook Worker** (`src/workers/webhook.worker.ts`)
   - Processes webhook delivery jobs from the queue
   - Manages retry logic and delivery tracking
   - Updates delivery status in the database

3. **API Routes** (`src/routes/webhooks.ts`)
   - RESTful endpoints for webhook management
   - Test endpoint for webhook verification
   - Delivery history endpoint for debugging

4. **Database Schema**
   - `webhook_subscriptions` - Stores webhook configurations
   - `webhook_deliveries` - Tracks delivery attempts and status

## Supported Events

### Asset Events
- `asset.created` - New asset created
- `asset.updated` - Asset properties modified
- `asset.deleted` - Asset removed from system

### Task Events
- `task.created` - New task created
- `task.updated` - Task properties modified
- `task.completed` - Task marked as complete
- `task.deleted` - Task removed
- `task.assigned` - Task assigned to user(s)
- `task.overdue` - Task past due date

### Schedule Events
- `schedule.created` - New schedule created
- `schedule.updated` - Schedule modified
- `schedule.deleted` - Schedule removed

### User Events
- `user.invited` - User invitation sent
- `user.joined` - User accepted invitation
- `user.deactivated` - User account deactivated

### Maintenance Events
- `maintenance.started` - Maintenance task started
- `maintenance.completed` - Maintenance task completed
- `warranty.expiring` - Asset warranty expiring soon
- `warranty.expired` - Asset warranty expired

## Webhook Payload Format

All webhook payloads follow this structure:

```json
{
  "id": "event-123-456789",
  "type": "asset.created",
  "timestamp": "2025-06-26T10:30:00Z",
  "data": {
    // Event-specific data
  },
  "metadata": {
    "source": "asset-service",
    "action": "create"
  }
}
```

## Security

### HMAC Signature Verification

Each webhook request includes an HMAC-SHA256 signature in the `X-Webhook-Signature` header:

```
X-Webhook-Signature: sha256=<hex-digest>
```

To verify the signature:
1. Extract the signature from the header
2. Compute HMAC-SHA256 of the raw request body using your webhook secret
3. Compare the computed signature with the received signature

### Headers

Every webhook request includes:
- `Content-Type: application/json`
- `User-Agent: DumbAssets-Webhook/1.0`
- `X-Webhook-Event: <event-type>`
- `X-Webhook-Event-Id: <unique-event-id>`
- `X-Webhook-Timestamp: <iso-timestamp>`
- `X-Webhook-Signature: <hmac-signature>` (if secret configured)

## Configuration

### Environment Variables

```bash
# No specific webhook environment variables required
# Webhooks are configured per organization via API
```

### Creating a Webhook

```bash
POST /api/webhooks
{
  "name": "Production Webhook",
  "url": "https://example.com/webhook",
  "events": ["asset.created", "task.completed"],
  "secret": "your-webhook-secret",
  "headers": {
    "X-Custom-Header": "value"
  },
  "retryPolicy": {
    "maxRetries": 3,
    "retryDelayMs": 1000,
    "backoffMultiplier": 2
  }
}
```

### Testing a Webhook

```bash
POST /api/webhooks/{webhookId}/test
```

This sends a test event to verify your endpoint is working correctly.

## Retry Policy

Failed webhook deliveries are automatically retried based on the configured retry policy:

- **maxRetries**: Maximum number of retry attempts (default: 3)
- **retryDelayMs**: Initial delay between retries in milliseconds (default: 1000)
- **backoffMultiplier**: Multiplier for exponential backoff (default: 2)

Example retry timeline with defaults:
- Initial attempt: Immediate
- Retry 1: After 1 second
- Retry 2: After 2 seconds (1 × 2)
- Retry 3: After 4 seconds (2 × 2)

## Integration Examples

### Asset Creation Event

```json
{
  "id": "asset-created-uuid-1719401400000",
  "type": "asset.created",
  "timestamp": "2025-06-26T10:30:00Z",
  "data": {
    "assetId": "asset-uuid",
    "name": "Laptop #123",
    "category": "EQUIPMENT",
    "status": "OPERATIONAL",
    "locationId": "location-uuid",
    "templateId": "template-uuid",
    "qrCode": "AST-12345678",
    "serialNumber": "SN123456",
    "manufacturer": "Dell",
    "modelNumber": "Latitude 7420"
  },
  "metadata": {
    "source": "asset-service",
    "action": "create"
  }
}
```

### Task Completion Event

```json
{
  "id": "task-completed-uuid-1719401400000",
  "type": "task.completed",
  "timestamp": "2025-06-26T10:30:00Z",
  "data": {
    "taskId": "task-uuid",
    "title": "Replace air filter",
    "status": "DONE",
    "completedAt": "2025-06-26T10:30:00Z",
    "completedBy": "user-uuid",
    "assetId": "asset-uuid",
    "assetName": "HVAC Unit #1",
    "scheduleId": "schedule-uuid",
    "scheduleName": "Monthly Maintenance",
    "actualCost": 25.00,
    "actualMinutes": 30,
    "estimatedMinutes": 45,
    "dueDate": "2025-06-25T00:00:00Z"
  },
  "metadata": {
    "source": "task-enhancement-service",
    "action": "complete",
    "notes": "Filter was dirtier than expected"
  }
}
```

## Monitoring & Debugging

### Delivery History

View webhook delivery history:

```bash
GET /api/webhooks/{webhookId}/deliveries?limit=50&offset=0&status=failed
```

Response includes:
- Delivery ID
- Event type and ID
- HTTP status code
- Response body (truncated)
- Error message (if failed)
- Attempt count
- Timestamps

### Common Issues

1. **Signature Verification Failures**
   - Ensure you're using the raw request body for HMAC computation
   - Verify the secret matches exactly (no extra whitespace)
   - Check that you're using SHA256 algorithm

2. **Timeout Errors**
   - Webhook endpoints must respond within 30 seconds
   - Consider acknowledging receipt quickly and processing asynchronously

3. **SSL Certificate Errors**
   - Webhooks require valid SSL certificates
   - Self-signed certificates are not supported

## Best Practices

1. **Idempotency**: Use the event ID to ensure you only process each event once
2. **Quick Response**: Respond with 2xx status quickly, process asynchronously if needed
3. **Error Handling**: Return 4xx for permanent failures, 5xx for temporary issues
4. **Security**: Always verify signatures in production environments
5. **Monitoring**: Set up alerts for repeated delivery failures

## API Reference

### Endpoints

- `GET /api/webhooks` - List webhooks
- `GET /api/webhooks/{id}` - Get webhook details
- `POST /api/webhooks` - Create webhook
- `PATCH /api/webhooks/{id}` - Update webhook
- `DELETE /api/webhooks/{id}` - Delete webhook
- `POST /api/webhooks/{id}/test` - Test webhook
- `GET /api/webhooks/{id}/deliveries` - Get delivery history

All endpoints require authentication and `manage:organization` permission.