'use client';

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  FormGroup,
  Divider,
  Button,
  TextField,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
} from '@mui/material';
import {
  Email as EmailIcon,
  Notifications as NotificationsIcon,
  Link as LinkIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
  useTestNotificationSettings,
} from '../../hooks/use-notification-settings';
import type { NotificationPreferences } from '../../api/notifications-api';

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
      id={`notification-tabpanel-${index}`}
      aria-labelledby={`notification-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function NotificationSettings() {
  const [tabValue, setTabValue] = React.useState(0);
  const [appriseUrls, setAppriseUrls] = React.useState('');
  const [testSuccess, setTestSuccess] = React.useState<Record<string, boolean>>({});

  const { data: settings, isLoading } = useNotificationSettings();
  const updateMutation = useUpdateNotificationSettings();
  const testMutation = useTestNotificationSettings();

  const preferences = settings?.preferences || {
    email: {
      enabled: false,
      taskAssigned: false,
      taskDue: false,
      taskOverdue: false,
      assetWarrantyExpiring: false,
      scheduleChanged: false,
      mentioned: false,
    },
    push: {
      enabled: false,
      taskAssigned: false,
      taskDue: false,
      taskOverdue: false,
      assetWarrantyExpiring: false,
      scheduleChanged: false,
      mentioned: false,
    },
    apprise: {
      enabled: false,
      urls: [],
    },
    webhooks: {
      enabled: false,
    },
  };

  React.useEffect(() => {
    if (preferences.apprise.urls) {
      setAppriseUrls(preferences.apprise.urls.join('\n'));
    }
  }, [preferences.apprise.urls]);

  const handleToggle = async (
    channel: keyof NotificationPreferences,
    field: string,
    value: boolean
  ) => {
    const updates = {
      [channel]: {
        ...preferences[channel],
        [field]: value,
      },
    };

    try {
      await updateMutation.mutateAsync(updates);
    } catch (error) {
      console.error('Failed to update notification settings:', error);
    }
  };

  const handleTestChannel = async (channel: 'email' | 'push' | 'apprise') => {
    try {
      const result = await testMutation.mutateAsync(channel);
      if (result.success) {
        setTestSuccess({ ...testSuccess, [channel]: true });
        setTimeout(() => {
          setTestSuccess(prev => ({ ...prev, [channel]: false }));
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to test notification channel:', error);
    }
  };

  const handleSaveAppriseUrls = async () => {
    const urls = appriseUrls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0);

    try {
      await updateMutation.mutateAsync({
        apprise: {
          ...preferences.apprise,
          urls,
        },
      });
    } catch (error) {
      console.error('Failed to save Apprise URLs:', error);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const notificationTypes = [
    { key: 'taskAssigned', label: 'Task Assigned', description: 'When a task is assigned to you' },
    { key: 'taskDue', label: 'Task Due', description: 'When a task is due soon' },
    { key: 'taskOverdue', label: 'Task Overdue', description: 'When a task becomes overdue' },
    { key: 'assetWarrantyExpiring', label: 'Warranty Expiring', description: 'When an asset warranty is expiring' },
    { key: 'scheduleChanged', label: 'Schedule Changed', description: 'When a schedule is modified' },
    { key: 'mentioned', label: 'Mentioned', description: 'When someone mentions you in a comment' },
  ];

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Notification Settings
      </Typography>
      <Typography variant="body2" color="textSecondary" paragraph>
        Configure how you want to receive notifications for different events.
      </Typography>

      <Tabs
        value={tabValue}
        onChange={(_, newValue) => setTabValue(newValue)}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab icon={<EmailIcon />} label="Email" />
        <Tab icon={<NotificationsIcon />} label="Push" />
        <Tab icon={<LinkIcon />} label="Apprise" />
      </Tabs>

      {/* Email Settings */}
      <TabPanel value={tabValue} index={0}>
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={preferences.email.enabled}
                onChange={(e) => handleToggle('email', 'enabled', e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="subtitle1">Enable Email Notifications</Typography>
                <Typography variant="caption" color="textSecondary">
                  Receive notifications via email
                </Typography>
              </Box>
            }
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        <FormGroup>
          {notificationTypes.map((type) => (
            <FormControlLabel
              key={type.key}
              control={
                <Switch
                  checked={preferences.email[type.key as keyof typeof preferences.email] as boolean}
                  onChange={(e) => handleToggle('email', type.key, e.target.checked)}
                  disabled={!preferences.email.enabled}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">{type.label}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {type.description}
                  </Typography>
                </Box>
              }
              sx={{ mb: 2 }}
            />
          ))}
        </FormGroup>

        <Box sx={{ mt: 3 }}>
          <Button
            variant="outlined"
            onClick={() => handleTestChannel('email')}
            disabled={!preferences.email.enabled || testMutation.isPending}
            startIcon={testSuccess.email ? <CheckIcon /> : null}
            color={testSuccess.email ? 'success' : 'primary'}
          >
            Test Email Notifications
          </Button>
        </Box>
      </TabPanel>

      {/* Push Settings */}
      <TabPanel value={tabValue} index={1}>
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={preferences.push.enabled}
                onChange={(e) => handleToggle('push', 'enabled', e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="subtitle1">Enable Push Notifications</Typography>
                <Typography variant="caption" color="textSecondary">
                  Receive browser push notifications
                </Typography>
              </Box>
            }
          />
        </Box>

        {settings?.pushSubscription && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Push notifications are enabled for this device
          </Alert>
        )}

        <Divider sx={{ my: 2 }} />

        <FormGroup>
          {notificationTypes.map((type) => (
            <FormControlLabel
              key={type.key}
              control={
                <Switch
                  checked={preferences.push[type.key as keyof typeof preferences.push] as boolean}
                  onChange={(e) => handleToggle('push', type.key, e.target.checked)}
                  disabled={!preferences.push.enabled}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">{type.label}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {type.description}
                  </Typography>
                </Box>
              }
              sx={{ mb: 2 }}
            />
          ))}
        </FormGroup>

        <Box sx={{ mt: 3 }}>
          <Button
            variant="outlined"
            onClick={() => handleTestChannel('push')}
            disabled={!preferences.push.enabled || testMutation.isPending}
            startIcon={testSuccess.push ? <CheckIcon /> : null}
            color={testSuccess.push ? 'success' : 'primary'}
          >
            Test Push Notifications
          </Button>
        </Box>
      </TabPanel>

      {/* Apprise Settings */}
      <TabPanel value={tabValue} index={2}>
        <Box sx={{ mb: 3 }}>
          <FormControlLabel
            control={
              <Switch
                checked={preferences.apprise.enabled}
                onChange={(e) => handleToggle('apprise', 'enabled', e.target.checked)}
              />
            }
            label={
              <Box>
                <Typography variant="subtitle1">Enable Apprise Notifications</Typography>
                <Typography variant="caption" color="textSecondary">
                  Send notifications to Slack, Discord, Telegram, and more
                </Typography>
              </Box>
            }
          />
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle2" gutterBottom>
          Apprise URLs
        </Typography>
        <Typography variant="caption" color="textSecondary" paragraph>
          Enter one URL per line. Supported services include Slack, Discord, Telegram, SMS, and many more.
        </Typography>
        
        <TextField
          multiline
          rows={4}
          fullWidth
          value={appriseUrls}
          onChange={(e) => setAppriseUrls(e.target.value)}
          placeholder={`discord://webhook_id/webhook_token
slack://TokenA/TokenB/TokenC/
telegram://bottoken/ChatID`}
          disabled={!preferences.apprise.enabled}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleSaveAppriseUrls}
            disabled={!preferences.apprise.enabled || updateMutation.isPending}
          >
            Save URLs
          </Button>
          <Button
            variant="outlined"
            onClick={() => handleTestChannel('apprise')}
            disabled={!preferences.apprise.enabled || testMutation.isPending}
            startIcon={testSuccess.apprise ? <CheckIcon /> : null}
            color={testSuccess.apprise ? 'success' : 'primary'}
          >
            Test Apprise
          </Button>
        </Box>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="textSecondary">
            Learn more about Apprise URL formats at{' '}
            <a
              href="https://github.com/caronc/apprise#supported-notifications"
              target="_blank"
              rel="noopener noreferrer"
            >
              Apprise Documentation
            </a>
          </Typography>
        </Box>
      </TabPanel>

      {updateMutation.isError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to save notification settings. Please try again.
        </Alert>
      )}
    </Paper>
  );
}