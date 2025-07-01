'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  Snackbar,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import InstallMobileIcon from '@mui/icons-material/InstallMobile';
import InstallDesktopIcon from '@mui/icons-material/InstallDesktop';
import OfflinePinIcon from '@mui/icons-material/OfflinePin';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SpeedIcon from '@mui/icons-material/Speed';
import IosShareIcon from '@mui/icons-material/IosShare';
import AddBoxIcon from '@mui/icons-material/AddBox';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  useEffect(() => {
    // Check if already installed
    if (isInStandaloneMode) {
      setIsInstalled(true);
      return;
    }

    // Check if install was previously dismissed
    const installDismissed = localStorage.getItem('pwa-install-dismissed');
    const dismissedTime = installDismissed ? parseInt(installDismissed, 10) : 0;
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);

    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after 30 seconds if not dismissed recently
      // For mobile devices, show earlier since PWA benefits are more significant
      if (daysSinceDismissed > (isMobile ? 3 : 7)) {
        const delay = isMobile ? 15000 : 30000; // 15s for mobile, 30s for desktop
        setTimeout(() => {
          setShowDialog(true);
        }, delay);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowSuccessMessage(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      if (isIOS) {
        setShowIOSInstructions(true);
      } else if (isAndroid) {
        // Provide Android-specific instructions if no prompt available
        alert('To install this app on Android, look for "Add to Home Screen" in your browser menu.');
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      setDeferredPrompt(null);
      setShowDialog(false);
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setShowDialog(false);
  };

  const handleIOSInstructionsClose = () => {
    setShowIOSInstructions(false);
    setShowDialog(false);
  };

  // Don't show anything if already installed
  if (isInstalled || isInStandaloneMode) {
    return null;
  }

  const features = [
    {
      icon: <OfflinePinIcon />,
      title: 'Work Offline',
      description: isMobile ? 'Access assets anywhere, anytime' : 'Access and update assets even without internet',
    },
    {
      icon: <CameraAltIcon />,
      title: isTouchDevice ? 'Camera Integration' : 'Camera Access',
      description: isMobile ? 'Capture photos with one tap' : 'Take photos directly from the app',
    },
    {
      icon: <NotificationsActiveIcon />,
      title: 'Push Notifications',
      description: isMobile ? 'Never miss important updates' : 'Get alerts for scheduled maintenance',
    },
    {
      icon: <SpeedIcon />,
      title: 'Faster Performance',
      description: isMobile ? 'Lightning-fast, app-like experience' : 'Instant loading and smooth experience',
    },
  ];

  return (
    <>
      {/* Install button in UI (optional) */}
      {(deferredPrompt || isIOS) && !showDialog && (
        <Button
          variant="outlined"
          startIcon={isMobile ? <InstallMobileIcon /> : <InstallDesktopIcon />}
          onClick={() => setShowDialog(true)}
          sx={{ display: { xs: 'none', sm: 'flex' } }}
        >
          Install App
        </Button>
      )}

      {/* Install Dialog */}
      <Dialog
        open={showDialog && !showIOSInstructions}
        onClose={handleDismiss}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {isMobile ? <InstallMobileIcon /> : <InstallDesktopIcon />}
            <Typography variant="h6">Install DumbAssets</Typography>
          </Box>
        </DialogTitle>
        
        <DialogContent>
          <Typography variant="body1" paragraph>
            Install DumbAssets for a better experience:
          </Typography>
          
          <List>
            {features.map((feature, index) => (
              <ListItem key={index}>
                <ListItemIcon>{feature.icon}</ListItemIcon>
                <ListItemText
                  primary={feature.title}
                  secondary={feature.description}
                />
              </ListItem>
            ))}
          </List>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            Installing won't take up much space and you can uninstall anytime from your device settings.
          </Alert>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleDismiss}>Maybe Later</Button>
          <Button onClick={handleInstall} variant="contained">
            Install Now
          </Button>
        </DialogActions>
      </Dialog>

      {/* iOS Installation Instructions */}
      <Dialog
        open={showIOSInstructions}
        onClose={handleIOSInstructionsClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Install on iOS</DialogTitle>
        
        <DialogContent>
          <Typography variant="body1" paragraph>
            To install DumbAssets on your iOS device:
          </Typography>
          
          <List>
            <ListItem>
              <ListItemIcon>
                <Typography variant="h6">1.</Typography>
              </ListItemIcon>
              <ListItemText
                primary="Tap the Share button"
                secondary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <IosShareIcon /> at the bottom of Safari
                  </Box>
                }
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <Typography variant="h6">2.</Typography>
              </ListItemIcon>
              <ListItemText
                primary="Scroll down and tap"
                secondary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <AddBoxIcon /> "Add to Home Screen"
                  </Box>
                }
              />
            </ListItem>
            
            <ListItem>
              <ListItemIcon>
                <Typography variant="h6">3.</Typography>
              </ListItemIcon>
              <ListItemText
                primary="Tap 'Add' in the top right"
                secondary="The app will appear on your home screen"
              />
            </ListItem>
          </List>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            Make sure you're using Safari browser for this to work.
          </Alert>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleIOSInstructionsClose} variant="contained">
            Got it
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Snackbar */}
      <Snackbar
        open={showSuccessMessage}
        autoHideDuration={6000}
        onClose={() => setShowSuccessMessage(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setShowSuccessMessage(false)}
          severity="success"
          sx={{ width: '100%' }}
        >
          DumbAssets has been installed successfully!
        </Alert>
      </Snackbar>
    </>
  );
};