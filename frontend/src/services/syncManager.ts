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
  private onlineStatusListener: (() => void) | null = null;
  private statusCallbacks: Set<(status: SyncStatusInfo) => void> = new Set();
  private conflictCallbacks: Set<(conflicts: ConflictResolution[]) => void> = new Set();

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
    if ('serviceWorker' in navigator && 'sync' in (self as any).registration) {
      navigator.serviceWorker.ready.then(registration => {
        (registration as any).sync.register('sync-tasks');
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
    if (this.onlineStatusListener) {
      window.removeEventListener('online', this.onlineStatusListener);
    }
    this.statusCallbacks.clear();
    this.conflictCallbacks.clear();
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
   * Get current sync status
   */
  async getStatus(): Promise<SyncStatusInfo> {
    const pendingCount = await db.sync_queue.count();
    const conflictTasks = await db.tasks.filter(t => t._conflict === true).count();
    const conflictComments = await db.comments.filter(c => c._conflict === true).count();
    const errorCount = await db.sync_queue.filter(e => e.error_message !== null).count();

    const deviceInfo = await db.device_info.get(getDeviceId());

    return {
      is_syncing: this.isSyncing,
      pending_count: pendingCount,
      conflict_count: conflictTasks + conflictComments,
      error_count: errorCount,
      last_sync_at: deviceInfo?.last_sync_at || null,
      is_online: navigator.onLine
    };
  }

  /**
   * Manual sync trigger
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
   * Pull changes from server
   */
  private async pullFromServer(): Promise<void> {
    try {
      // Get last sync timestamp
      const deviceInfo = await db.device_info.get(getDeviceId());
      const lastSync = deviceInfo?.last_sync_at;

      // Fetch tasks updated since last sync
      const tasks = lastSync
        ? await apiClient.getTasksSince(lastSync)
        : (await apiClient.getTasks()).results;

      // Sync each task to local database
      for (const task of tasks) {
        await taskRepository.syncFromServer(task);

        // Fetch comments for this task
        try {
          const comments = await apiClient.getComments(task.id);
          for (const comment of comments) {
            await commentRepository.syncFromServer(comment);
          }
        } catch (error) {
          console.error(`Failed to sync comments for task ${task.id}:`, error);
        }
      }

      console.log(`Pulled ${tasks.length} tasks from server`);
    } catch (error) {
      console.error('Error pulling from server:', error);
      throw error;
    }
  }

  /**
   * Push local changes to server
   */
  private async pushToServer(): Promise<void> {
    const maxRetries = 3;
    const queue = await db.sync_queue.orderBy('created_at').toArray();

    console.log(`Processing ${queue.length} queued operations`);

    for (const entry of queue) {
      // Skip if too many retries
      if (entry.attempt_count >= maxRetries) {
        console.error(`Max retries exceeded for ${entry.entity_type} ${entry.entity_id}`);
        continue;
      }

      try {
        await this.processSyncQueueEntry(entry);
        // Remove from queue on success
        await db.sync_queue.delete(entry.id);
      } catch (error: any) {
        // Update attempt count and error message
        await db.sync_queue.update(entry.id, {
          attempt_count: entry.attempt_count + 1,
          last_attempt_at: new Date().toISOString(),
          error_message: error.message || 'Unknown error'
        });
        console.error(`Failed to sync ${entry.entity_type} ${entry.entity_id}:`, error);
      }
    }
  }

  /**
   * Process a single sync queue entry
   */
  private async processSyncQueueEntry(entry: SyncQueueEntry): Promise<void> {
    if (entry.entity_type === 'task') {
      await this.syncTask(entry);
    } else if (entry.entity_type === 'comment') {
      await this.syncComment(entry);
    }
  }

  /**
   * Sync a task to server
   */
  private async syncTask(entry: SyncQueueEntry): Promise<void> {
    const localTask = await db.tasks.get(entry.entity_id);
    if (!localTask) {
      console.warn(`Task ${entry.entity_id} not found locally`);
      return;
    }

    let serverTask: Task;

    try {
      if (entry.operation === 'CREATE') {
        // Create on server
        serverTask = await apiClient.createTask({
          title: localTask.title,
          description: localTask.description,
          status: localTask.status,
          priority: localTask.priority,
          due_date: localTask.due_date,
          assigned_to: localTask.assigned_to,
          tags: localTask.tags,
          custom_fields: localTask.custom_fields
        });
      } else if (entry.operation === 'UPDATE') {
        // Update on server
        serverTask = await apiClient.updateTask(entry.entity_id, entry.data as any);
      } else if (entry.operation === 'DELETE') {
        // Delete on server
        await apiClient.deleteTask(entry.entity_id);
        return;
      } else {
        throw new Error(`Unknown operation: ${entry.operation}`);
      }

      // Check for conflicts
      const hasConflict = this.detectVectorClockConflict(
        localTask.vector_clock,
        serverTask.vector_clock
      );

      if (hasConflict) {
        // Mark as conflict for user resolution
        await db.tasks.update(entry.entity_id, {
          _conflict: true,
          _sync_status: 'conflict'
        });

        // Notify conflict callbacks
        this.notifyConflict({
          conflict_id: entry.entity_id,
          entity_type: 'task',
          entity_id: entry.entity_id,
          local_version: localTask,
          server_version: serverTask,
          resolution: 'use_local'
        });
      } else {
        // Update local with server data
        await db.tasks.put({
          ...serverTask,
          _local_only: false,
          _sync_status: 'synced',
          _conflict: false
        });
      }
    } catch (error: any) {
      // Handle specific errors
      if (error.status === 404) {
        // Task deleted on server, mark as deleted locally
        await db.tasks.update(entry.entity_id, {
          deleted_at: new Date().toISOString()
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Sync a comment to server
   */
  private async syncComment(entry: SyncQueueEntry): Promise<void> {
    const localComment = await db.comments.get(entry.entity_id);
    if (!localComment) {
      console.warn(`Comment ${entry.entity_id} not found locally`);
      return;
    }

    let serverComment: Comment;

    try {
      if (entry.operation === 'CREATE') {
        serverComment = await apiClient.createComment({
          task: localComment.task,
          content: localComment.content,
          parent: localComment.parent
        });
      } else if (entry.operation === 'UPDATE') {
        serverComment = await apiClient.updateComment(entry.entity_id, entry.data as any);
      } else if (entry.operation === 'DELETE') {
        await apiClient.deleteComment(entry.entity_id);
        return;
      } else {
        throw new Error(`Unknown operation: ${entry.operation}`);
      }

      // Check for conflicts
      const hasConflict = this.detectVectorClockConflict(
        localComment.vector_clock,
        serverComment.vector_clock
      );

      if (hasConflict) {
        await db.comments.update(entry.entity_id, {
          _conflict: true,
          _sync_status: 'conflict'
        });

        this.notifyConflict({
          conflict_id: entry.entity_id,
          entity_type: 'comment',
          entity_id: entry.entity_id,
          local_version: localComment,
          server_version: serverComment,
          resolution: 'use_local'
        });
      } else {
        await db.comments.put({
          ...serverComment,
          _local_only: false,
          _sync_status: 'synced',
          _conflict: false
        });
      }
    } catch (error: any) {
      if (error.status === 404) {
        await db.comments.update(entry.entity_id, {
          deleted_at: new Date().toISOString()
        });
      } else {
        throw error;
      }
    }
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
