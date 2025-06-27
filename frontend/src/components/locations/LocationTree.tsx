'use client';

import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Stack,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  LocationOn as LocationIcon,
  DriveFileMove as MoveIcon,
} from '@mui/icons-material';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { LocationNode } from '@/utils/location-helpers';

interface LocationTreeProps {
  locations: LocationNode[];
  selectedLocationId: string | null;
  onLocationSelect: (locationId: string | null) => void;
  onEditLocation?: (location: LocationNode) => void;
  onDeleteLocation?: (location: LocationNode) => void;
  onCreateChild?: (parentLocation: LocationNode) => void;
  onMoveLocation?: (location: LocationNode) => void;
}

interface LocationTreeItemProps {
  location: LocationNode;
  onLocationSelect: (locationId: string) => void;
  onEditLocation?: (location: LocationNode) => void;
  onDeleteLocation?: (location: LocationNode) => void;
  onCreateChild?: (parentLocation: LocationNode) => void;
  onMoveLocation?: (location: LocationNode) => void;
}

function LocationTreeItem({ 
  location, 
  onLocationSelect, 
  onEditLocation,
  onDeleteLocation,
  onCreateChild,
  onMoveLocation 
}: LocationTreeItemProps) {
  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditLocation?.(location);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteLocation?.(location);
  };

  const handleAddChildClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCreateChild?.(location);
  };

  const handleMoveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMoveLocation?.(location);
  };

  const renderLocationActions = () => (
    <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
      <Tooltip title="Add child location">
        <IconButton
          size="small"
          onClick={handleAddChildClick}
          sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
        >
          <AddIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Move location">
        <IconButton
          size="small"
          onClick={handleMoveClick}
          sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
          color="info"
        >
          <MoveIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Edit location">
        <IconButton
          size="small"
          onClick={handleEditClick}
          sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
        >
          <EditIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Delete location">
        <IconButton
          size="small"
          onClick={handleDeleteClick}
          sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
          color="error"
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Stack>
  );

  const renderLocationLabel = () => (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        py: 0.5,
        '&:hover .location-actions': {
          opacity: 1,
        },
      }}
      onClick={() => onLocationSelect(location.id)}
    >
      <LocationIcon fontSize="small" color="primary" />
      <Box sx={{ flex: 1 }}>
        <Typography variant="body1" component="span">
          {location.name}
        </Typography>
        {location.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            component="div"
            sx={{ fontSize: '0.75rem' }}
          >
            {location.description}
          </Typography>
        )}
      </Box>
      {location.children.length > 0 && (
        <Chip
          label={location.children.length}
          size="small"
          variant="outlined"
          sx={{ ml: 1 }}
        />
      )}
      <Box
        className="location-actions"
        sx={{
          opacity: 0,
          transition: 'opacity 0.2s',
        }}
      >
        {renderLocationActions()}
      </Box>
    </Stack>
  );

  return (
    <TreeItem itemId={location.id} label={renderLocationLabel()}>
      {location.children.map((child) => (
        <LocationTreeItem
          key={child.id}
          location={child}
          onLocationSelect={onLocationSelect}
          onEditLocation={onEditLocation}
          onDeleteLocation={onDeleteLocation}
          onCreateChild={onCreateChild}
          onMoveLocation={onMoveLocation}
        />
      ))}
    </TreeItem>
  );
}

export function LocationTree({
  locations,
  selectedLocationId,
  onLocationSelect,
  onEditLocation,
  onDeleteLocation,
  onCreateChild,
  onMoveLocation,
}: LocationTreeProps) {
  if (locations.length === 0) {
    return (
      <Box
        sx={{
          textAlign: 'center',
          py: 4,
          color: 'text.secondary',
        }}
      >
        <LocationIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="h6">No locations available</Typography>
        <Typography variant="body2">
          Add your first location to get started
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <SimpleTreeView
        selectedItems={selectedLocationId}
        onSelectedItemsChange={(event, itemIds) => {
          const selectedId = Array.isArray(itemIds) ? itemIds[0] : itemIds;
          onLocationSelect(selectedId || null);
        }}
        sx={{
          '& .MuiTreeItem-content': {
            padding: '4px 8px',
            borderRadius: 1,
            '&:hover': {
              backgroundColor: 'action.hover',
            },
            '&.Mui-selected': {
              backgroundColor: 'primary.light',
              '&:hover': {
                backgroundColor: 'primary.light',
              },
            },
          },
          '& .MuiTreeItem-label': {
            width: '100%',
          },
        }}
      >
        {locations.map((location) => (
          <LocationTreeItem
            key={location.id}
            location={location}
            onLocationSelect={onLocationSelect}
            onEditLocation={onEditLocation}
            onDeleteLocation={onDeleteLocation}
            onCreateChild={onCreateChild}
            onMoveLocation={onMoveLocation}
          />
        ))}
      </SimpleTreeView>
    </Box>
  );
}