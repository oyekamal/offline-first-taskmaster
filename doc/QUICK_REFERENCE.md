# Quick Reference Card

One-page reference for the offline-first task management architecture.

---

## Architecture at a Glance

```
Client (IndexedDB) ←→ Sync Engine ←→ Server (PostgreSQL)
                         ↕
                  Vector Clocks
                  Conflict Resolver
```

---

## Core Tables

### PostgreSQL (Server)
```
organizations → users → devices
            ↓       ↓
          projects → tasks → comments
                  ↓       → attachments
                  ↓       → task_assignments
                  sync_logs, conflicts, tombstones
```

### IndexedDB (Client)
```
tasks, comments, attachments, users, projects
sync_queue, vector_clock_state, conflict_queue
tombstones, cache_metadata
```

---

## Key Endpoints

```
POST   /api/auth/login           - Authenticate
POST   /api/sync/push            - Push local changes
GET    /api/sync/pull            - Pull server changes
GET    /api/tasks                - List tasks
POST   /api/tasks                - Create task
PATCH  /api/tasks/:id            - Update task
DELETE /api/tasks/:id            - Delete task
WS     task_updated              - Real-time update event
```

---

## Vector Clock Operations

```typescript
// Increment on local change
{ "device-a": 42 } → { "device-a": 43 }

// Merge on sync
local:  { "device-a": 43, "device-b": 2 }
remote: { "device-a": 42, "device-b": 3 }
merged: { "device-a": 43, "device-b": 3 }

// Compare for conflicts
if (mixed higher values) → CONCURRENT → Conflict!
```

---

## Sync Priorities

| Priority | Examples | Sync Order |
|----------|----------|------------|
| 1 (Critical) | Task creation, status changes | First |
| 2 (High) | Assignments, title edits | Second |
| 3 (Medium) | Description, due dates | Third |
| 4 (Low) | Tags, custom fields | Fourth |
| 5 (Background) | History, analytics | Last |

---

## Conflict Resolution Matrix

| Field | Strategy | Auto? |
|-------|----------|-------|
| Title/Description | Operational Transformation | ✓ |
| Status | State machine rules | Partial |
| Assignment | Last-Write-Wins | ✗ (manual) |
| Priority | Higher wins | ✓ |
| Tags | Union merge | ✓ |
| Due Date | Earlier wins | ✓ |

---

## Sync Flow

```
1. User Action (offline)
   ↓
2. Write to IndexedDB + sync_queue
   ↓
3. Network Available
   ↓
4. PUSH: Send changes to server
   ↓
5. Server: Detect conflicts, write to DB
   ↓
6. PULL: Get server changes
   ↓
7. Apply to IndexedDB
   ↓
8. Resolve conflicts (auto or manual)
```

---

## Performance Targets

- Local CRUD: **< 50ms**
- Sync latency: **< 2s**
- Initial load: **< 10s** (10K tasks)
- Storage: **< 50MB** per org
- Auto-resolve rate: **95%+**

---

## Code Snippets

### Create Task Offline
```typescript
const task = await taskRepo.createTask({
  title: "New task",
  status: "todo"
});
// Automatically queued for sync
```

### Trigger Sync
```typescript
await syncEngine.runSyncCycle('manual');
```

### Check Sync Status
```typescript
const pendingCount = await syncQueue.getCount();
```

### Vector Clock Comparison
```typescript
const relation = compareVectorClocks(
  localClock,
  remoteClock
);
if (relation === ClockRelation.CONCURRENT) {
  // Conflict!
}
```

---

## Security Checklist

- [ ] JWT authentication with refresh tokens
- [ ] HTTPS enforced
- [ ] Rate limiting enabled
- [ ] Input validation (Zod schemas)
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (DOMPurify)
- [ ] Audit logging enabled
- [ ] File encryption (AES-256)

---

## Monitoring Metrics

**Track These:**
- Sync success rate
- Conflict rate
- Average sync duration
- API response times
- Database query performance
- Cache hit rate
- Error rate

---

## Common Issues & Fixes

### Sync Stuck
```typescript
// Check queue
db.sync_queue.toArray().then(console.log);
// Clear and retry
await syncQueue.clear();
await syncEngine.runSyncCycle('manual');
```

### Conflicts Not Resolving
```typescript
// Get conflicts
const conflicts = await db.conflict_queue.toArray();
// Force resolution
await conflictResolver.resolveAll(conflicts);
```

### Storage Full
```typescript
// Run cleanup
await memoryManager.runCleanup();
// Check usage
navigator.storage.estimate().then(console.log);
```

---

## Testing Commands

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Load test (50 users)
npm run load-test -- --users 50
```

---

## Deployment Commands

```bash
# Build
npm run build

# Run migrations
npm run db:migrate

# Start production
npm start

# Docker
docker-compose up -d
```

---

## Environment Variables

```env
# Essential
DB_HOST=localhost
DB_NAME=taskmanager_db
JWT_SECRET=your-secret-key
REDIS_URL=redis://localhost:6379

# Optional
AWS_S3_BUCKET=attachments
PORT=3000
NODE_ENV=production
```

---

## File Structure

```
/src
  /db          - Database schemas
  /sync        - Sync engine
  /repositories - Data access
  /api         - REST API
  /routes      - Endpoints
  /middleware  - Auth, etc.
  /utils       - Helpers
```

---

## Important Constants

```typescript
// Sync
const SYNC_BATCH_SIZE = 100;
const SYNC_INTERVAL = 30000; // 30s
const MAX_RETRIES = 5;

// Retry
const BASE_BACKOFF = 1000; // 1s
const MAX_BACKOFF = 60000; // 60s

// Tombstones
const TOMBSTONE_TTL = 90 * 24 * 60 * 60 * 1000; // 90 days

// Attachments
const CHUNK_SIZE = 1048576; // 1MB
const MAX_CONCURRENT_CHUNKS = 5;
```

---

## Database Indexes (Critical)

```sql
-- Tasks
CREATE INDEX idx_tasks_org_status ON tasks(organization_id, status);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);

-- Sync
CREATE INDEX idx_sync_queue_status_priority
  ON sync_queue(status, priority);
```

---

## API Response Format

```typescript
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": 1707580900000
}
```

---

## State Machine: Entity Sync Status

```
created → pending → syncing → synced
             ↓         ↓
           failed   conflict
             ↓         ↓
           retry    resolve
```

---

## Rate Limits

- Login: **5/15min**
- Sync Push: **60/min**
- Sync Pull: **120/min**
- Tasks (GET): **300/min**
- Tasks (POST): **60/min**

---

## Useful Queries

### Get Pending Sync Items
```typescript
db.sync_queue
  .where('status')
  .equals('pending')
  .sortBy('priority');
```

### Get User's Tasks
```typescript
db.tasks
  .where('[organizationId+assignedTo]')
  .equals([orgId, userId])
  .toArray();
```

### Get Changes Since Timestamp
```sql
SELECT * FROM tasks
WHERE organization_id = $1
  AND updated_at > $2
ORDER BY updated_at ASC;
```

---

## Quick Troubleshooting

| Issue | Check | Fix |
|-------|-------|-----|
| Not syncing | Network, queue count | Trigger manual sync |
| Slow queries | EXPLAIN ANALYZE | Add indexes |
| High conflict rate | Sync frequency | Increase auto-sync |
| Storage full | IndexedDB size | Run cleanup |
| Auth failing | JWT expiry | Refresh token |

---

## Reference Documents

1. **README.md** - Start here
2. **ARCHITECTURE_OVERVIEW.md** - Design decisions
3. **DATABASE_SCHEMA.md** - Data model
4. **SYNC_STRATEGY.md** - Sync algorithms
5. **CONFLICT_RESOLUTION.md** - Conflict handling
6. **API_SPECIFICATION.md** - API docs
7. **IMPLEMENTATION_GUIDE.md** - Code guide
8. **PERFORMANCE_SECURITY.md** - Optimization
9. **VISUAL_REFERENCE.md** - Diagrams

---

## Emergency Contacts

- **Sync issues:** Check SYNC_STRATEGY.md
- **Conflicts:** Check CONFLICT_RESOLUTION.md
- **Performance:** Check PERFORMANCE_SECURITY.md
- **API errors:** Check API_SPECIFICATION.md

---

**Print this page and keep it handy!**

Version 1.0 | 2026-02-10
