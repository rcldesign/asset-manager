'use client';

import React, { useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Box,
  Typography,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Location } from '@/types';
import { useCreateLocation, useUpdateLocation } from '@/hooks/use-locations';

const locationFormSchema = z.object({
  name: z.string().min(1, 'Location name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  parentId: z.string().optional(),
});

type LocationFormData = z.infer<typeof locationFormSchema>;

interface LocationFormDialogProps {
  open: boolean;
  onClose: () => void;
  location?: Location; // If provided, edit mode; otherwise create mode
  parentLocation?: Location; // For creating child locations
  availableParents: Location[];
}

export function LocationFormDialog({
  open,
  onClose,
  location,
  parentLocation,
  availableParents,
}: LocationFormDialogProps) {
  const isEditing = Boolean(location);
  const createLocationMutation = useCreateLocation();
  const updateLocationMutation = useUpdateLocation();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LocationFormData>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: '',
      description: '',
      parentId: parentLocation?.id || '',
    },
  });

  // Reset form when dialog opens/closes or location changes
  useEffect(() => {
    if (open) {
      if (isEditing && location) {
        reset({
          name: location.name,
          description: location.description || '',
          parentId: location.parentId || '',
        });
      } else {
        reset({
          name: '',
          description: '',
          parentId: parentLocation?.id || '',
        });
      }
    }
  }, [open, isEditing, location, parentLocation, reset]);

  const onSubmit = async (data: LocationFormData) => {
    try {
      if (isEditing && location) {
        await updateLocationMutation.mutateAsync({
          id: location.id,
          data: {
            name: data.name,
            description: data.description || undefined,
            parentId: data.parentId || undefined,
          },
        });
      } else {
        await createLocationMutation.mutateAsync({
          name: data.name,
          description: data.description || undefined,
          parentId: data.parentId || undefined,
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save location:', error);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  // Filter out the current location and its descendants from parent options
  const parentOptions = availableParents.filter((parent) => {
    if (!isEditing || !location) return true;
    // Don't allow selecting self or descendants as parent
    return parent.id !== location.id && !parent.path.startsWith(location.path + '/');
  });

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {isEditing ? 'Edit Location' : 'Create Location'}
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {parentLocation && !isEditing && (
              <Typography variant="body2" color="text.secondary">
                Creating child location under: <strong>{parentLocation.name}</strong>
              </Typography>
            )}

            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Location Name"
                  error={!!errors.name}
                  helperText={errors.name?.message}
                  required
                  autoFocus
                  fullWidth
                />
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Description"
                  multiline
                  rows={3}
                  error={!!errors.description}
                  helperText={errors.description?.message}
                  fullWidth
                />
              )}
            />

            <Controller
              name="parentId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.parentId}>
                  <InputLabel>Parent Location</InputLabel>
                  <Select
                    {...field}
                    label="Parent Location"
                    value={field.value || ''}
                  >
                    <MenuItem value="">
                      <em>No Parent (Root Level)</em>
                    </MenuItem>
                    {parentOptions.map((parent) => (
                      <MenuItem key={parent.id} value={parent.id}>
                        {parent.path.replace(/\//g, ' → ')}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.parentId && (
                    <FormHelperText>{errors.parentId.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}