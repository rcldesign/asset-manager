import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Avatar,
  Paper,
  Divider,
  Link,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TimerIcon from '@mui/icons-material/Timer';
import BuildIcon from '@mui/icons-material/Build';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { Task } from '@/types';
import { format } from 'date-fns';

interface TaskDetailsTabProps {
  task: Task;
}

export const TaskDetailsTab: React.FC<TaskDetailsTabProps> = ({ task }) => {
  const formatDate = (date: string | null | undefined) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'PPP');
  };

  const formatDateTime = (date: string | null | undefined) => {
    if (!date) return 'Not set';
    return format(new Date(date), 'PPP p');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Stack spacing={3}>
      {/* Assignment and Schedule Info */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom fontWeight="medium">
          Assignment & Schedule
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <PersonIcon color="action" />
            <Box flex={1}>
              <Typography variant="body2" color="text.secondary">
                Assigned To
              </Typography>
              {task.assignedUser ? (
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                    {getInitials(task.assignedUser.fullName || task.assignedUser.email)}
                  </Avatar>
                  <Typography variant="body2">
                    {task.assignedUser.fullName || task.assignedUser.email}
                  </Typography>
                </Box>
              ) : (
                <Typography variant="body2">Unassigned</Typography>
              )}
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={2}>
            <BuildIcon color="action" />
            <Box flex={1}>
              <Typography variant="body2" color="text.secondary">
                Related Asset
              </Typography>
              {task.asset ? (
                <Link
                  href={`/assets/${task.asset.id}`}
                  underline="hover"
                  sx={{ display: 'block', mt: 0.5 }}
                >
                  {task.asset.name}
                </Link>
              ) : (
                <Typography variant="body2">No asset linked</Typography>
              )}
            </Box>
          </Box>

          {task.scheduleId && (
            <Box display="flex" alignItems="center" gap={2}>
              <ScheduleIcon color="action" />
              <Box flex={1}>
                <Typography variant="body2" color="text.secondary">
                  Created by Schedule
                </Typography>
                <Typography variant="body2">
                  Schedule #{task.scheduleId}
                </Typography>
              </Box>
            </Box>
          )}
        </Stack>
      </Paper>

      {/* Dates and Time */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom fontWeight="medium">
          Dates & Time
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={2}>
          <Box display="flex" alignItems="center" gap={2}>
            <CalendarTodayIcon color="action" />
            <Box flex={1}>
              <Typography variant="body2" color="text.secondary">
                Due Date
              </Typography>
              <Typography variant="body2">{formatDate(task.dueDate)}</Typography>
            </Box>
          </Box>

          {task.completedAt && (
            <Box display="flex" alignItems="center" gap={2}>
              <CalendarTodayIcon color="action" />
              <Box flex={1}>
                <Typography variant="body2" color="text.secondary">
                  Completed At
                </Typography>
                <Typography variant="body2">{formatDateTime(task.completedAt)}</Typography>
              </Box>
            </Box>
          )}

          <Box display="flex" alignItems="center" gap={2}>
            <CalendarTodayIcon color="action" />
            <Box flex={1}>
              <Typography variant="body2" color="text.secondary">
                Created At
              </Typography>
              <Typography variant="body2">{formatDateTime(task.createdAt)}</Typography>
            </Box>
          </Box>

          <Box display="flex" alignItems="center" gap={2}>
            <CalendarTodayIcon color="action" />
            <Box flex={1}>
              <Typography variant="body2" color="text.secondary">
                Last Updated
              </Typography>
              <Typography variant="body2">{formatDateTime(task.updatedAt)}</Typography>
            </Box>
          </Box>
        </Stack>
      </Paper>

      {/* Cost and Duration */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom fontWeight="medium">
          Cost & Duration
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={2}>
          <Box>
            <Box display="flex" alignItems="center" gap={2} mb={1}>
              <AttachMoneyIcon color="action" />
              <Typography variant="body2" color="text.secondary">
                Cost
              </Typography>
            </Box>
            <Box display="flex" gap={4} ml={4}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Estimated
                </Typography>
                <Typography variant="body2">
                  {task.estimatedCost ? `$${task.estimatedCost.toFixed(2)}` : 'Not set'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Actual
                </Typography>
                <Typography variant="body2">
                  {task.actualCost ? `$${task.actualCost.toFixed(2)}` : 'Not recorded'}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box>
            <Box display="flex" alignItems="center" gap={2} mb={1}>
              <TimerIcon color="action" />
              <Typography variant="body2" color="text.secondary">
                Duration
              </Typography>
            </Box>
            <Box display="flex" gap={4} ml={4}>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Estimated
                </Typography>
                <Typography variant="body2">
                  {task.estimatedDuration ? `${task.estimatedDuration} hours` : 'Not set'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Actual
                </Typography>
                <Typography variant="body2">
                  {task.actualDuration ? `${task.actualDuration} hours` : 'Not recorded'}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Stack>
      </Paper>

      {/* Additional Info */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" gutterBottom fontWeight="medium">
          Additional Information
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={2}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Task ID
            </Typography>
            <Typography variant="body2" fontFamily="monospace">
              {task.id}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Organization ID
            </Typography>
            <Typography variant="body2" fontFamily="monospace">
              {task.organizationId}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Task Type
            </Typography>
            <Chip
              label={task.isAutomated ? 'Automated' : 'Manual'}
              size="small"
              variant="outlined"
            />
          </Box>
        </Stack>
      </Paper>
    </Stack>
  );
};