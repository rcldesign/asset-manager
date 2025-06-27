import { Location } from '@/types';

export interface LocationNode extends Location {
  children: LocationNode[];
}

/**
 * Transforms a flat array of locations into a hierarchical tree structure
 * @param locations - Flat array of locations
 * @returns Array of root location nodes with nested children
 */
export function buildLocationTree(locations: Location[]): LocationNode[] {
  const locationMap = new Map<string, LocationNode>();
  const rootNodes: LocationNode[] = [];

  // First pass: Create nodes for all locations
  locations.forEach(location => {
    locationMap.set(location.id, {
      ...location,
      children: []
    });
  });

  // Second pass: Build the tree structure
  locations.forEach(location => {
    const node = locationMap.get(location.id)!;
    
    if (location.parentId) {
      const parent = locationMap.get(location.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Orphaned node - add to root
        rootNodes.push(node);
      }
    } else {
      // Root node
      rootNodes.push(node);
    }
  });

  // Sort nodes alphabetically at each level
  const sortNodes = (nodes: LocationNode[]): LocationNode[] => {
    return nodes.sort((a, b) => a.name.localeCompare(b.name)).map(node => ({
      ...node,
      children: sortNodes(node.children)
    }));
  };

  return sortNodes(rootNodes);
}

/**
 * Finds a location by ID in the tree
 * @param nodes - Array of location nodes
 * @param id - Location ID to find
 * @returns Found location node or null
 */
export function findLocationInTree(nodes: LocationNode[], id: string): LocationNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    
    const found = findLocationInTree(node.children, id);
    if (found) {
      return found;
    }
  }
  
  return null;
}

/**
 * Gets all descendant IDs of a location
 * @param node - Location node
 * @returns Array of descendant location IDs
 */
export function getDescendantIds(node: LocationNode): string[] {
  const ids: string[] = [];
  
  const collectIds = (n: LocationNode) => {
    n.children.forEach(child => {
      ids.push(child.id);
      collectIds(child);
    });
  };
  
  collectIds(node);
  return ids;
}

/**
 * Checks if a location can be moved to a new parent
 * @param locationId - ID of location to move
 * @param newParentId - ID of new parent (null for root)
 * @param tree - Location tree
 * @returns True if move is valid
 */
export function canMoveLocation(
  locationId: string, 
  newParentId: string | null, 
  tree: LocationNode[]
): boolean {
  // Can't move to same location
  if (locationId === newParentId) {
    return false;
  }
  
  // If moving to root, always valid
  if (!newParentId) {
    return true;
  }
  
  // Find the location to move
  const locationToMove = findLocationInTree(tree, locationId);
  if (!locationToMove) {
    return false;
  }
  
  // Can't move to own descendant
  const descendantIds = getDescendantIds(locationToMove);
  return !descendantIds.includes(newParentId);
}