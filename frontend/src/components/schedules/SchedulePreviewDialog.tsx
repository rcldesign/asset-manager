'use client';

import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Schedule as ScheduleIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';
import { Schedule, ScheduleType } from '@/types';
import { usePreviewOccurrences } from '@/hooks/use-schedules';

interface SchedulePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  schedule: Schedule | null;
}

export function SchedulePreviewDialog({
  open,
  onClose,
  schedule,
}: SchedulePreviewDialogProps) {
  const { data: previewData, isLoading, error } = usePreviewOccurrences({
    scheduleType: schedule?.scheduleType || ScheduleType.ONE_OFF,
    startDate: schedule?.startDate || '',
    endDate: schedule?.endDate || undefined,
    recurrenceRule: schedule?.recurrenceRule || undefined,
    intervalDays: schedule?.intervalDays || undefined,
    count: 10,
  });

  if (!schedule) return null;

  const getScheduleTypeLabel = (type: ScheduleType) => {
    const labels: Record<ScheduleType, string> = {
      ONE_OFF: 'One-off',
      FIXED_INTERVAL: 'Fixed Interval',
      CUSTOM: 'Custom',
    };
    return labels[type] || type;
  };

  const getScheduleTypeDescription = (schedule: Schedule) => {
    switch (schedule.scheduleType) {
      case ScheduleType.ONE_OFF:
        return 'This schedule will run once on the specified date.';
      case ScheduleType.FIXED_INTERVAL:
        return `This schedule repeats every ${schedule.intervalDays} day${schedule.intervalDays !== 1 ? 's' : ''}.`;
      case ScheduleType.CUSTOM:
        return `This schedule uses a custom recurrence rule: ${schedule.recurrenceRule || 'Not specified'}`;
      default:
        return 'No description available.';
    }
  };

  const taskTemplate = schedule.taskTemplate as Record<string, unknown>;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <ViewIcon color="primary" />
        Schedule Preview: {schedule.name}
      </DialogTitle>
      
      <DialogContent>
        {/* Schedule Information */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon />
            Schedule Details
          </Typography>
          
          {schedule.description && (
            <Typography variant="body2" color="text.secondary" paragraph>
              {schedule.description}
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Chip
              label={getScheduleTypeLabel(schedule.scheduleType)}
              color="primary"
              size="small"
            />
            <Chip
              label={schedule.isActive ? 'Active' : 'Inactive'}
              color={schedule.isActive ? 'success' : 'default'}
              size="small"
            />
            {schedule.asset && (
              <Chip
                label={`Asset: ${schedule.asset.name}`}
                color="info"
                size="small"
              />
            )}
          </Box>

          <Typography variant="body2" paragraph>
            {getScheduleTypeDescription(schedule)}
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">Start Date</Typography>
              <Typography variant="body2">
                {new Date(schedule.startDate).toLocaleDateString()}
              </Typography>
            </Box>
            
            {schedule.endDate && (
              <Box>
                <Typography variant="caption" color="text.secondary">End Date</Typography>
                <Typography variant="body2">
                  {new Date(schedule.endDate).toLocaleDateString()}
                </Typography>
              </Box>
            )}
            
            {schedule.nextOccurrence && (
              <Box>
                <Typography variant="caption" color="text.secondary">Next Occurrence</Typography>
                <Typography variant="body2">
                  {new Date(schedule.nextOccurrence).toLocaleDateString()}
                </Typography>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Task Template */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Task Template
          </Typography>
          
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2">{(taskTemplate?.title ?? 'No title') as string}</Typography>
            {(taskTemplate?.description as string) && (
              <Typography variant="body2" color="text.secondary">
                {taskTemplate.description as string}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              label={`Priority: ${(taskTemplate?.priority ?? 'Not specified') as string}`}
              size="small"
              variant="outlined"
            />
            {(taskTemplate?.estimatedDuration as number) && (
              <Chip
                label={`Duration: ${taskTemplate.estimatedDuration as number} min`}
                size="small"
                variant="outlined"
              />
            )}
            {(taskTemplate?.estimatedCost as number) && (
              <Chip
                label={`Cost: $${taskTemplate.estimatedCost as number}`}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </Paper>

        {/* Upcoming Occurrences */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalendarIcon />
            Upcoming Occurrences
          </Typography>
          
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : error ? (
            <Alert severity="error">
              Failed to load schedule preview: {error.message}
            </Alert>
          ) : previewData && previewData.occurrences.length > 0 ? (
            <Box>
              <List dense>
                {previewData.occurrences.map((occurrence, index) => (
                  <ListItem key={index} divider={index < previewData.occurrences.length - 1}>
                    <ListItemText
                      primary={new Date(occurrence).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                      secondary={new Date(occurrence).toLocaleDateString()}
                    />
                  </ListItem>
                ))}
              </List>
              {previewData.hasMore && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  And more occurrences beyond this preview...
                </Typography>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No upcoming occurrences found.
            </Typography>
          )}
        </Paper>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}