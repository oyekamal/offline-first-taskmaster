# Migration Guide: Sync Implementation Update

## Overview

This guide helps you migrate from the old individual sync approach to the new batch sync implementation.

---

## Do You Need to Migrate?

### Yes, if:
- ✅ You have existing users with offline data
- ✅ You have items in the sync_queue table
- ✅ You're upgrading an existing deployment

### No, if:
- ✅ This is a new installation
- ✅ No existing user data
- ✅ Fresh deployment

---

## Migration Steps

### Step 1: Backup Current State

```bash
# Backup the frontend code
cd frontend/
git stash push -m "backup before sync fix"

# Backup IndexedDB data (optional, for safety)
# Users can export their data through browser DevTools
```

### Step 2: Deploy Backend (if needed)

The backend already supports the batch sync endpoints, but verify:

```bash
cd backend/
python manage.py shell
```

```python
# Verify sync endpoints exist
from sync.views import sync_push, sync_pull
print("✅ Sync endpoints available")
```

### Step 3: Deploy Frontend Changes

```bash
cd frontend/

# Pull the fixed code
git pull origin main

# Install dependencies (if any new)
npm install

# Build
npm run build

# Deploy
npm run deploy
```

### Step 4: Monitor First Syncs

After deployment, monitor the first sync cycles:

```javascript
// In browser console
// Watch for batch sync calls
const originalFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0].includes('/api/sync/')) {
    console.log('🔄 Batch sync call:', args[0]);
  }
  return originalFetch.apply(this, args);
};
```

---

## Handling Existing Sync Queue

### Automatic Migration

The new code automatically handles old sync queue entries:

```typescript
// Old format in sync_queue
{
  id: 1,
  entity_type: "task",
  entity_id: "abc-123",
  operation: "CREATE",  // Old format
  data: {...}
}

// New code converts it
const changeItem = {
  id: entry.entity_id,
  operation: entry.operation.toLowerCase() as 'create' | 'update' | 'delete',
  data: entry.data || await this.getEntityData(entry.entity_type, entry.entity_id)
};
```

**No manual intervention needed!** ✅

### Queue Processing

1. Existing queue items will be processed in the next sync
2. They'll be grouped into batches automatically
3. Successfully synced items will be removed
4. Failed items will retry (up to 3 times)

---

## Data Compatibility

### Database Schema

No changes needed to IndexedDB schema:
- ✅ `sync_queue` table - compatible
- ✅ `tasks` table - compatible
- ✅ `comments` table - compatible
- ✅ `device_info` table - compatible

### API Compatibility

Old individual endpoints still work:
- ✅ `POST /api/tasks/` - still available
- ✅ `PATCH /api/tasks/{id}/` - still available
- ✅ `GET /api/comments/` - still available

They're just not used by sync anymore.

---

## Rollback Plan

If you need to rollback:

### Option 1: Git Revert

```bash
cd frontend/
git revert <commit-hash>
npm install
npm run build
```

### Option 2: Use Backup

```bash
cd frontend/
git stash pop  # Restore backed up code
npm install
npm run build
```

### Option 3: Feature Flag

Add a feature flag to toggle between old and new sync:

```typescript
// In syncManager.ts
private async pushToServer(): Promise<void> {
  if (USE_LEGACY_SYNC) {
    return this.pushToServerLegacy();  // Old implementation
  }
  // New batch implementation
}
```

---

## Monitoring & Validation

### Check Sync Success

```javascript
// Browser DevTools Console
import { syncManager } from './services/syncManager';

// Get sync status
const status = await syncManager.getStatus();
console.log('Sync status:', status);

// Expected output:
// {
//   is_syncing: false,
//   pending_count: 0,        // Should decrease after sync
//   conflict_count: 0,
//   error_count: 0,
//   last_sync_at: "2026-02-10T...",
//   is_online: true
// }
```

### Check Network Traffic

Open DevTools → Network tab:

**✅ Good Signs:**
```
POST /api/sync/push/     Status: 200
GET /api/sync/pull/      Status: 200
```

**❌ Bad Signs:**
```
Multiple POST /api/tasks/      (shouldn't see many)
Multiple GET /api/comments/    (shouldn't see many)
```

### Check Logs

**Backend logs:**
```bash
cd backend/
tail -f logs/sync.log
```

Look for:
```
✅ "Sync push: processed 5 items, 0 conflicts"
✅ "Sync pull: returned 10 tasks, 25 comments"
```

**Frontend console:**
```javascript
// Should see:
✅ "Starting sync..."
✅ "Pushed 5 items, 0 conflicts"
✅ "Pulled 10 tasks, 25 comments, 2 tombstones from server"
✅ "Sync completed successfully"
```

---

## Performance Validation

### Measure Sync Time

```javascript
// Add to syncManager.ts temporarily
async sync(): Promise<void> {
  const startTime = performance.now();
  
  // ... existing sync code ...
  
  const endTime = performance.now();
  console.log(`⏱️ Sync completed in ${endTime - startTime}ms`);
}
```

### Expected Improvements

| Scenario | Before | After | Target |
|----------|--------|-------|--------|
| 10 items | ~1000ms | ~200ms | <300ms |
| 50 items | ~5000ms | ~400ms | <600ms |
| 100 items | ~10000ms | ~600ms | <1000ms |

---

## Troubleshooting

### Issue: Sync queue not clearing

**Symptoms:**
- `pending_count` stays high
- Items not syncing

**Solution:**
```javascript
// Check for errors
const queue = await db.sync_queue.toArray();
const errors = queue.filter(e => e.error_message);
console.log('Failed items:', errors);

// Check retry counts
const maxRetries = queue.filter(e => e.attempt_count >= 3);
console.log('Max retries exceeded:', maxRetries);
```

### Issue: Network errors

**Symptoms:**
- 400 Bad Request
- Invalid data format

**Solution:**
```javascript
// Verify payload format
// Should match backend expectations
const payload = {
  deviceId: string,
  vectorClock: Record<string, number>,
  timestamp: number,
  changes: {
    tasks: Array<{id, operation, data}>,
    comments: Array<{id, operation, data}>
  }
};
```

### Issue: Conflicts not detected

**Symptoms:**
- Data overwrites without warning
- Conflicts not showing in UI

**Solution:**
```javascript
// Check vector clocks are present
const task = await db.tasks.get(taskId);
console.log('Vector clock:', task.vector_clock);

// Should see:
// {"device-abc": 42, "device-xyz": 18}
```

### Issue: Deletions not syncing

**Symptoms:**
- Deleted items reappear
- Tombstones not processing

**Solution:**
```javascript
// Check tombstone processing
// Enable debug logging in pullFromServer()
console.log('Processing tombstones:', pullResponse.tombstones);

// Verify deletions
await db.tasks.where('id').equals(tombstone.entity_id).delete();
```

---

## Testing Checklist

Before marking migration complete:

### Functional Tests
```
□ Create task offline → sync → appears on server
□ Update task offline → sync → updates on server
□ Delete task offline → sync → deleted on server
□ Create comment offline → sync → appears on server
□ Multi-device sync → no data loss
□ Conflict scenario → marked correctly
□ Network failure → retries work
```

### Performance Tests
```
□ Sync 10 items in <300ms
□ Sync 50 items in <600ms
□ Sync 100 items in <1000ms
□ No N+1 query pattern
□ Batch requests visible in network tab
```

### Edge Cases
```
□ Empty sync queue → no errors
□ Large batch (100+ items) → pagination works
□ Network timeout → graceful retry
□ Invalid data → error handled
□ Concurrent syncs → queue locked
```

---

## Post-Migration Tasks

### 1. Remove Old Code (Optional)

After 30 days of stable operation:

```typescript
// Can remove these if not used elsewhere:
// - apiClient.batchSyncTasks() (marked deprecated)
// - apiClient.getTasksSince() (marked deprecated)
```

### 2. Add Monitoring

```typescript
// Track sync metrics
analytics.track('sync_completed', {
  items_pushed: response.processed,
  items_pulled: pullResponse.tasks.length + pullResponse.comments.length,
  conflicts: response.conflicts.length,
  duration_ms: syncTime
});
```

### 3. Documentation Updates

```
□ Update API documentation
□ Update developer guides
□ Update troubleshooting guides
□ Update monitoring dashboards
```

---

## Support Contacts

If you encounter issues:

1. Check [SYNC_FIX_SUMMARY.md](./SYNC_FIX_SUMMARY.md)
2. Review [VISUAL_SYNC_COMPARISON.md](./VISUAL_SYNC_COMPARISON.md)
3. Check browser console and network tab
4. Check backend logs
5. File an issue with full logs

---

## Success Criteria

Migration is successful when:

- ✅ All sync queue items processed
- ✅ No sync errors in logs
- ✅ Network calls use `/api/sync/push` and `/api/sync/pull`
- ✅ Sync time < 1 second for typical loads
- ✅ No conflicts or all conflicts resolved
- ✅ Users report no data loss
- ✅ Multi-device sync working correctly

---

**Migration Status:** Ready ✅  
**Rollback Available:** Yes ✅  
**Breaking Changes:** None ✅  
**Data Loss Risk:** Low ✅
