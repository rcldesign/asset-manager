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
  CircularProgress,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { AssetTemplate } from '@/types';
import { useDeleteAssetTemplate, useAssetTemplateStats } from '@/hooks/use-asset-templates';

interface AssetTemplateDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  template: AssetTemplate | null;
}

export function AssetTemplateDeleteDialog({
  open,
  onClose,
  template,
}: AssetTemplateDeleteDialogProps) {
  const deleteTemplateMutation = useDeleteAssetTemplate();
  const { data: stats, isLoading: statsLoading } = useAssetTemplateStats(
    template?.id || '',
    !!template?.id && open
  );

  const handleDelete = async () => {
    if (!template) return;

    try {
      await deleteTemplateMutation.mutateAsync(template.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleClose = () => {
    if (!deleteTemplateMutation.isPending) {
      onClose();
    }
  };

  if (!template) return null;

  const isInUse = stats?.isInUse || false;
  const assetCount = stats?.assetCount || 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Delete Asset Template
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete the template{' '}
            <strong>&quot;{template.name}&quot;</strong>?
          </Typography>
          
          {template.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              {template.description}
            </Typography>
          )}

          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>Category:</strong> {template.category}
          </Typography>

          {statsLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2">Checking template usage...</Typography>
            </Box>
          ) : stats && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Assets using this template:</strong> {assetCount}
              </Typography>
              {stats.lastUsed && (
                <Typography variant="body2" color="text.secondary">
                  Last used: {new Date(stats.lastUsed).toLocaleDateString()}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {isInUse && assetCount > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Warning:</strong> This template is currently being used by {assetCount} asset{assetCount !== 1 ? 's' : ''}.
            </Typography>
            <Typography variant="body2">
              Deleting this template will not affect existing assets, but the template will no longer
              be available for creating new assets.
            </Typography>
          </Alert>
        )}

        <Alert severity="error">
          <Typography variant="body2">
            <strong>This action cannot be undone.</strong> The template and its field configuration
            will be permanently deleted.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={deleteTemplateMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          variant="contained"
          color="error"
          disabled={deleteTemplateMutation.isPending || statsLoading}
        >
          {deleteTemplateMutation.isPending ? 'Deleting...' : 'Delete Template'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}