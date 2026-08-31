# Offline-First Implementation Guide

This guide walks through adding offline support to Kereke Hub. Churches in areas with spotty connections will be able to work offline and sync automatically when reconnected.

## Overview

The offline system has three layers:

1. **Service Worker** - Caches the app shell and assets so the app loads offline
2. **IndexedDB Storage** - Local database stores members, visitors, attendance data
3. **Sync Queue** - Pending changes are queued locally and synced to Firestore when online

Users see a banner showing their offline/online status and pending operations that haven't synced yet.

## Setup Steps

### 1. Move Service Worker File

The service worker must be in the public directory:

```bash
# Copy the service worker to public folder
cp public-sw.js public/sw.js
```

### 2. Register Service Worker in Your App

In your main layout or app initialization (e.g., `app/hub/layout.tsx`), add:

```typescript
'use client';

import { useEffect } from 'react';

export default function HubLayout({ children }) {
  useEffect(() => {
    // Register service worker for offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered:', registration);
        })
        .catch(err => {
          console.warn('Service Worker registration failed:', err);
        });
    }

    // Initialize offline storage
    import('@/lib/offline/offline-storage').then(({ offlineStorage }) => {
      offlineStorage.initialize().catch(err => {
        console.warn('Offline storage initialization failed:', err);
      });
    });
  }, []);

  return <>{children}</>;
}
```

### 3. Initialize Sync Manager in FirebaseContext

Update your Firebase initialization context to set the database for the sync manager:

```typescript
// In your Firebase context file (e.g., context/FirebaseContext.ts)
import { offlineSync } from '@/lib/offline/offline-sync';

export const FirebaseProvider = ({ children }) => {
  useEffect(() => {
    // After Firebase is initialized with db
    offlineSync.setDatabase(db);
    offlineSync.startAutoSync();
  }, [db]);

  return <>{children}</>;
};
```

### 4. Add Offline Indicator to Layout

At the top of your app layout, add the offline status banner:

```typescript
import { OfflineIndicator } from '@/components/OfflineIndicator';

export default function HubLayout({ children }) {
  return (
    <>
      <OfflineIndicator />
      <main>{children}</main>
    </>
  );
}
```

### 5. Update Components to Use Offline Hooks

Replace direct Firestore queries with offline-aware hooks:

#### Before (Direct Firestore):
```typescript
const { user } = useAuth();
const [members, setMembers] = useState([]);

useEffect(() => {
  const q = query(
    collection(db, 'tenants', user.tenantId, 'members'),
    where('deleted', '==', false)
  );
  
  onSnapshot(q, snap => {
    setMembers(snap.docs.map(d => d.data()));
  });
}, [db, user.tenantId]);
```

#### After (Offline-first):
```typescript
const { user } = useAuth();
const { getMembers } = useOfflineMember(user?.tenantId || '');
const [members, setMembers] = useState([]);

useEffect(() => {
  getMembers().then(setMembers);
}, [getMembers]);
```

### 6. Update Write Operations

#### Before (Direct Firestore):
```typescript
const saveMember = async (memberId, data) => {
  await updateDoc(
    doc(db, 'tenants', tenantId, 'members', memberId),
    data
  );
};
```

#### After (Offline-first):
```typescript
const { saveMember } = useOfflineMember(tenantId);

const handleSave = async (memberId, data) => {
  await saveMember(memberId, data);
  // That's it! It handles offline queueing + syncing automatically
};
```

## Key Components

### OfflineStorage (`lib/offline/offline-storage.ts`)
Manages IndexedDB for storing members, visitors, and attendance locally.

**Main methods:**
- `saveMember()` / `getMember()` / `getMembersByTenant()`
- `saveVisitor()` / `getVisitor()` / `getVisitorsByTenant()`
- `saveAttendance()` / `getAttendanceByDate()`
- `addPendingOperation()` - Queue a change for sync
- `getPendingOperations()` - Get all queued changes

### OfflineSync (`lib/offline/offline-sync.ts`)
Handles syncing pending operations to Firestore when online.

**Main methods:**
- `setDatabase(db)` - Initialize with Firestore instance
- `startAutoSync()` - Listen for online events and sync automatically
- `syncTenant(tenantId)` - Manually trigger sync
- `writeWithOfflineSupport()` - Queue a write for sync

### Hooks (`lib/hooks/useOfflineSync.ts`)

#### `useOnlineStatus()`
Returns true/false for whether user is online.

```typescript
const isOnline = useOnlineStatus();

if (!isOnline) {
  return <p>You are offline. Changes are being saved locally.</p>;
}
```

#### `useSyncState(tenantId)`
Get information about pending and failed operations.

```typescript
const { pendingCount, failedCount, isSyncing, lastSyncTime } = useSyncState(tenantId);

return (
  <span>
    {pendingCount} pending operations
    {failedCount > 0 && ` (${failedCount} failed)`}
  </span>
);
```

#### `useOfflineMember(tenantId)`
Read/write members with offline support.

```typescript
const { getMembers, saveMember, isOnline, error } = useOfflineMember(tenantId);

// Get all members (from local cache if offline)
const members = await getMembers();

// Save a member (queued if offline)
await saveMember(memberId, { firstName: 'John', ... });
```

#### `useOfflineVisitor(tenantId)`
Read/write visitors with offline support.

```typescript
const { getVisitors, saveVisitor } = useOfflineVisitor(tenantId);
```

#### `useOfflineAttendance(tenantId)`
Read/write attendance with offline support.

```typescript
const { getAttendanceByDate, markAttendance } = useOfflineAttendance(tenantId);

// Get attendance for a specific date
const records = await getAttendanceByDate('2026-06-05');

// Mark someone as present/late/absent
await markAttendance(attendanceId, {
  memberId: 'member-123',
  status: 'present',
  date: '2026-06-05'
});
```

#### `useSyncTrigger(tenantId)`
Manually trigger syncing and monitor progress.

```typescript
const { triggerSync, isSyncing, lastSyncTime, syncError } = useSyncTrigger(tenantId);

return (
  <button onClick={() => triggerSync()} disabled={isSyncing}>
    {isSyncing ? 'Syncing...' : 'Sync now'}
  </button>
);
```

## UI Components

### OfflineIndicator
Shows at the top of the page when offline or has pending operations.

```typescript
import { OfflineIndicator } from '@/components/OfflineIndicator';

export default function Layout({ children }) {
  return (
    <>
      <OfflineIndicator />
      {children}
    </>
  );
}
```

Features:
- Shows "You are offline" banner when no connection
- Shows pending operation count when online
- Shows failed operation count with retry button
- Manual sync button when online

### SyncStatusBadge
Small badge showing sync status (useful for headers).

```typescript
import { SyncStatusBadge } from '@/components/OfflineIndicator';

export function Header() {
  return (
    <header className="flex justify-between items-center">
      <h1>Members</h1>
      <SyncStatusBadge />
    </header>
  );
}
```

## Data Sync Flow

### When User is Online:
1. User makes a change (e.g., marks attendance)
2. Change is written to local IndexedDB immediately (instant feedback)
3. Change is also queued in pending operations
4. Sync manager detects online status
5. Syncs all pending operations to Firestore in batches
6. Marks operations as synced in local DB

### When User is Offline:
1. User makes a change
2. Change is written to local IndexedDB immediately
3. Change is queued in pending operations
4. UI shows "Offline - changes will sync when you reconnect"
5. When connection returns, automatic sync triggers

### Conflict Resolution:
- Last-write-wins: If same field changed both offline and on server, offline version wins (because user's action is more recent)
- Document deletions on server are skipped (detected via getDoc before update)
- Retries happen automatically with exponential backoff

## Important Notes

### Firestore Security Rules
Your Firestore rules must allow the offline sync manager to write to the collections. The sync uses the same authentication as the user, so existing rules should work.

However, make sure your rules allow:
- Creating new attendance records
- Updating existing member/visitor/attendance docs
- Deleting when needed

Example rule:
```firestore
match /tenants/{tenantId}/members/{memberId} {
  allow read, write: if request.auth.uid != null && 
    request.auth.customClaims.tenantId == tenantId;
}
```

### Storage Limits
- IndexedDB typically has 50MB+ per domain (browsers vary)
- The local cache stores compact JSON, so this fits hundreds of members/visitors
- Old synced data can be manually cleared

### Battery & Data Usage
- Service Worker runs in background (uses minimal battery)
- Only syncs when online
- Batches operations for efficiency
- No polling in background

## Testing Offline Functionality

### In Chrome DevTools:
1. Open DevTools (F12)
2. Go to Network tab
3. Check "Offline" checkbox
4. Try marking attendance or adding members
5. Uncheck "Offline"
6. Watch sync happen automatically

### Simulating Bad Connection:
1. Network tab → Throttling dropdown
2. Select "Slow 3G" or "Slow 4G"
3. Watch sync slow down realistically

## Troubleshooting

### Service Worker Not Registering
- Make sure `public/sw.js` exists
- Check browser console for errors
- Try `navigator.serviceWorker.getRegistrations()` in console

### Data Not Syncing
- Check browser DevTools > Storage > IndexedDB to see pending operations
- Check network tab to see if sync requests are being made
- Look at browser console for sync errors
- Try manual sync via "Sync now" button

### Stale Data
- If you see old data, try clearing IndexedDB and syncing again
- DevTools > Storage > IndexedDB > Delete database
- Refresh page

### High Memory Usage
- IndexedDB grows over time with synced operations
- Clear old synced operations periodically
- Call `offlineStorage.clearAllData()` if needed

## Next Steps

1. Copy the four library files to your codebase:
   - `lib/offline/offline-storage.ts`
   - `lib/offline/offline-sync.ts`
   - `lib/hooks/useOfflineSync.ts`
   - `public/sw.js`

2. Update your Firebase context to initialize the sync manager

3. Register the service worker in your app layout

4. Add OfflineIndicator to your layout

5. Gradually update components to use the offline hooks (start with AttendanceMarking)

6. Test offline functionality in DevTools

The example `AttendanceMarkingOffline.tsx` shows a complete working component. Use it as a template for updating other components.
