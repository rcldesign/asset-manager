'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  IconButton,
  Badge,
  Tooltip,
  Alert,
  Button,
  Box,
  Typography,
  LinearProgress,
  Card,
  CardContent,
  CardActions,
  Divider,
  useTheme,
  useMediaQuery,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';

interface SyncItem {
  id: string;
  type: 'upload' | 'download';
  entity: string;
  action: string;
  status: 'pending' | 'syncing' | 'success' | 'error' | 'conflict';
  error?: string;
  conflictData?: {
    local: any;
    remote: any;
    timestamp: string;
    field?: string;
  };
  timestamp?: number;
  retryCount?: number;
}

export const SyncStatus: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [syncItems, setSyncItems] = useState<SyncItem[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [expandedConflicts, setExpandedConflicts] = useState<Set<string>>(new Set());
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    // Listen for sync events from service worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SYNC_STATUS') {
          setSyncItems(event.data.items);
          setIsSyncing(event.data.isSyncing);
          setSyncProgress(event.data.progress);
        }
      });
    }

    // Check for pending sync items on mount
    checkPendingSyncItems();
  }, []);

  const checkPendingSyncItems = async () => {
    try {
      // Check IndexedDB for pending sync items
      if ('indexedDB' in window) {
        const db = await openSyncDatabase();
        const transaction = db.transaction(['sync-queue'], 'readonly');
        const store = transaction.objectStore('sync-queue');
        const items = await store.getAll();
        
        setSyncItems(items.map((item: any) => ({
          ...item,
          status: 'pending',
        })));
      }
    } catch (error) {
      console.error('Error checking pending sync items:', error);
    }
  };

  const openSyncDatabase = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('asset-manager-sync', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('sync-queue')) {
          db.createObjectStore('sync-queue', { keyPath: 'id' });
        }
      };
    });
  };

  const handleManualSync = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'MANUAL_SYNC',
      });
    }
  };

  const resolveConflict = (itemId: string, useLocal: boolean) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'RESOLVE_CONFLICT',
        itemId,
        useLocal,
      });
    }
    
    // Remove from expanded conflicts
    setExpandedConflicts(prev => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  };

  const toggleConflictExpansion = (itemId: string) => {
    setExpandedConflicts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const retryFailedItem = (itemId: string) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'RETRY_SYNC_ITEM',
        itemId,
      });
    }
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getStatusIcon = (status: SyncItem['status']) => {
    switch (status) {
      case 'pending':
        return <CircularProgress size={20} />;
      case 'syncing':
        return <CircularProgress size={20} />;
      case 'success':
        return <CheckCircleIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'conflict':
        return <WarningIcon color="warning" />;
    }
  };

  const getItemIcon = (type: SyncItem['type']) => {
    return type === 'upload' ? <CloudUploadIcon /> : <CloudDownloadIcon />;
  };

  const pendingCount = syncItems.filter((item) => 
    item.status === 'pending' || item.status === 'conflict'
  ).length;

  const hasErrors = syncItems.some((item) => item.status === 'error');

  return (
    <>
      <Tooltip title="Sync Status">
        <IconButton
          color="inherit"
          onClick={() => setOpen(true)}
          sx={{ ml: 1 }}
        >
          <Badge
            badgeContent={pendingCount}
            color={hasErrors ? 'error' : 'warning'}
          >
            <SyncIcon className={isSyncing ? 'rotating' : ''} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth={isMobile ? false : "md"}
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">Sync Status</Typography>
            <Button
              variant="contained"
              size="small"
              onClick={handleManualSync}
              disabled={isSyncing || pendingCount === 0}
              startIcon={<SyncIcon />}
            >
              Sync Now
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {isSyncing && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={syncProgress} />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                Syncing... {Math.round(syncProgress)}%
              </Typography>
            </Box>
          )}

          {syncItems.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              All changes are synchronized
            </Alert>
          ) : (
            <Box>
              {/* Summary cards */}
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {['pending', 'error', 'conflict'].map(status => {
                  const count = syncItems.filter(item => item.status === status).length;
                  if (count === 0) return null;
                  
                  return (
                    <Card key={status} variant="outlined" sx={{ flex: '1 1 120px', minWidth: 120 }}>
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box display="flex" alignItems="center" gap={1}>
                          {getStatusIcon(status as SyncItem['status'])}
                          <Box>
                            <Typography variant="h6" color={
                              status === 'error' ? 'error' : 
                              status === 'conflict' ? 'warning.main' : 'text.primary'
                            }>
                              {count}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {status === 'pending' ? 'Pending' : 
                               status === 'error' ? 'Failed' : 'Conflicts'}
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>

              {/* Sync items list */}
              <List sx={{ maxHeight: isMobile ? 'calc(100vh - 300px)' : 400, overflow: 'auto' }}>
                {syncItems.map((item) => (
                  <Box key={item.id}>
                    <ListItem 
                      sx={{ 
                        backgroundColor: item.status === 'conflict' ? 'warning.light' : 
                                         item.status === 'error' ? 'error.light' : 'transparent',
                        borderRadius: 1,
                        mb: 1,
                      }}
                    >
                      <ListItemIcon>{getItemIcon(item.type)}</ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" justifyContent="space-between" alignItems="center">
                            <Typography variant="body2" fontWeight="medium">
                              {item.action} {item.entity}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatTimestamp(item.timestamp)}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          item.status === 'error' ? (
                            <Box>
                              <Typography variant="caption" color="error" display="block">
                                {item.error}
                              </Typography>
                              {item.retryCount && item.retryCount > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  Retried {item.retryCount} times
                                </Typography>
                              )}
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() => retryFailedItem(item.id)}
                                sx={{ mt: 1 }}
                              >
                                Retry
                              </Button>
                            </Box>
                          ) : item.status === 'conflict' ? (
                            <Box>
                              <Typography variant="caption" color="warning.main" display="block">
                                Conflict detected - data was modified both locally and remotely
                              </Typography>
                              <Button
                                size="small"
                                onClick={() => toggleConflictExpansion(item.id)}
                                sx={{ mt: 1 }}
                              >
                                {expandedConflicts.has(item.id) ? 'Hide Details' : 'View Details'}
                              </Button>
                            </Box>
                          ) : null
                        }
                      />
                      <ListItemIcon>{getStatusIcon(item.status)}</ListItemIcon>
                    </ListItem>

                    {/* Expanded conflict resolution */}
                    {item.status === 'conflict' && expandedConflicts.has(item.id) && item.conflictData && (
                      <Card variant="outlined" sx={{ ml: 2, mr: 2, mb: 2 }}>
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>
                            Conflict Resolution Required
                          </Typography>
                          
                          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 2 }}>
                            <Box>
                              <Typography variant="caption" color="primary" fontWeight="bold">
                                Your Local Changes
                              </Typography>
                              <Box sx={{ 
                                backgroundColor: 'primary.light', 
                                p: 1, 
                                borderRadius: 1, 
                                mt: 0.5,
                                maxHeight: 100,
                                overflow: 'auto'
                              }}>
                                <Typography variant="caption" component="pre">
                                  {JSON.stringify(item.conflictData.local, null, 2)}
                                </Typography>
                              </Box>
                            </Box>
                            
                            <Box>
                              <Typography variant="caption" color="secondary" fontWeight="bold">
                                Remote Changes
                              </Typography>
                              <Box sx={{ 
                                backgroundColor: 'secondary.light', 
                                p: 1, 
                                borderRadius: 1, 
                                mt: 0.5,
                                maxHeight: 100,
                                overflow: 'auto'
                              }}>
                                <Typography variant="caption" component="pre">
                                  {JSON.stringify(item.conflictData.remote, null, 2)}
                                </Typography>
                              </Box>
                            </Box>
                          </Box>
                          
                          <CardActions sx={{ justifyContent: 'center', pt: 2 }}>
                            <Button
                              variant="contained"
                              color="primary"
                              onClick={() => resolveConflict(item.id, true)}
                              size="small"
                            >
                              Keep My Changes
                            </Button>
                            <Button
                              variant="contained"
                              color="secondary"
                              onClick={() => resolveConflict(item.id, false)}
                              size="small"
                            >
                              Use Remote Version
                            </Button>
                          </CardActions>
                        </CardContent>
                      </Card>
                    )}
                  </Box>
                ))}
              </List>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        @keyframes rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        
        .rotating {
          animation: rotate 2s linear infinite;
        }
      `}</style>
    </>
  );
};