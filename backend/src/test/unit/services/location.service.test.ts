import { LocationService } from '../../../services/location.service';
import { AppError, NotFoundError, ConflictError } from '../../../utils/errors';
import { prismaMock } from '../../prisma-singleton';

describe('LocationService', () => {
  let locationService: LocationService;
  const mockOrganizationId = 'org-123';
  const mockLocationId = 'loc-123';
  const mockParentId = 'parent-123';

  beforeEach(() => {
    locationService = new LocationService();
    jest.clearAllMocks();
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
      prismaMock.location.findFirst.mockResolvedValue(null);
      prismaMock.location.findUnique.mockResolvedValue(mockParent as any);
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

      prismaMock.location.findUnique
        .mockResolvedValueOnce(mockLocation as any)
        .mockResolvedValueOnce(newParent as any);
      prismaMock.location.findMany.mockResolvedValue(descendants as any);
      prismaMock.$transaction.mockImplementation(() =>
        Promise.resolve([{ ...mockLocation, path: 'new-parent.child' }]),
      );

      const result = await locationService.moveLocation(
        mockLocationId,
        'new-parent',
        mockOrganizationId,
      );

      expect(prismaMock.$transaction).toHaveBeenCalled();
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
      prismaMock.location.findUnique.mockResolvedValueOnce(mockLocation as any);
      prismaMock.location.findMany.mockResolvedValue([]);
      prismaMock.$transaction.mockImplementation(() =>
        Promise.resolve([{ ...mockLocation, path: mockLocationId, parentId: null }]),
      );

      const result = await locationService.moveLocation(mockLocationId, null, mockOrganizationId);

      expect(result.path).toBe(mockLocationId);
    });
  });

  describe('deleteLocation', () => {
    it('should delete location successfully', async () => {
      const mockLocation = { id: mockLocationId };

      prismaMock.location.findUnique.mockResolvedValue(mockLocation as any);
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

      prismaMock.location.findUnique.mockResolvedValue(mockLocation as any);
      prismaMock.location.count.mockResolvedValueOnce(1); // has children

      await expect(
        locationService.deleteLocation(mockLocationId, mockOrganizationId),
      ).rejects.toThrow(ConflictError);
    });

    it('should throw error if location has assets', async () => {
      const mockLocation = { id: mockLocationId };

      prismaMock.location.findUnique.mockResolvedValue(mockLocation as any);
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

      prismaMock.location.findUnique.mockResolvedValue(mockLocation as any);
      prismaMock.location.findMany.mockResolvedValue(mockDescendants as any);

      const result = await locationService.findSubtree(mockLocationId, mockOrganizationId);

      expect(result).toHaveLength(2);
      expect(prismaMock.location.findMany).toHaveBeenCalledWith({
        where: { path: { startsWith: 'root.child.' } },
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

      prismaMock.location.findUnique.mockResolvedValue(mockLocation as any);
      prismaMock.location.findMany.mockResolvedValue(mockAncestors as any);

      const result = await locationService.findAncestors('grandchild', mockOrganizationId);

      expect(result).toHaveLength(2);
      expect(prismaMock.location.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['root', 'child'] } },
        orderBy: { path: 'asc' },
      });
    });

    it('should return empty array for root location', async () => {
      const mockLocation = { id: 'root', path: 'root' };

      prismaMock.location.findUnique.mockResolvedValue(mockLocation as any);

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
