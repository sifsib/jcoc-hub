/**
 * Offline Status Indicator Banner
 * Shows when user is offline and displays pending operations count
 */

'use client';

import { useOnlineStatus, useSyncState, useSyncTrigger } from '@/lib/hooks/useOfflineSync';
import { useAuth } from '@/context/AuthContext';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  if (!tenantId) return null;

  const syncState = useSyncState(tenantId);
  const { triggerSync, isSyncing } = useSyncTrigger(tenantId);

  if (isOnline && !syncState.pendingCount) {
    return null; // Don't show anything if online and no pending ops
  }

  return (
    <div
      className={`sticky top-0 z-50 px-4 py-2 text-sm font-medium transition-colors ${
        isOnline
          ? 'bg-amber-50 text-amber-900 border-b border-amber-200'
          : 'bg-red-50 text-red-900 border-b border-red-200'
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-2 h-2 rounded-full animate-pulse ${
              isOnline ? 'bg-amber-600' : 'bg-red-600'
            }`}
          />
          <span>
            {!isOnline ? (
              <>
                <strong>You are offline.</strong> Changes are being saved locally and will sync when you reconnect.
              </>
            ) : (
              <>
                <strong>Syncing changes:</strong> {syncState.pendingCount} pending operation{syncState.pendingCount !== 1 ? 's' : ''}.
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {syncState.failedCount > 0 && (
            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
              {syncState.failedCount} failed
            </span>
          )}
          {isOnline && syncState.pendingCount > 0 && (
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs font-medium transition"
            >
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SyncStatusBadge() {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  if (!tenantId) return null;

  const syncState = useSyncState(tenantId);
  const { isSyncing } = useSyncTrigger(tenantId);

  if (isOnline && !syncState.pendingCount) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1 text-sm font-medium rounded-full bg-slate-100">
      <div
        className={`w-2 h-2 rounded-full ${
          isSyncing
            ? 'animate-pulse bg-blue-500'
            : isOnline
              ? 'bg-green-500'
              : 'bg-red-500'
        }`}
      />
      <span>
        {isSyncing ? 'Syncing' : isOnline ? 'Online' : 'Offline'}
        {syncState.pendingCount > 0 && ` (${syncState.pendingCount})`}
      </span>
    </div>
  );
}
