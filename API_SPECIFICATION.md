# API Specification

## Overview

RESTful API design optimized for offline-first synchronization with efficient delta sync, batching, and conflict resolution.

---

## Authentication

### JWT-Based Authentication

```typescript
// Token structure
interface JWTPayload {
  userId: string;
  organizationId: string;
  deviceId: string;
  role: 'admin' | 'manager' | 'member';
  iat: number; // Issued at
  exp: number; // Expiration
}

// Headers for all authenticated requests
{
  "Authorization": "Bearer <jwt_token>",
  "X-Device-ID": "<device_uuid>",
  "X-Client-Version": "1.0.0"
}
```

### Authentication Endpoints

#### POST /api/auth/login

Login and receive JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "hashed_password",
  "deviceFingerprint": "browser_uuid",
  "deviceName": "Chrome on MacBook Pro"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "refresh_token_here",
  "expiresIn": 86400,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "organizationId": "org-uuid",
    "role": "member"
  },
  "device": {
    "id": "device-uuid",
    "name": "Chrome on MacBook Pro"
  }
}
```

---

#### POST /api/auth/refresh

Refresh expired JWT token.

**Request:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

**Response (200 OK):**
```json
{
  "token": "new_jwt_token",
  "expiresIn": 86400
}
```

---

## Sync Endpoints

### POST /api/sync/push

Push local changes to server.

**Request:**
```json
{
  "deviceId": "device-uuid",
  "vectorClock": {
    "device-uuid": 42,
    "other-device-uuid": 18
  },
  "timestamp": 1707580800000,
  "changes": {
    "tasks": [
      {
        "id": "task-uuid",
        "operation": "update",
        "data": {
          "id": "task-uuid",
          "organizationId": "org-uuid",
          "projectId": "project-uuid",
          "title": "Updated task title",
          "description": "Task description",
          "status": "in_progress",
          "priority": "high",
          "dueDate": 1707667200000,
          "assignedTo": "user-uuid",
          "tags": ["urgent", "frontend"],
          "version": 5,
          "vectorClock": {
            "device-uuid": 42
          },
          "lastModifiedBy": "user-uuid",
          "lastModifiedDevice": "device-uuid",
          "checksum": "sha256_hash",
          "updatedAt": 1707580800000
        }
      }
    ],
    "comments": [
      {
        "id": "comment-uuid",
        "operation": "create",
        "data": {
          "id": "comment-uuid",
          "taskId": "task-uuid",
          "userId": "user-uuid",
          "content": "This is a comment",
          "parentId": null,
          "version": 1,
          "vectorClock": {
            "device-uuid": 43
          },
          "createdAt": 1707580900000
        }
      }
    ],
    "attachments": []
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "processed": 2,
  "conflicts": [
    {
      "entityType": "task",
      "entityId": "task-uuid",
      "conflictReason": "Concurrent modification detected",
      "serverVersion": {
        "id": "task-uuid",
        "title": "Different title from server",
        "version": 6,
        "vectorClock": {
          "device-uuid": 41,
          "other-device-uuid": 20
        },
        "updatedAt": 1707580850000
      },
      "serverVectorClock": {
        "device-uuid": 41,
        "other-device-uuid": 20
      }
    }
  ],
  "serverVectorClock": {
    "device-uuid": 42,
    "other-device-uuid": 20
  },
  "timestamp": 1707580900000
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Invalid payload",
  "details": "Missing required field: deviceId"
}
```

**Response (409 Conflict):**
```json
{
  "error": "Version conflict",
  "conflicts": [/* conflict details */]
}
```

---

### GET /api/sync/pull

Pull server changes since last sync.

**Query Parameters:**
- `since` (required): Unix timestamp in milliseconds
- `limit` (optional): Max entities per type (default: 100)
- `entityTypes` (optional): Comma-separated list (default: all)

**Request:**
```
GET /api/sync/pull?since=1707580000000&limit=100
```

**Response (200 OK):**
```json
{
  "tasks": [
    {
      "id": "task-uuid",
      "organizationId": "org-uuid",
      "projectId": "project-uuid",
      "title": "Task from server",
      "description": "Description",
      "status": "todo",
      "priority": "medium",
      "dueDate": null,
      "assignedTo": "user-uuid",
      "tags": [],
      "customFields": {},
      "version": 3,
      "vectorClock": {
        "other-device-uuid": 25
      },
      "lastModifiedBy": "user-uuid",
      "lastModifiedDevice": "other-device-uuid",
      "checksum": "sha256_hash",
      "createdAt": 1707580100000,
      "updatedAt": 1707580500000,
      "deletedAt": null
    }
  ],
  "comments": [
    {
      "id": "comment-uuid",
      "taskId": "task-uuid",
      "userId": "user-uuid",
      "content": "Comment text",
      "parentId": null,
      "version": 1,
      "vectorClock": {
        "other-device-uuid": 26
      },
      "isEdited": false,
      "createdAt": 1707580200000,
      "updatedAt": 1707580200000,
      "deletedAt": null
    }
  ],
  "attachments": [
    {
      "id": "attachment-uuid",
      "taskId": "task-uuid",
      "userId": "user-uuid",
      "filename": "document.pdf",
      "fileSize": 1048576,
      "mimeType": "application/pdf",
      "storageKey": "s3_key",
      "thumbnailKey": "thumbnail_s3_key",
      "uploadStatus": "completed",
      "checksumSha256": "sha256_hash",
      "vectorClock": {
        "other-device-uuid": 27
      },
      "createdAt": 1707580300000,
      "completedAt": 1707580350000,
      "deletedAt": null
    }
  ],
  "tombstones": [
    {
      "id": "tombstone-uuid",
      "entityType": "task",
      "entityId": "deleted-task-uuid",
      "deletedBy": "user-uuid",
      "deletedFromDevice": "other-device-uuid",
      "vectorClock": {
        "other-device-uuid": 28
      },
      "createdAt": 1707580400000,
      "expiresAt": 1715356400000
    }
  ],
  "users": [
    {
      "id": "user-uuid",
      "organizationId": "org-uuid",
      "email": "colleague@example.com",
      "name": "Jane Smith",
      "avatarUrl": "https://cdn.example.com/avatar.jpg",
      "role": "member",
      "isActive": true,
      "lastSeenAt": 1707580000000
    }
  ],
  "projects": [
    {
      "id": "project-uuid",
      "organizationId": "org-uuid",
      "name": "Project Alpha",
      "description": "Project description",
      "color": "#3B82F6",
      "isArchived": false,
      "createdBy": "user-uuid",
      "createdAt": 1707500000000,
      "updatedAt": 1707550000000
    }
  ],
  "serverVectorClock": {
    "device-uuid": 42,
    "other-device-uuid": 28
  },
  "hasMore": false,
  "timestamp": 1707580900000
}
```

---

### GET /api/sync/conflicts

Get all unresolved conflicts for current device.

**Response (200 OK):**
```json
{
  "conflicts": [
    {
      "id": "conflict-uuid",
      "entityType": "task",
      "entityId": "task-uuid",
      "localVersion": {/* full entity */},
      "serverVersion": {/* full entity */},
      "localVectorClock": {/* vector clock */},
      "serverVectorClock": {/* vector clock */},
      "conflictReason": "Concurrent modification",
      "suggestedResolution": {/* merged entity */},
      "createdAt": 1707580800000
    }
  ],
  "total": 1
}
```

---

### POST /api/sync/conflicts/:conflictId/resolve

Resolve a conflict manually.

**Request:**
```json
{
  "resolution": "local" | "remote" | "custom",
  "customResolution": {
    // If resolution = "custom", provide merged entity
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "resolvedEntity": {/* final entity state */}
}
```

---

## Task Endpoints

### GET /api/tasks

Get tasks for current organization.

**Query Parameters:**
- `status` (optional): Filter by status
- `assignedTo` (optional): Filter by assigned user
- `projectId` (optional): Filter by project
- `search` (optional): Full-text search
- `limit` (optional): Page size (default: 50)
- `offset` (optional): Pagination offset

**Request:**
```
GET /api/tasks?status=todo&assignedTo=me&limit=50
```

**Response (200 OK):**
```json
{
  "tasks": [/* array of tasks */],
  "total": 150,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

---

### GET /api/tasks/:taskId

Get single task with related data.

**Query Parameters:**
- `include` (optional): Comma-separated list of relations (comments, attachments, history)

**Request:**
```
GET /api/tasks/task-uuid?include=comments,attachments
```

**Response (200 OK):**
```json
{
  "task": {/* task object */},
  "comments": [/* comments array */],
  "attachments": [/* attachments array */]
}
```

---

### POST /api/tasks

Create new task.

**Request:**
```json
{
  "title": "New task",
  "description": "Task description",
  "projectId": "project-uuid",
  "status": "todo",
  "priority": "medium",
  "dueDate": 1707667200000,
  "assignedTo": "user-uuid",
  "tags": ["urgent"]
}
```

**Response (201 Created):**
```json
{
  "task": {
    "id": "task-uuid",
    "organizationId": "org-uuid",
    // ... all task fields
    "createdAt": 1707580900000,
    "updatedAt": 1707580900000
  }
}
```

---

### PATCH /api/tasks/:taskId

Update existing task.

**Request:**
```json
{
  "title": "Updated title",
  "status": "in_progress",
  "version": 5
}
```

**Response (200 OK):**
```json
{
  "task": {/* updated task */}
}
```

**Response (409 Conflict):**
```json
{
  "error": "Version conflict",
  "currentVersion": 6,
  "yourVersion": 5,
  "currentState": {/* server state */}
}
```

---

### DELETE /api/tasks/:taskId

Soft delete task.

**Request:**
```
DELETE /api/tasks/task-uuid
```

**Response (204 No Content)**

---

## Comment Endpoints

### GET /api/tasks/:taskId/comments

Get all comments for a task.

**Response (200 OK):**
```json
{
  "comments": [
    {
      "id": "comment-uuid",
      "taskId": "task-uuid",
      "userId": "user-uuid",
      "user": {
        "id": "user-uuid",
        "name": "John Doe",
        "avatarUrl": "https://cdn.example.com/avatar.jpg"
      },
      "content": "Comment text",
      "parentId": null,
      "isEdited": false,
      "createdAt": 1707580000000,
      "updatedAt": 1707580000000
    }
  ]
}
```

---

### POST /api/tasks/:taskId/comments

Create new comment.

**Request:**
```json
{
  "content": "This is a comment",
  "parentId": null
}
```

**Response (201 Created):**
```json
{
  "comment": {/* created comment */}
}
```

---

### PATCH /api/comments/:commentId

Edit comment.

**Request:**
```json
{
  "content": "Updated comment text",
  "version": 1
}
```

**Response (200 OK):**
```json
{
  "comment": {/* updated comment */}
}
```

---

### DELETE /api/comments/:commentId

Delete comment.

**Response (204 No Content)**

---

## Attachment Endpoints

### POST /api/tasks/:taskId/attachments/init

Initialize chunked file upload.

**Request:**
```json
{
  "filename": "document.pdf",
  "fileSize": 10485760,
  "mimeType": "application/pdf",
  "checksumSha256": "sha256_hash",
  "chunkSize": 1048576,
  "totalChunks": 10
}
```

**Response (201 Created):**
```json
{
  "attachment": {
    "id": "attachment-uuid",
    "uploadStatus": "pending",
    "uploadUrl": "https://s3.amazonaws.com/...",
    "uploadId": "multipart_upload_id"
  }
}
```

---

### POST /api/attachments/:attachmentId/chunks/:chunkNumber

Upload file chunk.

**Request:**
```
Content-Type: multipart/form-data

chunk: <binary data>
```

**Response (200 OK):**
```json
{
  "chunkNumber": 1,
  "etag": "chunk_etag",
  "uploadProgress": 10
}
```

---

### POST /api/attachments/:attachmentId/complete

Complete chunked upload.

**Request:**
```json
{
  "parts": [
    {
      "partNumber": 1,
      "etag": "etag_1"
    },
    {
      "partNumber": 2,
      "etag": "etag_2"
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "attachment": {
    "id": "attachment-uuid",
    "uploadStatus": "completed",
    "storageKey": "s3_key",
    "downloadUrl": "https://cdn.example.com/...",
    "completedAt": 1707580900000
  }
}
```

---

### GET /api/attachments/:attachmentId/download

Get signed download URL.

**Response (200 OK):**
```json
{
  "downloadUrl": "https://s3.amazonaws.com/signed_url",
  "expiresIn": 3600
}
```

---

### DELETE /api/attachments/:attachmentId

Delete attachment.

**Response (204 No Content)**

---

## WebSocket Events

### Connection

```typescript
const socket = io('wss://api.example.com', {
  auth: {
    token: jwtToken
  },
  query: {
    deviceId: 'device-uuid'
  }
});
```

---

### Client → Server Events

#### `join_organization`

Join organization room for real-time updates.

```typescript
socket.emit('join_organization', {
  organizationId: 'org-uuid'
});
```

---

#### `subscribe_tasks`

Subscribe to specific task updates.

```typescript
socket.emit('subscribe_tasks', {
  taskIds: ['task-1', 'task-2', 'task-3']
});
```

---

### Server → Client Events

#### `task_updated`

Task updated by another user/device.

```typescript
socket.on('task_updated', (data) => {
  console.log('Task updated:', data);
  /*
  {
    taskId: 'task-uuid',
    changes: {
      status: 'done',
      updatedAt: 1707580900000
    },
    updatedBy: {
      id: 'user-uuid',
      name: 'Jane Smith'
    },
    vectorClock: { ... }
  }
  */
});
```

---

#### `comment_created`

New comment added.

```typescript
socket.on('comment_created', (data) => {
  /*
  {
    comment: { ... },
    taskId: 'task-uuid'
  }
  */
});
```

---

#### `sync_required`

Server indicates client should sync.

```typescript
socket.on('sync_required', (data) => {
  /*
  {
    reason: 'bulk_update',
    affectedEntities: ['task-1', 'task-2']
  }
  */

  // Trigger sync
  syncEngine.triggerSync('server_notification');
});
```

---

#### `conflict_detected`

Real-time conflict notification.

```typescript
socket.on('conflict_detected', (data) => {
  /*
  {
    conflictId: 'conflict-uuid',
    entityType: 'task',
    entityId: 'task-uuid'
  }
  */
});
```

---

## Rate Limiting

### Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 requests | 15 minutes |
| `/api/sync/push` | 60 requests | 1 minute |
| `/api/sync/pull` | 120 requests | 1 minute |
| `/api/tasks` (GET) | 300 requests | 1 minute |
| `/api/tasks` (POST/PATCH) | 60 requests | 1 minute |
| WebSocket connections | 10 concurrent | per user |

### Rate Limit Headers

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1707580920
```

### Rate Limit Response (429)

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 30
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional details",
  "timestamp": 1707580900000,
  "requestId": "req-uuid"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_REQUEST` | 400 | Malformed request |
| `UNAUTHORIZED` | 401 | Missing or invalid auth token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VERSION_CONFLICT` | 409 | Optimistic lock failure |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Temporary outage |

---

## Pagination

### Cursor-Based Pagination

For large datasets, use cursor-based pagination:

**Request:**
```
GET /api/tasks?cursor=eyJpZCI6InRhc2stMTIzIiwidXBkYXRlZEF0IjoxNzA3NTgwMDAwfQ&limit=50
```

**Response:**
```json
{
  "tasks": [/* results */],
  "pagination": {
    "nextCursor": "eyJpZCI6InRhc2stMTczIiwidXBkYXRlZEF0IjoxNzA3NTgwNTAwfQ",
    "hasMore": true
  }
}
```

---

## Caching

### ETags

Support conditional requests:

**Request:**
```
GET /api/tasks/task-uuid
If-None-Match: "33a64df551425fcc55e4d42a148795d9f25f89d4"
```

**Response (304 Not Modified)** if content unchanged

**Response (200 OK)** with new ETag if changed:
```
ETag: "4d2f8f9a0c4e1b5d6a7c8e9f0a1b2c3d4e5f6a7b"
```

---

## Compression

All responses support gzip compression:

**Request:**
```
Accept-Encoding: gzip, deflate
```

**Response:**
```
Content-Encoding: gzip
```

---

## API Versioning

Version included in URL path:

```
https://api.example.com/v1/tasks
```

Deprecation notice in headers:

```
X-API-Deprecation: true
X-API-Sunset: 2027-01-01T00:00:00Z
Link: <https://api.example.com/v2/tasks>; rel="successor-version"
```

---

## Server Implementation Example

### Node.js/Express

```typescript
import express from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';

const app = express();
const pool = new Pool(/* config */);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(authenticateJWT);
app.use(rateLimiter);

// Sync push endpoint
app.post('/api/sync/push', async (req, res) => {
  const { deviceId, changes, vectorClock, timestamp } = req.body;
  const userId = req.user.id;
  const organizationId = req.user.organizationId;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const conflicts: Conflict[] = [];
    const processed: string[] = [];

    // Process tasks
    for (const taskChange of changes.tasks || []) {
      const conflict = await processTaskChange(
        client,
        taskChange,
        organizationId,
        userId,
        deviceId,
        vectorClock
      );

      if (conflict) {
        conflicts.push(conflict);
      } else {
        processed.push(taskChange.data.id);
      }
    }

    // Process comments
    for (const commentChange of changes.comments || []) {
      await processCommentChange(client, commentChange, userId, deviceId);
      processed.push(commentChange.data.id);
    }

    // Update device sync state
    await client.query(
      `UPDATE devices
       SET last_sync_at = NOW(),
           vector_clock = $1
       WHERE id = $2`,
      [JSON.stringify(vectorClock), deviceId]
    );

    // Log sync
    await client.query(
      `INSERT INTO sync_logs (id, device_id, user_id, sync_type, entities_pushed, conflicts_detected, status)
       VALUES (gen_random_uuid(), $1, $2, 'push', $3, $4, 'success')`,
      [deviceId, userId, processed.length, conflicts.length]
    );

    await client.query('COMMIT');

    // Broadcast changes to other devices via WebSocket
    broadcastChanges(organizationId, processed, deviceId);

    res.json({
      success: true,
      processed: processed.length,
      conflicts,
      serverVectorClock: await getServerVectorClock(organizationId),
      timestamp: Date.now()
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Push sync error:', error);
    res.status(500).json({
      error: 'Sync failed',
      code: 'SYNC_ERROR',
      requestId: req.id
    });
  } finally {
    client.release();
  }
});

// Sync pull endpoint
app.get('/api/sync/pull', async (req, res) => {
  const { since, limit = 100 } = req.query;
  const deviceId = req.headers['x-device-id'];
  const organizationId = req.user.organizationId;

  try {
    const sinceDate = new Date(parseInt(since as string));

    // Fetch changes in parallel
    const [tasks, comments, attachments, tombstones, users, projects] = await Promise.all([
      fetchTasksSince(organizationId, deviceId, sinceDate, limit),
      fetchCommentsSince(organizationId, deviceId, sinceDate, limit),
      fetchAttachmentsSince(organizationId, deviceId, sinceDate, limit),
      fetchTombstonesSince(organizationId, deviceId, sinceDate, limit),
      fetchUsersSince(organizationId, sinceDate),
      fetchProjectsSince(organizationId, sinceDate)
    ]);

    res.json({
      tasks,
      comments,
      attachments,
      tombstones,
      users,
      projects,
      serverVectorClock: await getServerVectorClock(organizationId),
      hasMore: tasks.length === limit,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Pull sync error:', error);
    res.status(500).json({
      error: 'Pull sync failed',
      code: 'SYNC_ERROR'
    });
  }
});

async function processTaskChange(
  client: PoolClient,
  change: any,
  organizationId: string,
  userId: string,
  deviceId: string,
  clientVectorClock: VectorClock
): Promise<Conflict | null> {
  const { operation, data } = change;

  // Check for conflicts
  const existing = await client.query(
    'SELECT * FROM tasks WHERE id = $1',
    [data.id]
  );

  if (existing.rows.length > 0) {
    const serverTask = existing.rows[0];
    const relation = compareVectorClocks(
      data.vectorClock,
      serverTask.vector_clock
    );

    if (relation === ClockRelation.CONCURRENT) {
      return {
        entityType: 'task',
        entityId: data.id,
        serverVersion: serverTask,
        serverVectorClock: serverTask.vector_clock,
        conflictReason: 'Concurrent modification'
      };
    }
  }

  // Apply change
  if (operation === 'create' || operation === 'update') {
    await client.query(
      `INSERT INTO tasks (
        id, organization_id, project_id, title, description,
        status, priority, due_date, assigned_to, tags,
        version, vector_clock, last_modified_by, last_modified_device,
        checksum, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        status = EXCLUDED.status,
        priority = EXCLUDED.priority,
        due_date = EXCLUDED.due_date,
        assigned_to = EXCLUDED.assigned_to,
        tags = EXCLUDED.tags,
        version = EXCLUDED.version,
        vector_clock = EXCLUDED.vector_clock,
        last_modified_by = EXCLUDED.last_modified_by,
        last_modified_device = EXCLUDED.last_modified_device,
        checksum = EXCLUDED.checksum,
        updated_at = NOW()`,
      [
        data.id, organizationId, data.projectId, data.title, data.description,
        data.status, data.priority, data.dueDate ? new Date(data.dueDate) : null,
        data.assignedTo, data.tags, data.version, JSON.stringify(data.vectorClock),
        userId, deviceId, data.checksum, new Date(data.createdAt)
      ]
    );
  } else if (operation === 'delete') {
    await client.query(
      'UPDATE tasks SET deleted_at = NOW() WHERE id = $1',
      [data.id]
    );

    // Create tombstone
    await client.query(
      `INSERT INTO tombstones (id, entity_type, entity_id, organization_id, deleted_by, deleted_from_device, vector_clock, expires_at)
       VALUES (gen_random_uuid(), 'task', $1, $2, $3, $4, $5, NOW() + INTERVAL '90 days')`,
      [data.id, organizationId, userId, deviceId, JSON.stringify(data.vectorClock)]
    );
  }

  return null;
}

app.listen(3000, () => {
  console.log('API server listening on port 3000');
});
```

---

**Next Document**: IMPLEMENTATION_GUIDE.md
