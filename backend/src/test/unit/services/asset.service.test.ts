import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AssetCategory, AssetStatus, Prisma, UserRole } from '@prisma/client';
import { AppError, NotFoundError, ConflictError } from '../../../utils/errors';
import type { IRequestContext } from '../../../interfaces/context.interface';

// Enable automatic mocking for Prisma and dependencies
jest.mock('../../../lib/prisma');
jest.mock('../../../services/asset-template.service');
jest.mock('../../../services/location.service');
jest.mock('../../../services/activity-stream.service');
jest.mock('../../../services/audit.service');

// Import modules after mocking
import type { AssetWithRelations } from '../../../services/asset.service';
import { AssetService } from '../../../services/asset.service';
import { prisma } from '../../../lib/prisma';
import type { AssetTemplateService } from '../../../services/asset-template.service';
import type { LocationService } from '../../../services/location.service';

// Type the mocked modules
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
jest.mock('../../../services/webhook.service', () => ({
  webhookService: {
    emitEvent: jest.fn().mockResolvedValue(undefined),
    createEnhancedEvent: jest.fn().mockResolvedValue({ id: 'event-123' }),
  },
}));


describe('AssetService', () => {
  let assetService: AssetService;
  let mockAssetTemplateService: jest.Mocked<AssetTemplateService>;
  let mockLocationService: jest.Mocked<LocationService>;

  const mockOrganizationId = 'org-123';
  const mockAssetId = 'asset-123';

  const mockContext: IRequestContext = {
    userId: 'user-123',
    userRole: UserRole.MEMBER,
    organizationId: mockOrganizationId,
    requestId: 'req-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock $executeRawUnsafe on the main prisma mock
    (mockPrisma.$executeRawUnsafe as jest.Mock).mockResolvedValue(undefined);

    // Create service instance with mock Prisma
    assetService = new AssetService(mockPrisma);

    // Get mocked instances
    mockAssetTemplateService = (assetService as any).assetTemplateService;
    mockLocationService = (assetService as any).locationService;

    // Mock $transaction to handle both callback and array forms
    (mockPrisma.$transaction as jest.Mock).mockImplementation((queries) => {
      if (Array.isArray(queries)) {
        // Return mock results for the queries
        return Promise.resolve([[], 0]);
      }
      if (typeof queries === 'function') {
        // For callback-based transactions, pass the mocked prisma client
        const txMock = {
          asset: {
            create: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
          },
          auditTrail: {
            create: jest.fn(),
          },
          location: {
            findFirst: jest.fn(),
          },
          organization: {
            findUnique: jest.fn(),
          },
          $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        };
        
        // Copy over the mock implementations for the transaction context
        txMock.asset.create.mockImplementation(mockPrisma.asset.create);
        txMock.asset.findFirst.mockImplementation(mockPrisma.asset.findFirst);
        txMock.asset.update.mockImplementation(mockPrisma.asset.update);
        txMock.asset.delete.mockImplementation(mockPrisma.asset.delete);
        txMock.asset.findMany.mockImplementation(mockPrisma.asset.findMany);
        txMock.asset.count.mockImplementation(mockPrisma.asset.count);
        txMock.auditTrail.create.mockResolvedValue({ id: 'audit-123' });
        txMock.location.findFirst.mockImplementation(mockPrisma.location.findFirst);
        txMock.organization.findUnique.mockImplementation(mockPrisma.organization.findUnique);
        
        // Store the transaction mock for test assertions
        (assetService as any)._lastTxMock = txMock;
        
        return queries(txMock);
      }
      return Promise.resolve([]);
    });
  });

  describe('createAsset', () => {
    const createData = {
      name: 'Test Asset',
      category: AssetCategory.EQUIPMENT,
      organizationId: mockOrganizationId,
      manufacturer: 'ACME Corp',
      modelNumber: 'MODEL-123',
      serialNumber: 'SN-123',
      purchasePrice: 1000,
      tags: ['test', 'equipment'],
    };

    it('should create asset successfully', async () => {
      const mockOrganization = { id: mockOrganizationId };
      const mockAssetId = 'asset-' + Math.random().toString(36).substring(2, 9);
      const mockAsset = {
        id: mockAssetId,
        ...createData,
        status: AssetStatus.OPERATIONAL,
        path: `/${mockAssetId}`,
        qrCode: `AST-${mockAssetId.substring(0, 8).toUpperCase()}`,
        customFields: null,
        parentId: null,
        locationId: null,
        assetTemplateId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization as any);
      mockPrisma.asset.findFirst.mockResolvedValue(null); // QR code check
      mockPrisma.asset.create.mockResolvedValue({
        ...mockAsset,
        location: null,
        assetTemplate: null,
        parent: null,
        _count: { children: 0, tasks: 0, attachments: 0 },
      } as any);

      const result = await assetService.createAsset(mockContext, createData);

      expect(result.name).toBe('Test Asset');
      expect(result.status).toBe(AssetStatus.OPERATIONAL);
      expect(typeof result.path).toBe('string');
      expect(result.path).toMatch(/^\/[a-zA-Z0-9-]+$/);
      expect(typeof result.qrCode).toBe('string');
      expect(result.qrCode).toMatch(/^AST-[A-Z0-9-]+$/);
      expect(mockPrisma.asset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Test Asset',
          category: AssetCategory.EQUIPMENT,
          status: AssetStatus.OPERATIONAL,
          organizationId: mockOrganizationId,
        }),
        include: expect.any(Object),
      });
    });

    it('should create asset with template', async () => {
      const templateId = 'template-123';
      const mockTemplate = {
        id: templateId,
        category: AssetCategory.EQUIPMENT,
        defaultFields: { location: 'Warehouse', status: 'new' },
        customFields: { type: 'object', properties: {} },
      };
      const customFields = { serialNumber: 'ABC123' };

      const createDataWithTemplate = {
        ...createData,
        assetTemplateId: templateId,
        customFields,
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockAssetTemplateService.getTemplateById.mockResolvedValue(mockTemplate as any);
      mockAssetTemplateService.validateCustomFieldValues.mockResolvedValue({
        valid: true,
        errors: [],
      });
      mockPrisma.asset.findFirst.mockResolvedValue(null);
      mockPrisma.asset.create.mockResolvedValue({
        ...createDataWithTemplate,
        id: mockAssetId,
        status: AssetStatus.OPERATIONAL,
        path: `/${mockAssetId}`,
        qrCode: `AST-${mockAssetId.substring(0, 8)}`,
        customFields: { ...mockTemplate.defaultFields, ...customFields },
      } as any);

      const result = await assetService.createAsset(mockContext, createDataWithTemplate);

      expect(mockAssetTemplateService.getTemplateById).toHaveBeenCalledWith(
        templateId,
        mockOrganizationId,
      );
      expect(mockAssetTemplateService.validateCustomFieldValues).toHaveBeenCalledWith(
        templateId,
        customFields,
        mockOrganizationId,
      );
      expect(result.customFields).toEqual({
        location: 'Warehouse',
        status: 'new',
        serialNumber: 'ABC123',
      });
    });

    it('should create asset with location', async () => {
      const locationId = 'location-123';
      const mockLocation = {
        id: locationId,
        name: 'Warehouse A',
        organizationId: mockOrganizationId,
      };

      const createDataWithLocation = {
        ...createData,
        locationId,
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockLocationService.getLocationById.mockResolvedValue(mockLocation as any);
      mockPrisma.asset.findFirst.mockResolvedValue(null);
      mockPrisma.asset.create.mockResolvedValue({
        ...createDataWithLocation,
        id: mockAssetId,
        status: AssetStatus.OPERATIONAL,
        path: `/${mockAssetId}`,
        location: mockLocation,
      } as any);

      const result = await assetService.createAsset(mockContext, createDataWithLocation);

      expect(mockLocationService.getLocationById).toHaveBeenCalledWith(locationId, mockOrganizationId);
      expect(result.location?.id).toBe(locationId);
    });

    it('should throw error if location not in organization', async () => {
      const locationId = 'location-123';
      const mockLocation = {
        id: locationId,
        name: 'Warehouse A',
        organizationId: 'other-org', // Different org
      };

      const createDataWithLocation = {
        ...createData,
        locationId,
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockLocationService.getLocationById.mockResolvedValue(mockLocation as any);

      await expect(assetService.createAsset(mockContext, createDataWithLocation)).rejects.toThrow(ConflictError);
    });

    it('should create child asset', async () => {
      const parentId = 'parent-123';
      const mockParent = {
        id: parentId,
        name: 'Parent Asset',
        path: '/parent-123',
        organizationId: mockOrganizationId,
      };

      const createDataWithParent = {
        ...createData,
        parentId,
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockPrisma.asset.findFirst
        .mockResolvedValueOnce(mockParent as any) // Parent lookup
        .mockResolvedValueOnce(null); // QR code check
      mockPrisma.asset.create.mockResolvedValue({
        ...createDataWithParent,
        id: mockAssetId,
        status: AssetStatus.OPERATIONAL,
        path: `/parent-123/${mockAssetId}`,
        parent: mockParent,
      } as any);

      const result = await assetService.createAsset(mockContext, createDataWithParent);

      expect(result.path).toBe(`/parent-123/${mockAssetId}`);
      expect(result.parent?.id).toBe(parentId);
    });

    it('should throw error if organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(assetService.createAsset(mockContext, createData)).rejects.toThrow(NotFoundError);
    });

    it('should throw error if template category mismatches', async () => {
      const templateId = 'template-123';
      const mockTemplate = {
        id: templateId,
        category: AssetCategory.FURNITURE, // Different category
      };

      const createDataWithTemplate = {
        ...createData,
        assetTemplateId: templateId,
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockAssetTemplateService.getTemplateById.mockResolvedValue(mockTemplate as any);

      await expect(assetService.createAsset(mockContext, createDataWithTemplate)).rejects.toThrow(ConflictError);
    });

    it('should throw error if custom fields invalid', async () => {
      const templateId = 'template-123';
      const mockTemplate = {
        id: templateId,
        category: AssetCategory.EQUIPMENT,
        customFields: { type: 'object', properties: {} },
      };

      const createDataWithTemplate = {
        ...createData,
        assetTemplateId: templateId,
        customFields: { invalidField: 'value' },
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockAssetTemplateService.getTemplateById.mockResolvedValue(mockTemplate as any);
      mockAssetTemplateService.validateCustomFieldValues.mockResolvedValue({
        valid: false,
        errors: ['Invalid field: invalidField'],
      });

      await expect(assetService.createAsset(mockContext, createDataWithTemplate)).rejects.toThrow(AppError);
    });

    it('should throw error if QR code already exists', async () => {
      const customQrCode = 'CUSTOM-QR-123';
      const createDataWithQr = {
        ...createData,
        qrCode: customQrCode,
      };

      mockPrisma.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      mockPrisma.asset.findFirst.mockResolvedValue({ id: 'existing-asset' } as any);

      await expect(assetService.createAsset(mockContext, createDataWithQr)).rejects.toThrow(ConflictError);
    });
  });

  describe('updateAsset', () => {
    const mockAsset = {
      id: mockAssetId,
      name: 'Original Asset',
      category: AssetCategory.EQUIPMENT,
      status: AssetStatus.OPERATIONAL,
      path: `/${mockAssetId}`,
      organizationId: mockOrganizationId,
      parentId: null,
      locationId: null,
      assetTemplateId: null,
      customFields: null,
      qrCode: `AST-${mockAssetId.substring(0, 8)}`,
    };

    it('should update asset successfully', async () => {
      const updateData = {
        name: 'Updated Asset',
        description: 'Updated description',
        tags: ['updated', 'test'],
      };

      const updatedAsset = { ...mockAsset, ...updateData };

      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);
      mockPrisma.asset.update.mockResolvedValue(updatedAsset as any);

      const result = await assetService.updateAsset(
        mockContext,
        mockAssetId,
        updateData,
        mockOrganizationId,
      );

      expect(result.name).toBe('Updated Asset');
      expect(result.description).toBe('Updated description');
      expect(mockPrisma.asset.update).toHaveBeenCalledWith({
        where: { id: mockAssetId },
        data: expect.objectContaining({
          name: 'Updated Asset',
          description: 'Updated description',
        }),
        include: expect.any(Object),
      });
    });

    it('should update asset with new template', async () => {
      const newTemplateId = 'new-template-123';
      const mockTemplate = {
        id: newTemplateId,
        category: AssetCategory.EQUIPMENT, // Same category
      };

      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);
      mockAssetTemplateService.getTemplateById.mockResolvedValue(mockTemplate as any);
      mockPrisma.asset.update.mockResolvedValue({
        ...mockAsset,
        assetTemplateId: newTemplateId,
      } as any);

      const result = await assetService.updateAsset(
        mockContext,
        mockAssetId,
        { assetTemplateId: newTemplateId },
        mockOrganizationId,
      );

      expect(mockAssetTemplateService.getTemplateById).toHaveBeenCalledWith(
        newTemplateId,
        mockOrganizationId,
      );
      expect(result.assetTemplateId).toBe(newTemplateId);
    });

    it('should move asset to new parent', async () => {
      const newParentId = 'new-parent-123';
      const mockNewParent = {
        id: newParentId,
        path: '/new-parent-123',
        organizationId: mockOrganizationId,
      };

      // Mock asset with a different current parent to ensure parent is actually changing
      const mockAssetWithOldParent = {
        ...mockAsset,
        parentId: 'old-parent-123',
        path: '/old-parent-123/asset-123',
      };
      
      mockPrisma.asset.findFirst
        .mockResolvedValueOnce(mockAssetWithOldParent as any) // Asset lookup
        .mockResolvedValueOnce(mockNewParent as any); // New parent lookup
      mockPrisma.$executeRawUnsafe.mockResolvedValue(0); // Update descendants
      mockPrisma.asset.update.mockResolvedValue({
        ...mockAsset,
        parentId: newParentId,
        path: `/new-parent-123/${mockAssetId}`,
      } as any);

      const result = await assetService.updateAsset(
        mockContext,
        mockAssetId,
        { parentId: newParentId },
        mockOrganizationId,
      );

      expect(result.path).toBe(`/new-parent-123/${mockAssetId}`);
      // The $executeRawUnsafe should be called within the transaction context
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const lastTxMock = (assetService as any)._lastTxMock;
      expect(lastTxMock.$executeRawUnsafe).toHaveBeenCalled();
    });

    it('should prevent circular dependency when moving', async () => {
      const childId = 'child-123';
      const mockChild = {
        id: childId,
        path: `/${mockAssetId}/child-123`,
        organizationId: mockOrganizationId,
      };

      mockPrisma.asset.findFirst
        .mockResolvedValueOnce(mockAsset as any) // Asset lookup
        .mockResolvedValueOnce(mockChild as any); // New parent (child) lookup

      await expect(
        assetService.updateAsset(
          mockContext,
          mockAssetId,
          { parentId: childId },
          mockOrganizationId,
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('should validate QR code uniqueness', async () => {
      const newQrCode = 'NEW-QR-123';

      mockPrisma.asset.findFirst
        .mockResolvedValueOnce(mockAsset as any) // Asset lookup
        .mockResolvedValueOnce({ id: 'other-asset' } as any); // QR code conflict

      await expect(
        assetService.updateAsset(
          mockContext,
          mockAssetId,
          { qrCode: newQrCode },
          mockOrganizationId,
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('should throw error if asset not found', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(
        assetService.updateAsset(
          mockContext,
          mockAssetId,
          { name: 'New Name' },
          mockOrganizationId,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteAsset', () => {
    const mockAsset = {
      id: mockAssetId,
      name: 'Asset to Delete',
      organizationId: mockOrganizationId,
      _count: { children: 0, tasks: 0, attachments: 0 },
    };

    it('should delete asset successfully', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);
      mockPrisma.asset.delete.mockResolvedValue(mockAsset as any);

      await assetService.deleteAsset(mockContext, mockAssetId, mockOrganizationId);

      expect(mockPrisma.asset.delete).toHaveBeenCalledWith({
        where: { id: mockAssetId },
      });
    });

    it('should prevent deletion of asset with children', async () => {
      const assetWithChildren = {
        ...mockAsset,
        _count: { children: 2, tasks: 0, attachments: 0 },
      };

      mockPrisma.asset.findFirst.mockResolvedValue(assetWithChildren as any);

      await expect(assetService.deleteAsset(mockContext, mockAssetId, mockOrganizationId)).rejects.toThrow(
        ConflictError,
      );
    });

    it('should delete asset with children when cascade is true', async () => {
      const assetWithChildren = {
        ...mockAsset,
        _count: { children: 2, tasks: 0, attachments: 0 },
      };

      mockPrisma.asset.findFirst.mockResolvedValue(assetWithChildren as any);
      mockPrisma.asset.delete.mockResolvedValue(assetWithChildren as any);

      await assetService.deleteAsset(mockContext, mockAssetId, mockOrganizationId, true);

      expect(mockPrisma.asset.delete).toHaveBeenCalled();
    });

    it('should prevent deletion of asset with active tasks', async () => {
      const assetWithTasks = {
        ...mockAsset,
        _count: { children: 0, tasks: 3, attachments: 0 },
      };

      mockPrisma.asset.findFirst.mockResolvedValue(assetWithTasks as any);
      mockPrisma.task.count.mockResolvedValue(2); // Active tasks

      await expect(assetService.deleteAsset(mockContext, mockAssetId, mockOrganizationId)).rejects.toThrow(
        ConflictError,
      );
    });

    it('should throw error if asset not found', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(null);

      await expect(assetService.deleteAsset(mockContext, mockAssetId, mockOrganizationId)).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('findAssets', () => {
    const mockAssets = [
      {
        id: 'asset-1',
        name: 'Asset 1',
        category: AssetCategory.EQUIPMENT,
        status: AssetStatus.OPERATIONAL,
        organizationId: mockOrganizationId,
        tags: ['equipment', 'warehouse'],
      },
      {
        id: 'asset-2',
        name: 'Asset 2',
        category: AssetCategory.FURNITURE,
        status: AssetStatus.MAINTENANCE,
        organizationId: mockOrganizationId,
        tags: ['furniture', 'office'],
      },
    ];

    it('should return paginated assets', async () => {
      // Mock the individual prisma methods that will be called in the transaction
      mockPrisma.asset.findMany.mockResolvedValue(mockAssets as any);
      mockPrisma.asset.count.mockResolvedValue(2);

      // Override the default transaction mock for this test
      (mockPrisma.$transaction as jest.Mock).mockImplementationOnce((queries) => {
        // Execute the promises in the array
        return Promise.all(queries);
      });

      const result = await assetService.findAssets(mockOrganizationId, {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.lastPage).toBe(1);
    });

    it('should filter by name', async () => {
      const filteredAssets = [mockAssets[0]];
      // Mock the individual prisma methods that will be called in the transaction
      mockPrisma.asset.findMany.mockResolvedValue(filteredAssets as any);
      mockPrisma.asset.count.mockResolvedValue(1);

      // Override the default transaction mock for this test
      (mockPrisma.$transaction as jest.Mock).mockImplementationOnce((queries) => {
        // Execute the promises in the array
        return Promise.all(queries);
      });

      const result = await assetService.findAssets(mockOrganizationId, {
        name: 'Asset 1',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.name).toBe('Asset 1');
    });

    it('should filter by category', async () => {
      const filteredAssets = [mockAssets[1]];
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce([filteredAssets, 1]);

      const result = await assetService.findAssets(mockOrganizationId, {
        category: AssetCategory.FURNITURE,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.category).toBe(AssetCategory.FURNITURE);
    });

    it('should filter by status', async () => {
      const filteredAssets = [mockAssets[1]];
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce([filteredAssets, 1]);

      const result = await assetService.findAssets(mockOrganizationId, {
        status: AssetStatus.MAINTENANCE,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.status).toBe(AssetStatus.MAINTENANCE);
    });

    it('should filter by tags', async () => {
      const filteredAssets = [mockAssets[0]];
      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce([filteredAssets, 1]);

      const result = await assetService.findAssets(mockOrganizationId, {
        tags: ['warehouse'],
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.tags).toContain('warehouse');
    });

    it('should filter by warranty expiring', async () => {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30);

      (mockPrisma.$transaction as jest.Mock).mockResolvedValueOnce([[], 0]);

      await assetService.findAssets(mockOrganizationId, {
        warrantyExpiring: { before: expiryDate },
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('getAssetTree', () => {
    const mockTreeAssets = [
      {
        id: 'root-1',
        name: 'Root Asset 1',
        path: '/root-1',
        parentId: null,
        organizationId: mockOrganizationId,
        _count: { children: 2, tasks: 0, attachments: 0 },
      },
      {
        id: 'child-1',
        name: 'Child Asset 1',
        path: '/root-1/child-1',
        parentId: 'root-1',
        organizationId: mockOrganizationId,
        _count: { children: 0, tasks: 1, attachments: 0 },
      },
      {
        id: 'child-2',
        name: 'Child Asset 2',
        path: '/root-1/child-2',
        parentId: 'root-1',
        organizationId: mockOrganizationId,
        _count: { children: 1, tasks: 0, attachments: 2 },
      },
      {
        id: 'grandchild-1',
        name: 'Grandchild Asset 1',
        path: '/root-1/child-2/grandchild-1',
        parentId: 'child-2',
        organizationId: mockOrganizationId,
        _count: { children: 0, tasks: 0, attachments: 0 },
      },
    ];

    it('should return asset tree structure', async () => {
      mockPrisma.asset.findMany.mockResolvedValue(mockTreeAssets as any);

      const result = await assetService.getAssetTree(mockOrganizationId);

      expect(result).toHaveLength(1); // One root
      expect(result[0]!.id).toBe('root-1');
      expect(result[0]!.children).toHaveLength(2);
      const secondChild = result[0]!.children![1] as AssetWithRelations;
      expect(secondChild.children).toHaveLength(1);
      expect(secondChild.children![0]!.id).toBe('grandchild-1');
    });

    it('should return subtree for specific root', async () => {
      mockPrisma.asset.findFirst.mockResolvedValue(mockTreeAssets[0] as any); // Root lookup
      mockPrisma.asset.findMany.mockResolvedValue(mockTreeAssets as any);

      const result = await assetService.getAssetTree(mockOrganizationId, 'root-1');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('root-1');
    });
  });

  describe('updateAssetStatus', () => {
    it('should update status with valid transition', async () => {
      const mockAsset = {
        id: mockAssetId,
        status: AssetStatus.OPERATIONAL,
        organizationId: mockOrganizationId,
      };

      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);
      mockPrisma.asset.update.mockResolvedValue({
        ...mockAsset,
        status: AssetStatus.MAINTENANCE,
      } as any);

      const result = await assetService.updateAssetStatus(
        mockAssetId,
        AssetStatus.MAINTENANCE,
        mockOrganizationId,
      );

      expect(result.status).toBe(AssetStatus.MAINTENANCE);
    });

    it('should throw error for invalid status transition', async () => {
      const mockAsset = {
        id: mockAssetId,
        status: AssetStatus.DISPOSED,
        organizationId: mockOrganizationId,
      };

      mockPrisma.asset.findFirst.mockResolvedValue(mockAsset as any);

      await expect(
        assetService.updateAssetStatus(mockAssetId, AssetStatus.OPERATIONAL, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getWarrantyExpiringAssets', () => {
    it('should return assets with warranty expiring soon', async () => {
      const expiringAssets = [
        {
          id: 'asset-1',
          name: 'Asset 1',
          warrantyExpiry: new Date('2024-01-15'),
          warrantyLifetime: false,
        },
        {
          id: 'asset-2',
          name: 'Asset 2',
          secondaryWarrantyExpiry: new Date('2024-01-20'),
          warrantyLifetime: false,
        },
      ];

      mockPrisma.asset.findMany.mockResolvedValue(expiringAssets as any);

      const result = await assetService.getWarrantyExpiringAssets(mockOrganizationId, 30);

      expect(result).toHaveLength(2);
      expect(mockPrisma.asset.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: mockOrganizationId,
          warrantyLifetime: false,
        }),
        orderBy: expect.any(Array),
      });
    });
  });

  describe('getAssetStatistics', () => {
    it('should return comprehensive asset statistics', async () => {
      const mockStats = {
        total: 10,
        byCategory: [
          { category: AssetCategory.EQUIPMENT, _count: 5 },
          { category: AssetCategory.FURNITURE, _count: 3 },
          { category: AssetCategory.SOFTWARE, _count: 2 },
        ],
        byStatus: [
          { status: AssetStatus.OPERATIONAL, _count: 7 },
          { status: AssetStatus.MAINTENANCE, _count: 2 },
          { status: AssetStatus.RETIRED, _count: 1 },
        ],
        byLocation: [
          { locationId: 'loc-1', _count: 4 },
          { locationId: 'loc-2', _count: 3 },
        ],
      };

      const mockLocations = [
        { id: 'loc-1', name: 'Warehouse' },
        { id: 'loc-2', name: 'Office' },
      ];

      mockPrisma.asset.count.mockResolvedValue(mockStats.total);
      // Mock groupBy calls separately
      (mockPrisma.asset.groupBy as jest.Mock)
        .mockResolvedValueOnce(mockStats.byCategory as any)
        .mockResolvedValueOnce(mockStats.byStatus as any)
        .mockResolvedValueOnce(mockStats.byLocation as any);
      mockPrisma.asset.findMany.mockResolvedValue([]); // Warranty expiring
      mockPrisma.asset.aggregate.mockResolvedValue({
        _sum: { purchasePrice: new Prisma.Decimal(25000) },
      } as any);
      mockPrisma.location.findMany.mockResolvedValue(mockLocations as any);

      const result = await assetService.getAssetStatistics(mockOrganizationId);

      expect(result.total).toBe(10);
      expect(result.byCategory.EQUIPMENT).toBe(5);
      expect(result.byCategory.FURNITURE).toBe(3);
      expect(result.byStatus.OPERATIONAL).toBe(7);
      expect(result.byLocation).toHaveLength(2);
      expect(result.byLocation[0]!.locationName).toBe('Warehouse');
      expect(result.totalValue).toBe(25000);
    });
  });
});
