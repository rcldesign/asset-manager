import { AppError, NotFoundError, ConflictError } from '../../../utils/errors';

// Import modules
import { LocationService } from '../../../services/location.service';
import { prismaMock } from '../../../test/prisma-singleton';

describe('LocationService', () => {
  let locationService: LocationService;
  const mockOrganizationId = 'org-123';
  const mockLocationId = 'loc-123';
  const mockParentId = 'parent-123';

  beforeEach(() => {
    locationService = new LocationService();
    jest.clearAllMocks();

    // Mock the $transaction method properly
    (prismaMock.$transaction as jest.Mock).mockImplementation((callback) => {
      if (typeof callback === 'function') {
        // For callback-based transactions, pass the mocked prisma client
        // Create a transaction client that mirrors prismaMock but with distinct mocks
        const txMock = {
          location: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
          },
          organization: {
            findUnique: jest.fn(),
          },
          asset: {
            count: jest.fn(),
          },
        };
        
        // Copy over the mock implementations for the transaction context
        txMock.location.findFirst.mockImplementation(prismaMock.location.findFirst);
        txMock.location.findUnique.mockImplementation(prismaMock.location.findUnique);
        txMock.location.findMany.mockImplementation(prismaMock.location.findMany);
        txMock.location.create.mockImplementation(prismaMock.location.create);
        txMock.location.update.mockImplementation(prismaMock.location.update);
        txMock.location.delete.mockImplementation(prismaMock.location.delete);
        txMock.location.count.mockImplementation(prismaMock.location.count);
        txMock.organization.findUnique.mockImplementation(prismaMock.organization.findUnique);
        txMock.asset.count.mockImplementation(prismaMock.asset.count);
        
        return callback(txMock);
      }
      // For array-based transactions
      if (Array.isArray(callback)) {
        return Promise.all(callback);
      }
      return Promise.resolve([]);
    });
  });

  describe('createLocation', () => {
    const createData = {
      name: 'Building A',
      description: 'Main building',
      organizationId: mockOrganizationId,
    };

    it('should create a root location successfully', async () => {
      const mockOrganization = { id: mockOrganizationId, name: 'Test Org' };
      const mockLocation = {
        id: mockLocationId,
        name: 'Building A',
        description: 'Main building',
        parentId: null,
        organizationId: mockOrganizationId,
        path: mockLocationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue(mockOrganization as any);
      prismaMock.location.findFirst.mockResolvedValue(null);
      prismaMock.location.create.mockResolvedValue({ ...mockLocation, path: '' } as any);
      prismaMock.location.update.mockResolvedValue(mockLocation as any);

      const result = await locationService.createLocation(createData);

      expect(result.path).toBe(mockLocationId);
      expect(prismaMock.location.update).toHaveBeenCalledWith({
        where: { id: mockLocationId },
        data: { path: mockLocationId },
      });
    });

    it('should create a child location with correct path', async () => {
      const createDataWithParent = { ...createData, parentId: mockParentId };
      const mockParent = {
        id: mockParentId,
        path: 'parent-123',
        organizationId: mockOrganizationId,
      };
      const mockLocation = {
        id: mockLocationId,
        name: 'Room 101',
        parentId: mockParentId,
        organizationId: mockOrganizationId,
        path: `${mockParentId}.${mockLocationId}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prismaMock.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      prismaMock.location.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(mockParent as any);
      prismaMock.location.create.mockResolvedValue({ ...mockLocation, path: '' } as any);
      prismaMock.location.update.mockResolvedValue(mockLocation as any);

      const result = await locationService.createLocation(createDataWithParent);

      expect(result.path).toBe(`${mockParentId}.${mockLocationId}`);
    });

    it('should throw error if organization not found', async () => {
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(locationService.createLocation(createData)).rejects.toThrow(NotFoundError);
    });

    it('should throw error if parent not found', async () => {
      const createDataWithParent = { ...createData, parentId: 'non-existent' };

      prismaMock.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      prismaMock.location.findFirst.mockResolvedValue(null);
      prismaMock.location.findUnique.mockResolvedValue(null);

      await expect(locationService.createLocation(createDataWithParent)).rejects.toThrow(
        NotFoundError,
      );
    });

    it('should throw error if name already exists in same parent', async () => {
      const existingLocation = { id: 'existing-123', name: 'Building A' };

      prismaMock.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      prismaMock.location.findFirst.mockResolvedValue(existingLocation as any);

      await expect(locationService.createLocation(createData)).rejects.toThrow(ConflictError);
    });

    it('should throw error if parent belongs to different organization', async () => {
      const createDataWithParent = { ...createData, parentId: mockParentId };
      const mockParent = {
        id: mockParentId,
        organizationId: 'different-org',
      };

      prismaMock.organization.findUnique.mockResolvedValue({ id: mockOrganizationId } as any);
      prismaMock.location.findFirst.mockResolvedValue(null);
      prismaMock.location.findUnique.mockResolvedValue(mockParent as any);

      await expect(locationService.createLocation(createDataWithParent)).rejects.toThrow(AppError);
    });
  });

  describe('moveLocation', () => {
    const mockLocation = {
      id: mockLocationId,
      path: 'root.child',
      parentId: 'root',
      organizationId: mockOrganizationId,
    };

    it('should move location successfully', async () => {
      const newParent = {
        id: 'new-parent',
        path: 'new-parent',
        organizationId: mockOrganizationId,
      };
      const descendants = [
        { id: 'child1', path: 'root.child.child1' },
        { id: 'child2', path: 'root.child.child2' },
      ];

      // Mock both regular calls and transaction calls
      prismaMock.location.findFirst
        .mockResolvedValueOnce(mockLocation as any)  // For tx.location.findFirst (locationToMove)
        .mockResolvedValueOnce(newParent as any)     // For tx.location.findFirst (newParent)
        .mockResolvedValueOnce(null);                // For existing name check
      prismaMock.location.findMany.mockResolvedValue(descendants as any);
      prismaMock.location.update.mockResolvedValue({
        ...mockLocation,
        path: 'new-parent.child',
      } as any);

      const result = await locationService.moveLocation(
        mockLocationId,
        'new-parent',
        mockOrganizationId,
      );

      expect(prismaMock.location.update).toHaveBeenCalled();
      expect(result.path).toBe('new-parent.child');
    });

    it('should prevent circular dependency', async () => {
      const circularParent = {
        id: 'circular',
        path: 'root.child.circular',
        organizationId: mockOrganizationId,
      };

      prismaMock.location.findUnique
        .mockResolvedValueOnce(mockLocation as any)
        .mockResolvedValueOnce(circularParent as any);

      await expect(
        locationService.moveLocation(mockLocationId, 'circular', mockOrganizationId),
      ).rejects.toThrow(AppError);
    });

    it('should prevent cross-organization move', async () => {
      const differentOrgParent = {
        id: 'different-parent',
        path: 'different-parent',
        organizationId: 'different-org',
      };

      prismaMock.location.findUnique
        .mockResolvedValueOnce(mockLocation as any)
        .mockResolvedValueOnce(differentOrgParent as any);

      await expect(
        locationService.moveLocation(mockLocationId, 'different-parent', mockOrganizationId),
      ).rejects.toThrow(AppError);
    });

    it('should handle move to root (null parent)', async () => {
      prismaMock.location.findFirst
        .mockResolvedValueOnce(mockLocation as any)  // For tx.location.findFirst (locationToMove)
        .mockResolvedValueOnce(null);                // For existing name check
      prismaMock.location.findMany.mockResolvedValue([]);
      prismaMock.location.update.mockResolvedValue({
        ...mockLocation,
        path: mockLocationId,
        parentId: null,
      } as any);

      const result = await locationService.moveLocation(mockLocationId, null, mockOrganizationId);

      expect(result.path).toBe(mockLocationId);
    });
  });

  describe('deleteLocation', () => {
    it('should delete location successfully', async () => {
      const mockLocation = { id: mockLocationId };

      prismaMock.location.findFirst.mockResolvedValue(mockLocation as any); // For getLocationById
      prismaMock.location.count.mockResolvedValueOnce(0); // no children
      prismaMock.asset.count.mockResolvedValue(0); // no assets
      prismaMock.location.delete.mockResolvedValue(mockLocation as any);

      await locationService.deleteLocation(mockLocationId, mockOrganizationId);

      expect(prismaMock.location.delete).toHaveBeenCalledWith({
        where: { id: mockLocationId },
      });
    });

    it('should throw error if location has children', async () => {
      const mockLocation = { id: mockLocationId };

      prismaMock.location.findFirst.mockResolvedValue(mockLocation as any); // For getLocationById
      prismaMock.location.count.mockResolvedValueOnce(1); // has children

      await expect(
        locationService.deleteLocation(mockLocationId, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });

    it('should throw error if location has assets', async () => {
      const mockLocation = { id: mockLocationId };

      prismaMock.location.findFirst.mockResolvedValue(mockLocation as any); // For getLocationById
      prismaMock.location.count.mockResolvedValue(0); // no children
      prismaMock.asset.count.mockResolvedValue(1); // has assets

      await expect(
        locationService.deleteLocation(mockLocationId, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('findByOrganization', () => {
    it('should return tree structure of locations', async () => {
      const mockLocations = [
        { id: 'root1', name: 'Building 1', parentId: null, path: 'root1' },
        { id: 'child1', name: 'Floor 1', parentId: 'root1', path: 'root1.child1' },
        {
          id: 'grandchild1',
          name: 'Room 101',
          parentId: 'child1',
          path: 'root1.child1.grandchild1',
        },
        { id: 'root2', name: 'Building 2', parentId: null, path: 'root2' },
      ];

      prismaMock.location.findMany.mockResolvedValue(mockLocations as any);

      const result = await locationService.findByOrganization(mockOrganizationId);

      expect(result).toHaveLength(2); // Two root locations
      expect(result[0]!.children).toHaveLength(1); // Building 1 has one child
      expect(result[0]!.children![0]!.children).toHaveLength(1); // Floor 1 has one child
      expect(result[1]!.children).toHaveLength(0); // Building 2 has no children
    });
  });

  describe('findSubtree', () => {
    it('should return all descendants', async () => {
      const mockLocation = { id: mockLocationId, path: 'root.child' };
      const mockDescendants = [
        { id: 'desc1', path: 'root.child.desc1' },
        { id: 'desc2', path: 'root.child.desc2' },
      ];

      prismaMock.location.findFirst.mockResolvedValue(mockLocation as any); // For getLocationById
      prismaMock.location.findMany.mockResolvedValue(mockDescendants as any);

      const result = await locationService.findSubtree(mockLocationId, mockOrganizationId);

      expect(result).toHaveLength(2);
      expect(prismaMock.location.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          path: { startsWith: 'root.child.' },
        },
        orderBy: { path: 'asc' },
      });
    });
  });

  describe('findAncestors', () => {
    it('should return ancestors in correct order', async () => {
      const mockLocation = { id: 'grandchild', path: 'root.child.grandchild' };
      const mockAncestors = [
        { id: 'root', path: 'root' },
        { id: 'child', path: 'root.child' },
      ];

      prismaMock.location.findFirst.mockResolvedValue(mockLocation as any); // For getLocationById
      prismaMock.location.findMany.mockResolvedValue(mockAncestors as any);

      const result = await locationService.findAncestors('grandchild', mockOrganizationId);

      expect(result).toHaveLength(2);
      expect(prismaMock.location.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['root', 'child'] },
          organizationId: mockOrganizationId,
        },
        orderBy: { path: 'asc' },
      });
    });

    it('should return empty array for root location', async () => {
      const mockLocation = { id: 'root', path: 'root' };

      prismaMock.location.findFirst.mockResolvedValue(mockLocation as any); // For getLocationById

      const result = await locationService.findAncestors('root', mockOrganizationId);

      expect(result).toHaveLength(0);
    });
  });

  describe('searchByName', () => {
    it('should search locations by name', async () => {
      const mockLocations = [
        { id: 'loc1', name: 'Building A' },
        { id: 'loc2', name: 'Building B' },
      ];

      prismaMock.location.findMany.mockResolvedValue(mockLocations as any);

      const result = await locationService.searchByName(mockOrganizationId, 'Building');

      expect(result).toHaveLength(2);
      expect(prismaMock.location.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrganizationId,
          name: {
            contains: 'Building',
            mode: 'insensitive',
          },
        },
        orderBy: { name: 'asc' },
      });
    });
  });
});
