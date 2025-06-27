import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stack,
  LinearProgress,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import WarningIcon from '@mui/icons-material/Warning';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import EventIcon from '@mui/icons-material/Event';
import { TaskStatus, TaskPriority } from '@/types';

interface TaskStatsCardsProps {
  stats: {
    total: number;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
  };
}

const statusLabels: Record<TaskStatus, string> = {
  [TaskStatus.PLANNED]: 'Planned',
  [TaskStatus.IN_PROGRESS]: 'In Progress',
  [TaskStatus.DONE]: 'Done',
  [TaskStatus.CANCELLED]: 'Cancelled',
  [TaskStatus.SKIPPED]: 'Skipped',
};

const priorityLabels: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: 'Low',
  [TaskPriority.MEDIUM]: 'Medium',
  [TaskPriority.HIGH]: 'High',
  [TaskPriority.URGENT]: 'Urgent',
};

export const TaskStatsCards: React.FC<TaskStatsCardsProps> = ({ stats }) => {
  const calculatePercentage = (value: number, total: number) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case TaskStatus.PLANNED:
        return '#9e9e9e';
      case TaskStatus.IN_PROGRESS:
        return '#2196f3';
      case TaskStatus.DONE:
        return '#4caf50';
      case TaskStatus.CANCELLED:
        return '#f44336';
      case TaskStatus.SKIPPED:
        return '#ff9800';
      default:
        return '#9e9e9e';
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case TaskPriority.LOW:
        return '#2196f3';
      case TaskPriority.MEDIUM:
        return '#9e9e9e';
      case TaskPriority.HIGH:
        return '#ff9800';
      case TaskPriority.URGENT:
        return '#f44336';
      default:
        return '#9e9e9e';
    }
  };

  return (
    <Box>
      <Box 
        sx={{ 
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: 2,
          mb: 2,
        }}
      >
        {/* Overview Card */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography color="text.secondary" variant="subtitle2">
                Total Tasks
              </Typography>
              <AssignmentIcon color="action" />
            </Stack>
            <Typography variant="h4" component="div">
              {stats.total}
            </Typography>
          </CardContent>
        </Card>

        {/* Overdue Card */}
        <Card sx={{ bgcolor: stats.overdue > 0 ? 'error.light' : undefined }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography color="text.secondary" variant="subtitle2">
                Overdue
              </Typography>
              <WarningIcon color={stats.overdue > 0 ? 'error' : 'action'} />
            </Stack>
            <Typography variant="h4" component="div" color={stats.overdue > 0 ? 'error.main' : undefined}>
              {stats.overdue}
            </Typography>
          </CardContent>
        </Card>

        {/* Due Today Card */}
        <Card sx={{ bgcolor: stats.dueToday > 0 ? 'warning.light' : undefined }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography color="text.secondary" variant="subtitle2">
                Due Today
              </Typography>
              <CalendarTodayIcon color={stats.dueToday > 0 ? 'warning' : 'action'} />
            </Stack>
            <Typography variant="h4" component="div" color={stats.dueToday > 0 ? 'warning.main' : undefined}>
              {stats.dueToday}
            </Typography>
          </CardContent>
        </Card>

        {/* Due This Week Card */}
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography color="text.secondary" variant="subtitle2">
                Due This Week
              </Typography>
              <EventIcon color="action" />
            </Stack>
            <Typography variant="h4" component="div">
              {stats.dueThisWeek}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, 1fr)',
          },
          gap: 2,
        }}
      >
        {/* Status Breakdown */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Status Breakdown
            </Typography>
            <Stack spacing={1}>
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <Box key={status}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="body2">
                      {statusLabels[status as TaskStatus] || status}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {count} ({calculatePercentage(count, stats.total)}%)
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={calculatePercentage(count, stats.total)}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: 'grey.200',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: getStatusColor(status as TaskStatus),
                      },
                    }}
                  />
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>

        {/* Priority Breakdown */}
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Priority Breakdown
            </Typography>
            <Stack spacing={1}>
              {Object.entries(stats.byPriority).map(([priority, count]) => (
                <Box key={priority}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="body2">
                      {priorityLabels[priority as TaskPriority] || priority}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {count} ({calculatePercentage(count, stats.total)}%)
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={calculatePercentage(count, stats.total)}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: 'grey.200',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: getPriorityColor(priority as TaskPriority),
                      },
                    }}
                  />
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};