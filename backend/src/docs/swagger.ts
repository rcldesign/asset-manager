import swaggerJSDoc from 'swagger-jsdoc';
import { config } from '../config';

// Basic swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'DumbAssets Enhanced API',
    version: '1.0.0',
    description:
      'A comprehensive asset management system with organization support, user management, and task tracking',
    contact: {
      name: 'DumbAssets Enhanced',
      url: 'https://github.com/your-repo/dumbassets-enhanced',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Development server',
    },
    {
      url: '/api',
      description: 'API base path',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token for authentication',
      },
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'API key for programmatic access',
      },
    },
    schemas: {
      // Enums
      UserRole: {
        type: 'string',
        enum: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'],
        description: 'User role within the organization',
      },
      TaskStatus: {
        type: 'string',
        enum: ['PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED'],
        description: 'Task status',
      },
      TaskPriority: {
        type: 'string',
        enum: ['HIGH', 'MEDIUM', 'LOW'],
        description: 'Task priority level',
      },
      ScheduleType: {
        type: 'string',
        enum: ['ONE_OFF', 'FIXED_INTERVAL', 'CUSTOM'],
        description: 'Schedule type',
      },
      AssetCategory: {
        type: 'string',
        enum: ['HARDWARE', 'SOFTWARE', 'FURNITURE', 'VEHICLE', 'EQUIPMENT', 'PROPERTY', 'OTHER'],
        description: 'Asset category',
      },
      AssetStatus: {
        type: 'string',
        enum: ['OPERATIONAL', 'MAINTENANCE', 'REPAIR', 'RETIRED', 'DISPOSED', 'LOST'],
        description: 'Asset operational status',
      },
      WebhookEventType: {
        type: 'string',
        enum: [
          'asset.created',
          'asset.updated',
          'asset.deleted',
          'task.created',
          'task.updated',
          'task.completed',
          'task.deleted',
          'task.assigned',
          'task.overdue',
          'schedule.created',
          'schedule.updated',
          'schedule.deleted',
          'user.invited',
          'user.joined',
          'user.deactivated',
          'maintenance.started',
          'maintenance.completed',
          'warranty.expiring',
          'warranty.expired',
          'audit.created',
          'report.generated',
          'report.scheduled',
          'backup.created',
          'backup.restored',
          'sync.completed',
          'gdpr.export_requested',
          'gdpr.deletion_requested',
        ],
        description: 'Webhook event types that can be subscribed to',
      },
      // Error schemas
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message',
          },
          details: {
            type: 'object',
            description: 'Additional error details',
          },
        },
        required: ['error'],
      },
      ValidationError: {
        allOf: [
          { $ref: '#/components/schemas/Error' },
          {
            type: 'object',
            properties: {
              details: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    description: 'Field that failed validation',
                  },
                  message: {
                    type: 'string',
                    description: 'Validation error message',
                  },
                },
              },
            },
          },
        ],
      },
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'User unique identifier',
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          fullName: {
            type: 'string',
            nullable: true,
            description: 'User full name',
          },
          role: {
            type: 'string',
            enum: ['OWNER', 'MANAGER', 'MEMBER', 'VIEWER'],
            description: 'User role in the organization',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the user belongs to',
          },
          emailVerified: {
            type: 'boolean',
            description: 'Whether the user email is verified',
          },
          totpEnabled: {
            type: 'boolean',
            description: 'Whether 2FA is enabled for the user',
          },
          isActive: {
            type: 'boolean',
            description: 'Whether the user account is active',
          },
          notificationPreferences: {
            type: 'object',
            description: 'User notification preferences',
            additionalProperties: true,
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'User creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'User last update timestamp',
          },
        },
        required: [
          'id',
          'email',
          'role',
          'organizationId',
          'emailVerified',
          'totpEnabled',
          'isActive',
          'notificationPreferences',
          'createdAt',
          'updatedAt',
        ],
      },
      Organization: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Organization unique identifier',
          },
          name: {
            type: 'string',
            description: 'Organization name',
          },
          ownerUserId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'User ID of the organization owner',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Organization creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Organization last update timestamp',
          },
        },
        required: ['id', 'name', 'createdAt', 'updatedAt'],
      },
      Asset: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Asset unique identifier',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the asset belongs to',
          },
          name: {
            type: 'string',
            description: 'Asset name',
          },
          category: {
            type: 'string',
            enum: [
              'HARDWARE',
              'SOFTWARE',
              'FURNITURE',
              'VEHICLE',
              'EQUIPMENT',
              'PROPERTY',
              'OTHER',
            ],
            description: 'Asset category',
          },
          status: {
            type: 'string',
            enum: ['OPERATIONAL', 'MAINTENANCE', 'REPAIR', 'RETIRED', 'DISPOSED', 'LOST'],
            description: 'Asset status',
          },
          assetTemplateId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Asset template ID',
          },
          locationId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Location ID where the asset is located',
          },
          parentId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Parent asset ID for asset hierarchy',
          },
          path: {
            type: 'string',
            description: 'Materialized path for efficient querying',
          },
          manufacturer: {
            type: 'string',
            nullable: true,
            description: 'Asset manufacturer',
          },
          modelNumber: {
            type: 'string',
            nullable: true,
            description: 'Asset model number',
          },
          serialNumber: {
            type: 'string',
            nullable: true,
            description: 'Asset serial number',
          },
          purchaseDate: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Asset purchase date',
          },
          purchasePrice: {
            type: 'number',
            nullable: true,
            description: 'Asset purchase price',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Asset description',
          },
          link: {
            type: 'string',
            format: 'uri',
            nullable: true,
            description: 'Link to asset information',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Asset tags',
          },
          warrantyScope: {
            type: 'string',
            nullable: true,
            description: 'Warranty scope description',
          },
          warrantyExpiry: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Warranty expiry date',
          },
          warrantyLifetime: {
            type: 'boolean',
            description: 'Whether the asset has lifetime warranty',
          },
          secondaryWarrantyScope: {
            type: 'string',
            nullable: true,
            description: 'Secondary warranty scope description',
          },
          secondaryWarrantyExpiry: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Secondary warranty expiry date',
          },
          customFields: {
            type: 'object',
            nullable: true,
            description: 'Custom fields for the asset',
            additionalProperties: true,
          },
          photoPath: {
            type: 'string',
            nullable: true,
            description: 'Path to asset photo',
          },
          receiptPath: {
            type: 'string',
            nullable: true,
            description: 'Path to purchase receipt',
          },
          manualPath: {
            type: 'string',
            nullable: true,
            description: 'Path to asset manual',
          },
          qrCode: {
            type: 'string',
            nullable: true,
            description: 'QR code for the asset',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Asset creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Asset last update timestamp',
          },
        },
        required: [
          'id',
          'organizationId',
          'name',
          'category',
          'status',
          'path',
          'tags',
          'warrantyLifetime',
          'createdAt',
          'updatedAt',
        ],
      },
      Task: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Task unique identifier',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the task belongs to',
          },
          assetId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Asset ID the task is related to',
          },
          scheduleId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Schedule ID the task was created from',
          },
          title: {
            type: 'string',
            description: 'Task title',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Task description',
          },
          dueDate: {
            type: 'string',
            format: 'date-time',
            description: 'Task due date',
          },
          status: {
            type: 'string',
            enum: ['PLANNED', 'IN_PROGRESS', 'DONE', 'SKIPPED'],
            description: 'Task status',
          },
          priority: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            description: 'Task priority',
          },
          estimatedCost: {
            type: 'number',
            nullable: true,
            description: 'Estimated task cost',
          },
          actualCost: {
            type: 'number',
            nullable: true,
            description: 'Actual task cost',
          },
          estimatedMinutes: {
            type: 'integer',
            nullable: true,
            description: 'Estimated task duration in minutes',
          },
          actualMinutes: {
            type: 'integer',
            nullable: true,
            description: 'Actual task duration in minutes',
          },
          completedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Task completion timestamp',
          },
          skippedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Task skip timestamp',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Task creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Task last update timestamp',
          },
        },
        required: [
          'id',
          'organizationId',
          'title',
          'dueDate',
          'status',
          'priority',
          'createdAt',
          'updatedAt',
        ],
      },
      AuthTokens: {
        type: 'object',
        properties: {
          tokens: {
            type: 'object',
            properties: {
              accessToken: {
                type: 'string',
                description: 'JWT access token (15 minutes expiry)',
              },
              refreshToken: {
                type: 'string',
                description: 'JWT refresh token (7 days expiry)',
              },
              accessTokenExpiry: {
                type: 'integer',
                description: 'Access token expiry timestamp',
              },
              refreshTokenExpiry: {
                type: 'integer',
                description: 'Refresh token expiry timestamp',
              },
              tokenId: {
                type: 'string',
                description: 'Token ID for tracking and revocation',
              },
            },
            required: [
              'accessToken',
              'refreshToken',
              'accessTokenExpiry',
              'refreshTokenExpiry',
              'tokenId',
            ],
          },
          user: {
            $ref: '#/components/schemas/User',
          },
        },
        required: ['tokens', 'user'],
      },
      TOTPSetup: {
        type: 'object',
        properties: {
          secret: {
            type: 'string',
            description: 'TOTP secret for manual entry',
          },
          qrCode: {
            type: 'string',
            description: 'QR code data URL for authenticator apps',
          },
          manualEntryKey: {
            type: 'string',
            description: 'Manual entry key for authenticator apps',
          },
          message: {
            type: 'string',
            description: 'Instructions for setup',
          },
        },
        required: ['secret', 'qrCode', 'manualEntryKey', 'message'],
      },
      ApiToken: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'API token unique identifier',
          },
          name: {
            type: 'string',
            description: 'API token name',
          },
          token: {
            type: 'string',
            description: 'API token value (only returned on creation)',
          },
          lastUsed: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Last time the token was used',
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Token expiration date',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Token creation timestamp',
          },
        },
        required: ['id', 'name', 'createdAt'],
      },
      AssetTemplate: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Asset template unique identifier',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the template belongs to',
          },
          name: {
            type: 'string',
            description: 'Template name',
          },
          category: {
            type: 'string',
            enum: [
              'HARDWARE',
              'SOFTWARE',
              'FURNITURE',
              'VEHICLE',
              'EQUIPMENT',
              'PROPERTY',
              'OTHER',
            ],
            description: 'Asset category',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Template description',
          },
          defaultFields: {
            type: 'object',
            description: 'Default fields for assets created from this template',
            additionalProperties: true,
          },
          customFields: {
            type: 'object',
            description: 'Custom field definitions for this template',
            additionalProperties: true,
          },
          isActive: {
            type: 'boolean',
            description: 'Whether the template is active',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Template creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Template last update timestamp',
          },
        },
        required: [
          'id',
          'organizationId',
          'name',
          'category',
          'defaultFields',
          'customFields',
          'isActive',
          'createdAt',
          'updatedAt',
        ],
      },
      Location: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Location unique identifier',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the location belongs to',
          },
          name: {
            type: 'string',
            description: 'Location name',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Location description',
          },
          parentId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Parent location ID for hierarchy',
          },
          path: {
            type: 'string',
            description: 'Materialized path for efficient querying',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Location creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Location last update timestamp',
          },
        },
        required: ['id', 'organizationId', 'name', 'path', 'createdAt', 'updatedAt'],
      },
      Schedule: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Schedule unique identifier',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the schedule belongs to',
          },
          assetId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Asset ID the schedule is associated with',
          },
          name: {
            type: 'string',
            description: 'Schedule name',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Schedule description',
          },
          scheduleType: {
            type: 'string',
            enum: ['ONE_OFF', 'FIXED_INTERVAL', 'CUSTOM'],
            description: 'Schedule type',
          },
          type: {
            type: 'string',
            nullable: true,
            description: 'Additional type field for new schedule types',
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Schedule start date',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Schedule end date',
          },
          intervalDays: {
            type: 'integer',
            nullable: true,
            description: 'Interval in days for fixed interval schedules',
          },
          intervalMonths: {
            type: 'integer',
            nullable: true,
            description: 'Interval in months for fixed interval schedules',
          },
          customRrule: {
            type: 'string',
            nullable: true,
            description: 'Custom RRULE for complex schedules',
          },
          recurrenceRule: {
            type: 'string',
            nullable: true,
            description: 'Recurrence rule for calendar-based schedules',
          },
          monthlyDayOfMonth: {
            type: 'integer',
            nullable: true,
            minimum: 1,
            maximum: 31,
            description: 'Day of month for monthly schedules',
          },
          seasonalMonths: {
            type: 'array',
            nullable: true,
            items: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
            description: 'Array of months for seasonal schedules',
          },
          usageThreshold: {
            type: 'number',
            nullable: true,
            description: 'Usage threshold for usage-based schedules',
          },
          currentUsage: {
            type: 'number',
            nullable: true,
            description: 'Current usage for usage-based schedules',
          },
          lastRunAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'When tasks were last generated',
          },
          nextRunAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'When tasks will next be generated',
          },
          nextOccurrence: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Next scheduled occurrence',
          },
          lastOccurrence: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Last scheduled occurrence',
          },
          isActive: {
            type: 'boolean',
            description: 'Whether the schedule is active',
          },
          taskTemplate: {
            type: 'object',
            description: 'Template for creating tasks',
            additionalProperties: true,
          },
          autoCreateAdvance: {
            type: 'integer',
            description: 'Days in advance to create tasks',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Schedule creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Schedule last update timestamp',
          },
        },
        required: [
          'id',
          'organizationId',
          'name',
          'scheduleType',
          'startDate',
          'isActive',
          'taskTemplate',
          'autoCreateAdvance',
          'createdAt',
          'updatedAt',
        ],
      },
      Notification: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Notification unique identifier',
          },
          organizationId: {
            type: 'string',
            format: 'uuid',
            description: 'Organization ID the notification belongs to',
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID the notification is for',
          },
          assetId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Related asset ID',
          },
          taskId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Related task ID',
          },
          scheduleId: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'Related schedule ID',
          },
          type: {
            type: 'string',
            description: 'Notification type',
          },
          title: {
            type: 'string',
            description: 'Notification title',
          },
          message: {
            type: 'string',
            description: 'Notification message',
          },
          data: {
            type: 'object',
            nullable: true,
            description: 'Additional notification data',
            additionalProperties: true,
          },
          isRead: {
            type: 'boolean',
            description: 'Whether the notification has been read',
          },
          readAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'When the notification was read',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Notification creation timestamp',
          },
        },
        required: [
          'id',
          'organizationId',
          'userId',
          'type',
          'title',
          'message',
          'isRead',
          'createdAt',
        ],
      },
      BackupMetadata: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Backup unique identifier',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'When the backup was created',
          },
          createdBy: {
            type: 'string',
            description: 'Email of user who created the backup',
          },
          type: {
            type: 'string',
            enum: ['full', 'database', 'files'],
            description: 'Type of backup',
          },
          size: {
            type: 'integer',
            description: 'Size of backup in bytes',
          },
          checksum: {
            type: 'string',
            description: 'SHA256 checksum of backup file',
          },
          databaseType: {
            type: 'string',
            enum: ['embedded', 'external'],
            description: 'Type of database backed up',
          },
          fileStorageType: {
            type: 'string',
            enum: ['local', 'smb'],
            description: 'Type of file storage backed up',
          },
          includesDatabase: {
            type: 'boolean',
            description: 'Whether database is included in backup',
          },
          includesFiles: {
            type: 'boolean',
            description: 'Whether files are included in backup',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Optional backup description',
          },
        },
        required: [
          'id',
          'timestamp',
          'createdBy',
          'type',
          'size',
          'checksum',
          'databaseType',
          'fileStorageType',
          'includesDatabase',
          'includesFiles',
        ],
      },
      AssetAttachment: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Attachment unique identifier',
          },
          assetId: {
            type: 'string',
            format: 'uuid',
            description: 'Asset ID the attachment belongs to',
          },
          uploadedByUserId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID who uploaded the attachment',
          },
          originalFilename: {
            type: 'string',
            description: 'Original filename',
          },
          storedFilename: {
            type: 'string',
            description: 'Stored filename on disk',
          },
          filePath: {
            type: 'string',
            description: 'File path on disk',
          },
          fileSizeBytes: {
            type: 'integer',
            description: 'File size in bytes',
          },
          mimeType: {
            type: 'string',
            description: 'MIME type of the file',
          },
          attachmentType: {
            type: 'string',
            enum: ['photo', 'receipt', 'manual', 'other'],
            description: 'Type of attachment',
          },
          isPrimary: {
            type: 'boolean',
            description: 'Whether this is the primary attachment of its type',
          },
          uploadDate: {
            type: 'string',
            format: 'date-time',
            description: 'Upload timestamp',
          },
        },
        required: [
          'id',
          'assetId',
          'uploadedByUserId',
          'originalFilename',
          'storedFilename',
          'filePath',
          'fileSizeBytes',
          'mimeType',
          'attachmentType',
          'isPrimary',
          'uploadDate',
        ],
      },
      TaskComment: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Comment unique identifier',
          },
          taskId: {
            type: 'string',
            format: 'uuid',
            description: 'Task ID the comment belongs to',
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID who made the comment',
          },
          content: {
            type: 'string',
            description: 'Comment content',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Comment creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Comment last update timestamp',
          },
        },
        required: ['id', 'taskId', 'userId', 'content', 'createdAt', 'updatedAt'],
      },
      TaskAssignment: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Assignment unique identifier',
          },
          taskId: {
            type: 'string',
            format: 'uuid',
            description: 'Task ID',
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'Assigned user ID',
          },
          assignedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Assignment timestamp',
          },
        },
        required: ['id', 'taskId', 'userId', 'assignedAt'],
      },
      TaskAttachment: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Attachment unique identifier',
          },
          taskId: {
            type: 'string',
            format: 'uuid',
            description: 'Task ID the attachment belongs to',
          },
          uploadedByUserId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID who uploaded the attachment',
          },
          originalFilename: {
            type: 'string',
            description: 'Original filename',
          },
          storedFilename: {
            type: 'string',
            description: 'Stored filename on disk',
          },
          fileSizeBytes: {
            type: 'integer',
            description: 'File size in bytes',
          },
          mimeType: {
            type: 'string',
            description: 'MIME type of the file',
          },
          uploadDate: {
            type: 'string',
            format: 'date-time',
            description: 'Upload timestamp',
          },
        },
        required: [
          'id',
          'taskId',
          'uploadedByUserId',
          'originalFilename',
          'storedFilename',
          'fileSizeBytes',
          'mimeType',
          'uploadDate',
        ],
      },
      // Request DTOs
      LoginRequest: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          password: {
            type: 'string',
            format: 'password',
            description: 'User password',
          },
          totp: {
            type: 'string',
            description: 'TOTP code if 2FA is enabled',
          },
        },
        required: ['email', 'password'],
      },
      RegisterRequest: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          password: {
            type: 'string',
            format: 'password',
            minLength: 8,
            description: 'User password (minimum 8 characters)',
          },
          fullName: {
            type: 'string',
            description: 'User full name',
          },
          organizationName: {
            type: 'string',
            description: 'Organization name',
          },
        },
        required: ['email', 'password', 'organizationName'],
      },
      RefreshTokenRequest: {
        type: 'object',
        properties: {
          refreshToken: {
            type: 'string',
            description: 'Refresh token',
          },
        },
        required: ['refreshToken'],
      },
      CreateAssetRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Asset name',
          },
          category: {
            $ref: '#/components/schemas/AssetCategory',
          },
          status: {
            $ref: '#/components/schemas/AssetStatus',
          },
          assetTemplateId: {
            type: 'string',
            format: 'uuid',
            description: 'Asset template ID to use',
          },
          locationId: {
            type: 'string',
            format: 'uuid',
            description: 'Location ID',
          },
          parentId: {
            type: 'string',
            format: 'uuid',
            description: 'Parent asset ID',
          },
          manufacturer: {
            type: 'string',
            description: 'Manufacturer name',
          },
          modelNumber: {
            type: 'string',
            description: 'Model number',
          },
          serialNumber: {
            type: 'string',
            description: 'Serial number',
          },
          purchaseDate: {
            type: 'string',
            format: 'date-time',
            description: 'Purchase date',
          },
          purchasePrice: {
            type: 'number',
            description: 'Purchase price',
          },
          description: {
            type: 'string',
            description: 'Asset description',
          },
          link: {
            type: 'string',
            format: 'uri',
            description: 'Link to asset information',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Asset tags',
          },
          warrantyScope: {
            type: 'string',
            description: 'Warranty scope',
          },
          warrantyExpiry: {
            type: 'string',
            format: 'date-time',
            description: 'Warranty expiry date',
          },
          warrantyLifetime: {
            type: 'boolean',
            description: 'Lifetime warranty',
          },
          customFields: {
            type: 'object',
            additionalProperties: true,
            description: 'Custom fields',
          },
        },
        required: ['name', 'category'],
      },
      UpdateAssetRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Asset name',
          },
          category: {
            $ref: '#/components/schemas/AssetCategory',
          },
          status: {
            $ref: '#/components/schemas/AssetStatus',
          },
          locationId: {
            type: 'string',
            format: 'uuid',
            description: 'Location ID',
          },
          manufacturer: {
            type: 'string',
            description: 'Manufacturer name',
          },
          modelNumber: {
            type: 'string',
            description: 'Model number',
          },
          serialNumber: {
            type: 'string',
            description: 'Serial number',
          },
          purchaseDate: {
            type: 'string',
            format: 'date-time',
            description: 'Purchase date',
          },
          purchasePrice: {
            type: 'number',
            description: 'Purchase price',
          },
          description: {
            type: 'string',
            description: 'Asset description',
          },
          link: {
            type: 'string',
            format: 'uri',
            description: 'Link to asset information',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Asset tags',
          },
          warrantyScope: {
            type: 'string',
            description: 'Warranty scope',
          },
          warrantyExpiry: {
            type: 'string',
            format: 'date-time',
            description: 'Warranty expiry date',
          },
          warrantyLifetime: {
            type: 'boolean',
            description: 'Lifetime warranty',
          },
          customFields: {
            type: 'object',
            additionalProperties: true,
            description: 'Custom fields',
          },
        },
      },
      CreateTaskRequest: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            format: 'uuid',
            description: 'Related asset ID',
          },
          title: {
            type: 'string',
            description: 'Task title',
          },
          description: {
            type: 'string',
            description: 'Task description',
          },
          dueDate: {
            type: 'string',
            format: 'date-time',
            description: 'Due date',
          },
          status: {
            $ref: '#/components/schemas/TaskStatus',
          },
          priority: {
            $ref: '#/components/schemas/TaskPriority',
          },
          estimatedCost: {
            type: 'number',
            description: 'Estimated cost',
          },
          estimatedMinutes: {
            type: 'integer',
            description: 'Estimated duration in minutes',
          },
          assignedUserIds: {
            type: 'array',
            items: {
              type: 'string',
              format: 'uuid',
            },
            description: 'User IDs to assign the task to',
          },
        },
        required: ['title', 'dueDate'],
      },
      UpdateTaskRequest: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Task title',
          },
          description: {
            type: 'string',
            description: 'Task description',
          },
          dueDate: {
            type: 'string',
            format: 'date-time',
            description: 'Due date',
          },
          status: {
            $ref: '#/components/schemas/TaskStatus',
          },
          priority: {
            $ref: '#/components/schemas/TaskPriority',
          },
          estimatedCost: {
            type: 'number',
            description: 'Estimated cost',
          },
          actualCost: {
            type: 'number',
            description: 'Actual cost',
          },
          estimatedMinutes: {
            type: 'integer',
            description: 'Estimated duration in minutes',
          },
          actualMinutes: {
            type: 'integer',
            description: 'Actual duration in minutes',
          },
        },
      },
      CreateScheduleRequest: {
        type: 'object',
        properties: {
          assetId: {
            type: 'string',
            format: 'uuid',
            description: 'Asset ID to associate with',
          },
          name: {
            type: 'string',
            description: 'Schedule name',
          },
          description: {
            type: 'string',
            description: 'Schedule description',
          },
          scheduleType: {
            $ref: '#/components/schemas/ScheduleType',
          },
          type: {
            type: 'string',
            description: 'Additional schedule type',
          },
          startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Start date',
          },
          endDate: {
            type: 'string',
            format: 'date-time',
            description: 'End date',
          },
          intervalDays: {
            type: 'integer',
            description: 'Interval in days',
          },
          intervalMonths: {
            type: 'integer',
            description: 'Interval in months',
          },
          customRrule: {
            type: 'string',
            description: 'Custom RRULE',
          },
          monthlyDayOfMonth: {
            type: 'integer',
            minimum: 1,
            maximum: 31,
            description: 'Day of month for monthly schedules',
          },
          seasonalMonths: {
            type: 'array',
            items: {
              type: 'integer',
              minimum: 1,
              maximum: 12,
            },
            description: 'Months for seasonal schedules',
          },
          usageThreshold: {
            type: 'number',
            description: 'Usage threshold',
          },
          taskTemplate: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Task title template',
              },
              description: {
                type: 'string',
                description: 'Task description template',
              },
              priority: {
                $ref: '#/components/schemas/TaskPriority',
              },
              estimatedCost: {
                type: 'number',
                description: 'Estimated cost',
              },
              estimatedMinutes: {
                type: 'integer',
                description: 'Estimated duration',
              },
            },
            required: ['title'],
          },
          autoCreateAdvance: {
            type: 'integer',
            description: 'Days in advance to create tasks',
          },
        },
        required: ['name', 'scheduleType', 'startDate', 'taskTemplate'],
      },
      CreateLocationRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Location name',
          },
          description: {
            type: 'string',
            description: 'Location description',
          },
          parentId: {
            type: 'string',
            format: 'uuid',
            description: 'Parent location ID',
          },
        },
        required: ['name'],
      },
      CreateAssetTemplateRequest: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Template name',
          },
          category: {
            $ref: '#/components/schemas/AssetCategory',
          },
          description: {
            type: 'string',
            description: 'Template description',
          },
          defaultFields: {
            type: 'object',
            additionalProperties: true,
            description: 'Default field values',
          },
          customFields: {
            type: 'object',
            additionalProperties: true,
            description: 'Custom field definitions',
          },
        },
        required: ['name', 'category'],
      },
      // Response DTOs
      PaginatedResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: {
              type: 'object',
            },
            description: 'Array of items',
          },
          pagination: {
            type: 'object',
            properties: {
              page: {
                type: 'integer',
                description: 'Current page number',
              },
              limit: {
                type: 'integer',
                description: 'Items per page',
              },
              total: {
                type: 'integer',
                description: 'Total number of items',
              },
              totalPages: {
                type: 'integer',
                description: 'Total number of pages',
              },
            },
            required: ['page', 'limit', 'total', 'totalPages'],
          },
        },
        required: ['data', 'pagination'],
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Success message',
          },
          data: {
            type: 'object',
            description: 'Response data',
          },
        },
        required: ['message'],
      },
      FileUploadResponse: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'File ID',
          },
          filename: {
            type: 'string',
            description: 'Original filename',
          },
          size: {
            type: 'integer',
            description: 'File size in bytes',
          },
          mimeType: {
            type: 'string',
            description: 'MIME type',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'File URL',
          },
        },
        required: ['id', 'filename', 'size', 'mimeType', 'url'],
      },
      // Audit Trail schemas
      AuditTrail: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Audit trail entry unique identifier',
          },
          model: {
            type: 'string',
            description: 'Model/entity type that was modified',
          },
          recordId: {
            type: 'string',
            description: 'ID of the record that was modified',
          },
          action: {
            type: 'string',
            enum: ['CREATE', 'UPDATE', 'DELETE', 'UPDATE_MANY', 'DELETE_MANY'],
            description: 'Action performed on the record',
          },
          oldValue: {
            type: 'object',
            nullable: true,
            description: 'Previous value before modification',
            additionalProperties: true,
          },
          newValue: {
            type: 'object',
            nullable: true,
            description: 'New value after modification',
            additionalProperties: true,
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID who performed the action',
          },
          user: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                format: 'uuid',
              },
              email: {
                type: 'string',
                format: 'email',
              },
              fullName: {
                type: 'string',
                nullable: true,
              },
            },
            description: 'User details',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Timestamp when the action was performed',
          },
        },
        required: ['id', 'model', 'recordId', 'action', 'userId', 'createdAt'],
      },
      AuditTrailQuery: {
        type: 'object',
        properties: {
          model: {
            type: 'string',
            description: 'Filter by model/entity type',
          },
          recordId: {
            type: 'string',
            description: 'Filter by specific record ID',
          },
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'Filter by user who performed actions',
          },
          action: {
            type: 'string',
            enum: ['CREATE', 'UPDATE', 'DELETE', 'UPDATE_MANY', 'DELETE_MANY'],
            description: 'Filter by action type',
          },
          fromDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter entries from this date',
          },
          toDate: {
            type: 'string',
            format: 'date-time',
            description: 'Filter entries up to this date',
          },
          page: {
            type: 'integer',
            minimum: 1,
            default: 1,
            description: 'Page number',
          },
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            default: 50,
            description: 'Items per page',
          },
        },
      },
      // Dashboard schemas
      DashboardStats: {
        type: 'object',
        properties: {
          assets: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
                description: 'Total number of assets',
              },
              byStatus: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
                description: 'Asset count by status',
              },
              byCategory: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
                description: 'Asset count by category',
              },
              recentlyAdded: {
                type: 'integer',
                description: 'Assets added in last 30 days',
              },
              warrantyExpiringSoon: {
                type: 'integer',
                description: 'Assets with warranty expiring in next 90 days',
              },
              totalValue: {
                type: 'number',
                description: 'Total purchase value of all assets',
              },
            },
          },
          tasks: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
                description: 'Total number of tasks',
              },
              byStatus: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
                description: 'Task count by status',
              },
              byPriority: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
                description: 'Task count by priority',
              },
              overdue: {
                type: 'integer',
                description: 'Number of overdue tasks',
              },
              dueToday: {
                type: 'integer',
                description: 'Tasks due today',
              },
              dueThisWeek: {
                type: 'integer',
                description: 'Tasks due this week',
              },
              completionRate: {
                type: 'number',
                description: 'Task completion rate percentage',
              },
            },
          },
          schedules: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
                description: 'Total number of schedules',
              },
              active: {
                type: 'integer',
                description: 'Number of active schedules',
              },
              nextWeek: {
                type: 'integer',
                description: 'Schedules with tasks due next week',
              },
            },
          },
          users: {
            type: 'object',
            properties: {
              total: {
                type: 'integer',
                description: 'Total number of users',
              },
              active: {
                type: 'integer',
                description: 'Active users in last 30 days',
              },
              byRole: {
                type: 'object',
                additionalProperties: {
                  type: 'integer',
                },
                description: 'User count by role',
              },
            },
          },
          lastUpdated: {
            type: 'string',
            format: 'date-time',
            description: 'When the dashboard data was last updated',
          },
        },
        required: ['assets', 'tasks', 'schedules', 'users', 'lastUpdated'],
      },
      // Report schemas
      ReportDefinition: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Report definition ID',
          },
          name: {
            type: 'string',
            description: 'Report name',
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Report description',
          },
          type: {
            type: 'string',
            enum: ['asset', 'task', 'schedule', 'maintenance', 'financial', 'custom'],
            description: 'Report type',
          },
          filters: {
            type: 'object',
            description: 'Report filters configuration',
            additionalProperties: true,
          },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  description: 'Field name',
                },
                label: {
                  type: 'string',
                  description: 'Display label',
                },
                type: {
                  type: 'string',
                  enum: ['string', 'number', 'date', 'boolean'],
                  description: 'Column data type',
                },
                format: {
                  type: 'string',
                  nullable: true,
                  description: 'Display format',
                },
              },
            },
            description: 'Report columns configuration',
          },
          groupBy: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Fields to group by',
          },
          sortBy: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                },
                direction: {
                  type: 'string',
                  enum: ['asc', 'desc'],
                },
              },
            },
            description: 'Sort configuration',
          },
          isPublic: {
            type: 'boolean',
            description: 'Whether the report is public',
          },
          createdBy: {
            type: 'string',
            format: 'uuid',
            description: 'User ID who created the report',
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Report creation timestamp',
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Report last update timestamp',
          },
        },
        required: [
          'id',
          'name',
          'type',
          'filters',
          'columns',
          'isPublic',
          'createdBy',
          'createdAt',
          'updatedAt',
        ],
      },
      // GDPR schemas
      GDPRDataExport: {
        type: 'object',
        properties: {
          userData: {
            type: 'object',
            description: 'User personal data',
            additionalProperties: true,
          },
          assets: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Asset',
            },
            description: 'Assets created by user',
          },
          tasks: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Task',
            },
            description: 'Tasks assigned to or created by user',
          },
          auditTrail: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/AuditTrail',
            },
            description: 'User activity audit trail',
          },
          notifications: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/Notification',
            },
            description: 'User notifications',
          },
          exportedAt: {
            type: 'string',
            format: 'date-time',
            description: 'When the data was exported',
          },
        },
        required: ['userData', 'assets', 'tasks', 'auditTrail', 'notifications', 'exportedAt'],
      },
      GDPRDataDeletionRequest: {
        type: 'object',
        properties: {
          confirmation: {
            type: 'string',
            description: 'Confirmation text (must be "DELETE MY DATA")',
          },
          retainAuditTrail: {
            type: 'boolean',
            default: true,
            description: 'Whether to retain audit trail for compliance',
          },
        },
        required: ['confirmation'],
      },
      // PWA Sync schemas
      SyncStatus: {
        type: 'object',
        properties: {
          lastSyncTime: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Last successful sync timestamp',
          },
          pendingChanges: {
            type: 'integer',
            description: 'Number of pending local changes',
          },
          syncInProgress: {
            type: 'boolean',
            description: 'Whether sync is currently in progress',
          },
          conflicts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entity: {
                  type: 'string',
                  description: 'Entity type',
                },
                id: {
                  type: 'string',
                  description: 'Entity ID',
                },
                localVersion: {
                  type: 'object',
                  additionalProperties: true,
                },
                serverVersion: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
            },
            description: 'Sync conflicts requiring resolution',
          },
        },
        required: ['pendingChanges', 'syncInProgress', 'conflicts'],
      },
      SyncRequest: {
        type: 'object',
        properties: {
          entities: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['assets', 'tasks', 'schedules', 'locations', 'notifications'],
            },
            description: 'Entities to sync',
          },
          lastSyncTime: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Last sync timestamp for delta sync',
          },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entity: {
                  type: 'string',
                  description: 'Entity type',
                },
                id: {
                  type: 'string',
                  description: 'Entity ID',
                },
                action: {
                  type: 'string',
                  enum: ['create', 'update', 'delete'],
                  description: 'Change action',
                },
                data: {
                  type: 'object',
                  additionalProperties: true,
                  description: 'Entity data',
                },
                timestamp: {
                  type: 'string',
                  format: 'date-time',
                  description: 'When the change was made',
                },
              },
            },
            description: 'Local changes to push',
          },
        },
        required: ['entities'],
      },
      SyncResponse: {
        type: 'object',
        properties: {
          serverTime: {
            type: 'string',
            format: 'date-time',
            description: 'Current server timestamp',
          },
          changes: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: true,
              },
            },
            description: 'Server changes by entity type',
          },
          deletions: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            description: 'Deleted entity IDs by type',
          },
          conflicts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entity: {
                  type: 'string',
                },
                id: {
                  type: 'string',
                },
                reason: {
                  type: 'string',
                },
              },
            },
            description: 'Conflicts that need resolution',
          },
        },
        required: ['serverTime', 'changes', 'deletions', 'conflicts'],
      },
    },
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization endpoints',
    },
    {
      name: 'Users',
      description: 'User management endpoints',
    },
    {
      name: 'Organizations',
      description: 'Organization management endpoints',
    },
    {
      name: 'Assets',
      description: 'Asset management endpoints',
    },
    {
      name: 'Asset Templates',
      description: 'Asset template management endpoints',
    },
    {
      name: 'Asset Attachments',
      description: 'Asset attachment management endpoints',
    },
    {
      name: 'Tasks',
      description: 'Task management endpoints',
    },
    {
      name: 'Locations',
      description: 'Location management endpoints',
    },
    {
      name: 'Schedules',
      description: 'Schedule management endpoints',
    },
    {
      name: 'Notifications',
      description: 'Notification management endpoints',
    },
    {
      name: 'Backup',
      description: 'Backup and restore operations',
    },
    {
      name: 'OIDC',
      description: 'OpenID Connect authentication endpoints',
    },
    {
      name: 'Health',
      description: 'Application health and status endpoints',
    },
    {
      name: 'Dashboard',
      description: 'Dashboard aggregation and analytics endpoints',
    },
    {
      name: 'Reports',
      description: 'Reporting and custom report builder endpoints',
    },
    {
      name: 'GDPR',
      description: 'GDPR compliance and data management endpoints',
    },
    {
      name: 'PWA Sync',
      description: 'Progressive Web App synchronization endpoints',
    },
    {
      name: 'Audit Trail',
      description: 'Audit trail querying and management endpoints',
    },
    {
      name: 'Activity Streams',
      description: 'Activity stream endpoints for real-time updates',
    },
    {
      name: 'Calendar Integration',
      description: 'Calendar integration and sync endpoints',
    },
    {
      name: 'Collaboration',
      description: 'Team collaboration and sharing endpoints',
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/routes/**/*.ts', './src/middleware/*.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
