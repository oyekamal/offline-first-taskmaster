/**
 * Dexie.js Database Configuration for Offline-First Task Manager
 *
 * This module sets up IndexedDB using Dexie.js with tables for:
 * - tasks: Main task entities
 * - comments: Task comments with threading
 * - sync_queue: Queue for offline operations
 * - device_info: Local device metadata
 *
 * Features:
 * - Automatic UUID generation for new entities
 * - Vector clock management for conflict resolution
 * - Checksum calculation for data integrity
 * - Migration support for schema evolution
 */

import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { Task, Comment, SyncQueueEntry, DeviceInfo } from '../types';

/**
 * Extended Dexie database class with typed tables
 */
export class TaskManagerDB extends Dexie {
  tasks!: Table<Task, string>;
  comments!: Table<Comment, string>;
  sync_queue!: Table<SyncQueueEntry, string>;
  device_info!: Table<DeviceInfo, string>;

  constructor() {
    super('TaskManagerDB');

    // Database schema definition
    // Note: Only indexed fields are listed, all fields are stored
    this.version(1).stores({
      tasks: 'id, status, priority, assigned_to, created_at, updated_at, due_date, position, deleted_at',
      comments: 'id, task, user, created_at, parent, deleted_at',
      sync_queue: 'id, entity_type, entity_id, created_at, operation',
      device_info: 'device_id, last_sync_at'
    });

    // Add hooks for automatic field population
    this.tasks.hook('creating', (primKey, obj) => {
      if (!obj.id) obj.id = uuidv4();
      if (!obj.created_at) obj.created_at = new Date().toISOString();
      if (!obj.updated_at) obj.updated_at = new Date().toISOString();
      if (!obj.version) obj.version = 1;
      if (!obj.vector_clock) obj.vector_clock = { [getDeviceId()]: 1 };
      if (!obj.checksum) obj.checksum = calculateChecksum(obj);
      if (!obj.tags) obj.tags = [];
      if (!obj.custom_fields) obj.custom_fields = {};
      obj._local_only = true;
      obj._sync_status = 'pending';
    });

    this.tasks.hook('updating', (modifications, primKey, obj) => {
      modifications.updated_at = new Date().toISOString();
      if (obj.vector_clock) {
        const deviceId = getDeviceId();
        const currentClock = obj.vector_clock[deviceId] || 0;
        modifications.vector_clock = {
          ...obj.vector_clock,
          [deviceId]: currentClock + 1
        };
      }
      if (obj.version) {
        modifications.version = obj.version + 1;
      }
      // Recalculate checksum with modifications
      const updatedObj = { ...obj, ...modifications };
      modifications.checksum = calculateChecksum(updatedObj);
    });

    this.comments.hook('creating', (primKey, obj) => {
      if (!obj.id) obj.id = uuidv4();
      if (!obj.created_at) obj.created_at = new Date().toISOString();
      if (!obj.updated_at) obj.updated_at = new Date().toISOString();
      if (!obj.version) obj.version = 1;
      if (!obj.vector_clock) obj.vector_clock = { [getDeviceId()]: 1 };
      if (!obj.is_edited) obj.is_edited = false;
      obj._local_only = true;
      obj._sync_status = 'pending';
    });

    this.comments.hook('updating', (modifications, primKey, obj) => {
      modifications.updated_at = new Date().toISOString();
      modifications.is_edited = true;
      if (obj.vector_clock) {
        const deviceId = getDeviceId();
        const currentClock = obj.vector_clock[deviceId] || 0;
        modifications.vector_clock = {
          ...obj.vector_clock,
          [deviceId]: currentClock + 1
        };
      }
      if (obj.version) {
        modifications.version = obj.version + 1;
      }
    });

    this.sync_queue.hook('creating', (primKey, obj) => {
      if (!obj.id) obj.id = uuidv4();
      if (!obj.created_at) obj.created_at = new Date().toISOString();
      if (!obj.attempt_count) obj.attempt_count = 0;
    });
  }
}

// Singleton database instance
export const db = new TaskManagerDB();

/**
 * Get or create a unique device ID for this client
 * Stored in localStorage for persistence across sessions
 */
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = uuidv4();
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

/**
 * Calculate checksum for data integrity verification
 * Uses a simple string hash of JSON representation
 * In production, consider using crypto.subtle.digest for SHA-256
 */
export function calculateChecksum(data: any): string {
  // Remove fields that shouldn't affect checksum
  const { checksum, _local_only, _conflict, _sync_status, ...relevantData } = data;

  const jsonString = JSON.stringify(relevantData, Object.keys(relevantData).sort());

  // Simple hash function (for production, use a proper hash)
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    const char = jsonString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get current device info
 */
export async function getDeviceInfo(): Promise<DeviceInfo | undefined> {
  const deviceId = getDeviceId();
  return await db.device_info.get(deviceId);
}

/**
 * Update device info with last sync timestamp
 */
export async function updateDeviceInfo(lastSyncAt?: string): Promise<void> {
  const deviceId = getDeviceId();
  const deviceInfo: DeviceInfo = {
    device_id: deviceId,
    last_sync_at: lastSyncAt || new Date().toISOString(),
    device_name: navigator.userAgent
  };
  await db.device_info.put(deviceInfo);
}

/**
 * Clear all local data (use with caution)
 */
export async function clearAllData(): Promise<void> {
  await db.tasks.clear();
  await db.comments.clear();
  await db.sync_queue.clear();
}

/**
 * Export database for backup/debugging
 */
export async function exportDatabase() {
  return {
    tasks: await db.tasks.toArray(),
    comments: await db.comments.toArray(),
    sync_queue: await db.sync_queue.toArray(),
    device_info: await db.device_info.toArray(),
    exported_at: new Date().toISOString()
  };
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const [taskCount, commentCount, queueCount] = await Promise.all([
    db.tasks.count(),
    db.comments.count(),
    db.sync_queue.count()
  ]);

  return {
    tasks: taskCount,
    comments: commentCount,
    pending_sync: queueCount,
    database_name: db.name,
    version: db.verno
  };
}

// Initialize device info on first load
getDeviceInfo().then(info => {
  if (!info) {
    updateDeviceInfo();
  }
});
