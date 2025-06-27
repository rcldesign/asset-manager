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
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useAssetTemplatesPaginated } from '@/hooks/use-asset-templates';
import { AssetTemplateFilters } from '@/api/asset-template-api';
import { AssetTemplate } from '@/types';
import { AssetTemplateTable } from './AssetTemplateTable';
import { AssetTemplateFilters as FilterComponent } from './AssetTemplateFilters';
import { AssetTemplateFormDialog } from './AssetTemplateFormDialog';
import { AssetTemplateDeleteDialog } from './AssetTemplateDeleteDialog';
import { AssetTemplateCloneDialog } from './AssetTemplateCloneDialog';

type DialogState = {
  type: 'create' | 'edit' | 'delete' | 'clone' | null;
  template?: AssetTemplate;
};

export function AssetTemplateManager() {
  const [filters, setFilters] = useState<AssetTemplateFilters>({
    page: 1,
    limit: 10,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [dialogState, setDialogState] = useState<DialogState>({ type: null });

  const {
    data: templatesData,
    isLoading,
    error,
    refetch,
  } = useAssetTemplatesPaginated(filters);

  const handleCreateTemplate = () => {
    setDialogState({ type: 'create' });
  };

  const handleEditTemplate = (template: AssetTemplate) => {
    setDialogState({ type: 'edit', template });
  };

  const handleDeleteTemplate = (template: AssetTemplate) => {
    setDialogState({ type: 'delete', template });
  };

  const handleCloneTemplate = (template: AssetTemplate) => {
    setDialogState({ type: 'clone', template });
  };

  const handleCloseDialog = () => {
    setDialogState({ type: null });
  };

  const handleFiltersChange = (newFilters: Partial<AssetTemplateFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const handleExportTemplates = () => {
    // TODO: Implement export functionality
    console.log('Export templates clicked');
  };

  const handleImportTemplates = () => {
    // TODO: Implement import functionality
    console.log('Import templates clicked');
  };

  if (isLoading && !templatesData) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load asset templates: {error.message}
      </Alert>
    );
  }

  const templates = templatesData?.data || [];
  const totalCount = templatesData?.total || 0;

  return (
    <Box>
      <Paper sx={{ m: 2 }}>
        {/* Header */}
        <Box sx={{ p: 3, pb: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <div>
              <Typography variant="h5" component="h1">
                Asset Template Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create and manage reusable templates for your assets
              </Typography>
            </div>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<UploadIcon />}
                onClick={handleImportTemplates}
                size="small"
              >
                Import
              </Button>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleExportTemplates}
                size="small"
              >
                Export
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => refetch()}
                size="small"
              >
                Refresh
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateTemplate}
              >
                New Template
              </Button>
            </Stack>
          </Stack>

          {totalCount > 0 && (
            <Box sx={{ mb: 2 }}>
              <Chip 
                label={`${totalCount} template${totalCount !== 1 ? 's' : ''}`} 
                variant="outlined" 
                size="small" 
              />
            </Box>
          )}
        </Box>

        {/* Filters */}
        <FilterComponent
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />

        {/* Content */}
        {templates.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No asset templates found
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              {filters.search || filters.category 
                ? 'Try adjusting your search filters or create a new template'
                : 'Create your first asset template to standardize asset creation'
              }
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateTemplate}
            >
              Create Template
            </Button>
          </Box>
        ) : (
          <AssetTemplateTable
            templates={templates}
            loading={isLoading}
            pagination={{
              total: totalCount,
              page: filters.page || 1,
              limit: filters.limit || 10,
              onPageChange: handlePageChange,
            }}
            onEdit={handleEditTemplate}
            onDelete={handleDeleteTemplate}
            onClone={handleCloneTemplate}
          />
        )}
      </Paper>

      {/* Dialogs */}
      <AssetTemplateFormDialog
        open={dialogState.type === 'create' || dialogState.type === 'edit'}
        onClose={handleCloseDialog}
        template={dialogState.template}
      />

      <AssetTemplateDeleteDialog
        open={dialogState.type === 'delete'}
        onClose={handleCloseDialog}
        template={dialogState.template || null}
      />

      <AssetTemplateCloneDialog
        open={dialogState.type === 'clone'}
        onClose={handleCloseDialog}
        template={dialogState.template || null}
      />
    </Box>
  );
}