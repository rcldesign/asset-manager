import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals';
import { LocationService } from '../../services/location.service';
import { AppError, ConflictError } from '../../utils/errors';
import { prisma } from '../../lib/prisma';
import type { Organization, Location } from '@prisma/client';

describe('LocationService Integration Tests', () => {
  let locationService: LocationService;
  let testOrganization: Organization;
  let testOrganization2: Organization;

  beforeAll(async () => {
    locationService = new LocationService();

    // Create test organizations
    testOrganization = await prisma.organization.create({
      data: {
        name: 'Test Organization for Location Tests',
      },
    });

    testOrganization2 = await prisma.organization.create({
      data: {
        name: 'Test Organization 2 for Location Tests',
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.location.deleteMany({
      where: {
        organizationId: {
          in: [testOrganization.id, testOrganization2.id],
        },
      },
    });

    await prisma.organization.deleteMany({
      where: {
        id: {
          in: [testOrganization.id, testOrganization2.id],
        },
      },
    });
  });

  beforeEach(async () => {
    // Clean up locations before each test
    await prisma.location.deleteMany({
      where: {
        organizationId: {
          in: [testOrganization.id, testOrganization2.id],
        },
      },
    });
  });

  describe('Location Creation and Path Management', () => {
    it('should create root location with correct path', async () => {
      const locationData = {
        name: 'Main Building',
        description: 'The main building',
        organizationId: testOrganization.id,
      };

      const location = await locationService.createLocation(locationData);

      expect(location.name).toBe('Main Building');
      expect(location.parentId).toBeNull();
      expect(location.path).toBe(location.id);
      expect(location.organizationId).toBe(testOrganization.id);
    });

    it('should create child location with correct path', async () => {
      // Create parent first
      const parent = await locationService.createLocation({
        name: 'Building A',
        organizationId: testOrganization.id,
      });

      // Create child
      const child = await locationService.createLocation({
        name: 'Floor 1',
        parentId: parent.id,
        organizationId: testOrganization.id,
      });

      expect(child.parentId).toBe(parent.id);
      expect(child.path).toBe(`${parent.id}.${child.id}`);
    });

    it('should create grandchild location with correct path', async () => {
      // Create hierarchy: Building > Floor > Room
      const building = await locationService.createLocation({
        name: 'Building A',
        organizationId: testOrganization.id,
      });

      const floor = await locationService.createLocation({
        name: 'Floor 1',
        parentId: building.id,
        organizationId: testOrganization.id,
      });

      const room = await locationService.createLocation({
        name: 'Room 101',
        parentId: floor.id,
        organizationId: testOrganization.id,
      });

      expect(room.path).toBe(`${building.id}.${floor.id}.${room.id}`);
    });

    it('should prevent duplicate names in same parent', async () => {
      const parent = await locationService.createLocation({
        name: 'Building A',
        organizationId: testOrganization.id,
      });

      await locationService.createLocation({
        name: 'Floor 1',
        parentId: parent.id,
        organizationId: testOrganization.id,
      });

      // Try to create another location with same name and parent
      await expect(
        locationService.createLocation({
          name: 'Floor 1',
          parentId: parent.id,
          organizationId: testOrganization.id,
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('should allow duplicate names in different parents', async () => {
      const building1 = await locationService.createLocation({
        name: 'Building A',
        organizationId: testOrganization.id,
      });

      const building2 = await locationService.createLocation({
        name: 'Building B',
        organizationId: testOrganization.id,
      });

      // Should be able to create "Floor 1" in both buildings
      const floor1 = await locationService.createLocation({
        name: 'Floor 1',
        parentId: building1.id,
        organizationId: testOrganization.id,
      });

      const floor2 = await locationService.createLocation({
        name: 'Floor 1',
        parentId: building2.id,
        organizationId: testOrganization.id,
      });

      expect(floor1.name).toBe('Floor 1');
      expect(floor2.name).toBe('Floor 1');
      expect(floor1.parentId).toBe(building1.id);
      expect(floor2.parentId).toBe(building2.id);
    });
  });

  describe('Location Move Operations', () => {
    let building1: Location;
    let building2: Location;
    let floor1: Location;
    let room101: Location;

    beforeEach(async () => {
      // Create test hierarchy
      building1 = await locationService.createLocation({
        name: 'Building 1',
        organizationId: testOrganization.id,
      });

      building2 = await locationService.createLocation({
        name: 'Building 2',
        organizationId: testOrganization.id,
      });

      floor1 = await locationService.createLocation({
        name: 'Floor 1',
        parentId: building1.id,
        organizationId: testOrganization.id,
      });

      room101 = await locationService.createLocation({
        name: 'Room 101',
        parentId: floor1.id,
        organizationId: testOrganization.id,
      });
    });

    it('should move location and update paths correctly', async () => {
      // Move floor1 from building1 to building2
      const movedFloor = await locationService.moveLocation(
        floor1.id,
        building2.id,
        testOrganization.id,
      );

      expect(movedFloor.parentId).toBe(building2.id);
      expect(movedFloor.path).toBe(`${building2.id}.${floor1.id}`);

      // Check that child's path was also updated
      const updatedRoom = await locationService.getLocationById(room101.id, testOrganization.id);
      expect(updatedRoom?.path).toBe(`${building2.id}.${floor1.id}.${room101.id}`);
    });

    it('should move location to root', async () => {
      // Move floor1 to become a root location
      const movedFloor = await locationService.moveLocation(floor1.id, null, testOrganization.id);

      expect(movedFloor.parentId).toBeNull();
      expect(movedFloor.path).toBe(floor1.id);

      // Check that child's path was also updated
      const updatedRoom = await locationService.getLocationById(room101.id, testOrganization.id);
      expect(updatedRoom?.path).toBe(`${floor1.id}.${room101.id}`);
    });

    it('should prevent circular dependency - direct', async () => {
      // Try to move building1 to be a child of floor1 (its own child)
      await expect(
        locationService.moveLocation(building1.id, floor1.id, testOrganization.id),
      ).rejects.toThrow(AppError);
    });

    it('should prevent circular dependency - indirect', async () => {
      // Try to move building1 to be a child of room101 (its own grandchild)
      await expect(
        locationService.moveLocation(building1.id, room101.id, testOrganization.id),
      ).rejects.toThrow(AppError);
    });

    it('should prevent cross-organization moves', async () => {
      const otherOrgLocation = await locationService.createLocation({
        name: 'Other Building',
        organizationId: testOrganization2.id,
      });

      await expect(
        locationService.moveLocation(floor1.id, otherOrgLocation.id, testOrganization.id),
      ).rejects.toThrow(AppError);
    });
  });

  describe('Location Deletion', () => {
    it('should delete leaf location successfully', async () => {
      const building = await locationService.createLocation({
        name: 'Test Building',
        organizationId: testOrganization.id,
      });

      const floor = await locationService.createLocation({
        name: 'Test Floor',
        parentId: building.id,
        organizationId: testOrganization.id,
      });

      // Should be able to delete the leaf location
      await locationService.deleteLocation(floor.id, testOrganization.id);

      const deletedLocation = await locationService.getLocationById(floor.id, testOrganization.id);
      expect(deletedLocation).toBeNull();
    });

    it('should prevent deletion of location with children', async () => {
      const building = await locationService.createLocation({
        name: 'Test Building',
        organizationId: testOrganization.id,
      });

      await locationService.createLocation({
        name: 'Test Floor',
        parentId: building.id,
        organizationId: testOrganization.id,
      });

      // Try to delete building (which has a child)
      await expect(
        locationService.deleteLocation(building.id, testOrganization.id),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('Location Queries', () => {
    let building: Location;
    let floor1: Location;
    let room101: Location;

    beforeEach(async () => {
      // Create test hierarchy
      building = await locationService.createLocation({
        name: 'Main Building',
        organizationId: testOrganization.id,
      });

      floor1 = await locationService.createLocation({
        name: 'Floor 1',
        parentId: building.id,
        organizationId: testOrganization.id,
      });

      await locationService.createLocation({
        name: 'Floor 2',
        parentId: building.id,
        organizationId: testOrganization.id,
      });

      room101 = await locationService.createLocation({
        name: 'Room 101',
        parentId: floor1.id,
        organizationId: testOrganization.id,
      });

      await locationService.createLocation({
        name: 'Room 102',
        parentId: floor1.id,
        organizationId: testOrganization.id,
      });
    });

    it('should return organization locations as tree structure', async () => {
      // First check if locations were created
      const allLocations = await prisma.location.findMany({
        where: { organizationId: testOrganization.id },
        orderBy: { path: 'asc' },
      });

      console.log(
        'All locations:',
        allLocations.map((l) => ({ id: l.id, name: l.name, parentId: l.parentId, path: l.path })),
      );

      const tree = await locationService.findByOrganization(testOrganization.id);

      console.log('Tree result:', JSON.stringify(tree, null, 2));

      expect(tree).toHaveLength(1); // One root building
      expect(tree[0]!.name).toBe('Main Building');
      expect(tree[0]!.children).toHaveLength(2); // Two floors

      // Find Floor 1 and Floor 2 by name to avoid relying on order
      const floor1Node = tree[0]!.children!.find((child) => child.name === 'Floor 1');
      const floor2Node = tree[0]!.children!.find((child) => child.name === 'Floor 2');

      expect(floor1Node).toBeDefined();
      expect(floor2Node).toBeDefined();
      expect(floor1Node!.children).toHaveLength(2); // Two rooms on floor 1
      expect(floor2Node!.children).toHaveLength(0); // No rooms on floor 2
    });

    it('should find subtree correctly', async () => {
      const subtree = await locationService.findSubtree(floor1.id, testOrganization.id);

      expect(subtree).toHaveLength(2); // Two rooms
      expect(subtree.map((l) => l.name).sort()).toEqual(['Room 101', 'Room 102']);
    });

    it('should find ancestors correctly', async () => {
      const ancestors = await locationService.findAncestors(room101.id, testOrganization.id);

      expect(ancestors).toHaveLength(2); // Building and Floor
      expect(ancestors[0]!.name).toBe('Main Building');
      expect(ancestors[1]!.name).toBe('Floor 1');
    });

    it('should return empty ancestors for root location', async () => {
      const ancestors = await locationService.findAncestors(building.id, testOrganization.id);
      expect(ancestors).toHaveLength(0);
    });

    it('should search by name case-insensitively', async () => {
      const results = await locationService.searchByName(testOrganization.id, 'floor');

      expect(results).toHaveLength(2);
      expect(results.map((l) => l.name).sort()).toEqual(['Floor 1', 'Floor 2']);
    });
  });

  describe('Organization Isolation', () => {
    it('should only return locations for specified organization', async () => {
      // Create locations in both organizations
      await locationService.createLocation({
        name: 'Org 1 Building',
        organizationId: testOrganization.id,
      });

      await locationService.createLocation({
        name: 'Org 2 Building',
        organizationId: testOrganization2.id,
      });

      const org1Locations = await locationService.findByOrganization(testOrganization.id);
      const org2Locations = await locationService.findByOrganization(testOrganization2.id);

      expect(org1Locations).toHaveLength(1);
      expect(org1Locations[0]!.name).toBe('Org 1 Building');

      expect(org2Locations).toHaveLength(1);
      expect(org2Locations[0]!.name).toBe('Org 2 Building');
    });
  });
});
