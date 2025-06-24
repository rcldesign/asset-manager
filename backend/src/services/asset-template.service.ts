import type { AssetTemplate, AssetCategory } from '@prisma/client';
import { Prisma } from '@prisma/client';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { prisma } from '../lib/prisma';
import { AppError, NotFoundError, ConflictError } from '../utils/errors';

export interface CreateAssetTemplateData {
  name: string;
  description?: string;
  category: AssetCategory;
  defaultFields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  organizationId: string;
}

export interface UpdateAssetTemplateData {
  name?: string;
  description?: string;
  category?: AssetCategory;
  defaultFields?: Record<string, unknown>;
  customFields?: Record<string, unknown>;
  isActive?: boolean;
}

export interface QueryAssetTemplateOptions {
  name?: string;
  category?: AssetCategory;
  hasCustomField?: string;
  customFieldSearch?: string;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'category' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  includeInactive?: boolean;
}

export interface AssetTemplateSearchResult {
  data: AssetTemplate[];
  meta: {
    total: number;
    page: number;
    limit: number;
    lastPage: number;
  };
}

/**
 * Service for managing asset templates with JSON schema validation.
 * Provides template creation, validation, cloning, and import/export capabilities.
 * Templates define reusable configurations and custom field schemas for assets.
 *
 * @class AssetTemplateService
 */
export class AssetTemplateService {
  private readonly ajv: Ajv;

  /**
   * Creates an instance of AssetTemplateService.
   * Initializes AJV validator with format support for JSON schema validation.
   */
  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
  }

  /**
   * Validate that customFields contains a valid JSON Schema definition.
   * Ensures the schema follows JSON Schema specification and can be compiled.
   *
   * @param {Record<string, unknown>} schema - The schema object to validate
   * @returns {boolean} True if schema is valid, false otherwise
   * @private
   */
  private validateCustomFieldSchema(schema: Record<string, unknown>): boolean {
    // If no custom fields provided, use empty schema
    if (!schema || Object.keys(schema).length === 0) {
      return true;
    }

    // Basic validation - check if it has the required structure for a JSON Schema
    if (typeof schema === 'object' && schema !== null) {
      // If it's a proper JSON Schema, it should have type and properties
      if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
        // Additional validation: try to compile the schema itself
        try {
          this.ajv.compile(schema);
          return true;
        } catch (error) {
          console.error('Failed to compile custom field schema:', error);
          return false;
        }
      }

      // If it has any keys but doesn't match JSON Schema structure, validate it
      // Check for common invalid patterns
      const schemaKeys = Object.keys(schema);
      if (schemaKeys.length > 0) {
        // Must have 'type' property to be a valid JSON Schema
        if (!schema.type) {
          return false;
        }
        // If type is 'object', must have 'properties'
        if (schema.type === 'object' && !schema.properties) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Create a new asset template with custom field schema validation.
   * Templates provide reusable configurations for assets of the same type.
   *
   * @param {CreateAssetTemplateData} data - Template creation data
   * @returns {Promise<AssetTemplate>} The created template
   * @throws {NotFoundError} If organization not found
   * @throws {ConflictError} If template name already exists in organization
   * @throws {AppError} If custom field schema is invalid
   *
   * @example
   * const template = await templateService.createTemplate({
   *   name: 'Laptop Template',
   *   category: 'EQUIPMENT',
   *   organizationId: 'org-123',
   *   defaultFields: {
   *     manufacturer: 'Dell',
   *     warrantyPeriod: '3 years'
   *   },
   *   customFields: {
   *     type: 'object',
   *     properties: {
   *       cpuModel: { type: 'string' },
   *       ramSize: { type: 'number', minimum: 4 }
   *     }
   *   }
   * });
   */
  async createTemplate(data: CreateAssetTemplateData): Promise<AssetTemplate> {
    const {
      name,
      description,
      category,
      defaultFields = {},
      customFields = {},
      organizationId,
    } = data;

    // Check if organization exists
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundError('Organization');
    }

    // Validate custom fields schema
    if (!this.validateCustomFieldSchema(customFields)) {
      throw new AppError('Invalid custom field schema provided', 400);
    }

    // Check for name uniqueness within organization
    const existingTemplate = await prisma.assetTemplate.findFirst({
      where: {
        organizationId,
        name,
      },
    });

    if (existingTemplate) {
      throw new ConflictError(`A template named "${name}" already exists in this organization`);
    }

    // Create the template
    const template = await prisma.assetTemplate.create({
      data: {
        name,
        description,
        category,
        defaultFields: defaultFields as Prisma.InputJsonValue,
        customFields: customFields as Prisma.InputJsonValue,
        organizationId,
      },
    });

    return template;
  }

  /**
   * Get template by ID with optional organization filtering.
   *
   * @param {string} id - The template ID
   * @param {string} [organizationId] - Optional organization ID for access control
   * @returns {Promise<AssetTemplate | null>} The template or null if not found
   *
   * @example
   * const template = await templateService.getTemplateById('template-123', 'org-456');
   */
  async getTemplateById(id: string, organizationId?: string): Promise<AssetTemplate | null> {
    const where: Prisma.AssetTemplateWhereInput = { id };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    return prisma.assetTemplate.findFirst({ where });
  }

  /**
   * Update asset template with validation for active templates.
   * Prevents breaking changes to templates that are in use by assets.
   *
   * @param {string} id - The template ID to update
   * @param {UpdateAssetTemplateData} data - Update data
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<AssetTemplate>} The updated template
   * @throws {NotFoundError} If template not found
   * @throws {ConflictError} If trying to modify schema/category of template in use
   * @throws {AppError} If custom field schema is invalid
   *
   * @example
   * // Safe update - only changing name and description
   * const updated = await templateService.updateTemplate('template-123', {
   *   name: 'Updated Laptop Template',
   *   description: 'Template for company laptops'
   * }, 'org-456');
   *
   * // Will throw if template is in use by assets
   * const schemaUpdate = await templateService.updateTemplate('template-123', {
   *   customFields: { ...newSchema }
   * }, 'org-456');
   */
  async updateTemplate(
    id: string,
    data: UpdateAssetTemplateData,
    organizationId: string,
  ): Promise<AssetTemplate> {
    // Check if template exists and belongs to organization
    const template = await this.getTemplateById(id, organizationId);
    if (!template) {
      throw new NotFoundError('Asset template');
    }

    const { name, description, category, defaultFields, customFields, isActive } = data;

    // If updating critical fields (customFields or category), check if template is in use
    if ((customFields !== undefined || category !== undefined) && template.isActive) {
      const assetCount = await prisma.asset.count({
        where: { assetTemplateId: id, organizationId },
      });

      if (assetCount > 0) {
        throw new ConflictError(
          'Cannot modify custom fields or category of a template that is in use. Please clone it to create a new version.',
        );
      }
    }

    // Validate custom fields schema if provided
    if (customFields !== undefined && !this.validateCustomFieldSchema(customFields)) {
      throw new AppError('Invalid custom field schema provided', 400);
    }

    // Check for name uniqueness if name is being changed
    if (name && name !== template.name) {
      const existingTemplate = await prisma.assetTemplate.findFirst({
        where: {
          organizationId,
          name,
          id: { not: id },
        },
      });

      if (existingTemplate) {
        throw new ConflictError(`A template named "${name}" already exists in this organization`);
      }
    }

    // Update template
    const updatedTemplate = await prisma.assetTemplate.update({
      where: { id },
      data: {
        name,
        description,
        category,
        defaultFields: defaultFields as Prisma.InputJsonValue,
        customFields: customFields as Prisma.InputJsonValue,
        isActive,
      },
    });

    return updatedTemplate;
  }

  /**
   * Delete template (soft delete by marking as inactive).
   * Templates in use by assets cannot be deleted.
   *
   * @param {string} id - The template ID to delete
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<void>}
   * @throws {NotFoundError} If template not found
   * @throws {ConflictError} If template is in use by assets
   *
   * @example
   * await templateService.deleteTemplate('template-123', 'org-456');
   */
  async deleteTemplate(id: string, organizationId: string): Promise<void> {
    const template = await this.getTemplateById(id, organizationId);
    if (!template) {
      throw new NotFoundError('Asset template');
    }

    // Check if template is in use
    const assetCount = await prisma.asset.count({
      where: { assetTemplateId: id, organizationId },
    });

    if (assetCount > 0) {
      throw new ConflictError('Cannot delete a template that is in use by assets');
    }

    // Soft delete by marking as inactive
    await prisma.assetTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Clone an existing template to create a new version.
   * Useful when needing to modify a template that's in use.
   *
   * @param {string} templateId - The ID of template to clone
   * @param {string} organizationId - Organization ID for access control
   * @param {string} [newName] - Optional name for the clone, defaults to "Original (Copy)"
   * @returns {Promise<AssetTemplate>} The cloned template
   * @throws {NotFoundError} If template not found
   * @throws {ConflictError} If clone name already exists
   *
   * @example
   * // Clone with auto-generated name
   * const clone = await templateService.cloneTemplate('template-123', 'org-456');
   *
   * // Clone with custom name
   * const clone = await templateService.cloneTemplate(
   *   'template-123',
   *   'org-456',
   *   'Laptop Template v2'
   * );
   */
  async cloneTemplate(
    templateId: string,
    organizationId: string,
    newName?: string,
  ): Promise<AssetTemplate> {
    const original = await this.getTemplateById(templateId, organizationId);
    if (!original) {
      throw new NotFoundError('Asset template');
    }

    const cloneName = newName || `${original.name} (Copy)`;

    // Check name uniqueness
    const existingTemplate = await prisma.assetTemplate.findFirst({
      where: {
        organizationId,
        name: cloneName,
      },
    });

    if (existingTemplate) {
      throw new ConflictError(
        `A template named "${cloneName}" already exists in this organization`,
      );
    }

    // Clone the template
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, createdAt, updatedAt, ...dataToClone } = original;

    return prisma.assetTemplate.create({
      data: {
        ...dataToClone,
        name: cloneName,
        isActive: true,
        defaultFields: dataToClone.defaultFields as Prisma.InputJsonValue,
        customFields: dataToClone.customFields as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Search and filter templates with pagination.
   * Supports filtering by name, category, custom fields, and active status.
   *
   * @param {string} organizationId - Organization ID to search within
   * @param {QueryAssetTemplateOptions} [options={}] - Search and pagination options
   * @returns {Promise<AssetTemplateSearchResult>} Paginated search results
   *
   * @example
   * // Search for equipment templates with custom field
   * const results = await templateService.findTemplates('org-123', {
   *   category: 'EQUIPMENT',
   *   hasCustomField: 'cpuModel',
   *   page: 1,
   *   limit: 20,
   *   sortBy: 'name',
   *   sortOrder: 'asc'
   * });
   *
   * // Search including inactive templates
   * const allTemplates = await templateService.findTemplates('org-123', {
   *   includeInactive: true
   * });
   */
  async findTemplates(
    organizationId: string,
    options: QueryAssetTemplateOptions = {},
  ): Promise<AssetTemplateSearchResult> {
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      name,
      category,
      hasCustomField,
      customFieldSearch,
      includeInactive = false,
    } = options;

    const skip = (page - 1) * limit;

    const whereConditions: Prisma.AssetTemplateWhereInput[] = [];

    // Base organization filter
    whereConditions.push({ organizationId });

    // Include only active templates unless specified otherwise
    if (!includeInactive) {
      whereConditions.push({ isActive: true });
    }

    // Search by template name
    if (name) {
      whereConditions.push({ name: { contains: name, mode: 'insensitive' } });
    }

    // Filter by category
    if (category) {
      whereConditions.push({ category: { equals: category } });
    }

    // Filter by custom field existence
    if (hasCustomField) {
      whereConditions.push({
        customFields: {
          path: ['properties', hasCustomField],
          not: Prisma.JsonNull,
        },
      });
    }

    // Search within custom field definitions
    if (customFieldSearch) {
      whereConditions.push({
        customFields: {
          string_contains: customFieldSearch,
        },
      });
    }

    const where: Prisma.AssetTemplateWhereInput =
      whereConditions.length === 1 ? whereConditions[0]! : { AND: whereConditions };

    // Execute query with transaction for consistency
    const [templates, total] = await prisma.$transaction([
      prisma.assetTemplate.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      prisma.assetTemplate.count({ where }),
    ]);

    return {
      data: templates,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all templates for an organization (simple list).
   * Returns all templates without pagination, sorted by name.
   *
   * @param {string} organizationId - Organization ID
   * @param {boolean} [includeInactive=false] - Whether to include inactive templates
   * @returns {Promise<AssetTemplate[]>} Array of templates
   *
   * @example
   * // Get active templates only
   * const templates = await templateService.findByOrganization('org-123');
   *
   * // Get all templates including inactive
   * const allTemplates = await templateService.findByOrganization('org-123', true);
   */
  async findByOrganization(
    organizationId: string,
    includeInactive = false,
  ): Promise<AssetTemplate[]> {
    const where: Prisma.AssetTemplateWhereInput = { organizationId };

    if (!includeInactive) {
      where.isActive = true;
    }

    return prisma.assetTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get multiple templates by their IDs.
   *
   * @param {string[]} ids - Array of template IDs
   * @param {string} [organizationId] - Optional organization ID for filtering
   * @returns {Promise<AssetTemplate[]>} Array of found templates
   *
   * @example
   * const templates = await templateService.findByIds(
   *   ['template-1', 'template-2', 'template-3'],
   *   'org-123'
   * );
   */
  async findByIds(ids: string[], organizationId?: string): Promise<AssetTemplate[]> {
    const where: Prisma.AssetTemplateWhereInput = {
      id: { in: ids },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }

    return prisma.assetTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Export templates for backup or sharing.
   * Removes organization-specific and auto-generated fields.
   *
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Array>} Array of templates ready for export
   *
   * @example
   * const exportData = await templateService.exportTemplates('org-123');
   * // Save to file or share with another organization
   * fs.writeFileSync('templates.json', JSON.stringify(exportData));
   */
  async exportTemplates(
    organizationId: string,
  ): Promise<Omit<AssetTemplate, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>[]> {
    const templates = await prisma.assetTemplate.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: 'asc' },
    });

    // Remove organization-specific and auto-generated fields for export
    return templates.map((template) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, organizationId, createdAt, updatedAt, ...exportData } = template;
      return exportData;
    });
  }

  /**
   * Import templates from exported data.
   * Handles naming conflicts based on specified strategy.
   *
   * @param {string} organizationId - Organization ID to import into
   * @param {Array} templates - Array of template data to import
   * @param {'fail' | 'skip' | 'rename'} [conflictStrategy='skip'] - How to handle name conflicts:
   *   - 'fail': Stop and report error
   *   - 'skip': Skip conflicting templates
   *   - 'rename': Auto-rename conflicting templates
   * @returns {Promise<Object>} Import results with counts and errors
   *
   * @example
   * const importData = JSON.parse(fs.readFileSync('templates.json'));
   *
   * // Import with skip strategy (default)
   * const results = await templateService.importTemplates('org-123', importData);
   * console.log(`Imported ${results.created}, skipped ${results.skipped}`);
   *
   * // Import with rename strategy
   * const results = await templateService.importTemplates(
   *   'org-123',
   *   importData,
   *   'rename'
   * );
   */
  async importTemplates(
    organizationId: string,
    templates: Omit<AssetTemplate, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>[],
    conflictStrategy: 'fail' | 'skip' | 'rename' = 'skip',
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (const templateData of templates) {
      try {
        const { name, description, category, defaultFields, customFields } = templateData;

        // Check if template already exists
        const existing = await prisma.assetTemplate.findFirst({
          where: { organizationId, name },
        });

        if (existing) {
          if (conflictStrategy === 'fail') {
            results.errors.push(`Template "${name}" already exists`);
            continue;
          } else if (conflictStrategy === 'skip') {
            results.skipped++;
            continue;
          } else if (conflictStrategy === 'rename') {
            // Find a unique name
            let uniqueName = `${name} (Imported)`;
            let counter = 1;
            while (
              await prisma.assetTemplate.findFirst({ where: { organizationId, name: uniqueName } })
            ) {
              uniqueName = `${name} (Imported ${counter++})`;
            }

            await this.createTemplate({
              name: uniqueName,
              description: description || undefined,
              category,
              defaultFields: (defaultFields as Record<string, unknown>) || {},
              customFields: (customFields as Record<string, unknown>) || {},
              organizationId,
            });
            results.created++;
          }
        } else {
          await this.createTemplate({
            name,
            description: description || undefined,
            category,
            defaultFields: (defaultFields as Record<string, unknown>) || {},
            customFields: (customFields as Record<string, unknown>) || {},
            organizationId,
          });
          results.created++;
        }
      } catch (error) {
        results.errors.push(
          `Failed to import template "${templateData.name}": ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return results;
  }

  /**
   * Get template usage statistics.
   * Provides insights into how a template is being used.
   *
   * @param {string} id - Template ID
   * @param {string} organizationId - Organization ID for access control
   * @returns {Promise<Object>} Usage statistics including:
   *   - assetCount: Number of assets using this template
   *   - lastUsed: Date when template was last used to create an asset
   *   - isInUse: Whether template is currently in use
   * @throws {NotFoundError} If template not found
   *
   * @example
   * const stats = await templateService.getTemplateStats('template-123', 'org-456');
   * if (stats.isInUse) {
   *   console.log(`Template used by ${stats.assetCount} assets`);
   *   console.log(`Last used: ${stats.lastUsed}`);
   * }
   */
  async getTemplateStats(
    id: string,
    organizationId: string,
  ): Promise<{
    assetCount: number;
    lastUsed: Date | null;
    isInUse: boolean;
  }> {
    const template = await this.getTemplateById(id, organizationId);
    if (!template) {
      throw new NotFoundError('Asset template');
    }

    const [assetCount, lastAsset] = await prisma.$transaction([
      prisma.asset.count({ where: { assetTemplateId: id, organizationId } }),
      prisma.asset.findFirst({
        where: { assetTemplateId: id, organizationId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      assetCount,
      lastUsed: lastAsset?.createdAt || null,
      isInUse: assetCount > 0,
    };
  }

  /**
   * Validate custom field values against a template's schema.
   * Uses AJV to validate values conform to the template's JSON schema.
   *
   * @param {string} templateId - Template ID containing the schema
   * @param {Record<string, unknown>} values - Values to validate
   * @returns {Promise<Object>} Validation result with:
   *   - valid: Whether values pass validation
   *   - errors: Array of validation error messages
   * @throws {NotFoundError} If template not found
   *
   * @example
   * const validation = await templateService.validateCustomFieldValues(
   *   'template-123',
   *   {
   *     cpuModel: 'Intel i7-12700K',
   *     ramSize: 32
   *   }
   * );
   *
   * if (!validation.valid) {
   *   console.error('Validation errors:', validation.errors);
   * }
   */
  async validateCustomFieldValues(
    templateId: string,
    values: Record<string, unknown>,
    organizationId: string,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const template = await prisma.assetTemplate.findFirst({
      where: { id: templateId, organizationId },
      select: { customFields: true },
    });

    if (!template) {
      throw new NotFoundError('Asset template');
    }

    const schema = template.customFields as Record<string, unknown>;

    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true, errors: [] };
    }

    try {
      const validator = this.ajv.compile(schema);
      const valid = validator(values);

      return {
        valid,
        errors: valid
          ? []
          : validator.errors?.map((err) => `${err.instancePath} ${err.message}`) || [],
      };
    } catch (error) {
      return {
        valid: false,
        errors: [
          `Schema validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }
}
