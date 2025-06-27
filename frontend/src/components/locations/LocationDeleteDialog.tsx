'use client';

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { Location } from '@/types';
import { useDeleteLocation, useLocationDescendants } from '@/hooks/use-locations';

interface LocationDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  location: Location | null;
}

export function LocationDeleteDialog({
  open,
  onClose,
  location,
}: LocationDeleteDialogProps) {
  const deleteLocationMutation = useDeleteLocation();
  const { data: descendants } = useLocationDescendants(
    location?.id || '',
    !!location?.id && open
  );

  const handleDelete = async () => {
    if (!location) return;

    try {
      await deleteLocationMutation.mutateAsync(location.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete location:', error);
    }
  };

  const handleClose = () => {
    if (!deleteLocationMutation.isPending) {
      onClose();
    }
  };

  if (!location) return null;

  const hasDescendants = descendants && descendants.length > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Delete Location
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete the location{' '}
            <strong>&quot;{location.name}&quot;</strong>?
          </Typography>
          
          {location.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {location.description}
            </Typography>
          )}
        </Box>

        {hasDescendants && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Warning:</strong> This location has {descendants.length} child location(s):
            </Typography>
            <Typography variant="body2" component="div">
              {descendants.slice(0, 5).map((child) => (
                <div key={child.id}>• {child.name}</div>
              ))}
              {descendants.length > 5 && (
                <div>• ... and {descendants.length - 5} more</div>
              )}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 'medium' }}>
              All child locations will also be deleted. This action cannot be undone.
            </Typography>
          </Alert>
        )}

        <Alert severity="error">
          <Typography variant="body2">
            <strong>This action cannot be undone.</strong> Any assets currently assigned to this location 
            {hasDescendants ? ' or its child locations' : ''} will have their location cleared.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={deleteLocationMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          variant="contained"
          color="error"
          disabled={deleteLocationMutation.isPending}
        >
          {deleteLocationMutation.isPending ? 'Deleting...' : 'Delete Location'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}