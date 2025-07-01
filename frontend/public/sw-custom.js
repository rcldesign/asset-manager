// Enhanced Service Worker for Asset Manager PWA
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;

// URLs to cache on install
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// API endpoints to cache
const API_ROUTES = [
  '/api/assets',
  '/api/locations',
  '/api/asset-templates',
  '/api/tasks',
  '/api/schedules',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return (
              cacheName.startsWith('static-') ||
              cacheName.startsWith('dynamic-') ||
              cacheName.startsWith('api-') ||
              cacheName.startsWith('images-')
            ) && !cacheName.includes(CACHE_VERSION);
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // API requests - Network first, fall back to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      networkFirstStrategy(request, API_CACHE)
    );
    return;
  }
  
  // Image requests - Cache first, fall back to network
  if (request.destination === 'image') {
    event.respondWith(
      cacheFirstStrategy(request, IMAGE_CACHE)
    );
    return;
  }
  
  // Static assets - Cache first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      cacheFirstStrategy(request, STATIC_CACHE)
    );
    return;
  }
  
  // Everything else - Network first
  event.respondWith(
    networkFirstStrategy(request, DYNAMIC_CACHE)
  );
});

// Cache first strategy
async function cacheFirstStrategy(request, cacheName) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Cache hit:', request.url);
      return cachedResponse;
    }
    
    console.log('[SW] Cache miss, fetching:', request.url);
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error);
    
    // Return offline page for navigation requests
    if (request.destination === 'document') {
      const offlineResponse = await caches.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    throw error;
  }
}

// Network first strategy
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // For API requests, return a custom offline response
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({
          error: 'Offline',
          message: 'This data is not available offline',
          cached: false,
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    
    throw error;
  }
}

// Background sync for offline changes
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-changes') {
    event.waitUntil(syncOfflineChanges());
  }
});

async function syncOfflineChanges() {
  try {
    // Open IndexedDB to get pending changes
    const db = await openSyncDatabase();
    const transaction = db.transaction(['sync-queue'], 'readonly');
    const store = transaction.objectStore('sync-queue');
    const items = await store.getAll();
    
    // Send sync status to clients
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_STATUS',
        items: items,
        isSyncing: true,
        progress: 0,
      });
    });
    
    // Process each pending change
    let completed = 0;
    for (const item of items) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });
        
        if (response.ok) {
          // Remove from sync queue
          await removeSyncItem(item.id);
          completed++;
          
          // Update progress
          const progress = (completed / items.length) * 100;
          clients.forEach((client) => {
            client.postMessage({
              type: 'SYNC_STATUS',
              items: items,
              isSyncing: true,
              progress: progress,
            });
          });
        }
      } catch (error) {
        console.error('[SW] Failed to sync item:', item.id, error);
      }
    }
    
    // Notify completion
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_STATUS',
        items: [],
        isSyncing: false,
        progress: 100,
      });
    });
    
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// Helper functions for IndexedDB
function openSyncDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('asset-manager-sync', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sync-queue')) {
        db.createObjectStore('sync-queue', { keyPath: 'id' });
      }
    };
  });
}

async function removeSyncItem(id) {
  const db = await openSyncDatabase();
  const transaction = db.transaction(['sync-queue'], 'readwrite');
  const store = transaction.objectStore('sync-queue');
  return store.delete(id);
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data.type === 'MANUAL_SYNC') {
    // Trigger manual sync
    self.registration.sync.register('sync-offline-changes');
  }
  
  if (event.data.type === 'RESOLVE_CONFLICT') {
    // Handle conflict resolution
    handleConflictResolution(event.data.itemId, event.data.useLocal);
  }
});

async function handleConflictResolution(itemId, useLocal) {
  // Implementation for conflict resolution
  console.log('[SW] Resolving conflict for:', itemId, 'Use local:', useLocal);
  // Add your conflict resolution logic here
}