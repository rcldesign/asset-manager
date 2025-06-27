'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Button,
  Stack,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CancelIcon from '@mui/icons-material/Cancel';
import { useRouter, useParams } from 'next/navigation';
import { useTask, useUpdateTaskStatus } from '@/hooks/use-tasks';
import { TaskStatus } from '@/types';
import { TaskDetailsTab } from '@/components/tasks/TaskDetailsTab';
import { TaskAttachmentsTab } from '@/components/tasks/TaskAttachmentsTab';
import { TaskHistoryTab } from '@/components/tasks/TaskHistoryTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`task-tabpanel-${index}`}
      aria-labelledby={`task-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const statusColors: Record<TaskStatus, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  [TaskStatus.PLANNED]: 'default',
  [TaskStatus.IN_PROGRESS]: 'info',
  [TaskStatus.DONE]: 'success',
  [TaskStatus.CANCELLED]: 'error',
  [TaskStatus.SKIPPED]: 'warning',
};

export default function TaskDetailPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data: task, isLoading, isError, error } = useTask(taskId);
  const updateStatusMutation = useUpdateTaskStatus();

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleBack = () => {
    router.push('/tasks');
  };

  const handleEdit = () => {
    router.push(`/tasks/${taskId}/edit`);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    try {
      await updateStatusMutation.mutateAsync({
        id: taskId,
        status: newStatus,
      });
      handleMenuClose();
    } catch (error) {
      console.error('Failed to update task status:', error);
    }
  };

  const handleDuplicate = () => {
    // TODO: Implement task duplication
    console.log('Duplicate task');
    handleMenuClose();
  };

  const handleDelete = () => {
    // TODO: Implement task deletion
    console.log('Delete task');
    handleMenuClose();
  };

  if (isLoading) {
    return (
      <Container>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (isError) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="error">
            Error loading task: {error instanceof Error ? error.message : 'Unknown error'}
          </Alert>
        </Box>
      </Container>
    );
  }

  if (!task) {
    return (
      <Container>
        <Box mt={4}>
          <Alert severity="warning">Task not found</Alert>
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box py={4}>
        <Stack direction="row" alignItems="center" spacing={2} mb={3}>
          <IconButton onClick={handleBack}>
            <ArrowBackIcon />
          </IconButton>
          <Box flex={1}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="h4" component="h1">
                {task.title}
              </Typography>
              <Chip
                label={task.status.replace('_', ' ')}
                size="small"
                color={statusColors[task.status]}
              />
              <Chip
                label={task.priority}
                size="small"
                variant="outlined"
                color={
                  task.priority === 'URGENT' ? 'error' :
                  task.priority === 'HIGH' ? 'warning' :
                  task.priority === 'MEDIUM' ? 'default' : 'info'
                }
              />
              {task.isAutomated && (
                <Chip label="Automated" size="small" variant="outlined" />
              )}
            </Stack>
            {task.description && (
              <Typography variant="body1" color="text.secondary" mt={1}>
                {task.description}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1}>
            {task.status === TaskStatus.PLANNED && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<PlayArrowIcon />}
                onClick={() => handleStatusChange(TaskStatus.IN_PROGRESS)}
                disabled={updateStatusMutation.isPending}
              >
                Start Task
              </Button>
            )}
            {task.status === TaskStatus.IN_PROGRESS && (
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon />}
                onClick={() => handleStatusChange(TaskStatus.DONE)}
                disabled={updateStatusMutation.isPending}
              >
                Complete
              </Button>
            )}
            {(task.status === TaskStatus.PLANNED || task.status === TaskStatus.IN_PROGRESS) && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                onClick={() => handleStatusChange(TaskStatus.CANCELLED)}
                disabled={updateStatusMutation.isPending}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={handleEdit}
            >
              Edit
            </Button>
            <IconButton onClick={handleMenuOpen}>
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
            >
              <MenuItem onClick={handleDuplicate}>Duplicate Task</MenuItem>
              <Divider />
              <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                Delete Task
              </MenuItem>
            </Menu>
          </Stack>
        </Stack>

        <Paper>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="task tabs">
            <Tab label="Details" />
            <Tab label="Attachments" />
            <Tab label="History" />
          </Tabs>
          <Divider />
          
          <Box sx={{ p: 3 }}>
            <TabPanel value={tabValue} index={0}>
              <TaskDetailsTab task={task} />
            </TabPanel>
            <TabPanel value={tabValue} index={1}>
              <TaskAttachmentsTab taskId={task.id} />
            </TabPanel>
            <TabPanel value={tabValue} index={2}>
              <TaskHistoryTab taskId={task.id} />
            </TabPanel>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}