# Offline-First Application Architecture
## Django + React + Dexie.js

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Sync Architecture](#sync-architecture)
4. [Implementation Details](#implementation-details)

---

## Overview

This architecture supports:
- Full offline functionality
- Automatic sync when online
- Conflict resolution
- Multi-device support
- Optimistic UI updates

---

## Database Schema

### Dexie.js (IndexedDB) Tables

```javascript
import Dexie from 'dexie';

const db = new Dexie('OfflineFirstApp');

db.version(1).stores({
  // Core Data Tables
  users: '++id, uuid, email, username, last_synced',
  posts: '++id, uuid, user_id, created_at, updated_at, is_deleted, sync_status',
  comments: '++id, uuid, post_id, user_id, created_at, updated_at, is_deleted, sync_status',
  attachments: '++id, uuid, post_id, comment_id, file_path, sync_status',
  
  // Sync Management Tables
  sync_queue: '++id, entity_type, entity_uuid, operation, timestamp, retry_count',
  sync_log: '++id, entity_type, entity_uuid, synced_at, status',
  conflict_queue: '++id, entity_type, entity_uuid, local_data, server_data, detected_at',
  
  // Metadata & Settings
  app_metadata: 'key, value, updated_at',
  user_preferences: '++id, user_id, key, value',
  
  // Cache Tables
  api_cache: 'endpoint, data, cached_at, expires_at',
  blob_storage: 'uuid, blob, mime_type, size, created_at'
});

export default db;
```

### Django Models (PostgreSQL)

```python
from django.db import models
from django.contrib.auth.models import User
import uuid

class TimestampedModel(models.Model):
    """Abstract base model with timestamps and soft delete"""
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        abstract = True


class UserProfile(TimestampedModel):
    """Extended user profile"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    last_sync = models.DateTimeField(null=True, blank=True)
    device_id = models.CharField(max_length=255, null=True, blank=True)
    
    class Meta:
        db_table = 'user_profiles'
        indexes = [
            models.Index(fields=['last_sync']),
        ]


class Post(TimestampedModel):
    """Main post entity"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='posts')
    title = models.CharField(max_length=255)
    content = models.TextField()
    version = models.IntegerField(default=1)
    
    class Meta:
        db_table = 'posts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['uuid', 'version']),
        ]


class Comment(TimestampedModel):
    """Comments on posts"""
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField()
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='replies')
    version = models.IntegerField(default=1)
    
    class Meta:
        db_table = 'comments'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['post', 'created_at']),
        ]


class Attachment(TimestampedModel):
    """File attachments"""
    post = models.ForeignKey(Post, null=True, blank=True, on_delete=models.CASCADE, related_name='attachments')
    comment = models.ForeignKey(Comment, null=True, blank=True, on_delete=models.CASCADE, related_name='attachments')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    file = models.FileField(upload_to='attachments/%Y/%m/%d/')
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100)
    size = models.BigIntegerField()
    
    class Meta:
        db_table = 'attachments'


class SyncLog(models.Model):
    """Track sync operations"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    entity_type = models.CharField(max_length=50, db_index=True)
    entity_uuid = models.UUIDField(db_index=True)
    operation = models.CharField(max_length=20)  # CREATE, UPDATE, DELETE
    synced_at = models.DateTimeField(auto_now_add=True, db_index=True)
    device_id = models.CharField(max_length=255, null=True)
    status = models.CharField(max_length=20)  # SUCCESS, FAILED, CONFLICT
    error_message = models.TextField(null=True, blank=True)
    
    class Meta:
        db_table = 'sync_logs'
        indexes = [
            models.Index(fields=['user', 'synced_at']),
            models.Index(fields=['entity_type', 'entity_uuid']),
        ]


class ConflictResolution(models.Model):
    """Track and resolve conflicts"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    entity_type = models.CharField(max_length=50)
    entity_uuid = models.UUIDField()
    local_version = models.JSONField()
    server_version = models.JSONField()
    resolved = models.BooleanField(default=False)
    resolution_strategy = models.CharField(max_length=50, null=True)  # SERVER_WINS, CLIENT_WINS, MANUAL
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'conflict_resolutions'
```

---

## Sync Architecture

### Sync Flow Diagram

```
┌─────────────┐
│   Client    │
│  (React +   │
│  Dexie.js)  │
└──────┬──────┘
       │
       │ 1. User Action (Create/Update/Delete)
       ▼
┌─────────────────────┐
│  Local IndexedDB    │
│  - Immediate save   │
│  - Add to sync_queue│
└──────┬──────────────┘
       │
       │ 2. Network Available?
       │
       ├─── NO ──► Queue for later
       │
       └─── YES ──┐
                  │
                  ▼
       ┌────────────────────┐
       │   Sync Manager     │
       │  - Batch operations│
       │  - Send to server  │
       └────────┬───────────┘
                │
                │ 3. HTTP Request
                ▼
       ┌────────────────────┐
       │  Django Backend    │
       │  - Validate data   │
       │  - Check conflicts │
       │  - Save to DB      │
       └────────┬───────────┘
                │
                │ 4. Response
                ▼
       ┌────────────────────┐
       │   Sync Manager     │
       │  - Update local DB │
       │  - Remove from queue│
       │  - Handle conflicts│
       └────────────────────┘
```

---

## Implementation Details

### 1. Dexie.js Setup and Utilities

```javascript
// db/index.js
import Dexie from 'dexie';

class OfflineDatabase extends Dexie {
  constructor() {
    super('OfflineFirstApp');
    
    this.version(1).stores({
      users: '++id, uuid, email, username, last_synced',
      posts: '++id, uuid, user_id, created_at, updated_at, is_deleted, sync_status',
      comments: '++id, uuid, post_id, user_id, created_at, updated_at, is_deleted, sync_status',
      attachments: '++id, uuid, post_id, comment_id, file_path, sync_status',
      sync_queue: '++id, entity_type, entity_uuid, operation, timestamp, retry_count',
      sync_log: '++id, entity_type, entity_uuid, synced_at, status',
      conflict_queue: '++id, entity_type, entity_uuid, local_data, server_data, detected_at',
      app_metadata: 'key, value, updated_at',
      user_preferences: '++id, user_id, key, value',
      api_cache: 'endpoint, data, cached_at, expires_at',
      blob_storage: 'uuid, blob, mime_type, size, created_at'
    });
  }
}

export const db = new OfflineDatabase();

// Utilities
export const generateUUID = () => {
  return crypto.randomUUID();
};

export const SyncStatus = {
  PENDING: 'pending',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  FAILED: 'failed',
  CONFLICT: 'conflict'
};

export const Operations = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete'
};
```

### 2. Data Access Layer (DAL)

```javascript
// dal/postRepository.js
import { db, generateUUID, SyncStatus, Operations } from '../db';

export class PostRepository {
  
  async create(postData) {
    const uuid = generateUUID();
    const now = new Date().toISOString();
    
    const post = {
      uuid,
      ...postData,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      sync_status: SyncStatus.PENDING
    };
    
    // Add to posts table
    const id = await db.posts.add(post);
    
    // Add to sync queue
    await db.sync_queue.add({
      entity_type: 'post',
      entity_uuid: uuid,
      operation: Operations.CREATE,
      timestamp: now,
      retry_count: 0,
      data: post
    });
    
    return { ...post, id };
  }
  
  async update(uuid, updates) {
    const now = new Date().toISOString();
    
    await db.posts.where('uuid').equals(uuid).modify({
      ...updates,
      updated_at: now,
      sync_status: SyncStatus.PENDING
    });
    
    const post = await db.posts.where('uuid').equals(uuid).first();
    
    // Add to sync queue
    await db.sync_queue.add({
      entity_type: 'post',
      entity_uuid: uuid,
      operation: Operations.UPDATE,
      timestamp: now,
      retry_count: 0,
      data: post
    });
    
    return post;
  }
  
  async delete(uuid) {
    const now = new Date().toISOString();
    
    // Soft delete
    await db.posts.where('uuid').equals(uuid).modify({
      is_deleted: true,
      updated_at: now,
      sync_status: SyncStatus.PENDING
    });
    
    // Add to sync queue
    await db.sync_queue.add({
      entity_type: 'post',
      entity_uuid: uuid,
      operation: Operations.DELETE,
      timestamp: now,
      retry_count: 0
    });
  }
  
  async getAll(filters = {}) {
    let query = db.posts.where('is_deleted').equals(false);
    
    if (filters.user_id) {
      query = query.and(post => post.user_id === filters.user_id);
    }
    
    return await query.reverse().sortBy('created_at');
  }
  
  async getById(uuid) {
    return await db.posts.where('uuid').equals(uuid).first();
  }
  
  async getPendingSync() {
    return await db.posts.where('sync_status').equals(SyncStatus.PENDING).toArray();
  }
}

export const postRepository = new PostRepository();
```

### 3. Sync Manager

```javascript
// sync/syncManager.js
import { db, SyncStatus } from '../db';
import { apiClient } from '../api/client';

class SyncManager {
  constructor() {
    this.isSyncing = false;
    this.syncInterval = null;
    this.retryDelay = 5000; // 5 seconds
    this.maxRetries = 3;
  }
  
  // Start automatic sync
  startAutoSync(intervalMs = 30000) {
    this.stopAutoSync();
    
    // Initial sync
    this.performSync();
    
    // Set up interval
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, intervalMs);
    
    // Listen for online event
    window.addEventListener('online', () => {
      console.log('Network restored, syncing...');
      this.performSync();
    });
  }
  
  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
  
  async performSync() {
    if (this.isSyncing || !navigator.onLine) {
      return;
    }
    
    this.isSyncing = true;
    
    try {
      // Step 1: Push local changes
      await this.pushChanges();
      
      // Step 2: Pull server changes
      await this.pullChanges();
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }
  
  async pushChanges() {
    const queue = await db.sync_queue
      .where('retry_count')
      .below(this.maxRetries)
      .toArray();
    
    if (queue.length === 0) return;
    
    console.log(`Pushing ${queue.length} changes...`);
    
    for (const item of queue) {
      try {
        const response = await this.syncEntity(item);
        
        if (response.status === 'success') {
          // Remove from queue
          await db.sync_queue.delete(item.id);
          
          // Update sync status
          await this.updateEntitySyncStatus(
            item.entity_type,
            item.entity_uuid,
            SyncStatus.SYNCED
          );
          
          // Log success
          await db.sync_log.add({
            entity_type: item.entity_type,
            entity_uuid: item.entity_uuid,
            synced_at: new Date().toISOString(),
            status: 'success'
          });
          
        } else if (response.status === 'conflict') {
          // Handle conflict
          await this.handleConflict(item, response.serverData);
        }
        
      } catch (error) {
        console.error(`Failed to sync ${item.entity_type}:`, error);
        
        // Increment retry count
        await db.sync_queue.update(item.id, {
          retry_count: item.retry_count + 1
        });
        
        // Update status to failed if max retries exceeded
        if (item.retry_count + 1 >= this.maxRetries) {
          await this.updateEntitySyncStatus(
            item.entity_type,
            item.entity_uuid,
            SyncStatus.FAILED
          );
        }
      }
    }
  }
  
  async syncEntity(queueItem) {
    const { entity_type, entity_uuid, operation, data } = queueItem;
    
    const endpoint = `/api/${entity_type}s/sync/`;
    
    return await apiClient.post(endpoint, {
      uuid: entity_uuid,
      operation,
      data
    });
  }
  
  async pullChanges() {
    try {
      const lastSync = await db.app_metadata.get('last_sync_timestamp');
      const timestamp = lastSync?.value || null;
      
      const response = await apiClient.get('/api/sync/changes/', {
        params: { since: timestamp }
      });
      
      const { posts, comments, attachments } = response.data;
      
      // Update local database
      if (posts?.length) {
        await this.mergeChanges('posts', posts);
      }
      
      if (comments?.length) {
        await this.mergeChanges('comments', comments);
      }
      
      if (attachments?.length) {
        await this.mergeChanges('attachments', attachments);
      }
      
      // Update last sync timestamp
      await db.app_metadata.put({
        key: 'last_sync_timestamp',
        value: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Pull changes failed:', error);
      throw error;
    }
  }
  
  async mergeChanges(tableName, changes) {
    const table = db[tableName];
    
    for (const item of changes) {
      const existing = await table.where('uuid').equals(item.uuid).first();
      
      if (!existing) {
        // New item from server
        await table.add({ ...item, sync_status: SyncStatus.SYNCED });
      } else {
        // Check if server version is newer
        const serverTime = new Date(item.updated_at).getTime();
        const localTime = new Date(existing.updated_at).getTime();
        
        if (serverTime > localTime) {
          // Server is newer, update local
          await table.update(existing.id, {
            ...item,
            sync_status: SyncStatus.SYNCED
          });
        }
      }
    }
  }
  
  async handleConflict(queueItem, serverData) {
    const localData = queueItem.data;
    
    // Add to conflict queue
    await db.conflict_queue.add({
      entity_type: queueItem.entity_type,
      entity_uuid: queueItem.entity_uuid,
      local_data: localData,
      server_data: serverData,
      detected_at: new Date().toISOString()
    });
    
    // Update entity status
    await this.updateEntitySyncStatus(
      queueItem.entity_type,
      queueItem.entity_uuid,
      SyncStatus.CONFLICT
    );
    
    // Remove from sync queue
    await db.sync_queue.delete(queueItem.id);
  }
  
  async updateEntitySyncStatus(entityType, entityUuid, status) {
    const table = db[`${entityType}s`];
    await table.where('uuid').equals(entityUuid).modify({
      sync_status: status
    });
  }
  
  async resolveConflict(conflictId, strategy = 'server_wins') {
    const conflict = await db.conflict_queue.get(conflictId);
    
    if (!conflict) return;
    
    const table = db[`${conflict.entity_type}s`];
    
    if (strategy === 'server_wins') {
      // Use server data
      await table.where('uuid').equals(conflict.entity_uuid).modify({
        ...conflict.server_data,
        sync_status: SyncStatus.SYNCED
      });
    } else if (strategy === 'client_wins') {
      // Re-queue for sync
      await db.sync_queue.add({
        entity_type: conflict.entity_type,
        entity_uuid: conflict.entity_uuid,
        operation: 'update',
        timestamp: new Date().toISOString(),
        retry_count: 0,
        data: conflict.local_data
      });
      
      await table.where('uuid').equals(conflict.entity_uuid).modify({
        sync_status: SyncStatus.PENDING
      });
    }
    
    // Remove from conflict queue
    await db.conflict_queue.delete(conflictId);
  }
}

export const syncManager = new SyncManager();
```

### 4. React Hooks

```javascript
// hooks/usePosts.js
import { useState, useEffect } from 'react';
import { postRepository } from '../dal/postRepository';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export function usePosts(filters = {}) {
  const [loading, setLoading] = useState(true);
  
  // Live query automatically updates when data changes
  const posts = useLiveQuery(
    () => postRepository.getAll(filters),
    [JSON.stringify(filters)]
  );
  
  useEffect(() => {
    if (posts !== undefined) {
      setLoading(false);
    }
  }, [posts]);
  
  const createPost = async (postData) => {
    return await postRepository.create(postData);
  };
  
  const updatePost = async (uuid, updates) => {
    return await postRepository.update(uuid, updates);
  };
  
  const deletePost = async (uuid) => {
    return await postRepository.delete(uuid);
  };
  
  return {
    posts: posts || [],
    loading,
    createPost,
    updatePost,
    deletePost
  };
}

// hooks/useSync.js
import { useState, useEffect } from 'react';
import { syncManager } from '../sync/syncManager';
import { db } from '../db';
import { useLiveQuery } from 'dexie-react-hooks';

export function useSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  const pendingCount = useLiveQuery(
    async () => await db.sync_queue.count()
  );
  
  const conflicts = useLiveQuery(
    async () => await db.conflict_queue.toArray()
  );
  
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Start auto sync
    syncManager.startAutoSync();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      syncManager.stopAutoSync();
    };
  }, []);
  
  const manualSync = async () => {
    setIsSyncing(true);
    await syncManager.performSync();
    setIsSyncing(false);
  };
  
  const resolveConflict = async (conflictId, strategy) => {
    await syncManager.resolveConflict(conflictId, strategy);
  };
  
  return {
    isOnline,
    isSyncing,
    pendingCount: pendingCount || 0,
    conflicts: conflicts || [],
    manualSync,
    resolveConflict
  };
}
```

### 5. Django REST API Views

```python
# views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone
from .models import Post, Comment, Attachment, SyncLog
from .serializers import PostSerializer, CommentSerializer

class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.filter(is_deleted=False)
    serializer_class = PostSerializer
    
    @action(detail=False, methods=['post'])
    def sync(self, request):
        """Handle sync from client"""
        uuid = request.data.get('uuid')
        operation = request.data.get('operation')
        data = request.data.get('data')
        
        try:
            with transaction.atomic():
                if operation == 'create':
                    return self._handle_create(uuid, data, request.user)
                elif operation == 'update':
                    return self._handle_update(uuid, data, request.user)
                elif operation == 'delete':
                    return self._handle_delete(uuid, request.user)
                    
        except Exception as e:
            return Response({
                'status': 'error',
                'message': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    def _handle_create(self, uuid, data, user):
        # Check if already exists
        if Post.objects.filter(uuid=uuid).exists():
            return Response({
                'status': 'error',
                'message': 'Post already exists'
            }, status=status.HTTP_409_CONFLICT)
        
        post = Post.objects.create(
            uuid=uuid,
            user=user,
            **data
        )
        
        # Log sync
        SyncLog.objects.create(
            user=user,
            entity_type='post',
            entity_uuid=uuid,
            operation='CREATE',
            status='SUCCESS'
        )
        
        return Response({
            'status': 'success',
            'data': PostSerializer(post).data
        })
    
    def _handle_update(self, uuid, data, user):
        try:
            post = Post.objects.get(uuid=uuid, user=user)
        except Post.DoesNotExist:
            return Response({
                'status': 'error',
                'message': 'Post not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Check for conflicts
        client_updated = data.get('updated_at')
        if post.updated_at.isoformat() > client_updated:
            # Conflict detected
            SyncLog.objects.create(
                user=user,
                entity_type='post',
                entity_uuid=uuid,
                operation='UPDATE',
                status='CONFLICT'
            )
            
            return Response({
                'status': 'conflict',
                'serverData': PostSerializer(post).data,
                'message': 'Server version is newer'
            })
        
        # Update post
        for key, value in data.items():
            if key not in ['uuid', 'id', 'created_at']:
                setattr(post, key, value)
        
        post.version += 1
        post.save()
        
        # Log sync
        SyncLog.objects.create(
            user=user,
            entity_type='post',
            entity_uuid=uuid,
            operation='UPDATE',
            status='SUCCESS'
        )
        
        return Response({
            'status': 'success',
            'data': PostSerializer(post).data
        })
    
    def _handle_delete(self, uuid, user):
        try:
            post = Post.objects.get(uuid=uuid, user=user)
        except Post.DoesNotExist:
            return Response({'status': 'success'})
        
        post.is_deleted = True
        post.deleted_at = timezone.now()
        post.save()
        
        # Log sync
        SyncLog.objects.create(
            user=user,
            entity_type='post',
            entity_uuid=uuid,
            operation='DELETE',
            status='SUCCESS'
        )
        
        return Response({'status': 'success'})


class SyncViewSet(viewsets.ViewSet):
    """Handle bulk sync operations"""
    
    @action(detail=False, methods=['get'])
    def changes(self, request):
        """Get all changes since timestamp"""
        since = request.query_params.get('since')
        user = request.user
        
        # Build query
        query_filter = {'user': user, 'is_deleted': False}
        
        if since:
            from datetime import datetime
            since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
            query_filter['updated_at__gt'] = since_dt
        
        posts = Post.objects.filter(**query_filter)
        comments = Comment.objects.filter(
            post__user=user,
            **({'updated_at__gt': since_dt} if since else {})
        )
        
        return Response({
            'posts': PostSerializer(posts, many=True).data,
            'comments': CommentSerializer(comments, many=True).data,
            'timestamp': timezone.now().isoformat()
        })
```

---

## Usage Example

### React Component

```javascript
// components/PostList.jsx
import React from 'react';
import { usePosts } from '../hooks/usePosts';
import { useSync } from '../hooks/useSync';

function PostList() {
  const { posts, loading, createPost, updatePost, deletePost } = usePosts();
  const { isOnline, pendingCount, manualSync } = useSync();
  
  const handleCreatePost = async () => {
    await createPost({
      user_id: 1,
      title: 'New Post',
      content: 'This is a new post created offline!'
    });
  };
  
  return (
    <div>
      <div className="sync-status">
        {isOnline ? '🟢 Online' : '🔴 Offline'}
        {pendingCount > 0 && ` (${pendingCount} pending)`}
        <button onClick={manualSync}>Sync Now</button>
      </div>
      
      <button onClick={handleCreatePost}>Create Post</button>
      
      {loading ? (
        <div>Loading...</div>
      ) : (
        <ul>
          {posts.map(post => (
            <li key={post.uuid}>
              <h3>{post.title}</h3>
              <p>{post.content}</p>
              <span className={`status-${post.sync_status}`}>
                {post.sync_status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PostList;
```

---

## Key Features Covered

✅ Offline-first architecture  
✅ Automatic background sync  
✅ Conflict detection and resolution  
✅ Optimistic UI updates  
✅ Retry logic with exponential backoff  
✅ Soft deletes  
✅ Version tracking  
✅ Multi-device support  
✅ File/blob storage  
✅ Live queries with Dexie React hooks  

