/**
 * Storage Manager - Monitors IndexedDB quota and provides cleanup capabilities
 *
 * Features:
 * - Periodic quota monitoring (every 60 seconds)
 * - Warning threshold (80%) and critical threshold (95%)
 * - Safe write wrapper that checks quota before writes
 * - Auto-cleanup of old synced data (90+ days)
 */

import { db } from '../db';

export interface StorageQuotaInfo {
  usage: number;       // bytes used
  quota: number;       // total bytes available
  percentage: number;  // 0-100
  level: 'ok' | 'warning' | 'critical';
}

export type StorageCallback = (info: StorageQuotaInfo) => void;

const WARNING_THRESHOLD = 0.8;   // 80%
const CRITICAL_THRESHOLD = 0.95; // 95%
const CHECK_INTERVAL = 60000;    // 60 seconds
const CLEANUP_AGE_DAYS = 90;     // Clean synced items older than 90 days

export class StorageManager {
  private checkInterval: number | null = null;
  private callbacks: Set<StorageCallback> = new Set();
  private lastQuotaInfo: StorageQuotaInfo = {
    usage: 0,
    quota: 0,
    percentage: 0,
    level: 'ok'
  };

  /**
   * Start periodic quota monitoring
   */
  startMonitoring(): void {
    // Immediate check
    this.checkQuota();

    // Periodic check
    this.checkInterval = window.setInterval(() => {
      this.checkQuota();
    }, CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.callbacks.clear();
  }

  /**
   * Subscribe to quota change notifications
   */
  onQuotaChange(callback: StorageCallback): () => void {
    this.callbacks.add(callback);
    // Immediately notify with current state
    callback(this.lastQuotaInfo);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Get current quota info
   */
  async getQuotaInfo(): Promise<StorageQuotaInfo> {
    if (!navigator.storage?.estimate) {
      return { usage: 0, quota: 0, percentage: 0, level: 'ok' };
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      let level: StorageQuotaInfo['level'] = 'ok';
      if (percentage >= CRITICAL_THRESHOLD * 100) {
        level = 'critical';
      } else if (percentage >= WARNING_THRESHOLD * 100) {
        level = 'warning';
      }

      return { usage, quota, percentage, level };
    } catch {
      return { usage: 0, quota: 0, percentage: 0, level: 'ok' };
    }
  }

  /**
   * Check quota and notify subscribers if level changed
   */
  private async checkQuota(): Promise<void> {
    const info = await this.getQuotaInfo();
    const prevLevel = this.lastQuotaInfo.level;
    this.lastQuotaInfo = info;

    // Notify on every check if warning/critical, or on level change
    if (info.level !== 'ok' || prevLevel !== info.level) {
      this.callbacks.forEach(cb => cb(info));
    }
  }

  /**
   * Safe write wrapper - checks quota before performing a write operation
   * Throws if storage is critically full
   */
  async safeWrite<T>(writeFn: () => Promise<T>): Promise<T> {
    const info = await this.getQuotaInfo();

    if (info.level === 'critical') {
      // Attempt cleanup first
      const cleaned = await this.cleanupOldSyncedData();
      if (cleaned > 0) {
        // Re-check after cleanup
        const newInfo = await this.getQuotaInfo();
        if (newInfo.level === 'critical') {
          throw new Error('Storage quota critically full. Please free up space.');
        }
      } else {
        throw new Error('Storage quota critically full. Please free up space.');
      }
    }

    return writeFn();
  }

  /**
   * Clean up old synced data to free storage space
   * Deletes synced tasks and comments older than CLEANUP_AGE_DAYS
   * Returns number of items deleted
   */
  async cleanupOldSyncedData(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - CLEANUP_AGE_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    let deletedCount = 0;

    // Delete old synced tasks (not local-only, not pending sync)
    const oldTasks = await db.tasks
      .filter(t =>
        t._sync_status === 'synced' &&
        !t._local_only &&
        t.updated_at < cutoffISO
      )
      .toArray();

    if (oldTasks.length > 0) {
      const taskIds = oldTasks.map(t => t.id);
      await db.tasks.where('id').anyOf(taskIds).delete();
      deletedCount += taskIds.length;

      // Also delete their comments
      for (const taskId of taskIds) {
        const comments = await db.comments.where('task').equals(taskId).toArray();
        if (comments.length > 0) {
          await db.comments.where('id').anyOf(comments.map(c => c.id)).delete();
          deletedCount += comments.length;
        }
      }
    }

    // Delete old synced comments without valid tasks
    const oldComments = await db.comments
      .filter(c =>
        c._sync_status === 'synced' &&
        !c._local_only &&
        c.updated_at < cutoffISO
      )
      .toArray();

    if (oldComments.length > 0) {
      await db.comments.where('id').anyOf(oldComments.map(c => c.id)).delete();
      deletedCount += oldComments.length;
    }

    // Clear processed sync queue entries
    const oldQueueEntries = await db.sync_queue
      .filter(e => e.created_at < cutoffISO)
      .toArray();

    if (oldQueueEntries.length > 0) {
      await db.sync_queue.where('id').anyOf(oldQueueEntries.map(e => e.id)).delete();
      deletedCount += oldQueueEntries.length;
    }

    if (deletedCount > 0) {
      console.log(`Storage cleanup: removed ${deletedCount} old items`);
    }

    return deletedCount;
  }

  /**
   * Format bytes to human-readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

// Export singleton
export const storageManager = new StorageManager();
