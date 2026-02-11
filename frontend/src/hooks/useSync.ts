/**
 * useSync Hook - React hook for sync status and operations
 *
 * Features:
 * - Real-time sync status updates
 * - Manual sync trigger
 * - Conflict notifications
 * - Pending operations count
 */

import { useEffect, useState } from 'react';
import { syncManager } from '../services/syncManager';
import { SyncStatusInfo, ConflictResolution } from '../types';
import toast from 'react-hot-toast';

/**
 * Hook for sync status
 */
export function useSync() {
  const [status, setStatus] = useState<SyncStatusInfo>({
    is_syncing: false,
    pending_count: 0,
    conflict_count: 0,
    error_count: 0,
    permission_error_count: 0,
    last_sync_at: null,
    is_online: navigator.onLine
  });

  const [conflicts, setConflicts] = useState<ConflictResolution[]>([]);

  useEffect(() => {
    // Initial status
    syncManager.getStatus().then(setStatus);

    // Subscribe to status updates
    const unsubscribeStatus = syncManager.onStatusChange(setStatus);

    // Subscribe to conflict notifications
    const unsubscribeConflicts = syncManager.onConflict((newConflicts) => {
      setConflicts(prev => [...prev, ...newConflicts]);
      toast.error(`${newConflicts.length} sync conflict(s) detected`);
    });

    // Subscribe to permission error notifications
    const unsubscribePermission = syncManager.onPermissionError((count) => {
      if (count > 0) {
        toast.error(
          `Permission denied: ${count} change(s) could not be synced. You may have lost access.`,
          { duration: 8000 }
        );
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeConflicts();
      unsubscribePermission();
    };
  }, []);

  const sync = async () => {
    try {
      await syncManager.sync();
      toast.success('Sync completed successfully');
    } catch (error) {
      toast.error('Sync failed');
      console.error('Sync error:', error);
    }
  };

  const fullSync = async () => {
    try {
      await syncManager.fullSync();
      toast.success('Full sync completed');
    } catch (error) {
      toast.error('Full sync failed');
      console.error('Full sync error:', error);
    }
  };

  const resolveConflict = async (resolution: ConflictResolution) => {
    try {
      await syncManager.resolveConflict(resolution);
      setConflicts(prev => prev.filter(c => c.conflict_id !== resolution.conflict_id));
      toast.success('Conflict resolved');
    } catch (error) {
      toast.error('Failed to resolve conflict');
      console.error('Conflict resolution error:', error);
    }
  };

  const dismissConflict = (conflictId: string) => {
    setConflicts(prev => prev.filter(c => c.conflict_id !== conflictId));
  };

  const debouncedSync = () => {
    syncManager.debouncedSync();
  };

  const clearPermissionErrors = async () => {
    try {
      await syncManager.clearPermissionErrors();
      toast.success('Permission errors dismissed');
    } catch (error) {
      toast.error('Failed to clear permission errors');
    }
  };

  return {
    status,
    conflicts,
    sync,
    fullSync,
    debouncedSync,
    resolveConflict,
    dismissConflict,
    clearPermissionErrors,
    isSyncing: status.is_syncing,
    pendingCount: status.pending_count,
    conflictCount: status.conflict_count,
    permissionErrorCount: status.permission_error_count,
    isOnline: status.is_online,
    lastSyncAt: status.last_sync_at
  };
}

/**
 * Hook for manual sync trigger
 */
export function useSyncTrigger() {
  const [isSyncing, setIsSyncing] = useState(false);

  const trigger = async () => {
    setIsSyncing(true);
    try {
      await syncManager.sync();
    } finally {
      setIsSyncing(false);
    }
  };

  return { trigger, isSyncing };
}
