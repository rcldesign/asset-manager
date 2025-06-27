'use client';

import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Stack,
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useLocations } from '@/hooks/use-locations';
import { buildLocationTree } from '@/utils/location-helpers';
import { Location } from '@/types';
import { LocationTree } from './LocationTree';
import { LocationFormDialog } from './LocationFormDialog';
import { LocationDeleteDialog } from './LocationDeleteDialog';
import { LocationMoveDialog } from './LocationMoveDialog';

type DialogState = {
  type: 'create' | 'edit' | 'delete' | 'move' | null;
  location?: Location;
  parentLocation?: Location;
};

export function LocationManager() {
  const { data: locations, isLoading, error } = useLocations();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>({ type: null });

  const handleCreateLocation = (parentLocation?: Location) => {
    setDialogState({ type: 'create', parentLocation });
  };

  const handleEditLocation = (location: Location) => {
    setDialogState({ type: 'edit', location });
  };

  const handleDeleteLocation = (location: Location) => {
    setDialogState({ type: 'delete', location });
  };

  const handleMoveLocation = (location: Location) => {
    setDialogState({ type: 'move', location });
  };

  const handleCloseDialog = () => {
    setDialogState({ type: null });
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load locations: {error.message}
      </Alert>
    );
  }

  if (!locations || locations.length === 0) {
    return (
      <Paper sx={{ p: 3, m: 2 }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h6" color="text.secondary">
            No locations found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create your first location to organize your assets
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleCreateLocation()}
          >
            Create Location
          </Button>
        </Stack>

        <LocationFormDialog
          open={dialogState.type === 'create'}
          onClose={handleCloseDialog}
          parentLocation={dialogState.parentLocation}
          availableParents={locations || []}
        />
      </Paper>
    );
  }

  const locationTree = buildLocationTree(locations);

  return (
    <Box>
      <Paper sx={{ p: 3, m: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h5" component="h1">
            Location Management
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleCreateLocation()}
          >
            Add Location
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" mb={3}>
          Organize your assets with a hierarchical location structure
        </Typography>

        <LocationTree
          locations={locationTree}
          selectedLocationId={selectedLocationId}
          onLocationSelect={setSelectedLocationId}
          onEditLocation={handleEditLocation}
          onDeleteLocation={handleDeleteLocation}
          onCreateChild={handleCreateLocation}
          onMoveLocation={handleMoveLocation}
        />
      </Paper>

      {/* Dialogs */}
      <LocationFormDialog
        open={dialogState.type === 'create' || dialogState.type === 'edit'}
        onClose={handleCloseDialog}
        location={dialogState.location}
        parentLocation={dialogState.parentLocation}
        availableParents={locations}
      />

      <LocationDeleteDialog
        open={dialogState.type === 'delete'}
        onClose={handleCloseDialog}
        location={dialogState.location || null}
      />

      <LocationMoveDialog
        open={dialogState.type === 'move'}
        onClose={handleCloseDialog}
        location={dialogState.location || null}
        allLocations={locations}
      />
    </Box>
  );
}