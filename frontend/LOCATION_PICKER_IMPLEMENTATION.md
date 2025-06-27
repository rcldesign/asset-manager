# Location Picker Component Implementation Guide

## Overview
The Location Picker is a critical component that allows users to select hierarchical locations for assets. It needs to handle potentially large location trees efficiently while providing an intuitive user experience.

## Component Architecture

### 1. Main Component: `LocationPicker.tsx`

```typescript
import React, { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Chip,
  InputAdornment,
} from '@mui/material';
import { TreeView, TreeItem } from '@mui/x-tree-view';
import {
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  LocationOn as LocationIcon,
} from '@mui/icons-material';
import { useLocations } from '@/hooks/use-locations';
import { Location } from '@/types';
import { LocationBreadcrumb } from './LocationBreadcrumb';
import { useDebounce } from '@/hooks/use-debounce';

interface LocationPickerProps {
  value?: string | null;
  onChange: (locationId: string | null) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  label = 'Location',
  error,
  helperText,
  required,
  disabled,
  placeholder = 'Select a location',
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(value || '');
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { locations, loading, error: loadError } = useLocations();

  // Build location tree structure
  const locationTree = useMemo(() => {
    if (!locations) return [];
    
    const locationMap = new Map<string, Location & { children: Location[] }>();
    const rootLocations: (Location & { children: Location[] })[] = [];
    
    // First pass: create all nodes
    locations.forEach(loc => {
      locationMap.set(loc.id, { ...loc, children: [] });
    });
    
    // Second pass: build tree
    locations.forEach(loc => {
      const node = locationMap.get(loc.id)!;
      if (loc.parentId) {
        const parent = locationMap.get(loc.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        rootLocations.push(node);
      }
    });
    
    return rootLocations;
  }, [locations]);

  // Filter locations based on search
  const filteredTree = useMemo(() => {
    if (!debouncedSearchTerm) return locationTree;
    
    const searchLower = debouncedSearchTerm.toLowerCase();
    
    const filterNode = (node: Location & { children: Location[] }): (Location & { children: Location[] }) | null => {
      const nameMatch = node.name.toLowerCase().includes(searchLower);
      const pathMatch = node.path.toLowerCase().includes(searchLower);
      const filteredChildren = node.children
        .map(child => filterNode(child))
        .filter(Boolean) as (Location & { children: Location[] })[];
      
      if (nameMatch || pathMatch || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      
      return null;
    };
    
    return locationTree
      .map(node => filterNode(node))
      .filter(Boolean) as (Location & { children: Location[] })[];
  }, [locationTree, debouncedSearchTerm]);

  // Get selected location object
  const selectedLocation = useMemo(() => {
    if (!value || !locations) return null;
    return locations.find(loc => loc.id === value);
  }, [value, locations]);

  const handleOpen = () => {
    if (!disabled) {
      setOpen(true);
      setSelected(value || '');
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSearchTerm('');
  };

  const handleSelect = () => {
    onChange(selected);
    handleClose();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleNodeToggle = (_event: React.SyntheticEvent, nodeIds: string[]) => {
    setExpanded(nodeIds);
  };

  const handleNodeSelect = (_event: React.SyntheticEvent, nodeId: string) => {
    setSelected(nodeId);
  };

  const renderTree = (nodes: (Location & { children: Location[] })[]) => {
    return nodes.map((node) => (
      <TreeItem
        key={node.id}
        nodeId={node.id}
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
            <LocationIcon sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} />
            <Box>
              <Box sx={{ fontWeight: node.id === selected ? 600 : 400 }}>
                {node.name}
              </Box>
              {node.description && (
                <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  {node.description}
                </Box>
              )}
            </Box>
          </Box>
        }
      >
        {node.children.length > 0 && renderTree(node.children)}
      </TreeItem>
    ));
  };

  return (
    <>
      <TextField
        label={label}
        value={selectedLocation?.name || ''}
        onClick={handleOpen}
        placeholder={placeholder}
        required={required}
        error={error}
        helperText={helperText}
        disabled={disabled}
        fullWidth
        InputProps={{
          readOnly: true,
          startAdornment: selectedLocation && (
            <InputAdornment position="start">
              <LocationIcon color="action" />
            </InputAdornment>
          ),
          endAdornment: (
            <InputAdornment position="end">
              {value && !disabled && (
                <IconButton size="small" onClick={handleClear}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              )}
            </InputAdornment>
          ),
        }}
        sx={{ cursor: disabled ? 'default' : 'pointer' }}
      />
      
      {selectedLocation && (
        <Box sx={{ mt: 1 }}>
          <LocationBreadcrumb locationId={selectedLocation.id} />
        </Box>
      )}

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Select Location</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            placeholder="Search locations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          
          {loadError && (
            <Box sx={{ color: 'error.main', mb: 2 }}>
              Error loading locations: {loadError.message}
            </Box>
          )}
          
          <Box sx={{ minHeight: 300, maxHeight: 400, overflow: 'auto' }}>
            <TreeView
              defaultCollapseIcon={<ExpandMoreIcon />}
              defaultExpandIcon={<ChevronRightIcon />}
              expanded={expanded}
              selected={selected}
              onNodeToggle={handleNodeToggle}
              onNodeSelect={handleNodeSelect}
            >
              {renderTree(filteredTree)}
            </TreeView>
          </Box>
          
          {selected && (
            <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
              <LocationBreadcrumb locationId={selected} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSelect} variant="contained" disabled={!selected}>
            Select
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
```

### 2. Supporting Component: `LocationBreadcrumb.tsx`

```typescript
import React, { useMemo } from 'react';
import { Breadcrumbs, Link, Typography, Box } from '@mui/material';
import { NavigateNext as NavigateNextIcon } from '@mui/icons-material';
import { useLocations } from '@/hooks/use-locations';

interface LocationBreadcrumbProps {
  locationId: string;
  interactive?: boolean;
  onNavigate?: (locationId: string) => void;
}

export const LocationBreadcrumb: React.FC<LocationBreadcrumbProps> = ({
  locationId,
  interactive = false,
  onNavigate,
}) => {
  const { locations } = useLocations();
  
  const breadcrumbPath = useMemo(() => {
    if (!locations || !locationId) return [];
    
    const path: typeof locations = [];
    let current = locations.find(loc => loc.id === locationId);
    
    while (current) {
      path.unshift(current);
      current = current.parentId 
        ? locations.find(loc => loc.id === current!.parentId)
        : null;
    }
    
    return path;
  }, [locations, locationId]);

  if (breadcrumbPath.length === 0) return null;

  return (
    <Breadcrumbs 
      separator={<NavigateNextIcon fontSize="small" />}
      sx={{ fontSize: '0.875rem' }}
    >
      {breadcrumbPath.map((location, index) => {
        const isLast = index === breadcrumbPath.length - 1;
        
        if (isLast || !interactive) {
          return (
            <Typography 
              key={location.id} 
              color={isLast ? 'text.primary' : 'text.secondary'}
              fontSize="inherit"
            >
              {location.name}
            </Typography>
          );
        }
        
        return (
          <Link
            key={location.id}
            component="button"
            variant="body2"
            onClick={() => onNavigate?.(location.id)}
            underline="hover"
            color="inherit"
          >
            {location.name}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
};
```

### 3. Simple Location Display Component: `LocationDisplay.tsx`

```typescript
import React from 'react';
import { Box, Chip } from '@mui/material';
import { LocationOn as LocationIcon } from '@mui/icons-material';
import { useLocations } from '@/hooks/use-locations';

interface LocationDisplayProps {
  locationId: string;
  showPath?: boolean;
}

export const LocationDisplay: React.FC<LocationDisplayProps> = ({
  locationId,
  showPath = false,
}) => {
  const { locations } = useLocations();
  
  const location = locations?.find(loc => loc.id === locationId);
  
  if (!location) return null;
  
  return (
    <Chip
      icon={<LocationIcon />}
      label={showPath ? location.path : location.name}
      size="small"
      variant="outlined"
    />
  );
};
```

## Usage Examples

### 1. In Asset Form

```typescript
import { LocationPicker } from '@/components/locations/LocationPicker';

const AssetForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    locationId: null,
    // ... other fields
  });

  return (
    <form>
      <LocationPicker
        label="Asset Location"
        value={formData.locationId}
        onChange={(locationId) => setFormData({ ...formData, locationId })}
        required
        helperText="Select where this asset is located"
      />
    </form>
  );
};
```

### 2. In Filter Component

```typescript
const AssetFilters = () => {
  const [filters, setFilters] = useState({ locationId: null });
  
  return (
    <LocationPicker
      label="Filter by Location"
      value={filters.locationId}
      onChange={(locationId) => setFilters({ ...filters, locationId })}
      placeholder="All locations"
    />
  );
};
```

## Performance Optimizations

### 1. Virtual Scrolling for Large Trees

```typescript
import { VariableSizeTree } from 'react-vtree';

// Use virtual scrolling for trees with >1000 nodes
const VirtualLocationTree = () => {
  // Implementation with react-vtree
};
```

### 2. Lazy Loading

```typescript
// Load child locations only when parent is expanded
const useLazyLocations = (parentId?: string) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (parentId) {
      setLoading(true);
      locationApi.getChildren(parentId)
        .then(setLocations)
        .finally(() => setLoading(false));
    }
  }, [parentId]);
  
  return { locations, loading };
};
```

### 3. Search Optimization

```typescript
// Use Fuse.js for fuzzy search
import Fuse from 'fuse.js';

const fuse = new Fuse(locations, {
  keys: ['name', 'path', 'description'],
  threshold: 0.3,
});

const searchResults = fuse.search(searchTerm);
```

## Testing Strategy

### 1. Unit Tests

```typescript
describe('LocationPicker', () => {
  it('should display selected location name', () => {
    render(
      <LocationPicker 
        value="loc-123" 
        onChange={jest.fn()}
      />
    );
    
    expect(screen.getByDisplayValue('Building A')).toBeInTheDocument();
  });
  
  it('should filter locations on search', async () => {
    const { getByPlaceholderText } = render(<LocationPicker />);
    
    fireEvent.change(getByPlaceholderText('Search locations...'), {
      target: { value: 'office' }
    });
    
    await waitFor(() => {
      expect(screen.queryByText('Warehouse')).not.toBeInTheDocument();
      expect(screen.getByText('Office')).toBeInTheDocument();
    });
  });
});
```

### 2. Integration Tests

```typescript
it('should update asset location', async () => {
  const onSubmit = jest.fn();
  render(<AssetForm onSubmit={onSubmit} />);
  
  // Open picker
  fireEvent.click(screen.getByLabelText('Asset Location'));
  
  // Select location
  fireEvent.click(screen.getByText('Server Room'));
  fireEvent.click(screen.getByText('Select'));
  
  // Submit form
  fireEvent.click(screen.getByText('Save'));
  
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'loc-server-room'
      })
    );
  });
});
```

## Accessibility

- Full keyboard navigation support
- ARIA labels for screen readers
- Focus management in dialog
- Clear visual indicators for selection

## Next Steps

1. Implement location management UI (CRUD operations)
2. Add bulk location operations
3. Implement location import/export
4. Add location usage statistics
5. Create mobile-optimized version