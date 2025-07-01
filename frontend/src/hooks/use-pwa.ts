'use client';

import { useState, useEffect, useCallback } from 'react';

interface PWAState {
  isOnline: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  hasCameraAccess: boolean;
  hasNotificationPermission: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  pendingSyncCount: number;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const usePWA = () => {
  const [state, setState] = useState<PWAState>({
    isOnline: typeof window !== 'undefined' ? navigator.onLine : true,
    isInstallable: false,
    isInstalled: false,
    hasCameraAccess: false,
    hasNotificationPermission: false,
    syncStatus: 'idle',
    pendingSyncCount: 0,
  });

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  // Check if PWA is installed
  const checkInstallStatus = useCallback(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const isIOSInstalled = (window.navigator as any).standalone === true;
    
    setState(prev => ({
      ...prev,
      isInstalled: isStandalone || isIOSInstalled,
    }));
  }, []);

  // Check camera permissions
  const checkCameraAccess = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return false;
      }

      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      const hasAccess = result.state === 'granted';
      
      setState(prev => ({
        ...prev,
        hasCameraAccess: hasAccess,
      }));

      return hasAccess;
    } catch (error) {
      console.warn('Camera permission check failed:', error);
      return false;
    }
  }, []);

  // Check notification permissions
  const checkNotificationPermission = useCallback(async () => {
    try {
      if (!('Notification' in window)) {
        return false;
      }

      const permission = Notification.permission === 'granted';
      
      setState(prev => ({
        ...prev,
        hasNotificationPermission: permission,
      }));

      return permission;
    } catch (error) {
      console.warn('Notification permission check failed:', error);
      return false;
    }
  }, []);

  // Request camera access
  const requestCameraAccess = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      
      // Stop the stream immediately as we just needed permission
      stream.getTracks().forEach(track => track.stop());
      
      setState(prev => ({
        ...prev,
        hasCameraAccess: true,
      }));

      return true;
    } catch (error) {
      console.error('Camera access denied:', error);
      setState(prev => ({
        ...prev,
        hasCameraAccess: false,
      }));
      return false;
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    try {
      if (!('Notification' in window)) {
        throw new Error('Notifications not supported');
      }

      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      
      setState(prev => ({
        ...prev,
        hasNotificationPermission: granted,
      }));

      return granted;
    } catch (error) {
      console.error('Notification permission denied:', error);
      return false;
    }
  }, []);

  // Install PWA
  const installPWA = useCallback(async () => {
    if (!deferredPrompt) {
      throw new Error('Install prompt not available');
    }

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setState(prev => ({
          ...prev,
          isInstallable: false,
          isInstalled: true,
        }));
      }
      
      setDeferredPrompt(null);
      return outcome === 'accepted';
    } catch (error) {
      console.error('PWA installation failed:', error);
      return false;
    }
  }, [deferredPrompt]);

  // Check sync status
  const checkSyncStatus = useCallback(async () => {
    try {
      if ('indexedDB' in window) {
        const db = await openSyncDatabase();
        const transaction = db.transaction(['sync-queue'], 'readonly');
        const store = transaction.objectStore('sync-queue');
        
        return new Promise<number>((resolve, reject) => {
          const request = store.count();
          request.onsuccess = () => {
            const count = request.result;
            setState(prev => ({
              ...prev,
              pendingSyncCount: count,
            }));
            resolve(count);
          };
          request.onerror = () => reject(request.error);
        });
      }
      return 0;
    } catch (error) {
      console.error('Failed to check sync status:', error);
      return 0;
    }
  }, []);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      setState(prev => ({ ...prev, syncStatus: 'syncing' }));
      
      navigator.serviceWorker.controller.postMessage({
        type: 'MANUAL_SYNC',
      });
      
      // Reset status after a delay (real implementation would listen for completion)
      setTimeout(() => {
        setState(prev => ({ ...prev, syncStatus: 'idle' }));
        checkSyncStatus();
      }, 3000);
    }
  }, [checkSyncStatus]);

  // Helper function to open sync database
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

  // Setup event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Online/offline events
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      triggerSync(); // Auto-sync when coming online
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
    };

    // Install prompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setState(prev => ({ ...prev, isInstallable: true }));
    };

    // App installed event
    const handleAppInstalled = () => {
      setState(prev => ({
        ...prev,
        isInstalled: true,
        isInstallable: false,
      }));
      setDeferredPrompt(null);
    };

    // Service worker message handler
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data.type === 'SYNC_STATUS') {
        setState(prev => ({
          ...prev,
          syncStatus: event.data.isSyncing ? 'syncing' : 'idle',
          pendingSyncCount: event.data.items?.length || 0,
        }));
      }
    };

    // Register event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    // Initial checks
    checkInstallStatus();
    checkCameraAccess();
    checkNotificationPermission();
    checkSyncStatus();

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, [checkInstallStatus, checkCameraAccess, checkNotificationPermission, checkSyncStatus, triggerSync]);

  return {
    ...state,
    deferredPrompt,
    installPWA,
    requestCameraAccess,
    requestNotificationPermission,
    triggerSync,
    checkSyncStatus,
  };
};