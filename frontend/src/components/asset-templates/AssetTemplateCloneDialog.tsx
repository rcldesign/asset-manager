'use client';

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
} from '@mui/material';
import { ContentCopy as CloneIcon } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AssetTemplate } from '@/types';
import { useCloneAssetTemplate } from '@/hooks/use-asset-templates';

const cloneFormSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
});

type CloneFormData = z.infer<typeof cloneFormSchema>;

interface AssetTemplateCloneDialogProps {
  open: boolean;
  onClose: () => void;
  template: AssetTemplate | null;
}

export function AssetTemplateCloneDialog({
  open,
  onClose,
  template,
}: AssetTemplateCloneDialogProps) {
  const cloneTemplateMutation = useCloneAssetTemplate();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CloneFormData>({
    resolver: zodResolver(cloneFormSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open && template) {
      reset({
        name: `${template.name} (Copy)`,
        description: template.description || '',
      });
    }
  }, [open, template, reset]);

  const onSubmit = async (data: CloneFormData) => {
    if (!template) return;

    try {
      await cloneTemplateMutation.mutateAsync({
        id: template.id,
        name: data.name,
        description: data.description || undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to clone template:', error);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!template) return null;

  const getFieldsCount = (template: AssetTemplate) => {
    const defaultCount = Object.keys(template.defaultFields || {}).length;
    const customCount = Object.keys(template.customFields || {}).length;
    return { defaultCount, customCount, total: defaultCount + customCount };
  };

  const fieldsCount = getFieldsCount(template);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloneIcon color="primary" />
          Clone Asset Template
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Cloning: {template.name}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>Category:</strong> {template.category}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" gutterBottom>
              <strong>Fields:</strong> {fieldsCount.total} field{fieldsCount.total !== 1 ? 's' : ''}
              {fieldsCount.total > 0 && (
                <span>
                  {' '}({fieldsCount.defaultCount} default
                  {fieldsCount.customCount > 0 && `, ${fieldsCount.customCount} custom`})
                </span>
              )}
            </Typography>

            {template.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {template.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="New Template Name"
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
          </Box>

          <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
            <Typography variant="body2">
              <strong>Note:</strong> The cloned template will include all field configurations
              and settings from the original template. You can modify these after cloning.
            </Typography>
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
            startIcon={<CloneIcon />}
          >
            {isSubmitting ? 'Cloning...' : 'Clone Template'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}