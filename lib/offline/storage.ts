/**
 * Offline Storage Layer
 * Uses IndexedDB to store data locally and manage sync queue
 *
 * Key features:
 * - Persistent local cache for members, visitors, attendance
 * - Pending operations queue for when offline
 * - Automatic schema versioning
 */

export interface OfflineOperation {
  id: string;
  timestamp: number;
  type: 'create' | 'update' | 'delete';
  collection: 'members' | 'visitors' | 'attendance';
  documentId: string;
  data: Record<string, any>;
  tenantId: string;
  status: 'pending' | 'synced' | 'failed';
  error?: string;
  retryCount: number;
}

export interface SyncState {
  lastSyncTime: number;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
}

const DB_NAME = 'KerekeHubOffline';
const DB_VERSION = 1;

// Store names
const STORE_MEMBERS = 'members';
const STORE_VISITORS = 'visitors';
const STORE_ATTENDANCE = 'attendance';
const STORE_OPERATIONS = 'pending_operations';
const STORE_SYNC_STATE = 'sync_state';

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private syncStateListeners: Set<(state: SyncState) => void> = new Set();

  async initialize(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores if they don't exist
        if (!db.objectStoreNames.contains(STORE_MEMBERS)) {
          db.createObjectStore(STORE_MEMBERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_VISITORS)) {
          db.createObjectStore(STORE_VISITORS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_ATTENDANCE)) {
          db.createObjectStore(STORE_ATTENDANCE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_OPERATIONS)) {
          const opStore = db.createObjectStore(STORE_OPERATIONS, { keyPath: 'id' });
          opStore.createIndex('status', 'status', { unique: false });
          opStore.createIndex('timestamp', 'timestamp', { unique: false });
          opStore.createIndex('collection', 'collection', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_STATE)) {
          db.createObjectStore(STORE_SYNC_STATE, { keyPath: 'tenantId' });
        }
      };
    });

    return this.initPromise;
  }

  private getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) throw new Error('Offline storage not initialized');
    const transaction = this.db.transaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  // Member operations
  async saveMember(tenantId: string, memberId: string, data: Record<string, any>): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_MEMBERS, 'readwrite');
      const request = store.put({
        id: `${tenantId}#${memberId}`,
        tenantId,
        memberId,
        ...data,
        syncedAt: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getMember(tenantId: string, memberId: string): Promise<Record<string, any> | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_MEMBERS);
      const request = store.get(`${tenantId}#${memberId}`);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getMembersByTenant(tenantId: string): Promise<Record<string, any>[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_MEMBERS);
      const index = store.index('tenantId');
      const request = index.getAll(tenantId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  // Visitor operations
  async saveVisitor(tenantId: string, visitorId: string, data: Record<string, any>): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_VISITORS, 'readwrite');
      const request = store.put({
        id: `${tenantId}#${visitorId}`,
        tenantId,
        visitorId,
        ...data,
        syncedAt: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getVisitor(tenantId: string, visitorId: string): Promise<Record<string, any> | null> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_VISITORS);
      const request = store.get(`${tenantId}#${visitorId}`);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async getVisitorsByTenant(tenantId: string): Promise<Record<string, any>[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_VISITORS);
      const index = store.index('tenantId');
      const request = index.getAll(tenantId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || []);
    });
  }

  // Attendance operations
  async saveAttendance(
    tenantId: string,
    attendanceId: string,
    data: Record<string, any>
  ): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_ATTENDANCE, 'readwrite');
      const request = store.put({
        id: `${tenantId}#${attendanceId}`,
        tenantId,
        attendanceId,
        ...data,
        syncedAt: Date.now()
      });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAttendanceByDate(tenantId: string, date: string): Promise<Record<string, any>[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_ATTENDANCE);
      const index = store.index('tenantId');
      const request = index.getAll(tenantId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result?.filter((rec: any) => rec.date === date) || [];
        resolve(results);
      };
    });
  }

  // Pending operations queue
  async addPendingOperation(operation: Omit<OfflineOperation, 'id'>): Promise<string> {
    await this.initialize();
    const id = `${operation.tenantId}#${Date.now()}#${Math.random()}`;
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_OPERATIONS, 'readwrite');
      const request = store.put({ ...operation, id });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(id);
    });
  }

  async getPendingOperations(tenantId: string): Promise<OfflineOperation[]> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_OPERATIONS);
      const index = store.index('status');
      const request = index.getAll('pending');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const ops = (request.result || []).filter((op: any) => op.tenantId === tenantId);
        resolve(ops.sort((a, b) => a.timestamp - b.timestamp));
      };
    });
  }

  async markOperationSynced(operationId: string): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_OPERATIONS, 'readwrite');
      const request = store.get(operationId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const op = request.result;
        if (op) {
          op.status = 'synced';
          const updateRequest = store.put(op);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };
    });
  }

  async markOperationFailed(operationId: string, error: string): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_OPERATIONS, 'readwrite');
      const request = store.get(operationId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const op = request.result;
        if (op) {
          op.status = 'failed';
          op.error = error;
          op.retryCount = (op.retryCount || 0) + 1;
          const updateRequest = store.put(op);
          updateRequest.onerror = () => reject(updateRequest.error);
          updateRequest.onsuccess = () => {
            this.notifySyncStateChanged(op.tenantId);
            resolve();
          };
        } else {
          resolve();
        }
      };
    });
  }

  async getSyncState(tenantId: string): Promise<SyncState> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_SYNC_STATE);
      const request = store.get(tenantId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result || {
          lastSyncTime: 0,
          isSyncing: false,
          pendingCount: 0,
          failedCount: 0
        });
      };
    });
  }

  async updateSyncState(tenantId: string, state: Partial<SyncState>): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      const store = this.getStore(STORE_SYNC_STATE, 'readwrite');
      const current = this.getSyncState(tenantId);
      current.then(curr => {
        const updated = { tenantId, ...curr, ...state };
        const request = store.put(updated);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this.notifySyncStateChanged(tenantId);
          resolve();
        };
      });
    });
  }

  onSyncStateChanged(listener: (state: SyncState) => void): () => void {
    this.syncStateListeners.add(listener);
    return () => this.syncStateListeners.delete(listener);
  }

  private notifySyncStateChanged(tenantId: string): void {
    this.getSyncState(tenantId).then(state => {
      this.syncStateListeners.forEach(listener => listener(state));
    });
  }

  async clearAllData(): Promise<void> {
    await this.initialize();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('DB not initialized'));
      const transaction = this.db.transaction(
        [STORE_MEMBERS, STORE_VISITORS, STORE_ATTENDANCE, STORE_OPERATIONS, STORE_SYNC_STATE],
        'readwrite'
      );
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore(STORE_MEMBERS).clear();
      transaction.objectStore(STORE_VISITORS).clear();
      transaction.objectStore(STORE_ATTENDANCE).clear();
      transaction.objectStore(STORE_OPERATIONS).clear();
      transaction.objectStore(STORE_SYNC_STATE).clear();
    });
  }
}

export const offlineStorage = new OfflineStorage();
