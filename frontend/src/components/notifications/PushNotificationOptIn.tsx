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
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Snackbar,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  NotificationsActive as NotificationsActiveIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import {
  useNotificationSettings,
  useSubscribeToPushNotifications,
  useUnsubscribeFromPushNotifications,
} from '../../hooks/use-notification-settings';

interface PushNotificationOptInProps {
  onComplete?: () => void;
}

export default function PushNotificationOptIn({ onComplete }: PushNotificationOptInProps) {
  const [activeStep, setActiveStep] = React.useState(0);
  const [permission, setPermission] = React.useState<NotificationPermission>(
    typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'default'
  );
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { data: settings, isLoading } = useNotificationSettings();
  const subscribeMutation = useSubscribeToPushNotifications();
  const unsubscribeMutation = useUnsubscribeFromPushNotifications();

  const isSubscribed = !!settings?.pushSubscription;
  const pushEnabled = settings?.preferences.push.enabled;

  React.useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const checkBrowserSupport = () => {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  };

  const requestPermission = async () => {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted') {
        setActiveStep(1);
      } else if (result === 'denied') {
        setError('Push notifications have been blocked. Please enable them in your browser settings.');
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      setError('Failed to request notification permission.');
    }
  };

  const subscribeToPushNotifications = async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service workers are not supported');
      }

      const registration = await navigator.serviceWorker.ready;
      
      // Get the VAPID public key from the server
      const response = await fetch('/api/notifications/vapid-public-key');
      const { publicKey } = await response.json();
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      await subscribeMutation.mutateAsync(subscription.toJSON());
      
      setActiveStep(2);
      setShowSuccess(true);
      
      if (onComplete) {
        setTimeout(onComplete, 2000);
      }
    } catch (error) {
      console.error('Error subscribing to push notifications:', error);
      setError('Failed to subscribe to push notifications. Please try again.');
    }
  };

  const unsubscribeFromPushNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await unsubscribeMutation.mutateAsync();
        setShowSuccess(false);
        setActiveStep(0);
      }
    } catch (error) {
      console.error('Error unsubscribing from push notifications:', error);
      setError('Failed to unsubscribe from push notifications.');
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!checkBrowserSupport()) {
    return (
      <Alert severity="error">
        Your browser does not support push notifications. Please use a modern browser like Chrome, Firefox, or Edge.
      </Alert>
    );
  }

  const benefits = [
    'Get instant notifications when tasks are assigned to you',
    'Receive reminders for upcoming due dates',
    'Stay informed about schedule changes',
    'Get notified when someone mentions you',
  ];

  return (
    <Paper sx={{ p: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom>
          {isSubscribed ? 'Push Notifications Enabled' : 'Enable Push Notifications'}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {isSubscribed 
            ? 'You are currently receiving push notifications on this device.'
            : 'Stay up to date with real-time notifications directly in your browser.'}
        </Typography>
      </Box>

      {!isSubscribed && (
        <>
          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Benefits of push notifications:
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

          <Stepper activeStep={activeStep} orientation="vertical">
            <Step>
              <StepLabel
                optional={
                  permission === 'denied' && (
                    <Typography variant="caption" color="error">
                      Blocked - Enable in browser settings
                    </Typography>
                  )
                }
              >
                Grant Permission
              </StepLabel>
              <StepContent>
                <Typography variant="body2" paragraph>
                  We need your permission to send you push notifications. Click the button below and allow notifications when prompted.
                </Typography>
                <Button
                  variant="contained"
                  onClick={requestPermission}
                  disabled={permission === 'granted' || permission === 'denied'}
                  startIcon={<NotificationsIcon />}
                >
                  {permission === 'granted' ? 'Permission Granted' : 'Request Permission'}
                </Button>
              </StepContent>
            </Step>

            <Step>
              <StepLabel>Subscribe to Notifications</StepLabel>
              <StepContent>
                <Typography variant="body2" paragraph>
                  Now we'll set up push notifications for this device. This will allow you to receive notifications even when the app isn't open.
                </Typography>
                <Button
                  variant="contained"
                  onClick={subscribeToPushNotifications}
                  disabled={subscribeMutation.isPending}
                  startIcon={subscribeMutation.isPending ? <CircularProgress size={20} /> : <NotificationsActiveIcon />}
                >
                  {subscribeMutation.isPending ? 'Subscribing...' : 'Enable Notifications'}
                </Button>
              </StepContent>
            </Step>

            <Step>
              <StepLabel>All Set!</StepLabel>
              <StepContent>
                <Alert severity="success" sx={{ mb: 2 }}>
                  Push notifications are now enabled for this device. You can manage your notification preferences in the settings.
                </Alert>
                {onComplete && (
                  <Button onClick={onComplete}>
                    Go to Settings
                  </Button>
                )}
              </StepContent>
            </Step>
          </Stepper>
        </>
      )}

      {isSubscribed && (
        <Box>
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Push notifications are active on this device
            </Typography>
            <Typography variant="caption">
              You can manage which notifications you receive in your notification settings.
            </Typography>
          </Alert>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              color="error"
              onClick={unsubscribeFromPushNotifications}
              disabled={unsubscribeMutation.isPending}
            >
              Disable Push Notifications
            </Button>
            {onComplete && (
              <Button variant="contained" onClick={onComplete}>
                Manage Settings
              </Button>
            )}
          </Box>
        </Box>
      )}

      {!pushEnabled && isSubscribed && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Push notifications are disabled in your settings. Enable them to receive notifications.
        </Alert>
      )}

      <Snackbar
        open={showSuccess}
        autoHideDuration={6000}
        onClose={() => setShowSuccess(false)}
      >
        <Alert severity="success" onClose={() => setShowSuccess(false)}>
          Push notifications enabled successfully!
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Paper>
  );
}