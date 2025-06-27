'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
} from '@mui/material';
import { DriveFileMove as MoveIcon } from '@mui/icons-material';
import { Location } from '@/types';
import { useMoveLocation } from '@/hooks/use-locations';
import { canMoveLocation, buildLocationTree } from '@/utils/location-helpers';

interface LocationMoveDialogProps {
  open: boolean;
  onClose: () => void;
  location: Location | null;
  allLocations: Location[];
}

export function LocationMoveDialog({
  open,
  onClose,
  location,
  allLocations,
}: LocationMoveDialogProps) {
  const [newParentId, setNewParentId] = useState<string>('');
  const moveLocationMutation = useMoveLocation();

  const handleMove = async () => {
    if (!location) return;

    try {
      await moveLocationMutation.mutateAsync({
        id: location.id,
        newParentId: newParentId || null,
      });
      onClose();
      setNewParentId('');
    } catch (error) {
      console.error('Failed to move location:', error);
    }
  };

  const handleClose = () => {
    if (!moveLocationMutation.isPending) {
      setNewParentId('');
      onClose();
    }
  };

  if (!location) return null;

  // Build tree to check move validity
  const locationTree = buildLocationTree(allLocations);
  
  // Filter valid parent options
  const validParents = allLocations.filter((parent) => {
    if (parent.id === location.id) return false; // Can't move to self
    
    // Check if move is valid using our helper
    return canMoveLocation(location.id, parent.id, locationTree);
  });

  // Check if current selection is valid
  const isMoveValid = newParentId === '' || canMoveLocation(location.id, newParentId, locationTree);
  
  // Find current parent for display
  const currentParent = allLocations.find(loc => loc.id === location.parentId);
  const newParent = allLocations.find(loc => loc.id === newParentId);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MoveIcon color="primary" />
        Move Location
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {location.name}
          </Typography>
          {location.description && (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {location.description}
            </Typography>
          )}
          
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>Current location:</strong>{' '}
            {currentParent ? currentParent.path.replace(/\//g, ' → ') : 'Root Level'}
          </Typography>
        </Box>

        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>New Parent Location</InputLabel>
          <Select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            label="New Parent Location"
          >
            <MenuItem value="">
              <em>Root Level</em>
            </MenuItem>
            {validParents.map((parent) => (
              <MenuItem key={parent.id} value={parent.id}>
                {parent.path.replace(/\//g, ' → ')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {!isMoveValid && newParentId && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Invalid move: Cannot move a location to its own descendant.
          </Alert>
        )}

        {newParent && (
          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, mb: 2 }}>
            <Typography variant="body2">
              <strong>New location path:</strong>{' '}
              {newParent.path.replace(/\//g, ' → ')} → {location.name}
            </Typography>
          </Box>
        )}

        {newParentId === '' && (
          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, mb: 2 }}>
            <Typography variant="body2">
              <strong>New location path:</strong> {location.name} (Root Level)
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={moveLocationMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleMove}
          variant="contained"
          disabled={
            moveLocationMutation.isPending || 
            !isMoveValid || 
            newParentId === (location.parentId || '')
          }
        >
          {moveLocationMutation.isPending ? 'Moving...' : 'Move Location'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}