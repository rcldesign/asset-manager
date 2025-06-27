'use client';

import React, { useState } from 'react';
import {
  IconButton,
  Badge,
  Popover,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Divider,
  Stack,
  CircularProgress,
  Alert,
} from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import MarkEmailReadIcon from '@mui/icons-material/MarkEmailRead';
import { formatDistanceToNow } from 'date-fns';
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
} from '@/hooks/use-notifications';
import { Notification } from '@/types';

export const NotificationBell: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  
  const { data: unreadCount } = useUnreadNotificationCount();
  const { data: notifications, isLoading, isError } = useNotifications({ limit: 10 });
  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsReadMutation.mutateAsync(notification.id);
    }
    
    // Navigate to related entity if applicable
    if (notification.assetId) {
      window.location.href = `/assets/${notification.assetId}`;
    } else if (notification.taskId) {
      window.location.href = `/tasks/${notification.taskId}`;
    } else if (notification.scheduleId) {
      window.location.href = `/schedules`;
    }
    
    handleClose();
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsReadMutation.mutateAsync();
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

  const open = Boolean(anchorEl);
  const id = open ? 'notification-popover' : undefined;
  const notificationCount = unreadCount?.count || 0;

  return (
    <>
      <IconButton
        aria-label="notifications"
        aria-describedby={id}
        onClick={handleClick}
        color="inherit"
      >
        <Badge badgeContent={notificationCount} color="error">
          <NotificationsIcon />
        </Badge>
      </IconButton>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <Box sx={{ width: 400, maxHeight: 600 }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6">Notifications</Typography>
              {notificationCount > 0 && (
                <Button
                  size="small"
                  startIcon={<MarkEmailReadIcon />}
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsReadMutation.isPending}
                >
                  Mark all read
                </Button>
              )}
            </Stack>
          </Box>

          {isLoading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : isError ? (
            <Box p={2}>
              <Alert severity="error">Error loading notifications</Alert>
            </Box>
          ) : notifications?.data.length === 0 ? (
            <Box p={4} textAlign="center">
              <NotificationsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No notifications</Typography>
            </Box>
          ) : (
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {notifications?.data.map((notification) => (
                <ListItem
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
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
                    primary={notification.title}
                    secondary={
                      <Stack spacing={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          {notification.message}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}

          {notifications && notifications.data.length > 0 && (
            <>
              <Divider />
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Button
                  fullWidth
                  href="/notifications"
                  onClick={handleClose}
                >
                  View all notifications
                </Button>
              </Box>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
};