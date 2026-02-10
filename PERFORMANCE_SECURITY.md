# Performance Optimization & Security

## Overview

Comprehensive guide to optimizing performance and securing the offline-first task management system.

---

## Performance Optimization

### 1. Database Query Optimization

#### PostgreSQL Optimizations

**1.1 Index Strategy**

```sql
-- Covering indexes for common queries
CREATE INDEX idx_tasks_org_status_updated
ON tasks(organization_id, status, updated_at)
WHERE deleted_at IS NULL;

-- Partial indexes for active records only
CREATE INDEX idx_tasks_active
ON tasks(organization_id, updated_at)
WHERE deleted_at IS NULL;

-- GIN indexes for array and JSONB columns
CREATE INDEX idx_tasks_tags_gin ON tasks USING GIN(tags);
CREATE INDEX idx_tasks_vector_clock_gin ON tasks USING GIN(vector_clock);
CREATE INDEX idx_tasks_custom_fields_gin ON tasks USING GIN(custom_fields);

-- Full-text search index
CREATE INDEX idx_tasks_fulltext
ON tasks USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

**1.2 Query Optimization Examples**

```sql
-- BAD: Sequential scan
SELECT * FROM tasks
WHERE organization_id = 'org-uuid'
  AND status = 'todo'
  AND deleted_at IS NULL;

-- GOOD: Index scan with covering index
SELECT id, title, status, assigned_to, updated_at
FROM tasks
WHERE organization_id = 'org-uuid'
  AND status = 'todo'
  AND deleted_at IS NULL
ORDER BY updated_at DESC
LIMIT 50;

-- EXPLAIN ANALYZE to verify
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

**1.3 Connection Pooling**

```typescript
// Optimal pool configuration
const pool = new Pool({
  max: 20, // Maximum connections
  min: 5, // Minimum idle connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 10000, // 10 seconds
  query_timeout: 10000
});

// Use prepared statements
const query = {
  name: 'fetch-tasks',
  text: 'SELECT * FROM tasks WHERE organization_id = $1 AND updated_at > $2',
  values: [orgId, lastSync]
};

await pool.query(query);
```

**1.4 Batch Operations**

```sql
-- Use UNNEST for bulk inserts
INSERT INTO tasks (id, title, status, organization_id, ...)
SELECT * FROM UNNEST(
  $1::uuid[],
  $2::varchar[],
  $3::varchar[],
  $4::uuid[],
  ...
);

-- Batch updates with temporary tables
CREATE TEMP TABLE task_updates (
  id UUID,
  status VARCHAR(50),
  updated_at TIMESTAMPTZ
);

INSERT INTO task_updates VALUES
  ('task-1', 'done', NOW()),
  ('task-2', 'in_progress', NOW());

UPDATE tasks t
SET status = tu.status,
    updated_at = tu.updated_at
FROM task_updates tu
WHERE t.id = tu.id;
```

---

#### IndexedDB Optimizations

**2.1 Efficient Queries**

```typescript
// BAD: Get all then filter
const allTasks = await db.tasks.toArray();
const filtered = allTasks.filter(t => t.status === 'todo');

// GOOD: Use indexes
const filtered = await db.tasks
  .where('[organizationId+status]')
  .equals([orgId, 'todo'])
  .toArray();

// BEST: Limit results
const filtered = await db.tasks
  .where('[organizationId+status]')
  .equals([orgId, 'todo'])
  .limit(50)
  .toArray();
```

**2.2 Bulk Operations**

```typescript
// Use bulkPut for multiple insertions
await db.tasks.bulkPut([task1, task2, task3, ...]);

// Use bulkDelete for multiple deletions
await db.tasks.bulkDelete([id1, id2, id3, ...]);

// Transaction for related operations
await db.transaction('rw', [db.tasks, db.comments], async () => {
  await db.tasks.add(newTask);
  await db.comments.bulkAdd(comments);
});
```

**2.3 Caching Strategy**

```typescript
class CachedRepository {
  private cache = new Map<string, { data: any; expiry: number }>();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async get(id: string): Promise<any> {
    // Check memory cache first
    const cached = this.cache.get(id);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Fetch from IndexedDB
    const data = await db.tasks.get(id);

    if (data) {
      this.cache.set(id, {
        data,
        expiry: Date.now() + this.CACHE_TTL
      });
    }

    return data;
  }

  invalidate(id: string): void {
    this.cache.delete(id);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

---

### 2. Network Optimization

**2.1 Request Batching**

```typescript
class RequestBatcher {
  private pendingRequests: Map<string, any[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private BATCH_DELAY = 100; // ms

  async fetch(url: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Add to batch
      if (!this.pendingRequests.has(url)) {
        this.pendingRequests.set(url, []);
      }

      this.pendingRequests.get(url)!.push({
        data,
        resolve,
        reject
      });

      // Schedule batch execution
      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.executeBatch(), this.BATCH_DELAY);
      }
    });
  }

  private async executeBatch(): Promise<void> {
    const batches = Array.from(this.pendingRequests.entries());
    this.pendingRequests.clear();
    this.batchTimer = null;

    for (const [url, requests] of batches) {
      try {
        const batchData = requests.map(r => r.data);
        const response = await apiClient.post(url, { batch: batchData });

        // Resolve individual requests
        requests.forEach((req, index) => {
          req.resolve(response.data.results[index]);
        });
      } catch (error) {
        requests.forEach(req => req.reject(error));
      }
    }
  }
}
```

**2.2 Compression**

```typescript
// Client-side compression
import pako from 'pako';

async function compressPayload(data: any): Promise<Uint8Array> {
  const json = JSON.stringify(data);
  const compressed = pako.gzip(json);
  return compressed;
}

async function decompressPayload(data: Uint8Array): Promise<any> {
  const decompressed = pako.ungzip(data, { to: 'string' });
  return JSON.parse(decompressed);
}

// Use in API calls
const compressed = await compressPayload(largePayload);

await apiClient.post('/api/sync/push', compressed, {
  headers: {
    'Content-Encoding': 'gzip',
    'Content-Type': 'application/json'
  }
});
```

**2.3 Request Deduplication**

```typescript
class RequestDeduplicator {
  private inFlightRequests = new Map<string, Promise<any>>();

  async fetch(url: string, options?: any): Promise<any> {
    const key = this.generateKey(url, options);

    // Return existing request if in flight
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key);
    }

    // Create new request
    const request = apiClient.get(url, options)
      .finally(() => {
        this.inFlightRequests.delete(key);
      });

    this.inFlightRequests.set(key, request);
    return request;
  }

  private generateKey(url: string, options?: any): string {
    return `${url}:${JSON.stringify(options?.params || {})}`;
  }
}
```

---

### 3. Memory Management

**3.1 Cleanup Strategies**

```typescript
class MemoryManager {
  // Clean expired cache entries
  async cleanupCache(): Promise<void> {
    const now = Date.now();

    await db.cache_metadata
      .where('expiresAt')
      .below(now)
      .delete();
  }

  // Clean old tombstones
  async cleanupTombstones(): Promise<void> {
    const now = Date.now();

    await db.tombstones
      .where('expiresAt')
      .below(now)
      .delete();
  }

  // Clean completed sync queue items
  async cleanupSyncQueue(): Promise<void> {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    await db.sync_queue
      .where('status')
      .equals('completed')
      .and(item => item.createdAt < sevenDaysAgo)
      .delete();
  }

  // Run all cleanup tasks
  async runCleanup(): Promise<void> {
    await Promise.all([
      this.cleanupCache(),
      this.cleanupTombstones(),
      this.cleanupSyncQueue()
    ]);

    console.log('Cleanup completed');
  }
}

// Schedule periodic cleanup
setInterval(() => {
  memoryManager.runCleanup();
}, 60 * 60 * 1000); // Every hour
```

**3.2 Pagination for Large Datasets**

```typescript
async function* fetchAllTasksPaginated(organizationId: string) {
  const PAGE_SIZE = 100;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const tasks = await db.tasks
      .where('organizationId')
      .equals(organizationId)
      .offset(offset)
      .limit(PAGE_SIZE)
      .toArray();

    yield tasks;

    hasMore = tasks.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
}

// Usage
for await (const taskBatch of fetchAllTasksPaginated(orgId)) {
  processTaskBatch(taskBatch);
}
```

**3.3 Virtual Scrolling**

```typescript
// Use libraries like react-window or @tanstack/react-virtual
import { useVirtualizer } from '@tanstack/react-virtual';

function TaskList({ tasks }: { tasks: Task[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated row height
    overscan: 5 // Render extra items for smooth scrolling
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`
            }}
          >
            <TaskItem task={tasks[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### 4. Sync Performance

**4.1 Incremental Sync**

```typescript
class IncrementalSyncEngine {
  private syncWatermarks: Record<string, number> = {};

  async pullIncremental(): Promise<void> {
    // Load watermarks
    await this.loadWatermarks();

    // Pull each entity type independently
    await Promise.all([
      this.pullTasks(),
      this.pullComments(),
      this.pullAttachments()
    ]);

    // Save updated watermarks
    await this.saveWatermarks();
  }

  private async pullTasks(): Promise<void> {
    const since = this.syncWatermarks.tasks || 0;

    const response = await apiClient.get('/api/sync/pull/tasks', {
      params: { since, limit: 100 }
    });

    await db.tasks.bulkPut(response.data.tasks);

    // Update watermark
    const maxTimestamp = Math.max(
      ...response.data.tasks.map((t: any) => t.updatedAt),
      since
    );
    this.syncWatermarks.tasks = maxTimestamp;
  }

  private async loadWatermarks(): Promise<void> {
    const stored = await db.cache_metadata.get('syncWatermarks');
    this.syncWatermarks = stored?.value || {};
  }

  private async saveWatermarks(): Promise<void> {
    await db.cache_metadata.put({
      key: 'syncWatermarks',
      value: this.syncWatermarks,
      updatedAt: Date.now()
    });
  }
}
```

**4.2 Parallel Sync Operations**

```typescript
async function parallelSync(): Promise<void> {
  // Run push and pull in parallel (where safe)
  const [pushResult, userDataResult, projectDataResult] = await Promise.all([
    syncEngine.push(),
    fetchUserData(),
    fetchProjectData()
  ]);

  // Then pull task data (depends on user/project data)
  await syncEngine.pull();
}
```

**4.3 Smart Conflict Detection**

```typescript
// Only check for conflicts on fields that actually changed
function detectConflicts(
  baseVersion: Task,
  localVersion: Task,
  remoteVersion: Task
): string[] {
  const conflictedFields: string[] = [];

  for (const field of Object.keys(localVersion)) {
    if (isSystemField(field)) continue;

    const baseValue = JSON.stringify(baseVersion[field]);
    const localValue = JSON.stringify(localVersion[field]);
    const remoteValue = JSON.stringify(remoteVersion[field]);

    // Both changed from base
    if (localValue !== baseValue && remoteValue !== baseValue) {
      // But changed differently
      if (localValue !== remoteValue) {
        conflictedFields.push(field);
      }
    }
  }

  return conflictedFields;
}
```

---

## Security

### 1. Authentication & Authorization

**1.1 JWT Implementation**

```typescript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Generate JWT
function generateToken(user: User, device: Device): string {
  const payload = {
    userId: user.id,
    organizationId: user.organizationId,
    deviceId: device.id,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, {
    algorithm: 'HS256'
  });
}

// Verify JWT
function verifyToken(token: string): any {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: ['HS256']
    });
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Hash password
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

// Verify password
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

**1.2 Refresh Token Strategy**

```typescript
interface RefreshToken {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

async function generateRefreshToken(
  userId: string,
  deviceId: string
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');

  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, device_id, token, expires_at)
     VALUES (gen_random_uuid(), $1, $2, $3, NOW() + INTERVAL '30 days')`,
    [userId, deviceId, token]
  );

  return token;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const result = await pool.query(
    `SELECT rt.*, u.organization_id, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token = $1
       AND rt.expires_at > NOW()`,
    [refreshToken]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid or expired refresh token');
  }

  const { user_id, device_id, organization_id, role } = result.rows[0];

  return generateToken(
    { id: user_id, organizationId: organization_id, role },
    { id: device_id }
  );
}
```

**1.3 Row-Level Security (PostgreSQL)**

```sql
-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY tasks_organization_isolation ON tasks
  USING (organization_id = current_setting('app.current_org_id')::uuid);

CREATE POLICY comments_organization_isolation ON comments
  USING (
    EXISTS (
      SELECT 1 FROM tasks
      WHERE tasks.id = comments.task_id
        AND tasks.organization_id = current_setting('app.current_org_id')::uuid
    )
  );

-- Set organization context in API
app.use(async (req, res, next) => {
  if (req.user) {
    await pool.query(
      `SET LOCAL app.current_org_id = $1`,
      [req.user.organizationId]
    );
  }
  next();
});
```

---

### 2. Data Encryption

**2.1 Attachment Encryption**

```typescript
// Client-side encryption before upload
async function encryptFile(file: File, encryptionKey: CryptoKey): Promise<ArrayBuffer> {
  const fileBuffer = await file.arrayBuffer();

  // Generate IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    encryptionKey,
    fileBuffer
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return combined.buffer;
}

// Client-side decryption after download
async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  encryptionKey: CryptoKey
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedBuffer);

  // Extract IV
  const iv = data.slice(0, 12);
  const encrypted = data.slice(12);

  // Decrypt
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    encryptionKey,
    encrypted
  );
}

// Generate encryption key from password
async function deriveEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
```

**2.2 Transport Security**

```typescript
// Enforce HTTPS
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// HSTS header
app.use(helmet.hsts({
  maxAge: 31536000, // 1 year
  includeSubDomains: true,
  preload: true
}));

// Certificate pinning (client-side)
const pinnedCertificates = [
  'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='
];

// Configure axios with certificate validation
const httpsAgent = new https.Agent({
  rejectUnauthorized: true,
  checkServerIdentity: (host, cert) => {
    const certFingerprint = calculateFingerprint(cert);
    if (!pinnedCertificates.includes(certFingerprint)) {
      throw new Error('Certificate pinning failed');
    }
  }
});
```

---

### 3. Input Validation & Sanitization

**3.1 Server-Side Validation**

```typescript
import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

// Define schemas
const TaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).nullable(),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.number().nullable(),
  assignedTo: z.string().uuid().nullable(),
  tags: z.array(z.string().max(50)).max(20),
  customFields: z.record(z.any())
});

// Validate and sanitize
function validateTask(data: any): Task {
  // Validate structure
  const validated = TaskSchema.parse(data);

  // Sanitize HTML content
  if (validated.description) {
    validated.description = DOMPurify.sanitize(validated.description, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre'],
      ALLOWED_ATTR: ['href']
    });
  }

  return validated;
}

// Use in API endpoint
app.post('/api/tasks', async (req, res) => {
  try {
    const validatedTask = validateTask(req.body);
    // ... create task
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }
    throw error;
  }
});
```

**3.2 SQL Injection Prevention**

```typescript
// ALWAYS use parameterized queries
// BAD: String concatenation
const query = `SELECT * FROM tasks WHERE id = '${taskId}'`; // NEVER DO THIS

// GOOD: Parameterized query
const query = 'SELECT * FROM tasks WHERE id = $1';
const result = await pool.query(query, [taskId]);

// GOOD: Named parameters with prepared statements
const query = {
  name: 'get-task',
  text: 'SELECT * FROM tasks WHERE id = $1',
  values: [taskId]
};
```

**3.3 XSS Prevention**

```typescript
// Client-side sanitization before rendering
import DOMPurify from 'dompurify';

function renderMarkdown(content: string): string {
  // Parse markdown
  const html = marked.parse(content);

  // Sanitize HTML
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'code', 'pre', 'blockquote', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOW_DATA_ATTR: false
  });
}

// Use in React
function TaskDescription({ description }: { description: string }) {
  const sanitizedHTML = useMemo(
    () => renderMarkdown(description),
    [description]
  );

  return (
    <div
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
}
```

---

### 4. Rate Limiting & DDoS Protection

**4.1 Rate Limiting Implementation**

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// General API rate limit
const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:'
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Stricter limit for authentication
const authLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:auth:'
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  skipSuccessfulRequests: true
});

// Apply limiters
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
```

**4.2 Request Throttling**

```typescript
// Client-side throttling
class ThrottledApiClient {
  private requestQueue: Array<() => Promise<any>> = [];
  private activeRequests = 0;
  private maxConcurrent = 5;

  async request(fn: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    while (this.activeRequests < this.maxConcurrent && this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!;
      this.activeRequests++;

      request().finally(() => {
        this.activeRequests--;
        this.processQueue();
      });
    }
  }
}
```

---

### 5. Audit Logging

**5.1 Comprehensive Audit Trail**

```typescript
interface AuditLog {
  id: string;
  userId: string;
  deviceId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: any;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

async function logAuditEvent(
  userId: string,
  deviceId: string,
  action: string,
  entityType: string,
  entityId: string,
  changes: any,
  req: Request
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (
      id, user_id, device_id, action, entity_type, entity_id,
      changes, ip_address, user_agent, timestamp
    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      userId,
      deviceId,
      action,
      entityType,
      entityId,
      JSON.stringify(changes),
      req.ip,
      req.headers['user-agent']
    ]
  );
}

// Use in endpoints
app.patch('/api/tasks/:taskId', async (req, res) => {
  const { taskId } = req.params;
  const changes = req.body;

  // Update task
  const updated = await updateTask(taskId, changes);

  // Log audit event
  await logAuditEvent(
    req.user.id,
    req.headers['x-device-id'],
    'update_task',
    'task',
    taskId,
    changes,
    req
  );

  res.json({ task: updated });
});
```

---

### 6. Security Headers

```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https://cdn.example.com'],
      connectSrc: ["'self'", 'https://api.example.com', 'wss://api.example.com'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' }
}));
```

---

## Monitoring & Observability

### Performance Metrics

```typescript
class PerformanceMonitor {
  trackOperation(operation: string, duration: number, metadata?: any): void {
    // Send to analytics
    analytics.track('performance', {
      operation,
      duration,
      ...metadata
    });

    // Log slow operations
    if (duration > 1000) {
      console.warn(`Slow operation: ${operation} took ${duration}ms`);
    }
  }

  trackSync(metrics: {
    duration: number;
    pushed: number;
    pulled: number;
    conflicts: number;
  }): void {
    analytics.track('sync_completed', metrics);
  }

  trackError(error: Error, context?: any): void {
    analytics.track('error', {
      message: error.message,
      stack: error.stack,
      ...context
    });
  }
}
```

---

**Document Complete**
