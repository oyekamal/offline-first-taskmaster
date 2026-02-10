# API Usage Examples

Complete examples of using the TaskManager API with curl and Python.

## Authentication

### Login

**Request:**
```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "deviceFingerprint": "browser-uuid-12345",
    "deviceName": "Chrome on MacBook Pro"
  }'
```

**Response:**
```json
{
  "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "name": "John Doe",
    "organization_id": "660e8400-e29b-41d4-a716-446655440000",
    "role": "member"
  },
  "device": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "name": "Chrome on MacBook Pro"
  }
}
```

### Python Example:
```python
import requests

def login(email, password, device_fingerprint):
    url = "http://localhost:8000/api/auth/login/"
    data = {
        "email": email,
        "password": password,
        "deviceFingerprint": device_fingerprint,
        "deviceName": "Python Client"
    }
    response = requests.post(url, json=data)
    return response.json()

# Usage
auth = login("user@example.com", "password123", "python-client-123")
access_token = auth["access"]
device_id = auth["device"]["id"]
```

## Task Operations

### Create Task

**Request:**
```bash
curl -X POST http://localhost:8000/api/tasks/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Implement user authentication",
    "description": "Add JWT-based authentication to the API",
    "status": "todo",
    "priority": "high",
    "due_date": "2026-02-20T10:00:00Z",
    "assigned_to": "550e8400-e29b-41d4-a716-446655440000",
    "tags": ["backend", "security"],
    "last_modified_by": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

**Response:**
```json
{
  "id": "880e8400-e29b-41d4-a716-446655440000",
  "organization": "660e8400-e29b-41d4-a716-446655440000",
  "project": null,
  "project_name": null,
  "title": "Implement user authentication",
  "description": "Add JWT-based authentication to the API",
  "status": "todo",
  "priority": "high",
  "due_date": "2026-02-20T10:00:00Z",
  "completed_at": null,
  "position": "1000.0000000000",
  "created_by": "550e8400-e29b-41d4-a716-446655440000",
  "created_by_name": "John Doe",
  "assigned_to": "550e8400-e29b-41d4-a716-446655440000",
  "assigned_to_name": "Jane Smith",
  "tags": ["backend", "security"],
  "custom_fields": {},
  "version": 1,
  "vector_clock": {
    "770e8400-e29b-41d4-a716-446655440000": 1
  },
  "last_modified_by": "550e8400-e29b-41d4-a716-446655440000",
  "last_modified_by_name": "John Doe",
  "last_modified_device": "770e8400-e29b-41d4-a716-446655440000",
  "checksum": "abc123...",
  "comment_count": 0,
  "created_at": "2026-02-10T15:30:00Z",
  "updated_at": "2026-02-10T15:30:00Z",
  "deleted_at": null
}
```

### List Tasks with Filters

**Request:**
```bash
# Get all tasks assigned to me with status "todo"
curl -X GET "http://localhost:8000/api/tasks/?assignedTo=me&status=todo" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Search tasks
curl -X GET "http://localhost:8000/api/tasks/?search=authentication" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Filter by project
curl -X GET "http://localhost:8000/api/tasks/?project=PROJECT_UUID" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Task

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/tasks/880e8400-e29b-41d4-a716-446655440000/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "in_progress",
    "last_modified_by": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

## Synchronization

### Push Changes to Server

**Request:**
```bash
curl -X POST http://localhost:8000/api/sync/push/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "770e8400-e29b-41d4-a716-446655440000",
    "vectorClock": {
      "770e8400-e29b-41d4-a716-446655440000": 42
    },
    "timestamp": 1707580800000,
    "changes": {
      "tasks": [
        {
          "id": "880e8400-e29b-41d4-a716-446655440000",
          "operation": "update",
          "data": {
            "id": "880e8400-e29b-41d4-a716-446655440000",
            "title": "Updated title",
            "status": "in_progress",
            "version": 2,
            "vector_clock": {
              "770e8400-e29b-41d4-a716-446655440000": 42
            }
          }
        }
      ],
      "comments": [
        {
          "id": "990e8400-e29b-41d4-a716-446655440000",
          "operation": "create",
          "data": {
            "id": "990e8400-e29b-41d4-a716-446655440000",
            "task": "880e8400-e29b-41d4-a716-446655440000",
            "content": "Started working on this",
            "version": 1,
            "vector_clock": {
              "770e8400-e29b-41d4-a716-446655440000": 43
            },
            "created_at": 1707580900000
          }
        }
      ]
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "processed": 2,
  "conflicts": [],
  "serverVectorClock": {
    "770e8400-e29b-41d4-a716-446655440000": 43,
    "880e8400-e29b-41d4-a716-446655440000": 25
  },
  "timestamp": 1707580950000
}
```

### Pull Changes from Server

**Request:**
```bash
curl -X GET "http://localhost:8000/api/sync/pull/?since=1707580000000&limit=100" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID"
```

**Response:**
```json
{
  "tasks": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440000",
      "title": "New task from server",
      "status": "todo",
      "priority": "medium",
      "version": 1,
      "vector_clock": {
        "880e8400-e29b-41d4-a716-446655440000": 15
      },
      "created_at": "2026-02-10T16:00:00Z",
      "updated_at": "2026-02-10T16:00:00Z"
    }
  ],
  "comments": [],
  "tombstones": [],
  "serverVectorClock": {
    "770e8400-e29b-41d4-a716-446655440000": 43,
    "880e8400-e29b-41d4-a716-446655440000": 25
  },
  "hasMore": false,
  "timestamp": 1707581000000
}
```

### Python Sync Client Example

```python
import requests
from datetime import datetime

class SyncClient:
    def __init__(self, base_url, access_token, device_id):
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {access_token}",
            "X-Device-ID": device_id,
            "Content-Type": "application/json"
        }
        self.device_id = device_id

    def push_changes(self, changes, vector_clock):
        """Push local changes to server."""
        url = f"{self.base_url}/api/sync/push/"
        payload = {
            "deviceId": self.device_id,
            "vectorClock": vector_clock,
            "timestamp": int(datetime.now().timestamp() * 1000),
            "changes": changes
        }
        response = requests.post(url, json=payload, headers=self.headers)
        return response.json()

    def pull_changes(self, since_timestamp):
        """Pull server changes."""
        url = f"{self.base_url}/api/sync/pull/"
        params = {
            "since": since_timestamp,
            "limit": 100
        }
        response = requests.get(url, params=params, headers=self.headers)
        return response.json()

    def full_sync(self, local_changes, vector_clock, last_sync_time):
        """Perform full bidirectional sync."""
        # Push local changes
        push_result = self.push_changes(local_changes, vector_clock)

        # Pull server changes
        pull_result = self.pull_changes(last_sync_time)

        return {
            "push": push_result,
            "pull": pull_result
        }

# Usage
client = SyncClient(
    "http://localhost:8000",
    access_token="your_token_here",
    device_id="your_device_id"
)

changes = {
    "tasks": [
        {
            "id": "task-uuid",
            "operation": "update",
            "data": {"title": "Updated", "status": "done"}
        }
    ],
    "comments": []
}

result = client.full_sync(
    changes,
    {"device-uuid": 42},
    1707580000000
)

print(f"Pushed: {result['push']['processed']}")
print(f"Pulled: {len(result['pull']['tasks'])} tasks")
```

## Conflict Resolution

### Get Unresolved Conflicts

**Request:**
```bash
curl -X GET http://localhost:8000/api/sync/conflicts/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Resolve Conflict

**Request:**
```bash
curl -X POST http://localhost:8000/api/sync/conflicts/CONFLICT_UUID/resolve/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "local"
  }'

# Or with custom resolution
curl -X POST http://localhost:8000/api/sync/conflicts/CONFLICT_UUID/resolve/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resolution": "custom",
    "customResolution": {
      "title": "Merged title",
      "status": "in_progress",
      "description": "Combined description"
    }
  }'
```

## Comments

### Add Comment to Task

**Request:**
```bash
curl -X POST http://localhost:8000/api/comments/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "880e8400-e29b-41d4-a716-446655440000",
    "content": "This looks great! Let me know if you need help.",
    "parent": null
  }'
```

### Reply to Comment (Threaded)

**Request:**
```bash
curl -X POST http://localhost:8000/api/comments/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "task": "880e8400-e29b-41d4-a716-446655440000",
    "content": "Thanks! I will let you know.",
    "parent": "990e8400-e29b-41d4-a716-446655440000"
  }'
```

## Error Handling

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": 1707580800000,
  "requestId": "req-uuid"
}
```

### Common Error Codes

- `INVALID_REQUEST` (400): Malformed request
- `UNAUTHORIZED` (401): Missing or invalid auth token
- `FORBIDDEN` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `VERSION_CONFLICT` (409): Optimistic lock failure
- `RATE_LIMITED` (429): Too many requests
- `INTERNAL_ERROR` (500): Server error

## Rate Limiting

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1707580920
```

## Pagination

List endpoints support cursor-based pagination:

```bash
curl -X GET "http://localhost:8000/api/tasks/?limit=50&offset=0" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

Response includes pagination metadata:

```json
{
  "count": 150,
  "next": "http://localhost:8000/api/tasks/?limit=50&offset=50",
  "previous": null,
  "results": [...]
}
```
