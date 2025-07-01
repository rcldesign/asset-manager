// Enhanced Service Worker for Asset Manager PWA
// This extends the basic service worker with more advanced features

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const IMAGE_CACHE = `images-${CACHE_VERSION}`;
const OFFLINE_CACHE = `offline-${CACHE_VERSION}`;

// Cache strategies
const CACHE_STRATEGIES = {
  CACHE_FIRST: 'cache-first',
  NETWORK_FIRST: 'network-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only',
};

// Route configurations
const ROUTE_STRATEGIES = {
  // Static assets - cache first
  '\\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$': CACHE_STRATEGIES.CACHE_FIRST,
  
  // API routes - network first with offline fallback
  '^/api/': CACHE_STRATEGIES.NETWORK_FIRST,
  
  // Pages - stale while revalidate
  '/$|^/dashboard|^/assets|^/tasks|^/reports': CACHE_STRATEGIES.STALE_WHILE_REVALIDATE,
  
  // Critical data - network only
  '^/api/auth|^/api/sync': CACHE_STRATEGIES.NETWORK_ONLY,
};

// URLs to precache
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/dashboard',
  '/assets',
  '/tasks',
  '/manifest.json',
];

// Background sync tags
const SYNC_TAGS = {
  ASSET_SYNC: 'asset-sync',
  TASK_SYNC: 'task-sync',
  IMAGE_UPLOAD: 'image-upload',
  GENERAL_SYNC: 'general-sync',
};

// Install event
self.addEventListener('install', (event) => {
  console.log('[SW Enhanced] Installing...');
  
  event.waitUntil(
    (async () => {
      // Cache static assets
      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(PRECACHE_URLS);
      
      // Cache offline fallbacks
      const offlineCache = await caches.open(OFFLINE_CACHE);
      await offlineCache.add('/offline.html');
      
      console.log('[SW Enhanced] Installation complete');
    })()
  );
  
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[SW Enhanced] Activating...');
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => 
        name.includes('static-') || 
        name.includes('dynamic-') || 
        name.includes('api-') || 
        name.includes('images-') ||
        name.includes('offline-')
      ).filter(name => !name.includes(CACHE_VERSION));
      
      await Promise.all(oldCaches.map(name => caches.delete(name)));
      
      console.log('[SW Enhanced] Activation complete');
    })()
  );
  
  self.clients.claim();
});

// Fetch event with advanced routing
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests for caching
  if (request.method !== 'GET') {
    return;
  }
  
  // Determine strategy based on URL
  const strategy = getStrategyForUrl(url.pathname);
  
  event.respondWith(
    executeStrategy(request, strategy)
  );
});

// Background sync
self.addEventListener('sync', (event) => {
  console.log('[SW Enhanced] Background sync:', event.tag);
  
  switch (event.tag) {
    case SYNC_TAGS.ASSET_SYNC:
      event.waitUntil(syncAssets());
      break;
    case SYNC_TAGS.TASK_SYNC:
      event.waitUntil(syncTasks());
      break;
    case SYNC_TAGS.IMAGE_UPLOAD:
      event.waitUntil(syncImages());
      break;
    case SYNC_TAGS.GENERAL_SYNC:
      event.waitUntil(syncAll());
      break;
    default:
      event.waitUntil(syncAll());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  console.log('[SW Enhanced] Push received');
  
  const options = {
    body: 'You have new updates in Asset Manager',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'View Updates',
        icon: '/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icon-192x192.png'
      }
    ]
  };
  
  if (event.data) {
    const data = event.data.json();
    options.body = data.body || options.body;
    options.data = { ...options.data, ...data };
  }
  
  event.waitUntil(
    self.registration.showNotification('Asset Manager', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW Enhanced] Notification click:', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    );
  }
});

// Message handling
self.addEventListener('message', (event) => {
  console.log('[SW Enhanced] Message received:', event.data);
  
  switch (event.data.type) {
    case 'MANUAL_SYNC':
      event.waitUntil(handleManualSync(event.source));
      break;
    case 'CLEAR_CACHE':
      event.waitUntil(clearAllCaches());
      break;
    case 'GET_CACHE_SIZE':
      event.waitUntil(getCacheSize(event.source));
      break;
    case 'QUEUE_OFFLINE_ACTION':
      event.waitUntil(queueOfflineAction(event.data.payload));
      break;
  }
});

// Strategy implementations
function getStrategyForUrl(pathname) {
  for (const [pattern, strategy] of Object.entries(ROUTE_STRATEGIES)) {
    if (new RegExp(pattern).test(pathname)) {
      return strategy;
    }
  }
  return CACHE_STRATEGIES.NETWORK_FIRST; // Default
}

async function executeStrategy(request, strategy) {
  switch (strategy) {
    case CACHE_STRATEGIES.CACHE_FIRST:
      return cacheFirstStrategy(request);
    case CACHE_STRATEGIES.NETWORK_FIRST:
      return networkFirstStrategy(request);
    case CACHE_STRATEGIES.STALE_WHILE_REVALIDATE:
      return staleWhileRevalidateStrategy(request);
    case CACHE_STRATEGIES.NETWORK_ONLY:
      return networkOnlyStrategy(request);
    case CACHE_STRATEGIES.CACHE_ONLY:
      return cacheOnlyStrategy(request);
    default:
      return networkFirstStrategy(request);
  }
}

async function cacheFirstStrategy(request) {
  const cacheName = getCacheNameForRequest(request);
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return getOfflineFallback(request);
  }
}

async function networkFirstStrategy(request) {
  const cacheName = getCacheNameForRequest(request);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return getOfflineFallback(request);
  }
}

async function staleWhileRevalidateStrategy(request) {
  const cacheName = getCacheNameForRequest(request);
  const cachedResponse = await caches.match(request);
  
  const networkUpdate = fetch(request).then(response => {
    if (response.ok) {
      const cache = caches.open(cacheName);
      cache.then(c => c.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);
  
  return cachedResponse || networkUpdate || getOfflineFallback(request);
}

async function networkOnlyStrategy(request) {
  try {
    return await fetch(request);
  } catch (error) {
    return getOfflineFallback(request);
  }
}

async function cacheOnlyStrategy(request) {
  const cachedResponse = await caches.match(request);
  return cachedResponse || getOfflineFallback(request);
}

function getCacheNameForRequest(request) {
  const url = new URL(request.url);
  
  if (url.pathname.startsWith('/api/')) {
    return API_CACHE;
  }
  
  if (request.destination === 'image') {
    return IMAGE_CACHE;
  }
  
  if (url.pathname.match(/\.(js|css)$/)) {
    return STATIC_CACHE;
  }
  
  return DYNAMIC_CACHE;
}

async function getOfflineFallback(request) {
  const url = new URL(request.url);
  
  // API requests - return offline response
  if (url.pathname.startsWith('/api/')) {
    return new Response(
      JSON.stringify({
        error: 'Offline',
        message: 'This request is not available offline',
        offline: true,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
  
  // Navigation requests - return offline page
  if (request.destination === 'document') {
    const offlineResponse = await caches.match('/offline.html');
    if (offlineResponse) {
      return offlineResponse;
    }
  }
  
  // Default response
  return new Response('Offline', { status: 503 });
}

// Sync functions
async function syncAll() {
  console.log('[SW Enhanced] Starting full sync');
  
  try {
    await Promise.all([
      syncAssets(),
      syncTasks(),
      syncImages(),
    ]);
    
    notifyClients({ type: 'SYNC_COMPLETE' });
  } catch (error) {
    console.error('[SW Enhanced] Sync failed:', error);
    notifyClients({ type: 'SYNC_ERROR', error: error.message });
  }
}

async function syncAssets() {
  const db = await openSyncDatabase();
  const transaction = db.transaction(['sync-queue'], 'readonly');
  const store = transaction.objectStore('sync-queue');
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const items = request.result.filter(item => item.entity === 'asset');
      await processSyncItems(items);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function syncTasks() {
  const db = await openSyncDatabase();
  const transaction = db.transaction(['sync-queue'], 'readonly');
  const store = transaction.objectStore('sync-queue');
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const items = request.result.filter(item => item.entity === 'task');
      await processSyncItems(items);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function syncImages() {
  const db = await openSyncDatabase();
  const transaction = db.transaction(['sync-queue'], 'readonly');
  const store = transaction.objectStore('sync-queue');
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = async () => {
      const items = request.result.filter(item => item.type === 'image');
      await processSyncItems(items);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function processSyncItems(items) {
  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      
      if (response.ok) {
        await removeSyncItem(item.id);
        notifyClients({
          type: 'SYNC_ITEM_COMPLETE',
          item: item,
        });
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[SW Enhanced] Sync item failed:', item.id, error);
      notifyClients({
        type: 'SYNC_ITEM_ERROR',
        item: item,
        error: error.message,
      });
    }
  }
}

// Database helpers
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
      if (!db.objectStoreNames.contains('offline-data')) {
        db.createObjectStore('offline-data', { keyPath: 'id' });
      }
    };
  });
}

async function removeSyncItem(id) {
  const db = await openSyncDatabase();
  const transaction = db.transaction(['sync-queue'], 'readwrite');
  const store = transaction.objectStore('sync-queue');
  
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function queueOfflineAction(payload) {
  const db = await openSyncDatabase();
  const transaction = db.transaction(['sync-queue'], 'readwrite');
  const store = transaction.objectStore('sync-queue');
  
  const item = {
    id: `${Date.now()}-${Math.random()}`,
    ...payload,
    timestamp: Date.now(),
  };
  
  return new Promise((resolve, reject) => {
    const request = store.add(item);
    request.onsuccess = () => {
      notifyClients({
        type: 'SYNC_ITEM_QUEUED',
        item: item,
      });
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Client communication
async function notifyClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage(message);
  });
}

async function handleManualSync(client) {
  try {
    await syncAll();
    client.postMessage({
      type: 'MANUAL_SYNC_COMPLETE',
    });
  } catch (error) {
    client.postMessage({
      type: 'MANUAL_SYNC_ERROR',
      error: error.message,
    });
  }
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  notifyClients({ type: 'CACHES_CLEARED' });
}

async function getCacheSize(client) {
  const cacheNames = await caches.keys();
  let totalSize = 0;
  
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }
  
  client.postMessage({
    type: 'CACHE_SIZE',
    size: totalSize,
    sizeFormatted: formatBytes(totalSize),
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}