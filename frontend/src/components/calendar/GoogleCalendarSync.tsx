'use client';

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  FormGroup,
  FormControlLabel,
  Divider,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Google as GoogleIcon,
  CalendarMonth as CalendarIcon,
  Sync as SyncIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Refresh as RefreshIcon,
  LinkOff as UnlinkIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import {
  useGoogleCalendarStatus,
  useConnectGoogleCalendar,
  useDisconnectGoogleCalendar,
  useSyncGoogleCalendar,
  useUpdateGoogleCalendarSettings,
} from '../../hooks/use-calendar-integration';

export default function GoogleCalendarSync() {
  const [syncInProgress, setSyncInProgress] = React.useState(false);

  const { data: status, isLoading, refetch } = useGoogleCalendarStatus();
  const connectMutation = useConnectGoogleCalendar();
  const disconnectMutation = useDisconnectGoogleCalendar();
  const syncMutation = useSyncGoogleCalendar();
  const updateSettingsMutation = useUpdateGoogleCalendarSettings();

  const isConnected = status?.connected || false;
  const lastSync = status?.lastSync;
  const syncSettings = status?.settings || {
    syncTasks: true,
    syncSchedules: true,
    autoSync: true,
    defaultCalendar: null,
  };

  const handleConnect = () => {
    // This will redirect to Google OAuth
    window.location.href = '/api/calendar/google/auth';
  };

  const handleDisconnect = async () => {
    if (confirm('Are you sure you want to disconnect your Google Calendar? This will stop syncing tasks and schedules.')) {
      try {
        await disconnectMutation.mutateAsync();
      } catch (error) {
        console.error('Failed to disconnect Google Calendar:', error);
      }
    }
  };

  const handleManualSync = async () => {
    setSyncInProgress(true);
    try {
      await syncMutation.mutateAsync();
      await refetch();
    } catch (error) {
      console.error('Manual sync failed:', error);
    } finally {
      setSyncInProgress(false);
    }
  };

  const handleSettingToggle = async (setting: string, value: boolean) => {
    try {
      await updateSettingsMutation.mutateAsync({
        ...syncSettings,
        [setting]: value,
      });
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const benefits = [
    'Automatically sync tasks to your Google Calendar',
    'View all your tasks alongside other calendar events',
    'Get Google Calendar reminders for tasks',
    'Sync changes in both directions',
  ];

  return (
    <Paper sx={{ p: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <GoogleIcon sx={{ fontSize: 40, color: '#4285F4' }} />
          <Typography variant="h5">
            Google Calendar Integration
          </Typography>
        </Box>
        <Typography variant="body2" color="textSecondary">
          {isConnected 
            ? 'Your Google Calendar is connected and syncing with your tasks.'
            : 'Connect your Google Calendar to sync tasks and schedules.'}
        </Typography>
      </Box>

      {!isConnected ? (
        <>
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Benefits of Google Calendar sync:
            </Typography>
            <List dense>
              {benefits.map((benefit, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <CheckIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={benefit} />
                </ListItem>
              ))}
            </List>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              What we&apos;ll access:
            </Typography>
            <Typography variant="caption">
              • Read and write access to your Google Calendar events<br />
              • Ability to create calendar events for tasks<br />
              • Your basic Google profile information
            </Typography>
          </Alert>

          <Button
            variant="contained"
            size="large"
            startIcon={<GoogleIcon />}
            onClick={handleConnect}
            disabled={connectMutation.isPending}
            sx={{
              backgroundColor: '#4285F4',
              '&:hover': {
                backgroundColor: '#357ae8',
              },
            }}
          >
            Connect Google Calendar
          </Button>
        </>
      ) : (
        <>
          {/* Connection Status */}
          <Alert 
            severity="success" 
            sx={{ mb: 3 }}
            action={
              <Tooltip title="Disconnect">
                <IconButton
                  color="inherit"
                  size="small"
                  onClick={handleDisconnect}
                  disabled={disconnectMutation.isPending}
                >
                  <UnlinkIcon />
                </IconButton>
              </Tooltip>
            }
          >
            <Typography variant="subtitle2">
              Connected to {status?.email}
            </Typography>
            {lastSync && (
              <Typography variant="caption">
                Last synced: {format(new Date(lastSync), 'MMM d, yyyy h:mm a')}
              </Typography>
            )}
          </Alert>

          {/* Sync Settings */}
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              Sync Settings
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={syncSettings.syncTasks}
                    onChange={(e) => handleSettingToggle('syncTasks', e.target.checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">Sync Tasks</Typography>
                    <Typography variant="caption" color="textSecondary">
                      Create calendar events for all tasks with due dates
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={syncSettings.syncSchedules}
                    onChange={(e) => handleSettingToggle('syncSchedules', e.target.checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">Sync Schedules</Typography>
                    <Typography variant="caption" color="textSecondary">
                      Create recurring events for scheduled tasks
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={syncSettings.autoSync}
                    onChange={(e) => handleSettingToggle('autoSync', e.target.checked)}
                    disabled={updateSettingsMutation.isPending}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body1">Auto-sync</Typography>
                    <Typography variant="caption" color="textSecondary">
                      Automatically sync changes every 15 minutes
                    </Typography>
                  </Box>
                }
              />
            </FormGroup>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Sync Status */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Sync Status
            </Typography>
            {status?.syncErrors && status.syncErrors.length > 0 ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Some items failed to sync:
                </Typography>
                {status.syncErrors.map((error, index) => (
                  <Typography key={index} variant="caption" display="block">
                    • {error}
                  </Typography>
                ))}
              </Alert>
            ) : (
              <Alert severity="success" icon={<CheckIcon />}>
                All items synced successfully
              </Alert>
            )}
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={syncInProgress ? <CircularProgress size={20} /> : <SyncIcon />}
              onClick={handleManualSync}
              disabled={syncInProgress || syncMutation.isPending}
            >
              {syncInProgress ? 'Syncing...' : 'Sync Now'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              Disconnect
            </Button>
          </Box>

          {/* Sync Info */}
          <Box sx={{ mt: 3 }}>
            <Typography variant="caption" color="textSecondary">
              {syncSettings.autoSync 
                ? 'Auto-sync is enabled. Changes will sync automatically every 15 minutes.'
                : 'Auto-sync is disabled. Use the Sync Now button to manually sync changes.'}
            </Typography>
          </Box>
        </>
      )}
    </Paper>
  );
}