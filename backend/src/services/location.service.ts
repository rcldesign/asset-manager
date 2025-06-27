import type { Location } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, NotFoundError, ConflictError } from '../utils/errors';

export interface CreateLocationData {
  name: string;
  description?: string;
  parentId?: string | null;
  organizationId: string;
}

export interface UpdateLocationData {
  name?: string;
  description?: string;
  parentId?: string | null;
}

export interface LocationWithChildren extends Location {
  children?: LocationWithChildren[];
}

/**
 * Service for managing hierarchical locations with materialized path.
 * Provides tree-based location management for asset organization.
 * Uses materialized path pattern for efficient hierarchical queries.
 *
 * @class LocationService
 */
export class LocationService {
  /**
   * Create a new location with hierarchical placement.
   * Validates organization ownership and name uniqueness within parent.
   *
   * @param {CreateLocationData} data - Location creation data
   * @returns {Promise<Location>} The created location with generated path
   * @throws {NotFoundError} If organization or parent location not found
   * @throws {ConflictError} If location name already exists in parent
   * @throws {AppError} If parent belongs to different organization
   *
   * @example
   * // Create root location
   * const building = await locationService.createLocation({
   *   name: 'Main Building',
   *   organizationId: 'org-123'
   * });
   *
   * // Create child location
   * const floor = await locationService.createLocation({
   *   name: '2nd Floor',
   *   parentId: building.id,
   *   organizationId: 'org-123'
   * });
   */
  async createLocation(data: CreateLocationData): Promise<Location> {
    const { name, description, parentId, organizationId } = data;

    return prisma.$transaction(async (tx) => {
      // Check if organization exists
      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        throw new NotFoundError('Organization');
      }

      // Check for name uniqueness within the same parent
      const existingLocation = await tx.location.findFirst({
        where: {
          organizationId,
          name,
          parentId,
        },
      });

      if (existingLocation) {
        throw new ConflictError(`A location named "${name}" already exists in this location`);
      }

      let parentLocation: Location | null = null;

      if (parentId) {
        // Validate parent exists and belongs to same organization
        parentLocation = await tx.location.findFirst({
          where: { id: parentId, organizationId },
        });

        if (!parentLocation) {
          throw new NotFoundError('Parent location');
        }
      }

      // Create the location first to get the ID
      const location = await tx.location.create({
        data: {
          name,
          description,
          parentId,
          organizationId,
          path: 'temp', // Temporary value, will be updated
        },
      });

      // Calculate the correct path
      const updatedPath = parentLocation ? `${parentLocation.path}.${location.id}` : location.id;

      // Update with correct path
      return tx.location.update({
        where: { id: location.id },
        data: { path: updatedPath },
      });
    });
  }

  /**
   * Get location by ID within a specific organization.
   *
   * @param {string} id - The location ID
   * @param {string} organizationId - The organization ID
   * @returns {Promise<Location | null>} The location or null if not found
   *
   * @example
   * const location = await locationService.getLocationById('location-123', 'org-456');
   */
  async getLocationById(id: string, organizationId: string): Promise<Location | null> {
    return prisma.location.findFirst({
      where: { id, organizationId },
    });
  }

  /**
   * Update location properties.
   * Handles parent changes by delegating to moveLocation method.
   *
   * @param {string} id - The location ID to update
   * @param {UpdateLocationData} data - Update data
   * @returns {Promise<Location>} The updated location
   * @throws {NotFoundError} If location not found
   * @throws {ConflictError} If new name already exists in parent
   *
   * @example
   * // Update name and description
   * const updated = await locationService.updateLocation('location-123', {
   *   name: 'Server Room A',
   *   description: 'Primary server room on 2nd floor'
   * });
   *
   * // Move to different parent
   * const moved = await locationService.updateLocation('location-123', {
   *   parentId: 'new-parent-456'
   * });
   */
  async updateLocation(
    id: string,
    data: UpdateLocationData,
    organizationId: string,
  ): Promise<Location> {
    return prisma.$transaction(async (tx) => {
      const location = await tx.location.findFirst({ where: { id, organizationId } });
      if (!location) {
        throw new NotFoundError('Location');
      }

      const { name, description, parentId } = data;
      const isMoving = parentId !== undefined && parentId !== location.parentId;

      // Perform uniqueness check before any modifications
      if (name && name !== location.name) {
        const targetParentId = isMoving ? parentId : location.parentId;
        const existingLocation = await tx.location.findFirst({
          where: {
            organizationId,
            name,
            parentId: targetParentId,
            id: { not: id },
          },
        });
        if (existingLocation) {
          throw new ConflictError(
            `A location named "${name}" already exists in the target location`,
          );
        }
      }

      // If moving, perform the move operation within this transaction
      if (isMoving) {
        await this.moveLocationWithinTransaction(id, parentId, organizationId, tx);
      }

      // Prepare data for simple field updates, excluding parentId
      const updateData: { name?: string; description?: string } = {};
      if (name !== undefined) {
        updateData.name = name;
      }
      if (description !== undefined) {
        updateData.description = description;
      }

      // If there are fields to update, perform the update within the transaction
      if (Object.keys(updateData).length > 0) {
        return tx.location.update({
          where: { id },
          data: updateData,
        });
      }

      // Return the final state of the location from within the transaction
      return tx.location.findUniqueOrThrow({ where: { id } });
    });
  }

  /**
   * Move location to a new parent (complex operation with path updates).
   * Updates materialized paths for the location and all descendants.
   * Prevents circular dependencies and cross-organization moves.
   *
   * @param {string} locationId - The location ID to move
   * @param {string | null} newParentId - New parent ID or null for root
   * @param {string} organizationId - The organization ID
   * @returns {Promise<Location>} The moved location with updated path
   * @throws {NotFoundError} If location or new parent not found
   * @throws {AppError} If move would create circular dependency or cross organizations
   * @throws {ConflictError} If location name already exists in target parent
   *
   * @example
   * // Move to new parent
   * await locationService.moveLocation('room-123', 'floor-456', 'org-789');
   *
   * // Move to root level
   * await locationService.moveLocation('floor-123', null, 'org-789');
   */
  async moveLocation(
    locationId: string,
    newParentId: string | null,
    organizationId: string,
  ): Promise<Location> {
    return prisma.$transaction(async (tx) => {
      return this.moveLocationWithinTransaction(locationId, newParentId, organizationId, tx);
    });
  }

  /**
   * Internal method to move location within an existing transaction.
   * This allows the move operation to be part of larger atomic operations.
   *
   * @private
   * @param {string} locationId - The location ID to move
   * @param {string | null} newParentId - New parent ID or null for root
   * @param {string} organizationId - The organization ID
   * @param {any} tx - The Prisma transaction client
   * @returns {Promise<Location>} The moved location with updated path
   */
  private async moveLocationWithinTransaction(
    locationId: string,
    newParentId: string | null,
    organizationId: string,
    tx: any,
  ): Promise<Location> {
    // Fetch current location and new parent with organization scoping
    const [locationToMove, newParent] = await Promise.all([
      tx.location.findFirst({ where: { id: locationId, organizationId } }),
      newParentId ? tx.location.findFirst({ where: { id: newParentId, organizationId } }) : null,
    ]);

    // Validation checks
    if (!locationToMove) {
      throw new NotFoundError('Location to move');
    }

    if (newParentId && !newParent) {
      throw new NotFoundError('New parent location');
    }

    if (locationToMove.parentId === newParentId) {
      return locationToMove; // No change needed
    }

    // Check for name uniqueness in target parent
    const existingWithSameName = await tx.location.findFirst({
      where: {
        organizationId,
        parentId: newParentId,
        name: locationToMove.name,
        id: { not: locationId },
      },
    });

    if (existingWithSameName) {
      throw new ConflictError(
        `A location named "${locationToMove.name}" already exists in the target location`,
      );
    }

    // CRITICAL: Prevent circular dependency
    if (newParent && newParent.path.startsWith(locationToMove.path)) {
      throw new AppError('Cannot move location to be a child of itself or its descendants', 400);
    }

    // Find all descendants
    const oldPath = locationToMove.path;
    const descendants = await tx.location.findMany({
      where: {
        organizationId,
        path: { startsWith: `${oldPath}.` },
      },
    });

    // Calculate new paths
    const newBasePath = newParent ? `${newParent.path}.${locationToMove.id}` : locationToMove.id;

    // Update the moved location itself
    const updatedLocation = await tx.location.update({
      where: { id: locationId },
      data: { path: newBasePath, parentId: newParentId },
    });

    // Update all descendants
    for (const descendant of descendants) {
      const newDescendantPath = descendant.path.replace(oldPath, newBasePath);
      await tx.location.update({
        where: { id: descendant.id },
        data: { path: newDescendantPath },
      });
    }

    return updatedLocation;
  }

  /**
   * Delete location (only if it has no children or assets).
   * Ensures no orphaned assets or locations.
   *
   * @param {string} id - The location ID to delete
   * @param {string} organizationId - The organization ID
   * @returns {Promise<void>}
   * @throws {NotFoundError} If location not found
   * @throws {ConflictError} If location has children or assigned assets
   *
   * @example
   * // Delete empty location
   * await locationService.deleteLocation('location-123', 'org-456');
   *
   * // Will throw if location has children or assets
   * try {
   *   await locationService.deleteLocation('parent-location', 'org-456');
   * } catch (error) {
   *   console.error('Location has dependencies');
   * }
   */
  async deleteLocation(id: string, organizationId: string): Promise<void> {
    const location = await this.getLocationById(id, organizationId);
    if (!location) {
      throw new NotFoundError('Location');
    }

    // Check for children
    const childCount = await prisma.location.count({
      where: { parentId: id, organizationId },
    });

    if (childCount > 0) {
      throw new ConflictError('Cannot delete location with child locations');
    }

    // Check for assets
    const assetCount = await prisma.asset.count({
      where: { locationId: id, organizationId },
    });

    if (assetCount > 0) {
      throw new ConflictError('Cannot delete location with assigned assets');
    }

    await prisma.location.delete({
      where: { id },
    });
  }

  /**
   * Get all locations for an organization as tree structure.
   * Returns hierarchical structure with nested children.
   *
   * @param {string} organizationId - The organization ID
   * @returns {Promise<LocationWithChildren[]>} Array of root locations with nested children
   *
   * @example
   * const locationTree = await locationService.findByOrganization('org-123');
   * // Returns:
   * // [{
   * //   id: 'building-1',
   * //   name: 'Main Building',
   * //   children: [{
   * //     id: 'floor-1',
   * //     name: '1st Floor',
   * //     children: [...]
   * //   }]
   * // }]
   */
  async findByOrganization(organizationId: string): Promise<LocationWithChildren[]> {
    const locations = await prisma.location.findMany({
      where: { organizationId },
      orderBy: { path: 'asc' },
    });

    // Build tree structure
    const locationMap = new Map<string, LocationWithChildren>();
    const rootLocations: LocationWithChildren[] = [];

    // First pass: create all location objects
    locations.forEach((location) => {
      locationMap.set(location.id, { ...location, children: [] });
    });

    // Second pass: build tree structure
    locations.forEach((location) => {
      const locationWithChildren = locationMap.get(location.id)!;

      if (location.parentId) {
        const parent = locationMap.get(location.parentId);
        if (parent) {
          parent.children!.push(locationWithChildren);
        }
      } else {
        rootLocations.push(locationWithChildren);
      }
    });

    return rootLocations;
  }

  /**
   * Get all descendants of a location (subtree).
   * Returns flat array of all locations under the specified parent.
   *
   * @param {string} locationId - The parent location ID
   * @param {string} organizationId - The organization ID
   * @returns {Promise<Location[]>} Array of descendant locations
   * @throws {NotFoundError} If location not found
   *
   * @example
   * // Get all rooms in a building
   * const allRooms = await locationService.findSubtree('building-123', 'org-456');
   * console.log(`Building contains ${allRooms.length} sub-locations`);
   */
  async findSubtree(locationId: string, organizationId: string): Promise<Location[]> {
    const location = await this.getLocationById(locationId, organizationId);
    if (!location) {
      throw new NotFoundError('Location');
    }

    return prisma.location.findMany({
      where: {
        organizationId,
        path: { startsWith: `${location.path}.` },
      },
      orderBy: { path: 'asc' },
    });
  }

  /**
   * Get ancestors of a location (path to root).
   * Returns array ordered from root to immediate parent.
   *
   * @param {string} locationId - The location ID
   * @param {string} organizationId - The organization ID
   * @returns {Promise<Location[]>} Array of ancestor locations
   * @throws {NotFoundError} If location not found
   *
   * @example
   * // Get breadcrumb path for a location
   * const ancestors = await locationService.findAncestors('room-123', 'org-456');
   * // Returns: [building, floor] (root to parent)
   * const breadcrumb = ancestors.map(l => l.name).join(' > ');
   */
  async findAncestors(locationId: string, organizationId: string): Promise<Location[]> {
    const location = await this.getLocationById(locationId, organizationId);
    if (!location) {
      throw new NotFoundError('Location');
    }

    // Split path and get all ancestor IDs
    const ancestorIds = location.path.split('.').filter((id) => id !== locationId);

    if (ancestorIds.length === 0) {
      return []; // Root location has no ancestors
    }

    return prisma.location.findMany({
      where: {
        id: { in: ancestorIds },
        organizationId,
      },
      orderBy: { path: 'asc' },
    });
  }

  /**
   * Get multiple locations by their IDs within a specific organization.
   *
   * @param {string[]} ids - Array of location IDs
   * @param {string} organizationId - The organization ID
   * @returns {Promise<Location[]>} Array of found locations
   *
   * @example
   * const locations = await locationService.findByIds([
   *   'location-1',
   *   'location-2',
   *   'location-3'
   * ], 'org-456');
   */
  async findByIds(ids: string[], organizationId: string): Promise<Location[]> {
    return prisma.location.findMany({
      where: {
        id: { in: ids },
        organizationId,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Search locations by name within organization.
   * Case-insensitive partial match search.
   *
   * @param {string} organizationId - The organization ID
   * @param {string} query - Search query string
   * @returns {Promise<Location[]>} Array of matching locations
   *
   * @example
   * // Search for all server rooms
   * const serverRooms = await locationService.searchByName('org-123', 'server');
   *
   * // Search for specific floor
   * const floors = await locationService.searchByName('org-123', '2nd');
   */
  async searchByName(organizationId: string, query: string): Promise<Location[]> {
    return prisma.location.findMany({
      where: {
        organizationId,
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get all locations for an organization as a flat list.
   * More efficient than building a tree and then flattening it.
   */
  async findAllFlat(organizationId: string): Promise<Location[]> {
    return prisma.location.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }
}
