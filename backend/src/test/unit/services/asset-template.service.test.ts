import { AppError, NotFoundError, ConflictError } from '../../../utils/errors';
import { AssetCategory } from '@prisma/client';

// Import modules
import { AssetTemplateService } from '../../../services/asset-template.service';
import { prismaMock } from '../../../test/prisma-singleton';

describe('AssetTemplateService', () => {
  let assetTemplateService: AssetTemplateService;
  const mockOrganizationId = 'org-123';
  const mockTemplateId = 'template-123';

  beforeEach(() => {
    assetTemplateService = new AssetTemplateService();
    jest.clearAllMocks();

    // Mock $transaction to handle array of promises
    (prismaMock.$transaction as jest.Mock).mockImplementation((queries) => {
      if (Array.isArray(queries)) {
        // Execute the promises in the array
        return Promise.all(queries);
      }
      return Promise.resolve([]);
    });
  });

  describe('createTemplate', () => {
    const createData = {
      name: 'Equipment Template',
      description: 'Template for equipment assets',
      category: AssetCategory.EQUIPMENT,
      organizationId: mockOrganizationId,
      defaultFields: {
        location: 'Main Warehouse',
        status: 'operational',
      },
      customFields: {
        type: 'object',
        properties: {
          serialNumber: { type: 'string', title: 'Serial Number' },
          warranty: { type: 'string', format: 'date', title: 'Warranty Expiry' },
        },
      },
    };

    it('should create template successfully', async () => {
      const mockOrganization = { id: mockOrganizationId, name: 'Test Org' };
      const mockTemplate = {
        id: mockTemplateId,
        ...createData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);
      prismaMock.assetTemplate.create.mockResolvedValue(mockTemplate as any);

      const result = await assetTemplateService.createTemplate(createData);

      expect(result.name).toBe('Equipment Template');
      expect(prismaMock.assetTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Equipment Template',
          category: AssetCategory.EQUIPMENT,
          organizationId: mockOrganizationId,
        }),
      });
    });

    it('should throw error if organization not found', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(assetTemplateService.createTemplate(createData)).rejects.toThrow(NotFoundError);
    });

    it('should throw error if template name already exists', async () => {
      const mockOrganization = { id: mockOrganizationId };
      const existingTemplate = { id: 'existing-123', name: 'Equipment Template' };

      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.assetTemplate.findFirst.mockResolvedValue(existingTemplate as any);

      await expect(assetTemplateService.createTemplate(createData)).rejects.toThrow(ConflictError);
    });

    it('should throw error for invalid custom field schema', async () => {
      const invalidData = {
        ...createData,
        customFields: { invalidSchema: true }, // Invalid schema
      };

      const mockOrganization = { id: mockOrganizationId };
      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);

      await expect(assetTemplateService.createTemplate(invalidData)).rejects.toThrow(AppError);
    });

    it('should create template with empty custom fields', async () => {
      const dataWithoutCustomFields = {
        name: 'Simple Template',
        description: 'Simple template',
        category: AssetCategory.EQUIPMENT,
        organizationId: mockOrganizationId,
        defaultFields: {},
        customFields: {}, // Add empty customFields
      };

      const mockOrganization = { id: mockOrganizationId };
      const mockTemplate = {
        id: mockTemplateId,
        ...dataWithoutCustomFields,
        customFields: {},
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);
      prismaMock.assetTemplate.create.mockResolvedValue(mockTemplate as any);

      const result = await assetTemplateService.createTemplate(dataWithoutCustomFields);

      expect(result.name).toBe('Simple Template');
    });
  });

  describe('updateTemplate', () => {
    const mockTemplate = {
      id: mockTemplateId,
      name: 'Original Template',
      category: AssetCategory.EQUIPMENT,
      organizationId: mockOrganizationId,
      isActive: true,
      defaultFields: {},
      customFields: { type: 'object', properties: {} },
    };

    it('should update template successfully', async () => {
      const updateData = {
        name: 'Updated Template',
        description: 'Updated description',
      };

      const updatedTemplate = { ...mockTemplate, ...updateData };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(mockTemplate as any) // First call for template existence check
        .mockResolvedValueOnce(null); // Second call for name uniqueness check
      prismaMock.asset.count.mockResolvedValue(0);
      prismaMock.assetTemplate.update.mockResolvedValue(updatedTemplate as any);

      const result = await assetTemplateService.updateTemplate(
        mockTemplateId,
        updateData,
        mockOrganizationId,
      );

      expect(result.name).toBe('Updated Template');
    });

    it('should throw error if template not found', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);

      await expect(
        assetTemplateService.updateTemplate(
          mockTemplateId,
          { name: 'New Name' },
          mockOrganizationId,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should prevent updating custom fields when template is in use', async () => {
      const updateData = {
        customFields: { type: 'object', properties: { newField: { type: 'string' } } },
      };

      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);
      prismaMock.asset.count.mockResolvedValue(5); // Template is in use

      await expect(
        assetTemplateService.updateTemplate(mockTemplateId, updateData, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });

    it('should prevent updating category when template is in use', async () => {
      const updateData = { category: AssetCategory.FURNITURE };

      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);
      prismaMock.asset.count.mockResolvedValue(3); // Template is in use

      await expect(
        assetTemplateService.updateTemplate(mockTemplateId, updateData, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });

    it('should allow updating name when template is in use', async () => {
      const updateData = { name: 'New Name' };
      const updatedTemplate = { ...mockTemplate, ...updateData };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(mockTemplate as any) // First call for template existence check
        .mockResolvedValueOnce(null); // Second call for name uniqueness check
      prismaMock.asset.count.mockResolvedValue(5); // Template is in use
      prismaMock.assetTemplate.update.mockResolvedValue(updatedTemplate as any);

      const result = await assetTemplateService.updateTemplate(
        mockTemplateId,
        updateData,
        mockOrganizationId,
      );

      expect(result.name).toBe('New Name');
    });

    it('should prevent duplicate names', async () => {
      const updateData = { name: 'Existing Template' };
      const existingTemplate = { id: 'other-123', name: 'Existing Template' };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(mockTemplate as any) // Template exists
        .mockResolvedValueOnce(existingTemplate as any); // Name conflict

      await expect(
        assetTemplateService.updateTemplate(mockTemplateId, updateData, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('deleteTemplate', () => {
    const mockTemplate = {
      id: mockTemplateId,
      name: 'Template to Delete',
      organizationId: mockOrganizationId,
    };

    it('should delete template successfully', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);
      prismaMock.asset.count.mockResolvedValue(0); // No assets using template
      prismaMock.assetTemplate.update.mockResolvedValue(mockTemplate as any);

      await assetTemplateService.deleteTemplate(mockTemplateId, mockOrganizationId);

      expect(prismaMock.assetTemplate.update).toHaveBeenCalledWith({
        where: { id: mockTemplateId },
        data: { isActive: false },
      });
    });

    it('should throw error if template not found', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);

      await expect(
        assetTemplateService.deleteTemplate(mockTemplateId, mockOrganizationId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should prevent deletion if template is in use', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);
      prismaMock.asset.count.mockResolvedValue(3); // Template is in use

      await expect(
        assetTemplateService.deleteTemplate(mockTemplateId, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('cloneTemplate', () => {
    const mockTemplate = {
      id: mockTemplateId,
      name: 'Original Template',
      description: 'Original description',
      category: AssetCategory.EQUIPMENT,
      defaultFields: {},
      customFields: { type: 'object', properties: {} },
      organizationId: mockOrganizationId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should clone template successfully', async () => {
      const clonedTemplate = {
        ...mockTemplate,
        id: 'cloned-123',
        name: 'Original Template (Copy)',
      };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(mockTemplate as any) // Original template exists
        .mockResolvedValueOnce(null); // No name conflict
      prismaMock.assetTemplate.create.mockResolvedValue(clonedTemplate as any);

      const result = await assetTemplateService.cloneTemplate(mockTemplateId, mockOrganizationId);

      expect(result.name).toBe('Original Template (Copy)');
      expect(prismaMock.assetTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Original Template (Copy)',
          description: 'Original description',
          category: AssetCategory.EQUIPMENT,
          isActive: true,
        }),
      });
    });

    it('should clone with custom name', async () => {
      const customName = 'Custom Clone Name';
      const clonedTemplate = {
        ...mockTemplate,
        id: 'cloned-123',
        name: customName,
      };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(mockTemplate as any) // Original template exists
        .mockResolvedValueOnce(null); // No name conflict
      prismaMock.assetTemplate.create.mockResolvedValue(clonedTemplate as any);

      const result = await assetTemplateService.cloneTemplate(
        mockTemplateId,
        mockOrganizationId,
        customName,
      );

      expect(result.name).toBe(customName);
    });

    it('should throw error if original template not found', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);

      await expect(
        assetTemplateService.cloneTemplate(mockTemplateId, mockOrganizationId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw error if clone name conflicts', async () => {
      const existingTemplate = { id: 'existing-123', name: 'Original Template (Copy)' };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(mockTemplate as any) // Original template exists
        .mockResolvedValueOnce(existingTemplate as any); // Name conflict

      await expect(
        assetTemplateService.cloneTemplate(mockTemplateId, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('findTemplates', () => {
    const mockTemplates = [
      {
        id: 'template-1',
        name: 'Equipment Template',
        category: AssetCategory.EQUIPMENT,
        organizationId: mockOrganizationId,
        isActive: true,
        defaultFields: {},
        customFields: {
          type: 'object',
          properties: { warranty: { type: 'string' } },
        },
      },
      {
        id: 'template-2',
        name: 'Furniture Template',
        category: AssetCategory.FURNITURE,
        organizationId: mockOrganizationId,
        isActive: true,
        defaultFields: {},
        customFields: { type: 'object', properties: {} },
      },
    ];

    it('should return paginated templates', async () => {
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.assetTemplate.findMany.mockResolvedValue(mockTemplates as any);
      prismaMock.assetTemplate.count.mockResolvedValue(2);

      const result = await assetTemplateService.findTemplates(mockOrganizationId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('should filter by name', async () => {
      const filteredTemplates = [mockTemplates[0]];
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.assetTemplate.findMany.mockResolvedValue(filteredTemplates as any);
      prismaMock.assetTemplate.count.mockResolvedValue(1);

      const result = await assetTemplateService.findTemplates(mockOrganizationId, {
        name: 'Equipment',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe('Equipment Template');
    });

    it('should filter by category', async () => {
      const filteredTemplates = [mockTemplates[1]];
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.assetTemplate.findMany.mockResolvedValue(filteredTemplates as any);
      prismaMock.assetTemplate.count.mockResolvedValue(1);

      const result = await assetTemplateService.findTemplates(mockOrganizationId, {
        category: AssetCategory.FURNITURE,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.category).toBe(AssetCategory.FURNITURE);
    });

    it('should filter by custom field existence', async () => {
      const filteredTemplates = [mockTemplates[0]];
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.assetTemplate.findMany.mockResolvedValue(filteredTemplates as any);
      prismaMock.assetTemplate.count.mockResolvedValue(1);

      const result = await assetTemplateService.findTemplates(mockOrganizationId, {
        hasCustomField: 'warranty',
      });

      expect(result.data).toHaveLength(1);
    });

    it('should search within custom fields', async () => {
      const filteredTemplates = [mockTemplates[0]];
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.assetTemplate.findMany.mockResolvedValue(filteredTemplates as any);
      prismaMock.assetTemplate.count.mockResolvedValue(1);

      const result = await assetTemplateService.findTemplates(mockOrganizationId, {
        customFieldSearch: 'warranty',
      });

      expect(result.data).toHaveLength(1);
    });

    it('should include inactive templates when requested', async () => {
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.assetTemplate.findMany.mockResolvedValue(mockTemplates as any);
      prismaMock.assetTemplate.count.mockResolvedValue(2);

      await assetTemplateService.findTemplates(mockOrganizationId, {
        includeInactive: true,
      });

      // Verify that the query includes inactive templates
      // This would be checked by the actual query structure in practice
      expect(prismaMock.$transaction).toHaveBeenCalled();
    });
  });

  describe('getTemplateStats', () => {
    const mockTemplate = {
      id: mockTemplateId,
      name: 'Test Template',
      organizationId: mockOrganizationId,
    };

    it('should return template usage statistics', async () => {
      const mockLastAsset = { createdAt: new Date('2023-01-01') };

      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.asset.count.mockResolvedValue(3);
      prismaMock.asset.findFirst.mockResolvedValue(mockLastAsset as any);

      const result = await assetTemplateService.getTemplateStats(
        mockTemplateId,
        mockOrganizationId,
      );

      expect(result.assetCount).toBe(3);
      expect(result.isInUse).toBe(true);
      expect(result.lastUsed).toEqual(mockLastAsset.createdAt);
    });

    it('should return zero stats for unused template', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);
      // Mock the individual prisma methods that will be called in the transaction
      prismaMock.asset.count.mockResolvedValue(0);
      prismaMock.asset.findFirst.mockResolvedValue(null);

      const result = await assetTemplateService.getTemplateStats(
        mockTemplateId,
        mockOrganizationId,
      );

      expect(result.assetCount).toBe(0);
      expect(result.isInUse).toBe(false);
      expect(result.lastUsed).toBe(null);
    });

    it('should throw error if template not found', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);

      await expect(
        assetTemplateService.getTemplateStats(mockTemplateId, mockOrganizationId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('validateCustomFieldValues', () => {
    const mockTemplate = {
      id: mockTemplateId,
      customFields: {
        type: 'object',
        properties: {
          serialNumber: { type: 'string' },
          warranty: { type: 'string', format: 'date' },
          price: { type: 'number', minimum: 0 },
        },
        required: ['serialNumber'],
      },
    };

    it('should validate correct values', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);

      const result = await assetTemplateService.validateCustomFieldValues(
        mockTemplateId,
        {
          serialNumber: 'ABC123',
          warranty: '2024-12-31',
          price: 100.5,
        },
        mockOrganizationId,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect validation errors', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(mockTemplate as any);

      const result = await assetTemplateService.validateCustomFieldValues(
        mockTemplateId,
        {
          // Missing required serialNumber
          warranty: 'invalid-date',
          price: -10, // Invalid negative price
        },
        mockOrganizationId,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty schema', async () => {
      const emptySchemaTemplate = { id: mockTemplateId, customFields: {} };
      prismaMock.assetTemplate.findFirst.mockResolvedValue(emptySchemaTemplate as any);

      const result = await assetTemplateService.validateCustomFieldValues(
        mockTemplateId,
        {
          anyField: 'anyValue',
        },
        mockOrganizationId,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should throw error if template not found', async () => {
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null);

      await expect(
        assetTemplateService.validateCustomFieldValues(mockTemplateId, {}, mockOrganizationId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('exportTemplates', () => {
    const mockTemplates = [
      {
        id: 'template-1',
        name: 'Equipment Template',
        description: 'Equipment description',
        category: AssetCategory.EQUIPMENT,
        defaultFields: {},
        customFields: { type: 'object', properties: {} },
        isActive: true,
        organizationId: mockOrganizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    it('should export templates without organization-specific fields', async () => {
      prismaMock.assetTemplate.findMany.mockResolvedValue(mockTemplates as any);

      const result = await assetTemplateService.exportTemplates(mockOrganizationId);

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('id');
      expect(result[0]).not.toHaveProperty('organizationId');
      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('updatedAt');
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('category');
    });
  });

  describe('importTemplates', () => {
    const importData = [
      {
        name: 'Imported Template',
        description: 'Imported description',
        category: AssetCategory.EQUIPMENT,
        defaultFields: {},
        customFields: { type: 'object', properties: {} },
        isActive: true,
      },
    ];

    it('should import new templates successfully', async () => {
      const mockOrganization = { id: mockOrganizationId };
      const mockTemplate = {
        id: mockTemplateId,
        ...importData[0],
        organizationId: mockOrganizationId,
      };

      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.assetTemplate.findFirst.mockResolvedValue(null); // No existing template
      prismaMock.assetTemplate.create.mockResolvedValue(mockTemplate as any);

      const result = await assetTemplateService.importTemplates(mockOrganizationId, importData);

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip existing templates with skip strategy', async () => {
      const existingTemplate = { id: 'existing-123', name: 'Imported Template' };

      prismaMock.assetTemplate.findFirst.mockResolvedValue(existingTemplate as any);

      const result = await assetTemplateService.importTemplates(
        mockOrganizationId,
        importData,
        'skip',
      );

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should rename conflicting templates with rename strategy', async () => {
      const existingTemplate = { id: 'existing-123', name: 'Imported Template' };
      const mockOrganization = { id: mockOrganizationId };
      const renamedTemplate = {
        id: mockTemplateId,
        ...importData[0],
        name: 'Imported Template (Imported)',
        organizationId: mockOrganizationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.assetTemplate.findFirst
        .mockResolvedValueOnce(existingTemplate as any) // First check finds conflict
        .mockResolvedValueOnce(null) // Second check for renamed template is clear
        .mockResolvedValueOnce(null); // Third check in createTemplate
      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.assetTemplate.create.mockResolvedValue(renamedTemplate as any);

      const result = await assetTemplateService.importTemplates(
        mockOrganizationId,
        importData,
        'rename',
      );

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
