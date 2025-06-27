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
  Chip,
} from '@mui/material';
import { Warning as WarningIcon } from '@mui/icons-material';
import { Schedule, ScheduleType } from '@/types';
import { useDeleteSchedule, useScheduleStats } from '@/hooks/use-schedules';

interface ScheduleDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  schedule: Schedule | null;
}

export function ScheduleDeleteDialog({
  open,
  onClose,
  schedule,
}: ScheduleDeleteDialogProps) {
  const deleteScheduleMutation = useDeleteSchedule();
  const { data: stats, isLoading: statsLoading } = useScheduleStats(
    schedule?.id || '',
    !!schedule?.id && open
  );

  const handleDelete = async () => {
    if (!schedule) return;

    try {
      await deleteScheduleMutation.mutateAsync(schedule.id);
      onClose();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
    }
  };

  const handleClose = () => {
    if (!deleteScheduleMutation.isPending) {
      onClose();
    }
  };

  if (!schedule) return null;

  const getScheduleTypeLabel = (type: ScheduleType) => {
    const labels: Record<ScheduleType, string> = {
      ONE_OFF: 'One-off',
      FIXED_INTERVAL: 'Fixed Interval',
      CUSTOM: 'Custom',
    };
    return labels[type] || type;
  };

  const taskCount = stats?.taskCount || 0;
  const hasGeneratedTasks = taskCount > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        Delete Schedule
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 2 }}>
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete the schedule{' '}
            <strong>&quot;{schedule.name}&quot;</strong>?
          </Typography>
          
          {schedule.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              {schedule.description}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip
              label={getScheduleTypeLabel(schedule.scheduleType)}
              size="small"
              variant="outlined"
            />
            <Chip
              label={schedule.isActive ? 'Active' : 'Inactive'}
              size="small"
              color={schedule.isActive ? 'success' : 'default'}
              variant="outlined"
            />
            {schedule.asset && (
              <Chip
                label={`Asset: ${schedule.asset.name}`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>

          {statsLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, my: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="body2">Checking schedule usage...</Typography>
            </Box>
          ) : stats && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">
                <strong>Generated tasks:</strong> {taskCount}
              </Typography>
              {stats.lastGenerated && (
                <Typography variant="body2" color="text.secondary">
                  Last generated: {new Date(stats.lastGenerated).toLocaleDateString()}
                </Typography>
              )}
              {stats.nextOccurrence && (
                <Typography variant="body2" color="text.secondary">
                  Next occurrence: {new Date(stats.nextOccurrence).toLocaleDateString()}
                </Typography>
              )}
            </Box>
          )}
        </Box>

        {hasGeneratedTasks && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" gutterBottom>
              <strong>Warning:</strong> This schedule has generated {taskCount} task{taskCount !== 1 ? 's' : ''}.
            </Typography>
            <Typography variant="body2">
              Deleting this schedule will not affect existing tasks, but no new tasks will be
              generated from this schedule.
            </Typography>
          </Alert>
        )}

        <Alert severity="error">
          <Typography variant="body2">
            <strong>This action cannot be undone.</strong> The schedule and its configuration
            will be permanently deleted. Any future task generation will stop.
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions>
        <Button 
          onClick={handleClose} 
          disabled={deleteScheduleMutation.isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          variant="contained"
          color="error"
          disabled={deleteScheduleMutation.isPending || statsLoading}
        >
          {deleteScheduleMutation.isPending ? 'Deleting...' : 'Delete Schedule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}