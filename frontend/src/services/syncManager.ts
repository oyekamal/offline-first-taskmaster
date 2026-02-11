/**
 * Sync Manager - Handles bidirectional synchronization between local IndexedDB and server
 *
 * Features:
 * - Background sync with automatic retry
 * - Network status detection
 * - Conflict detection and resolution using vector clocks
 * - Queue-based sync with exponential backoff
 * - Progress tracking and status reporting
 * - Batch sync optimization
 */

import { db, getDeviceId, updateDeviceInfo } from '../db';
import { taskRepository } from '../db/repositories/TaskRepository';
import { commentRepository } from '../db/repositories/CommentRepository';
import { apiClient } from './apiClient';
import {
  Task,
  Comment,
  SyncQueueEntry,
  SyncStatusInfo,
  ConflictResolution
} from '../types';

export class SyncManager {
  private isSyncing = false;
  private syncInterval: number | null = null;
  private debounceTimer: number | null = null;
  private onlineStatusListener: (() => void) | null = null;
  private statusCallbacks: Set<(status: SyncStatusInfo) => void> = new Set();
  private conflictCallbacks: Set<(conflicts: ConflictResolution[]) => void> = new Set();
  private permissionErrorCallbacks: Set<(count: number) => void> = new Set();

  /**
   * Initialize sync manager
   * Sets up auto-sync on network changes and periodic sync
   */
  initialize() {
    // Listen for online/offline events
    this.onlineStatusListener = () => {
      if (navigator.onLine && apiClient.isAuthenticated()) {
        console.log('Network restored, starting sync...');
        this.sync();
      }
    };
    window.addEventListener('online', this.onlineStatusListener);

    // Periodic sync every 30 seconds when online and authenticated
    this.syncInterval = window.setInterval(() => {
      if (navigator.onLine && !this.isSyncing && apiClient.isAuthenticated()) {
        this.sync();
      }
    }, 30000);

    // Initial sync if online and authenticated
    if (navigator.onLine && apiClient.isAuthenticated()) {
      setTimeout(() => this.sync(), 1000);
    }

    // Register background sync if supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if ('sync' in registration) {
          (registration as any).sync.register('sync-tasks');
        }
      }).catch(err => {
        console.warn('Background sync registration failed:', err);
      });
    }
  }

  /**
   * Cleanup sync manager
   */
  destroy() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.onlineStatusListener) {
      window.removeEventListener('online', this.onlineStatusListener);
    }
    this.statusCallbacks.clear();
    this.conflictCallbacks.clear();
    this.permissionErrorCallbacks.clear();
  }

  /**
   * Subscribe to sync status updates
   */
  onStatusChange(callback: (status: SyncStatusInfo) => void): () => void {
    this.statusCallbacks.add(callback);
    // Return unsubscribe function
    return () => this.statusCallbacks.delete(callback);
  }

  /**
   * Subscribe to conflict notifications
   */
  onConflict(callback: (conflicts: ConflictResolution[]) => void): () => void {
    this.conflictCallbacks.add(callback);
    return () => this.conflictCallbacks.delete(callback);
  }

  /**
   * Subscribe to permission error notifications
   */
  onPermissionError(callback: (count: number) => void): () => void {
    this.permissionErrorCallbacks.add(callback);
    return () => this.permissionErrorCallbacks.delete(callback);
  }

  /**
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatusInfo> {
    const pendingCount = await db.sync_queue.count();
    const conflictTasks = await db.tasks.filter(t => t._conflict === true).count();
    const conflictComments = await db.comments.filter(c => c._conflict === true).count();
    const errorCount = await db.sync_queue.filter(e => e.error_message !== null).count();
    const permissionDeniedTasks = await db.tasks.filter(t => t._sync_status === 'permission_denied').count();
    const permissionDeniedComments = await db.comments.filter(c => c._sync_status === 'permission_denied').count();

    const deviceInfo = await db.device_info.get(getDeviceId());

    return {
      is_syncing: this.isSyncing,
      pending_count: pendingCount,
      conflict_count: conflictTasks + conflictComments,
      error_count: errorCount,
      permission_error_count: permissionDeniedTasks + permissionDeniedComments,
      last_sync_at: deviceInfo?.last_sync_at || null,
      is_online: navigator.onLine
    };
  }

  /**
   * Debounced sync trigger - delays sync by 2 seconds
   * Useful for batching rapid changes without immediate API calls
   */
  debouncedSync(): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer for 2 second delay
    this.debounceTimer = window.setTimeout(() => {
      this.sync();
      this.debounceTimer = null;
    }, 2000);
  }

  /**
   * Manual sync trigger - immediate sync
   */
  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    if (!navigator.onLine) {
      console.log('Offline, skipping sync');
      return;
    }

    // Check authentication before syncing
    if (!apiClient.isAuthenticated()) {
      console.log('Not authenticated, skipping sync');
      return;
    }

    this.isSyncing = true;
    this.notifyStatusChange();

    try {
      console.log('Starting sync...');

      // Phase 1: Pull changes from server
      await this.pullFromServer();

      // Phase 2: Push local changes to server
      await this.pushToServer();

      // Update last sync time
      await updateDeviceInfo();

      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  }

  /**
   * Pull changes from server using proper batch sync endpoint
   */
  private async pullFromServer(): Promise<void> {
    try {
      // Get last sync timestamp
      const deviceInfo = await db.device_info.get(getDeviceId());
      const lastSyncAt = deviceInfo?.last_sync_at;
      
      // Convert ISO string to Unix timestamp in milliseconds
      const sinceTimestamp = lastSyncAt 
        ? new Date(lastSyncAt).getTime()
        : Date.now() - (30 * 24 * 60 * 60 * 1000); // Default: 30 days ago

      // Call proper sync pull endpoint
      const pullResponse = await apiClient.syncPull({
        since: sinceTimestamp,
        limit: 100
      });

      console.log(`Pulled ${pullResponse.tasks.length} tasks, ${pullResponse.comments.length} comments, ${pullResponse.tombstones.length} tombstones from server`);

      // Process tasks
      for (const task of pullResponse.tasks) {
        await taskRepository.syncFromServer(task);
        // Remove from sync queue if exists (server is source of truth)
        await db.sync_queue.where('entity_id').equals(task.id).delete();
      }

      // Process comments
      for (const comment of pullResponse.comments) {
        await commentRepository.syncFromServer(comment);
        // Remove from sync queue if exists (server is source of truth)
        await db.sync_queue.where('entity_id').equals(comment.id).delete();
      }

      // Process tombstones (deletions)
      for (const tombstone of pullResponse.tombstones) {
        if (tombstone.entity_type === 'task') {
          await db.tasks.where('id').equals(tombstone.entity_id).delete();
          await db.sync_queue.where('entity_id').equals(tombstone.entity_id).delete();

          // Cascade: delete all local comments belonging to this task
          const orphanedComments = await db.comments
            .where('task')
            .equals(tombstone.entity_id)
            .toArray();
          if (orphanedComments.length > 0) {
            const orphanedIds = orphanedComments.map(c => c.id);
            await db.comments.where('id').anyOf(orphanedIds).delete();
            // Also remove their sync queue entries
            await db.sync_queue.where('entity_id').anyOf(orphanedIds).delete();
            console.log(`Cascade-deleted ${orphanedIds.length} orphaned comments for deleted task ${tombstone.entity_id}`);
          }
        } else if (tombstone.entity_type === 'comment') {
          await db.comments.where('id').equals(tombstone.entity_id).delete();
          await db.sync_queue.where('entity_id').equals(tombstone.entity_id).delete();
        }
      }

      // Update device vector clock with server's vector clock
      await db.device_info.update(getDeviceId(), {
        vector_clock: pullResponse.serverVectorClock
      });

      // If there are more changes, pull again
      if (pullResponse.hasMore) {
        console.log('More changes available, pulling again...');
        await this.pullFromServer();
      }
    } catch (error) {
      console.error('Error pulling from server:', error);
      throw error;
    }
  }

  /**
   * Push local changes to server using proper batch sync endpoint
   */
  private async pushToServer(): Promise<void> {
    const maxRetries = 3;
    const queue = await db.sync_queue
      .filter(entry => entry.attempt_count < maxRetries)
      .sortBy('created_at');

    if (queue.length === 0) {
      console.log('No pending changes to push');
      return;
    }

    // Filter out orphaned comment entries (parent task deleted locally)
    const validQueue: SyncQueueEntry[] = [];
    for (const entry of queue) {
      if (entry.entity_type === 'comment' && entry.operation !== 'DELETE') {
        const taskId = (entry.data as Partial<Comment>)?.task;
        if (taskId) {
          const parentTask = await db.tasks.get(taskId);
          if (!parentTask) {
            // Parent task doesn't exist locally — orphaned comment
            console.log(`Removing orphaned comment ${entry.entity_id} from sync queue (parent task ${taskId} deleted)`);
            await db.sync_queue.delete(entry.id);
            await db.comments.where('id').equals(entry.entity_id).delete();
            continue;
          }
        }
      }
      validQueue.push(entry);
    }

    if (validQueue.length === 0) {
      console.log('No valid changes to push after orphan cleanup');
      return;
    }

    console.log(`Processing ${validQueue.length} queued operations`);

    // Mark entities as syncing
    for (const entry of validQueue) {
      if (entry.entity_type === 'task') {
        await db.tasks.update(entry.entity_id, { _sync_status: 'syncing' });
      } else if (entry.entity_type === 'comment') {
        await db.comments.update(entry.entity_id, { _sync_status: 'syncing' });
      }
    }

    // Get device info
    const deviceId = getDeviceId();
    const deviceInfo = await db.device_info.get(deviceId);
    const vectorClock = deviceInfo?.vector_clock || {};

    // Group changes by entity type
    const taskChanges: Array<{ id: string; operation: 'create' | 'update' | 'delete'; data: any }> = [];
    const commentChanges: Array<{ id: string; operation: 'create' | 'update' | 'delete'; data: any }> = [];

    // Prepare changes in batch format
    // Always fetch current entity from IndexedDB to ensure id, vector_clock,
    // and version are included — entry.data may only have partial updates
    for (const entry of validQueue) {
      const fullEntity = await this.getEntityData(entry.entity_type, entry.entity_id);
      const changeItem = {
        id: entry.entity_id,
        operation: entry.operation.toLowerCase() as 'create' | 'update' | 'delete',
        data: {
          ...fullEntity,       // Full entity (has id, vector_clock, version, etc.)
          ...(entry.data || {}) // Override with queued changes (latest values)
        }
      };

      if (entry.entity_type === 'task') {
        taskChanges.push(changeItem);
      } else if (entry.entity_type === 'comment') {
        commentChanges.push(changeItem);
      }
    }

    // Prepare batch push payload
    const pushPayload = {
      deviceId,
      vectorClock,
      timestamp: Date.now(),
      changes: {
        ...(taskChanges.length > 0 && { tasks: taskChanges }),
        ...(commentChanges.length > 0 && { comments: commentChanges })
      }
    };

    try {
      // Call proper sync push endpoint
      const pushResponse = await apiClient.syncPush(pushPayload);

      console.log(`Pushed ${pushResponse.processed} items, ${pushResponse.conflicts.length} conflicts`);

      // Handle conflicts
      for (const conflict of pushResponse.conflicts) {
        await this.handleServerConflict(conflict);
      }

      // Update device vector clock with server's vector clock
      await db.device_info.update(deviceId, {
        vector_clock: pushResponse.serverVectorClock
      });

      // Mark successfully processed items as synced
      const processedEntries = validQueue.slice(0, pushResponse.processed);
      for (const entry of processedEntries) {
        if (entry.entity_type === 'task') {
          await db.tasks.update(entry.entity_id, { 
            _sync_status: 'synced',
            _local_only: false 
          });
        } else if (entry.entity_type === 'comment') {
          await db.comments.update(entry.entity_id, { 
            _sync_status: 'synced',
            _local_only: false 
          });
        }
      }

      // Remove successfully processed items from queue
      const processedIds = processedEntries.map(e => e.id);
      await db.sync_queue.bulkDelete(processedIds);

    } catch (error: any) {
      console.error('Batch push failed:', error);

      const is403 = error?.response?.status === 403;

      for (const entry of validQueue) {
        if (is403) {
          // Permission denied — stop retrying by maxing out attempt_count
          await db.sync_queue.update(entry.id, {
            attempt_count: 999,
            last_attempt_at: new Date().toISOString(),
            error_message: 'Permission denied — you may have lost access to this organization'
          });
          if (entry.entity_type === 'task') {
            await db.tasks.update(entry.entity_id, { _sync_status: 'permission_denied' as any });
          } else if (entry.entity_type === 'comment') {
            await db.comments.update(entry.entity_id, { _sync_status: 'permission_denied' as any });
          }
        } else {
          await db.sync_queue.update(entry.id, {
            attempt_count: entry.attempt_count + 1,
            last_attempt_at: new Date().toISOString(),
            error_message: error.message || 'Unknown error'
          });
          if (entry.entity_type === 'task') {
            await db.tasks.update(entry.entity_id, { _sync_status: 'error' });
          } else if (entry.entity_type === 'comment') {
            await db.comments.update(entry.entity_id, { _sync_status: 'error' });
          }
        }
      }

      if (is403) {
        await this.notifyPermissionError();
      }

      throw error;
    }
  }

  /**
   * Get entity data for sync
   */
  private async getEntityData(entityType: string, entityId: string): Promise<any> {
    if (entityType === 'task') {
      return await db.tasks.get(entityId);
    } else if (entityType === 'comment') {
      return await db.comments.get(entityId);
    }
    return null;
  }

  /**
   * Handle conflict returned from server
   */
  private async handleServerConflict(conflict: {
    entityType: string;
    entityId: string;
    conflictReason: string;
    serverVersion: any;
    serverVectorClock: Record<string, number>;
  }): Promise<void> {
    console.log(`Conflict detected for ${conflict.entityType} ${conflict.entityId}: ${conflict.conflictReason}`);

    // Mark entity as conflicted in local database
    if (conflict.entityType === 'task') {
      await db.tasks.update(conflict.entityId, {
        _conflict: true,
        _sync_status: 'conflict'
      });
    } else if (conflict.entityType === 'comment') {
      await db.comments.update(conflict.entityId, {
        _conflict: true,
        _sync_status: 'conflict'
      });
    }

    // Get local version
    const localVersion = conflict.entityType === 'task'
      ? await db.tasks.get(conflict.entityId)
      : await db.comments.get(conflict.entityId);

    // Notify conflict callbacks
    this.notifyConflict({
      conflict_id: conflict.entityId,
      entity_type: conflict.entityType,
      entity_id: conflict.entityId,
      local_version: localVersion,
      server_version: conflict.serverVersion,
      resolution: 'use_local'
    });
  }



  /**
   * Resolve a conflict
   */
  async resolveConflict(resolution: ConflictResolution): Promise<void> {
    if (resolution.entity_type === 'task') {
      const task = resolution.resolution === 'use_local'
        ? resolution.local_version as Task
        : resolution.resolution === 'use_server'
        ? resolution.server_version as Task
        : { ...resolution.local_version as Task, ...resolution.merged_data };

      // Update server with resolved version
      await apiClient.updateTask(resolution.entity_id, task);

      // Update local
      await db.tasks.update(resolution.entity_id, {
        ...task,
        _conflict: false,
        _sync_status: 'synced'
      });
    } else {
      const comment = resolution.resolution === 'use_local'
        ? resolution.local_version as Comment
        : resolution.resolution === 'use_server'
        ? resolution.server_version as Comment
        : { ...resolution.local_version as Comment, ...resolution.merged_data };

      await apiClient.updateComment(resolution.entity_id, { content: comment.content });

      await db.comments.update(resolution.entity_id, {
        ...comment,
        _conflict: false,
        _sync_status: 'synced'
      });
    }

    // Remove from sync queue
    await db.sync_queue.where('entity_id').equals(resolution.entity_id).delete();
  }

  /**
   * Detect conflict using vector clocks
   */
  private detectVectorClockConflict(
    localClock: Record<string, number>,
    serverClock: Record<string, number>
  ): boolean {
    let localDominates = false;
    let serverDominates = false;

    const allDevices = new Set([...Object.keys(localClock), ...Object.keys(serverClock)]);

    for (const device of allDevices) {
      const localTime = localClock[device] || 0;
      const serverTime = serverClock[device] || 0;

      if (localTime > serverTime) localDominates = true;
      if (serverTime > localTime) serverDominates = true;
    }

    // Conflict if both clocks have dominance
    return localDominates && serverDominates;
  }

  /**
   * Notify status change to subscribers
   */
  private async notifyStatusChange() {
    const status = await this.getStatus();
    this.statusCallbacks.forEach(callback => callback(status));
  }

  /**
   * Notify conflict to subscribers
   */
  private notifyConflict(conflict: ConflictResolution) {
    this.conflictCallbacks.forEach(callback => callback([conflict]));
  }

  /**
   * Clear permission errors - removes denied entries from sync queue and resets entity status
   */
  async clearPermissionErrors(): Promise<void> {
    const deniedTasks = await db.tasks.filter(t => t._sync_status === 'permission_denied').toArray();
    const deniedComments = await db.comments.filter(c => c._sync_status === 'permission_denied').toArray();

    for (const task of deniedTasks) {
      await db.sync_queue.where('entity_id').equals(task.id).delete();
      await db.tasks.update(task.id, { _sync_status: 'error' });
    }
    for (const comment of deniedComments) {
      await db.sync_queue.where('entity_id').equals(comment.id).delete();
      await db.comments.update(comment.id, { _sync_status: 'error' });
    }

    this.notifyStatusChange();
  }

  /**
   * Notify permission error to subscribers
   */
  private async notifyPermissionError() {
    const status = await this.getStatus();
    this.permissionErrorCallbacks.forEach(callback => callback(status.permission_error_count));
  }

  /**
   * Force full sync (pull all data from server)
   */
  async fullSync(): Promise<void> {
    this.isSyncing = true;
    this.notifyStatusChange();

    try {
      // Clear local data
      await db.tasks.clear();
      await db.comments.clear();

      // Pull everything from server
      await this.pullFromServer();

      // Clear sync queue
      await db.sync_queue.clear();

      await updateDeviceInfo();
    } catch (error) {
      console.error('Full sync error:', error);
      throw error;
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }
  }

  /**
   * Get pending sync count
   */
  async getPendingCount(): Promise<number> {
    return await db.sync_queue.count();
  }

  /**
   * Get conflicts
   */
  async getConflicts(): Promise<Array<Task | Comment>> {
    const tasks = await db.tasks.filter(t => t._conflict === true).toArray();
    const comments = await db.comments.filter(c => c._conflict === true).toArray();
    return [...tasks, ...comments];
  }
}

// Export singleton instance
export const syncManager = new SyncManager();
