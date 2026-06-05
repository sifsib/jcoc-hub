/**
 * Offline Sync Manager
 * Handles syncing pending operations back to Firestore when online
 * Uses batch operations for efficiency and conflict resolution
 */

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  getDoc,
  getDocs,
  query,
  where,
  Firestore
} from 'firebase/firestore';
import { offlineStorage, OfflineOperation, SyncState } from './offline-storage';

export interface SyncResult {
  successful: number;
  failed: number;
  errors: Array<{ operationId: string; error: string }>;
}

class OfflineSync {
  private db: Firestore | null = null;
  private syncInProgress = new Map<string, boolean>();
  private syncIntervals = new Map<string, NodeJS.Timeout>();
  private onlineListenerAttached = false;

  setDatabase(db: Firestore): void {
    this.db = db;
  }

  startAutoSync(): void {
    if (this.onlineListenerAttached) return;
    this.onlineListenerAttached = true;

    // Listen for online/offline changes
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Initial check
    if (navigator.onLine) {
      this.handleOnline();
    }
  }

  private handleOnline(): void {
    // When coming online, trigger sync for all tenants with pending ops
    offlineStorage.getPendingOperations('').catch(err => {
      console.warn('Failed to get pending operations on online:', err);
    });
  }

  private handleOffline(): void {
    // Stop any in-progress syncs when going offline
    this.syncIntervals.forEach(interval => clearInterval(interval));
    this.syncIntervals.clear();
  }

  async syncTenant(tenantId: string): Promise<SyncResult> {
    if (!this.db) throw new Error('Database not initialized');
    if (this.syncInProgress.get(tenantId)) {
      return { successful: 0, failed: 0, errors: [] };
    }

    this.syncInProgress.set(tenantId, true);
    try {
      await offlineStorage.updateSyncState(tenantId, { isSyncing: true });

      const operations = await offlineStorage.getPendingOperations(tenantId);
      if (operations.length === 0) {
        await offlineStorage.updateSyncState(tenantId, { isSyncing: false });
        return { successful: 0, failed: 0, errors: [] };
      }

      const result = await this.batchSyncOperations(tenantId, operations);

      // Update counts
      const remaining = await offlineStorage.getPendingOperations(tenantId);
      const failed = remaining.filter(op => op.status === 'failed').length;

      await offlineStorage.updateSyncState(tenantId, {
        isSyncing: false,
        lastSyncTime: Date.now(),
        pendingCount: remaining.length,
        failedCount: failed
      });

      return result;
    } finally {
      this.syncInProgress.set(tenantId, false);
    }
  }

  private async batchSyncOperations(
    tenantId: string,
    operations: OfflineOperation[]
  ): Promise<SyncResult> {
    if (!this.db) throw new Error('Database not initialized');

    const result: SyncResult = {
      successful: 0,
      failed: 0,
      errors: []
    };

    // Group operations by status
    const pending = operations.filter(op => op.status === 'pending');
    const failed = operations.filter(op => op.status === 'failed');

    // Process pending first, then retry failed
    const toProcess = [...pending, ...failed];

    // Batch in groups of 500 (Firestore limit)
    for (let i = 0; i < toProcess.length; i += 500) {
      const batch = toProcess.slice(i, i + 500);
      const batchResult = await this.processBatch(tenantId, batch);
      result.successful += batchResult.successful;
      result.failed += batchResult.failed;
      result.errors.push(...batchResult.errors);
    }

    return result;
  }

  private async processBatch(
    tenantId: string,
    operations: OfflineOperation[]
  ): Promise<SyncResult> {
    if (!this.db) throw new Error('Database not initialized');

    const result: SyncResult = {
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const op of operations) {
      try {
        // Check online status
        if (!navigator.onLine) {
          throw new Error('Connection lost');
        }

        await this.applyOperation(op);
        await offlineStorage.markOperationSynced(op.id);
        result.successful++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await offlineStorage.markOperationFailed(op.id, errorMsg);
        result.failed++;
        result.errors.push({
          operationId: op.id,
          error: errorMsg
        });
      }
    }

    return result;
  }

  private async applyOperation(op: OfflineOperation): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const collectionPath = op.collection;
    const collRef = collection(this.db, 'tenants', op.tenantId, collectionPath);
    const docRef = doc(collRef, op.documentId);

    switch (op.type) {
      case 'create':
        await setDoc(docRef, {
          ...op.data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        break;

      case 'update':
        // Get current doc to handle conflicts
        const currentDoc = await getDoc(docRef);
        if (!currentDoc.exists()) {
          // Document was deleted on server, skip update
          console.warn(`Document ${op.documentId} not found, skipping update`);
          break;
        }
        await updateDoc(docRef, {
          ...op.data,
          updatedAt: serverTimestamp()
        });
        break;

      case 'delete':
        await deleteDoc(docRef);
        break;

      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  /**
   * Write operation that queues for offline sync if offline,
   * or writes directly to Firestore if online
   */
  async writeWithOfflineSupport(
    tenantId: string,
    collection: 'members' | 'visitors' | 'attendance',
    documentId: string,
    data: Record<string, any>,
    type: 'create' | 'update' | 'delete' = 'update'
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Always queue the operation
    const opId = await offlineStorage.addPendingOperation({
      timestamp: Date.now(),
      type,
      collection,
      documentId,
      data,
      tenantId,
      status: 'pending',
      retryCount: 0
    });

    // Also update local cache
    if (type === 'create' || type === 'update') {
      if (collection === 'members') {
        await offlineStorage.saveMember(tenantId, documentId, data);
      } else if (collection === 'visitors') {
        await offlineStorage.saveVisitor(tenantId, documentId, data);
      } else if (collection === 'attendance') {
        await offlineStorage.saveAttendance(tenantId, documentId, data);
      }
    }

    // Try to sync immediately if online
    if (navigator.onLine) {
      // Non-blocking sync
      this.syncTenant(tenantId).catch(err => {
        console.warn('Background sync failed:', err);
      });
    }
  }

  /**
   * Poll for syncing when app comes online
   * Call this from a useEffect when component mounts
   */
  startSyncPolling(tenantId: string, intervalMs: number = 5000): () => void {
    const interval = setInterval(() => {
      if (navigator.onLine) {
        this.syncTenant(tenantId).catch(err => {
          console.warn('Sync poll failed:', err);
        });
      }
    }, intervalMs);

    this.syncIntervals.set(tenantId, interval);

    return () => {
      clearInterval(interval);
      this.syncIntervals.delete(tenantId);
    };
  }
}

export const offlineSync = new OfflineSync();
