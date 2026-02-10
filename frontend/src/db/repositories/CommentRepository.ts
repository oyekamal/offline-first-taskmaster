/**
 * Comment Repository - Manages task comments with threading support
 *
 * Features:
 * - CRUD operations for comments
 * - Thread hierarchy management (parent-child relationships)
 * - Optimistic updates
 * - Sync queue integration
 */

import { liveQuery } from 'dexie';
import { db, getDeviceId } from '../index';
import {
  Comment,
  CreateCommentInput,
  UpdateCommentInput,
  SyncQueueEntry,
  SyncOperation
} from '../../types';

export class CommentRepository {
  /**
   * Create a new comment
   */
  async create(input: CreateCommentInput, user: { id: string; name: string; avatar_url?: string }): Promise<Comment> {
    const deviceId = getDeviceId();
    const now = new Date().toISOString();

    const comment: Comment = {
      id: '', // Auto-generated
      task: input.task,
      user: user.id,
      user_name: user.name,
      user_avatar_url: user.avatar_url || null,
      content: input.content,
      parent: input.parent || null,
      version: 1,
      vector_clock: { [deviceId]: 1 },
      is_edited: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      _local_only: true,
      _sync_status: 'pending'
    };

    const id = await db.comments.add(comment);
    const created = await db.comments.get(id);

    if (!created) {
      throw new Error('Failed to create comment');
    }

    // Update task comment count
    const task = await db.tasks.get(input.task);
    if (task) {
      await db.tasks.update(input.task, {
        comment_count: task.comment_count + 1
      });
    }

    // Add to sync queue
    await this.addToSyncQueue(created.id, 'CREATE', created);

    return created;
  }

  /**
   * Get a single comment by ID
   */
  async get(id: string): Promise<Comment | undefined> {
    return await db.comments.get(id);
  }

  /**
   * Update a comment
   */
  async update(id: string, updates: UpdateCommentInput): Promise<Comment> {
    const existing = await db.comments.get(id);
    if (!existing) {
      throw new Error('Comment not found');
    }

    await db.comments.update(id, {
      content: updates.content,
      _sync_status: 'pending'
    });

    const updated = await db.comments.get(id);
    if (!updated) {
      throw new Error('Failed to update comment');
    }

    // Add to sync queue
    await this.addToSyncQueue(id, 'UPDATE', updates);

    return updated;
  }

  /**
   * Soft delete a comment
   */
  async delete(id: string): Promise<void> {
    const comment = await db.comments.get(id);
    if (!comment) {
      throw new Error('Comment not found');
    }

    await db.comments.update(id, {
      deleted_at: new Date().toISOString(),
      _sync_status: 'pending'
    });

    // Update task comment count
    const task = await db.tasks.get(comment.task);
    if (task && task.comment_count > 0) {
      await db.tasks.update(comment.task, {
        comment_count: task.comment_count - 1
      });
    }

    // Add to sync queue
    await this.addToSyncQueue(id, 'DELETE', { deleted_at: new Date().toISOString() });
  }

  /**
   * Get all comments for a task
   */
  async getByTask(taskId: string, includeDeleted = false): Promise<Comment[]> {
    let query = db.comments.where('task').equals(taskId);

    const comments = await query.toArray();

    return includeDeleted
      ? comments
      : comments.filter(c => !c.deleted_at);
  }

  /**
   * Get comments with threading structure
   * Returns comments organized by parent-child relationships
   */
  async getThreaded(taskId: string): Promise<Comment[]> {
    const allComments = await this.getByTask(taskId);

    // Build a map of comments by ID for quick lookup
    const commentMap = new Map<string, Comment & { replies?: Comment[] }>();
    allComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });

    // Root comments (no parent)
    const rootComments: Comment[] = [];

    // Organize into hierarchy
    allComments.forEach(comment => {
      if (comment.parent) {
        const parent = commentMap.get(comment.parent);
        if (parent?.replies) {
          parent.replies.push(commentMap.get(comment.id)!);
        }
      } else {
        rootComments.push(commentMap.get(comment.id)!);
      }
    });

    return rootComments;
  }

  /**
   * Get replies to a specific comment
   */
  async getReplies(parentId: string): Promise<Comment[]> {
    return db.comments
      .where('parent')
      .equals(parentId)
      .and(c => !c.deleted_at)
      .toArray();
  }

  /**
   * Get comment count for a task
   */
  async countByTask(taskId: string): Promise<number> {
    return db.comments
      .where('task')
      .equals(taskId)
      .and(c => !c.deleted_at)
      .count();
  }

  /**
   * Live query for task comments
   */
  liveQuery(taskId: string) {
    return liveQuery(() => this.getByTask(taskId));
  }

  /**
   * Live query for threaded comments
   */
  liveQueryThreaded(taskId: string) {
    return liveQuery(() => this.getThreaded(taskId));
  }

  /**
   * Sync comment from server
   */
  async syncFromServer(comment: Comment): Promise<void> {
    const existing = await db.comments.get(comment.id);

    if (!existing) {
      // New comment from server
      await db.comments.add({
        ...comment,
        _local_only: false,
        _sync_status: 'synced'
      });
    } else {
      // Check for conflicts
      const hasConflict = this.detectConflict(existing.vector_clock, comment.vector_clock);

      if (hasConflict) {
        await db.comments.update(comment.id, {
          _conflict: true,
          _sync_status: 'conflict'
        });
      } else {
        await db.comments.put({
          ...comment,
          _local_only: false,
          _sync_status: 'synced'
        });
      }
    }
  }

  /**
   * Mark comment as synced
   */
  async markSynced(id: string): Promise<void> {
    await db.comments.update(id, {
      _local_only: false,
      _sync_status: 'synced'
    });

    // Remove from sync queue
    await db.sync_queue
      .where('entity_id')
      .equals(id)
      .delete();
  }

  /**
   * Get comments by user
   */
  async getByUser(userId: string): Promise<Comment[]> {
    return db.comments
      .where('user')
      .equals(userId)
      .and(c => !c.deleted_at)
      .toArray();
  }

  /**
   * Private helper: Add to sync queue
   */
  private async addToSyncQueue(
    entityId: string,
    operation: SyncOperation,
    data: Partial<Comment>
  ): Promise<void> {
    const deviceId = getDeviceId();
    const entry: SyncQueueEntry = {
      id: '', // Auto-generated
      entity_type: 'comment',
      entity_id: entityId,
      operation,
      data,
      vector_clock: { [deviceId]: Date.now() },
      attempt_count: 0,
      last_attempt_at: null,
      created_at: new Date().toISOString(),
      error_message: null
    };

    await db.sync_queue.add(entry);
  }

  /**
   * Private helper: Detect conflicts
   */
  private detectConflict(
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

    return localDominates && serverDominates;
  }
}

// Export singleton instance
export const commentRepository = new CommentRepository();
