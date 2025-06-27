'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  PlayArrow as GenerateIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { Schedule, ScheduleType } from '@/types';
import { Pagination } from '@/components/ui/Pagination';
import { useGenerateTasks } from '@/hooks/use-schedules';

interface ScheduleTableProps {
  schedules: Schedule[];
  loading?: boolean;
  pagination: {
    total: number;
    page: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  onEdit: (schedule: Schedule) => void;
  onDelete: (schedule: Schedule) => void;
  onPreview: (schedule: Schedule) => void;
}

export function ScheduleTable({
  schedules,
  loading = false,
  pagination,
  onEdit,
  onDelete,
  onPreview,
}: ScheduleTableProps) {
  const generateTasksMutation = useGenerateTasks();

  const getScheduleTypeColor = (type: ScheduleType) => {
    const colors: Record<ScheduleType, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'> = {
      ONE_OFF: 'secondary',
      FIXED_INTERVAL: 'primary',
      CUSTOM: 'info',
    };
    return colors[type] || 'default';
  };

  const getScheduleTypeLabel = (type: ScheduleType) => {
    const labels: Record<ScheduleType, string> = {
      ONE_OFF: 'One-off',
      FIXED_INTERVAL: 'Fixed Interval',
      CUSTOM: 'Custom',
    };
    return labels[type] || type;
  };

  const handleGenerateTasks = async (schedule: Schedule) => {
    try {
      await generateTasksMutation.mutateAsync({ id: schedule.id, count: 5 });
    } catch (error) {
      console.error('Failed to generate tasks:', error);
    }
  };

  if (loading && schedules.length === 0) {
    return (
      <Box display="flex" justifyContent="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Asset</TableCell>
              <TableCell>Start Date</TableCell>
              <TableCell>Next Occurrence</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id} hover>
                <TableCell>
                  <Box>
                    <Typography variant="body2" fontWeight="medium">
                      {schedule.name}
                    </Typography>
                    {schedule.description && (
                      <Typography variant="caption" color="text.secondary">
                        {schedule.description}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                
                <TableCell>
                  <Chip
                    label={getScheduleTypeLabel(schedule.scheduleType)}
                    color={getScheduleTypeColor(schedule.scheduleType)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                
                <TableCell>
                  {schedule.asset ? (
                    <Typography variant="body2">
                      {schedule.asset.name}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No asset
                    </Typography>
                  )}
                </TableCell>
                
                <TableCell>
                  <Typography variant="body2">
                    {format(new Date(schedule.startDate), 'MMM d, yyyy')}
                  </Typography>
                </TableCell>
                
                <TableCell>
                  {schedule.nextOccurrence ? (
                    <Typography variant="body2">
                      {format(new Date(schedule.nextOccurrence), 'MMM d, yyyy')}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      None
                    </Typography>
                  )}
                </TableCell>
                
                <TableCell>
                  <Chip
                    label={schedule.isActive ? 'Active' : 'Inactive'}
                    color={schedule.isActive ? 'success' : 'default'}
                    size="small"
                    variant={schedule.isActive ? 'filled' : 'outlined'}
                  />
                </TableCell>
                
                <TableCell>
                  <Typography variant="body2">
                    {format(new Date(schedule.createdAt), 'MMM d, yyyy')}
                  </Typography>
                </TableCell>
                
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    <Tooltip title="Preview occurrences">
                      <IconButton
                        size="small"
                        onClick={() => onPreview(schedule)}
                        color="info"
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    
                    {schedule.isActive && (
                      <Tooltip title="Generate tasks">
                        <IconButton
                          size="small"
                          onClick={() => handleGenerateTasks(schedule)}
                          color="success"
                          disabled={generateTasksMutation.isPending}
                        >
                          <GenerateIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    <Tooltip title="Edit schedule">
                      <IconButton
                        size="small"
                        onClick={() => onEdit(schedule)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    
                    <Tooltip title="Delete schedule">
                      <IconButton
                        size="small"
                        onClick={() => onDelete(schedule)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && (
        <Box display="flex" justifyContent="center" p={2}>
          <CircularProgress size={20} />
        </Box>
      )}

      <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
        <Pagination
          page={pagination.page}
          totalPages={Math.ceil(pagination.total / pagination.limit)}
          onPageChange={pagination.onPageChange}
        />
      </Box>
    </Box>
  );
}