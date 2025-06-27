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
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useSchedulesPaginated } from '@/hooks/use-schedules';
import { ScheduleFilters } from '@/api/schedule-api';
import { Schedule } from '@/types';
import { ScheduleTable } from './ScheduleTable';
import { ScheduleFilters as FilterComponent } from './ScheduleFilters';
import { ScheduleFormDialog } from './ScheduleFormDialog';
import { ScheduleDeleteDialog } from './ScheduleDeleteDialog';
import { SchedulePreviewDialog } from './SchedulePreviewDialog';

type DialogState = {
  type: 'create' | 'edit' | 'delete' | 'preview' | null;
  schedule?: Schedule;
};

export function ScheduleManager() {
  const [filters, setFilters] = useState<ScheduleFilters>({
    page: 1,
    limit: 10,
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const [dialogState, setDialogState] = useState<DialogState>({ type: null });

  const {
    data: schedulesData,
    isLoading,
    error,
    refetch,
  } = useSchedulesPaginated(filters);

  const handleCreateSchedule = () => {
    setDialogState({ type: 'create' });
  };

  const handleEditSchedule = (schedule: Schedule) => {
    setDialogState({ type: 'edit', schedule });
  };

  const handleDeleteSchedule = (schedule: Schedule) => {
    setDialogState({ type: 'delete', schedule });
  };

  const handlePreviewSchedule = (schedule: Schedule) => {
    setDialogState({ type: 'preview', schedule });
  };

  const handleCloseDialog = () => {
    setDialogState({ type: null });
  };

  const handleFiltersChange = (newFilters: Partial<ScheduleFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  if (isLoading && !schedulesData) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Failed to load schedules: {error.message}
      </Alert>
    );
  }

  const schedules = schedulesData?.data || [];
  const totalCount = schedulesData?.total || 0;

  return (
    <Box>
      <Paper sx={{ m: 2 }}>
        {/* Header */}
        <Box sx={{ p: 3, pb: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <div>
              <Typography variant="h5" component="h1">
                Schedule Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Create and manage recurring and one-off task schedules
              </Typography>
            </div>
            <Stack direction="row" spacing={1}>
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
                onClick={handleCreateSchedule}
              >
                New Schedule
              </Button>
            </Stack>
          </Stack>

          {totalCount > 0 && (
            <Box sx={{ mb: 2 }}>
              <Chip 
                label={`${totalCount} schedule${totalCount !== 1 ? 's' : ''}`} 
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
        {schedules.length === 0 && !isLoading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No schedules found
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              {filters.search || filters.scheduleType 
                ? 'Try adjusting your search filters or create a new schedule'
                : 'Create your first schedule to automate task generation'
              }
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleCreateSchedule}
            >
              Create Schedule
            </Button>
          </Box>
        ) : (
          <ScheduleTable
            schedules={schedules}
            loading={isLoading}
            pagination={{
              total: totalCount,
              page: filters.page || 1,
              limit: filters.limit || 10,
              onPageChange: handlePageChange,
            }}
            onEdit={handleEditSchedule}
            onDelete={handleDeleteSchedule}
            onPreview={handlePreviewSchedule}
          />
        )}
      </Paper>

      {/* Dialogs */}
      <ScheduleFormDialog
        open={dialogState.type === 'create' || dialogState.type === 'edit'}
        onClose={handleCloseDialog}
        schedule={dialogState.schedule}
      />

      <ScheduleDeleteDialog
        open={dialogState.type === 'delete'}
        onClose={handleCloseDialog}
        schedule={dialogState.schedule || null}
      />

      <SchedulePreviewDialog
        open={dialogState.type === 'preview'}
        onClose={handleCloseDialog}
        schedule={dialogState.schedule || null}
      />
    </Box>
  );
}