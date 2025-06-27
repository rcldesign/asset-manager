'use client';

import { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  IconButton,
  Stack,
  Chip,
  CircularProgress,
  Alert,
  Menu,
  MenuItem,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import { formatDistanceToNow, format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  useNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDeleteNotification,
  useClearAllNotifications,
} from '@/hooks/use-notifications';
import { Notification } from '@/types';
import { Pagination } from '@/components/ui/Pagination';
import { AppBar } from '@/components/layout/AppBar';

export default function NotificationsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { data, isLoading, isError, error } = useNotifications({ page, limit: 20 });
  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();
  const deleteMutation = useDeleteNotification();
  const clearAllMutation = useClearAllNotifications();

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsReadMutation.mutateAsync(notification.id);
    }
    
    // Navigate to related entity
    if (notification.assetId) {
      router.push(`/assets/${notification.assetId}`);
    } else if (notification.taskId) {
      router.push(`/tasks/${notification.taskId}`);
    } else if (notification.scheduleId) {
      router.push('/schedules');
    }
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsReadMutation.mutateAsync();
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      await clearAllMutation.mutateAsync();
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'info':
        return <InfoIcon color="info" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'success':
        return <CheckCircleIcon color="success" />;
      default:
        return <InfoIcon />;
    }
  };

  const getNotificationChip = (notification: Notification) => {
    if (notification.assetId) {
      return <Chip label="Asset" size="small" variant="outlined" />;
    }
    if (notification.taskId) {
      return <Chip label="Task" size="small" variant="outlined" />;
    }
    if (notification.scheduleId) {
      return <Chip label="Schedule" size="small" variant="outlined" />;
    }
    return null;
  };

  return (
    <>
      <AppBar />
      <Container maxWidth="lg">
        <Box py={4}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h4" component="h1">
              Notifications
            </Typography>
            <Box>
              <IconButton onClick={handleMenuOpen}>
                <MoreVertIcon />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
              >
                <MenuItem onClick={() => { handleMarkAllAsRead(); handleMenuClose(); }}>
                  <ListItemIcon>
                    <MarkEmailReadIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Mark all as read</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { handleClearAll(); handleMenuClose(); }}>
                  <ListItemIcon>
                    <ClearAllIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Clear all</ListItemText>
                </MenuItem>
              </Menu>
            </Box>
          </Stack>

          {isLoading ? (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress />
            </Box>
          ) : isError ? (
            <Alert severity="error">
              Error loading notifications: {error instanceof Error ? error.message : 'Unknown error'}
            </Alert>
          ) : data?.data.length === 0 ? (
            <Paper sx={{ p: 8, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No notifications
              </Typography>
              <Typography variant="body2" color="text.secondary">
                You&apos;ll see notifications here when there are updates about your assets, tasks, or schedules.
              </Typography>
            </Paper>
          ) : (
            <>
              <Paper>
                <List>
                  {data?.data.map((notification, index) => (
                    <ListItem
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      divider={index < data.data.length - 1}
                      sx={{
                        backgroundColor: notification.isRead ? 'transparent' : 'action.hover',
                        '&:hover': {
                          backgroundColor: 'action.selected',
                        },
                      }}
                    >
                      <ListItemIcon>
                        {getNotificationIcon(notification.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle1">
                              {notification.title}
                            </Typography>
                            {getNotificationChip(notification)}
                            {!notification.isRead && (
                              <Chip label="New" size="small" color="primary" />
                            )}
                          </Stack>
                        }
                        secondary={
                          <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary">
                              {notification.message}
                            </Typography>
                            <Typography variant="caption" color="text.disabled">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })} • 
                              {format(new Date(notification.createdAt), 'PPP')}
                            </Typography>
                          </Stack>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          aria-label="delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              </Paper>

              {data && data.totalPages > 1 && (
                <Box mt={3}>
                  <Pagination
                    page={page}
                    totalPages={data.totalPages}
                    onPageChange={setPage}
                  />
                </Box>
              )}
            </>
          )}
        </Box>
      </Container>
    </>
  );
}