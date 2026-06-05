/**
 * React hooks for offline-first data synchronization
 * Abstract away the complexity of offline storage and syncing
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppUser } from '@/lib/useAppUser';
import { offlineStorage, SyncState } from '@/lib/offline/storage';
import { offlineSync } from '@/lib/offline/sync';

/**
 * Hook to monitor online/offline status
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

/**
 * Hook to monitor sync state and pending operations
 */
export function useSyncState(tenantId: string) {
  const [syncState, setSyncState] = useState<SyncState>({
    lastSyncTime: 0,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0
  });

  useEffect(() => {
    // Get initial state
    offlineStorage.getSyncState(tenantId).then(setSyncState);

    // Subscribe to changes
    const unsubscribe = offlineStorage.onSyncStateChanged((state) => {
      setSyncState(state);
    });

    return unsubscribe;
  }, [tenantId]);

  return syncState;
}

/**
 * Hook to handle member operations with offline support
 */
export function useOfflineMember(tenantId: string) {
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getMember = useCallback(
    async (memberId: string) => {
      try {
        setLoading(true);
        setError(null);
        const member = await offlineStorage.getMember(tenantId, memberId);
        return member;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get member';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  const getMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const members = await offlineStorage.getMembersByTenant(tenantId);
      return members;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get members';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const saveMember = useCallback(
    async (memberId: string, data: Record<string, any>, isNewMember = false) => {
      try {
        setLoading(true);
        setError(null);
        // Write to offline storage and queue for sync
        await offlineSync.writeWithOfflineSupport(
          tenantId,
          'members',
          memberId,
          data,
          isNewMember ? 'create' : 'update'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save member';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  return {
    getMember,
    getMembers,
    saveMember,
    loading,
    error,
    isOnline
  };
}

/**
 * Hook to handle visitor operations with offline support
 */
export function useOfflineVisitor(tenantId: string) {
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getVisitor = useCallback(
    async (visitorId: string) => {
      try {
        setLoading(true);
        setError(null);
        const visitor = await offlineStorage.getVisitor(tenantId, visitorId);
        return visitor;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get visitor';
        setError(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  const getVisitors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const visitors = await offlineStorage.getVisitorsByTenant(tenantId);
      return visitors;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get visitors';
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const saveVisitor = useCallback(
    async (visitorId: string, data: Record<string, any>, isNew = false) => {
      try {
        setLoading(true);
        setError(null);
        await offlineSync.writeWithOfflineSupport(
          tenantId,
          'visitors',
          visitorId,
          data,
          isNew ? 'create' : 'update'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save visitor';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  return {
    getVisitor,
    getVisitors,
    saveVisitor,
    loading,
    error,
    isOnline
  };
}

/**
 * Hook to handle attendance operations with offline support
 */
export function useOfflineAttendance(tenantId: string) {
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getAttendanceByDate = useCallback(
    async (date: string) => {
      try {
        setLoading(true);
        setError(null);
        const attendance = await offlineStorage.getAttendanceByDate(tenantId, date);
        return attendance;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to get attendance';
        setError(msg);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  const markAttendance = useCallback(
    async (attendanceId: string, data: Record<string, any>) => {
      try {
        setLoading(true);
        setError(null);
        await offlineSync.writeWithOfflineSupport(
          tenantId,
          'attendance',
          attendanceId,
          data,
          'update'
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to mark attendance';
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  return {
    getAttendanceByDate,
    markAttendance,
    loading,
    error,
    isOnline
  };
}

/**
 * Hook to manually trigger sync and monitor progress
 */
export function useSyncTrigger(tenantId: string) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const triggerSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      setSyncError(null);
      const result = await offlineSync.syncTenant(tenantId);
      setLastSyncTime(Date.now());

      if (result.failed > 0) {
        setSyncError(`${result.failed} operations failed to sync`);
      }

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setSyncError(msg);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, [tenantId]);

  // Auto-sync when coming online
  const isOnline = useOnlineStatus();
  useEffect(() => {
    if (isOnline && !isSyncing) {
      // Small delay to avoid hammering
      const timer = setTimeout(() => triggerSync(), 1000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, isSyncing, triggerSync]);

  return {
    triggerSync,
    isSyncing,
    lastSyncTime,
    syncError
  };
}
