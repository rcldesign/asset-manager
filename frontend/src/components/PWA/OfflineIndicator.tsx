'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
  Snackbar, 
  Alert, 
  Chip, 
  Box, 
  Button, 
  Typography, 
  IconButton, 
  Collapse,
  useTheme,
  useMediaQuery 
} from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import WifiIcon from '@mui/icons-material/Wifi';
import RefreshIcon from '@mui/icons-material/Refresh';
import InfoIcon from '@mui/icons-material/Info';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? navigator.onLine : true
  );
  const [showNotification, setShowNotification] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [lastOfflineTime, setLastOfflineTime] = useState<Date | null>(null);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setShowNotification(true);
      setLastOfflineTime(null);
      setIsRetrying(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowNotification(true);
      setLastOfflineTime(new Date());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setShowNotification(false);
  };

  const handleRetryConnection = useCallback(async () => {
    setIsRetrying(true);
    
    try {
      // Attempt to fetch a lightweight resource to test connectivity
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await fetch('/api/health', {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
      });
      
      clearTimeout(timeoutId);
      
      // If successful, the online event should fire automatically
      // But in case it doesn't, we manually trigger it
      if (!navigator.onLine) {
        // Force a connection check
        window.dispatchEvent(new Event('online'));
      }
    } catch (error) {
      console.warn('Retry connection failed:', error);
    } finally {
      setIsRetrying(false);
    }
  }, []);

  const getOfflineDuration = () => {
    if (!lastOfflineTime) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastOfflineTime.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
  };

  return (
    <>
      {/* Enhanced persistent indicator */}
      <Box
        sx={{
          position: 'fixed',
          top: isMobile ? 70 : 80,
          right: isMobile ? 10 : 20,
          zIndex: 1200,
          display: !isOnline ? 'block' : 'none',
        }}
      >
        <Box
          sx={{
            backgroundColor: 'warning.main',
            color: 'warning.contrastText',
            borderRadius: 2,
            p: 1,
            minWidth: isMobile ? 140 : 160,
            boxShadow: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Chip
              icon={<WifiOffIcon />}
              label={`Offline ${getOfflineDuration()}`}
              size="small"
              sx={{
                backgroundColor: 'transparent',
                color: 'inherit',
                border: 'none',
                fontWeight: 'bold',
              }}
            />
            <IconButton
              size="small"
              onClick={() => setShowDetails(!showDetails)}
              sx={{ color: 'inherit', ml: 1 }}
            >
              {showDetails ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          
          <Collapse in={showDetails}>
            <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <Typography variant="caption" display="block" sx={{ mb: 1 }}>
                Your changes are saved locally and will sync when connection is restored.
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={isRetrying ? <RefreshIcon className="rotating" /> : <RefreshIcon />}
                onClick={handleRetryConnection}
                disabled={isRetrying}
                sx={{
                  color: 'inherit',
                  borderColor: 'rgba(255,255,255,0.5)',
                  '&:hover': {
                    borderColor: 'rgba(255,255,255,0.8)',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  },
                }}
                fullWidth
              >
                {isRetrying ? 'Checking...' : 'Retry Connection'}
              </Button>
            </Box>
          </Collapse>
        </Box>
      </Box>

      {/* Enhanced notification when status changes */}
      <Snackbar
        open={showNotification}
        autoHideDuration={isOnline ? 3000 : 6000}
        onClose={handleClose}
        anchorOrigin={{ 
          vertical: isMobile ? 'top' : 'bottom', 
          horizontal: 'center' 
        }}
      >
        <Alert
          onClose={handleClose}
          severity={isOnline ? 'success' : 'warning'}
          sx={{ 
            width: '100%',
            '& .MuiAlert-message': {
              width: '100%',
            },
          }}
          icon={isOnline ? <WifiIcon /> : <WifiOffIcon />}
          action={
            !isOnline ? (
              <Button
                color="inherit"
                size="small"
                startIcon={<InfoIcon />}
                onClick={() => setShowDetails(true)}
              >
                Learn More
              </Button>
            ) : null
          }
        >
          <Box>
            <Typography variant="body2" fontWeight="medium">
              {isOnline
                ? 'Connection restored!'
                : 'Working offline'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isOnline
                ? 'Your offline changes will be synchronized automatically.'
                : 'Changes are saved locally and will sync when you reconnect.'}
            </Typography>
          </Box>
        </Alert>
      </Snackbar>

      {/* CSS for rotation animation */}
      <style jsx global>{`
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .rotating {
          animation: rotate 1s linear infinite;
        }
      `}</style>
    </>
  );
};