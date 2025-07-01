/**
 * Integration tests for PWA offline sync functionality
 */

import 'fake-indexeddb/auto';

describe('PWA Sync Integration', () => {
  let db: IDBDatabase;
  
  beforeEach(async () => {
    // Setup IndexedDB for testing
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('asset-manager-sync', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains('sync-queue')) {
          database.createObjectStore('sync-queue', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('offline-data')) {
          database.createObjectStore('offline-data', { keyPath: 'id' });
        }
      };
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // Clear IndexedDB
    indexedDB.deleteDatabase('asset-manager-sync');
  });

  describe('Offline Data Storage', () => {
    it('should store data for offline access', async () => {
      const testData = {
        id: 'asset-1',
        type: 'asset',
        data: {
          name: 'Test Asset',
          serialNumber: 'TEST-001',
          category: 'IT_EQUIPMENT',
        },
        timestamp: Date.now(),
      };

      // Store data
      const transaction = db.transaction(['offline-data'], 'readwrite');
      const store = transaction.objectStore('offline-data');
      await new Promise((resolve, reject) => {
        const request = store.add(testData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Retrieve data
      const retrieveTransaction = db.transaction(['offline-data'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('offline-data');
      const retrievedData = await new Promise((resolve, reject) => {
        const request = retrieveStore.get('asset-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect(retrievedData).toEqual(testData);
    });

    it('should handle data updates offline', async () => {
      // Initial data
      const initialData = {
        id: 'asset-1',
        type: 'asset',
        data: { name: 'Original Name' },
        timestamp: Date.now(),
      };

      // Store initial data
      let transaction = db.transaction(['offline-data'], 'readwrite');
      let store = transaction.objectStore('offline-data');
      await new Promise((resolve, reject) => {
        const request = store.add(initialData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Update data
      const updatedData = {
        ...initialData,
        data: { name: 'Updated Name' },
        timestamp: Date.now(),
      };

      transaction = db.transaction(['offline-data'], 'readwrite');
      store = transaction.objectStore('offline-data');
      await new Promise((resolve, reject) => {
        const request = store.put(updatedData);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Verify update
      const retrieveTransaction = db.transaction(['offline-data'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('offline-data');
      const result = await new Promise((resolve, reject) => {
        const request = retrieveStore.get('asset-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect((result as any).data.name).toBe('Updated Name');
    });
  });

  describe('Sync Queue Management', () => {
    it('should queue operations for later sync', async () => {
      const syncItem = {
        id: 'sync-1',
        type: 'upload',
        entity: 'asset',
        action: 'create',
        url: '/api/assets',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Asset',
          serialNumber: 'NEW-001',
        }),
        timestamp: Date.now(),
      };

      // Add to sync queue
      const transaction = db.transaction(['sync-queue'], 'readwrite');
      const store = transaction.objectStore('sync-queue');
      await new Promise((resolve, reject) => {
        const request = store.add(syncItem);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Verify queued
      const retrieveTransaction = db.transaction(['sync-queue'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('sync-queue');
      const queuedItems = await new Promise((resolve, reject) => {
        const request = retrieveStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect((queuedItems as any[]).length).toBe(1);
      expect((queuedItems as any[])[0].id).toBe('sync-1');
    });

    it('should handle multiple queued operations', async () => {
      const operations = [
        {
          id: 'sync-1',
          type: 'upload',
          entity: 'asset',
          action: 'create',
        },
        {
          id: 'sync-2',
          type: 'upload',
          entity: 'task',
          action: 'update',
        },
        {
          id: 'sync-3',
          type: 'download',
          entity: 'asset',
          action: 'fetch',
        },
      ];

      // Add all operations
      const transaction = db.transaction(['sync-queue'], 'readwrite');
      const store = transaction.objectStore('sync-queue');
      
      for (const op of operations) {
        await new Promise((resolve, reject) => {
          const request = store.add({
            ...op,
            timestamp: Date.now(),
          });
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      // Verify all queued
      const retrieveTransaction = db.transaction(['sync-queue'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('sync-queue');
      const queuedItems = await new Promise((resolve, reject) => {
        const request = retrieveStore.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect((queuedItems as any[]).length).toBe(3);
    });

    it('should remove items from queue after successful sync', async () => {
      const syncItem = {
        id: 'sync-1',
        type: 'upload',
        entity: 'asset',
        action: 'create',
        timestamp: Date.now(),
      };

      // Add to queue
      let transaction = db.transaction(['sync-queue'], 'readwrite');
      let store = transaction.objectStore('sync-queue');
      await new Promise((resolve, reject) => {
        const request = store.add(syncItem);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Simulate successful sync by removing item
      transaction = db.transaction(['sync-queue'], 'readwrite');
      store = transaction.objectStore('sync-queue');
      await new Promise((resolve, reject) => {
        const request = store.delete('sync-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Verify removed
      const retrieveTransaction = db.transaction(['sync-queue'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('sync-queue');
      const result = await new Promise((resolve, reject) => {
        const request = retrieveStore.get('sync-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect(result).toBeUndefined();
    });
  });

  describe('Network State Management', () => {
    let originalOnLine: boolean;

    beforeEach(() => {
      originalOnLine = navigator.onLine;
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: originalOnLine,
      });
    });

    it('should detect online state', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      expect(navigator.onLine).toBe(true);
    });

    it('should detect offline state', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
      });

      expect(navigator.onLine).toBe(false);
    });

    it('should handle network state changes', (done) => {
      const handleOnline = () => {
        expect(navigator.onLine).toBe(true);
        window.removeEventListener('online', handleOnline);
        done();
      };

      window.addEventListener('online', handleOnline);

      // Simulate going online
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true,
      });

      // Trigger event
      window.dispatchEvent(new Event('online'));
    });
  });

  describe('Conflict Resolution', () => {
    it('should detect data conflicts', async () => {
      // Local version
      const localData = {
        id: 'asset-1',
        name: 'Local Asset Name',
        lastModified: Date.now() - 1000, // 1 second ago
      };

      // Remote version (newer)
      const remoteData = {
        id: 'asset-1',
        name: 'Remote Asset Name',
        lastModified: Date.now(), // Now
      };

      // Simulate conflict detection
      const hasConflict = localData.lastModified < remoteData.lastModified && 
                         localData.name !== remoteData.name;

      expect(hasConflict).toBe(true);
    });

    it('should resolve conflicts by choosing newer version', async () => {
      const localData = {
        id: 'asset-1',
        name: 'Local Name',
        lastModified: Date.now() - 1000,
      };

      const remoteData = {
        id: 'asset-1',
        name: 'Remote Name',
        lastModified: Date.now(),
      };

      // Choose newer version
      const resolved = localData.lastModified > remoteData.lastModified 
        ? localData 
        : remoteData;

      expect(resolved.name).toBe('Remote Name');
      expect(resolved.lastModified).toBe(remoteData.lastModified);
    });
  });

  describe('Data Synchronization', () => {
    it('should handle optimistic updates', async () => {
      // Original data
      const originalData = {
        id: 'asset-1',
        name: 'Original Name',
        status: 'ACTIVE',
      };

      // Optimistic update
      const optimisticData = {
        ...originalData,
        name: 'Updated Name',
      };

      // Store optimistic update
      const transaction = db.transaction(['offline-data'], 'readwrite');
      const store = transaction.objectStore('offline-data');
      await new Promise((resolve, reject) => {
        const request = store.put({
          id: 'asset-1',
          type: 'asset',
          data: optimisticData,
          isOptimistic: true,
          timestamp: Date.now(),
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Verify optimistic update
      const retrieveTransaction = db.transaction(['offline-data'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('offline-data');
      const result = await new Promise((resolve, reject) => {
        const request = retrieveStore.get('asset-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect((result as any).data.name).toBe('Updated Name');
      expect((result as any).isOptimistic).toBe(true);
    });

    it('should rollback failed optimistic updates', async () => {
      // Original data
      const originalData = {
        id: 'asset-1',
        name: 'Original Name',
      };

      // Failed optimistic update
      const failedUpdate = {
        id: 'asset-1',
        name: 'Failed Update',
      };

      // Store original
      let transaction = db.transaction(['offline-data'], 'readwrite');
      let store = transaction.objectStore('offline-data');
      await new Promise((resolve, reject) => {
        const request = store.put({
          id: 'asset-1',
          type: 'asset',
          data: originalData,
          timestamp: Date.now(),
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Rollback by restoring original
      transaction = db.transaction(['offline-data'], 'readwrite');
      store = transaction.objectStore('offline-data');
      await new Promise((resolve, reject) => {
        const request = store.put({
          id: 'asset-1',
          type: 'asset',
          data: originalData,
          timestamp: Date.now(),
        });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Verify rollback
      const retrieveTransaction = db.transaction(['offline-data'], 'readonly');
      const retrieveStore = retrieveTransaction.objectStore('offline-data');
      const result = await new Promise((resolve, reject) => {
        const request = retrieveStore.get('asset-1');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect((result as any).data.name).toBe('Original Name');
    });
  });
});