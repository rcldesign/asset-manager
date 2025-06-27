import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Chip,
  IconButton,
  Box,
  Typography,
  Tooltip,
  Stack,
  Avatar,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import WarningIcon from '@mui/icons-material/Warning';
import { Task, TaskStatus, TaskPriority } from '@/types';
import { format, isAfter, startOfToday } from 'date-fns';

interface TaskTableProps {
  tasks: Task[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort: (field: string) => void;
  onViewTask: (taskId: string) => void;
}

const statusColors: Record<TaskStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  [TaskStatus.PLANNED]: 'default',
  [TaskStatus.IN_PROGRESS]: 'info',
  [TaskStatus.DONE]: 'success',
  [TaskStatus.CANCELLED]: 'error',
  [TaskStatus.SKIPPED]: 'warning',
};

const priorityColors: Record<TaskPriority, 'default' | 'error' | 'warning' | 'info'> = {
  [TaskPriority.LOW]: 'info',
  [TaskPriority.MEDIUM]: 'default',
  [TaskPriority.HIGH]: 'warning',
  [TaskPriority.URGENT]: 'error',
};

const priorityIcons: Record<TaskPriority, string> = {
  [TaskPriority.LOW]: '↓',
  [TaskPriority.MEDIUM]: '→',
  [TaskPriority.HIGH]: '↑',
  [TaskPriority.URGENT]: '⚡',
};

export const TaskTable: React.FC<TaskTableProps> = ({
  tasks,
  sortBy,
  sortOrder,
  onSort,
  onViewTask,
}) => {
  const createSortHandler = (property: string) => () => {
    onSort(property);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '-';
    return format(new Date(date), 'MMM dd, yyyy');
  };

  const isOverdue = (dueDate: string | null | undefined) => {
    if (!dueDate) return false;
    return isAfter(startOfToday(), new Date(dueDate));
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
    <TableContainer>
      <Table sx={{ minWidth: 750 }} aria-labelledby="tableTitle">
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'title'}
                direction={sortBy === 'title' ? sortOrder : 'asc'}
                onClick={createSortHandler('title')}
              >
                Title
                {sortBy === 'title' ? (
                  <Box component="span" sx={visuallyHidden}>
                    {sortOrder === 'desc' ? 'sorted descending' : 'sorted ascending'}
                  </Box>
                ) : null}
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'status'}
                direction={sortBy === 'status' ? sortOrder : 'asc'}
                onClick={createSortHandler('status')}
              >
                Status
              </TableSortLabel>
            </TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'priority'}
                direction={sortBy === 'priority' ? sortOrder : 'asc'}
                onClick={createSortHandler('priority')}
              >
                Priority
              </TableSortLabel>
            </TableCell>
            <TableCell>Asset</TableCell>
            <TableCell>Assigned To</TableCell>
            <TableCell>
              <TableSortLabel
                active={sortBy === 'dueDate'}
                direction={sortBy === 'dueDate' ? sortOrder : 'asc'}
                onClick={createSortHandler('dueDate')}
              >
                Due Date
              </TableSortLabel>
            </TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} align="center">
                <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                  No tasks found
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => {
              const overdue = isOverdue(task.dueDate) && task.status !== TaskStatus.DONE;
              
              return (
                <TableRow
                  key={task.id}
                  hover
                  sx={{ 
                    '&:last-child td, &:last-child th': { border: 0 },
                    opacity: task.status === TaskStatus.DONE ? 0.7 : 1,
                  }}
                >
                  <TableCell component="th" scope="row">
                    <Box>
                      <Typography 
                        variant="body2" 
                        fontWeight="medium"
                        sx={{ 
                          textDecoration: task.status === TaskStatus.DONE ? 'line-through' : 'none' 
                        }}
                      >
                        {task.isAutomated && (
                          <Tooltip title="Automated task">
                            <AssignmentIcon fontSize="small" color="action" sx={{ mr: 1, verticalAlign: 'middle' }} />
                          </Tooltip>
                        )}
                        {task.title}
                      </Typography>
                      {task.description && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {task.description.length > 60
                            ? `${task.description.substring(0, 60)}...`
                            : task.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={task.status.replace('_', ' ')}
                      size="small"
                      color={statusColors[task.status]}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={<Typography variant="caption">{priorityIcons[task.priority]}</Typography>}
                      label={task.priority}
                      size="small"
                      color={priorityColors[task.priority]}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {task.asset ? (
                      <Typography variant="body2">
                        {task.asset.name}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {task.assignedUser ? (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                          {getInitials(task.assignedUser.fullName || task.assignedUser.email)}
                        </Avatar>
                        <Typography variant="body2">
                          {task.assignedUser.fullName || task.assignedUser.email}
                        </Typography>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Unassigned
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      {overdue && (
                        <Tooltip title="Overdue">
                          <WarningIcon color="error" fontSize="small" />
                        </Tooltip>
                      )}
                      <CalendarTodayIcon fontSize="small" color="action" />
                      <Typography 
                        variant="body2" 
                        color={overdue ? 'error' : 'text.primary'}
                      >
                        {formatDate(task.dueDate)}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      size="small"
                      onClick={() => onViewTask(task.id)}
                      aria-label={`View task ${task.title}`}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};