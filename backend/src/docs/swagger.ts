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
            format: 'date',
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
            format: 'date',
            nullable: true,
            description: 'Warranty expiry date',
          },
          warrantyLifetime: {
            type: 'boolean',
            description: 'Whether the asset has lifetime warranty',
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
      name: 'Tasks',
      description: 'Task management endpoints',
    },
    {
      name: 'Health',
      description: 'Application health and status endpoints',
    },
  ],
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/routes/**/*.ts', './src/middleware/*.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
