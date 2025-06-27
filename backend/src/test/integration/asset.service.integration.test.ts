import { AssetService } from '../../services/asset.service';
import { AssetTemplateService } from '../../services/asset-template.service';
import { LocationService } from '../../services/location.service';
import { prisma } from '../../lib/prisma';
import { AssetCategory, AssetStatus } from '@prisma/client';
import { TestDatabaseHelper } from '../helpers';
import { skipIfNoDatabase } from './skip-if-no-db';

void skipIfNoDatabase();

describe('AssetService Integration Tests', () => {
  let assetService: AssetService;
  let assetTemplateService: AssetTemplateService;
  let locationService: LocationService;
  let testDbHelper: TestDatabaseHelper;
  let organizationId: string;

  beforeAll(async () => {
    testDbHelper = new TestDatabaseHelper();
    await testDbHelper.connect();
    await testDbHelper.clearDatabase();
  });

  beforeEach(async () => {
    // Create services
    assetService = new AssetService();
    assetTemplateService = new AssetTemplateService();
    locationService = new LocationService();

    // Create test organization
    const testOrg = await testDbHelper.createTestOrganization();
    organizationId = testOrg.id;
  });

  afterEach(async () => {
    await testDbHelper.clearDatabase();
  });

  afterAll(async () => {
    await testDbHelper.disconnect();
    await prisma.$disconnect();
  });

  describe('Asset CRUD with Template and Location', () => {
    it('should create asset with template and location', async () => {
      // Create template
      const template = await assetTemplateService.createTemplate({
        name: 'Server Template',
        category: AssetCategory.HARDWARE,
        organizationId,
        defaultFields: {
          rackUnit: 2,
          powerConsumption: 500,
        },
        customFields: {
          type: 'object',
          properties: {
            ipAddress: { type: 'string', format: 'ipv4' },
            hostname: { type: 'string' },
          },
          required: ['hostname'],
        },
      });

      // Create location
      const location = await locationService.createLocation({
        name: 'Data Center',
        description: 'Main data center',
        organizationId,
      });

      // Create asset
      const asset = await assetService.createAsset({
        name: 'Web Server 01',
        category: AssetCategory.HARDWARE,
        assetTemplateId: template.id,
        locationId: location.id,
        organizationId,
        manufacturer: 'Dell',
        modelNumber: 'PowerEdge R740',
        serialNumber: 'SN123456',
        purchasePrice: 5000,
        warrantyExpiry: new Date('2025-12-31'),
        customFields: {
          ipAddress: '192.168.1.100',
          hostname: 'web01.example.com',
        },
      });

      expect(asset.name).toBe('Web Server 01');
      expect(asset.assetTemplateId).toBe(template.id);
      expect(asset.locationId).toBe(location.id);
      expect(asset.customFields).toMatchObject({
        rackUnit: 2,
        powerConsumption: 500,
        ipAddress: '192.168.1.100',
        hostname: 'web01.example.com',
      });
      expect(asset.qrCode).toMatch(/^AST-/);
    });

    it('should handle asset hierarchy', async () => {
      // Create parent asset
      const parentAsset = await assetService.createAsset({
        name: 'Server Rack',
        category: AssetCategory.EQUIPMENT,
        organizationId,
      });

      // Create child assets
      const childAsset1 = await assetService.createAsset({
        name: 'Server 1',
        category: AssetCategory.HARDWARE,
        parentId: parentAsset.id,
        organizationId,
      });

      const childAsset2 = await assetService.createAsset({
        name: 'Server 2',
        category: AssetCategory.HARDWARE,
        parentId: parentAsset.id,
        organizationId,
      });

      // Get asset tree
      const tree = await assetService.getAssetTree(organizationId);

      expect(tree).toHaveLength(1);
      expect(tree[0]!.id).toBe(parentAsset.id);

      // Check the structure by getting the parent with children included
      const parentWithChildren = await assetService.getAssetById(parentAsset.id, organizationId);
      expect(parentWithChildren).toBeDefined();
      expect(parentWithChildren!.children).toBeDefined();
      expect(parentWithChildren!.children).toHaveLength(2);
      expect(parentWithChildren!.children!.map((c) => c.id).sort()).toEqual(
        [childAsset1.id, childAsset2.id].sort(),
      );
    });

    it('should move asset between parents', async () => {
      // Create assets
      const rack1 = await assetService.createAsset({
        name: 'Rack 1',
        category: AssetCategory.EQUIPMENT,
        organizationId,
      });

      const rack2 = await assetService.createAsset({
        name: 'Rack 2',
        category: AssetCategory.EQUIPMENT,
        organizationId,
      });

      const server = await assetService.createAsset({
        name: 'Server',
        category: AssetCategory.HARDWARE,
        parentId: rack1.id,
        organizationId,
      });

      // Move server to rack2
      const movedAsset = await assetService.moveAsset(server.id, organizationId, {
        newParentId: rack2.id,
      });

      expect(movedAsset.parentId).toBe(rack2.id);
      expect(movedAsset.path).toContain(rack2.id);
    });

    it('should update asset status lifecycle', async () => {
      const asset = await assetService.createAsset({
        name: 'Test Asset',
        category: AssetCategory.EQUIPMENT,
        organizationId,
      });

      // Valid transitions
      let updated = await assetService.updateAssetStatus(
        asset.id,
        AssetStatus.MAINTENANCE,
        organizationId,
      );
      expect(updated.status).toBe(AssetStatus.MAINTENANCE);

      updated = await assetService.updateAssetStatus(
        asset.id,
        AssetStatus.OPERATIONAL,
        organizationId,
      );
      expect(updated.status).toBe(AssetStatus.OPERATIONAL);

      // Valid transition to retired
      updated = await assetService.updateAssetStatus(asset.id, AssetStatus.RETIRED, organizationId);
      expect(updated.status).toBe(AssetStatus.RETIRED);

      // Valid transition to disposed
      updated = await assetService.updateAssetStatus(
        asset.id,
        AssetStatus.DISPOSED,
        organizationId,
      );
      expect(updated.status).toBe(AssetStatus.DISPOSED);

      // Invalid transition from disposed back to operational
      await expect(
        assetService.updateAssetStatus(asset.id, AssetStatus.OPERATIONAL, organizationId),
      ).rejects.toThrow('Invalid status transition');
    });
  });

  describe('Asset Search and Filtering', () => {
    beforeEach(async () => {
      // Create test data
      const location1 = await locationService.createLocation({
        name: 'Warehouse',
        organizationId,
      });

      const location2 = await locationService.createLocation({
        name: 'Office',
        organizationId,
      });

      const template = await assetTemplateService.createTemplate({
        name: 'Computer Template',
        category: AssetCategory.HARDWARE,
        organizationId,
        defaultFields: {},
        customFields: {},
      });

      // Create various assets
      await assetService.createAsset({
        name: 'Desktop PC 1',
        category: AssetCategory.HARDWARE,
        status: AssetStatus.OPERATIONAL,
        locationId: location1.id,
        assetTemplateId: template.id,
        organizationId,
        tags: ['desktop', 'office'],
        purchasePrice: 1200,
      });

      await assetService.createAsset({
        name: 'Desktop PC 2',
        category: AssetCategory.HARDWARE,
        status: AssetStatus.MAINTENANCE,
        locationId: location2.id,
        organizationId,
        tags: ['desktop', 'development'],
        purchasePrice: 1500,
      });

      await assetService.createAsset({
        name: 'Office Chair',
        category: AssetCategory.FURNITURE,
        status: AssetStatus.OPERATIONAL,
        locationId: location2.id,
        organizationId,
        tags: ['furniture', 'office'],
        purchasePrice: 300,
      });

      await assetService.createAsset({
        name: 'Software License',
        category: AssetCategory.SOFTWARE,
        status: AssetStatus.OPERATIONAL,
        organizationId,
        tags: ['software', 'license'],
        warrantyExpiry: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days
      });
    });

    it('should search assets by name', async () => {
      const result = await assetService.findAssets(organizationId, {
        name: 'Desktop',
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.every((a) => a.name.includes('Desktop'))).toBe(true);
    });

    it('should filter by category', async () => {
      const result = await assetService.findAssets(organizationId, {
        category: AssetCategory.HARDWARE,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.every((a) => a.category === AssetCategory.HARDWARE)).toBe(true);
    });

    it('should filter by location', async () => {
      const locations = await locationService.findByOrganization(organizationId);
      const officeLocation = locations.find((l) => l.name === 'Office');

      const result = await assetService.findAssets(organizationId, {
        locationId: officeLocation!.id,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((a) => a.name).sort()).toEqual(['Desktop PC 2', 'Office Chair']);
    });

    it('should filter by tags', async () => {
      const result = await assetService.findAssets(organizationId, {
        tags: ['office'],
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.map((a) => a.name).sort()).toEqual(['Desktop PC 1', 'Office Chair']);
    });

    it('should find warranty expiring assets', async () => {
      const expiringAssets = await assetService.getWarrantyExpiringAssets(
        organizationId,
        30, // 30 days
      );

      expect(expiringAssets).toHaveLength(1);
      expect(expiringAssets[0]!.name).toBe('Software License');
    });
  });

  describe('Asset Statistics', () => {
    it('should calculate comprehensive statistics', async () => {
      // Create assets with various attributes
      const location = await locationService.createLocation({
        name: 'Main Office',
        organizationId,
      });

      await assetService.createAsset({
        name: 'Asset 1',
        category: AssetCategory.HARDWARE,
        status: AssetStatus.OPERATIONAL,
        locationId: location.id,
        organizationId,
        purchasePrice: 1000,
      });

      await assetService.createAsset({
        name: 'Asset 2',
        category: AssetCategory.HARDWARE,
        status: AssetStatus.MAINTENANCE,
        organizationId,
        purchasePrice: 1500,
      });

      await assetService.createAsset({
        name: 'Asset 3',
        category: AssetCategory.SOFTWARE,
        status: AssetStatus.OPERATIONAL,
        organizationId,
        purchasePrice: 500,
        warrantyExpiry: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      });

      const stats = await assetService.getAssetStatistics(organizationId);

      expect(stats.total).toBe(3);
      expect(stats.byCategory.HARDWARE).toBe(2);
      expect(stats.byCategory.SOFTWARE).toBe(1);
      expect(stats.byStatus.OPERATIONAL).toBe(2);
      expect(stats.byStatus.MAINTENANCE).toBe(1);
      expect(stats.byLocation).toHaveLength(1);
      expect(stats.byLocation[0]!.locationName).toBe('Main Office');
      expect(stats.warrantyExpiringSoon).toBe(1);
      expect(stats.totalValue).toBe(3000);
    });
  });

  describe('Asset Deletion and Cascading', () => {
    it('should prevent deletion of asset with active tasks', async () => {
      const asset = await assetService.createAsset({
        name: 'Server',
        category: AssetCategory.HARDWARE,
        organizationId,
      });

      // Create an active task (would be done through TaskService in real app)
      await prisma.task.create({
        data: {
          title: 'Maintenance',
          dueDate: new Date(),
          status: 'PLANNED',
          organizationId,
          assetId: asset.id,
        },
      });

      await expect(assetService.deleteAsset(asset.id, organizationId)).rejects.toThrow(
        'Cannot delete asset with active tasks',
      );
    });

    it('should cascade delete child assets', async () => {
      const parent = await assetService.createAsset({
        name: 'Parent',
        category: AssetCategory.EQUIPMENT,
        organizationId,
      });

      const child = await assetService.createAsset({
        name: 'Child',
        category: AssetCategory.EQUIPMENT,
        parentId: parent.id,
        organizationId,
      });

      await assetService.deleteAsset(parent.id, organizationId, true);

      // Verify both are deleted
      const foundParent = await assetService.getAssetById(parent.id, organizationId);
      const foundChild = await assetService.getAssetById(child.id, organizationId);

      expect(foundParent).toBeNull();
      expect(foundChild).toBeNull();
    });
  });
});
