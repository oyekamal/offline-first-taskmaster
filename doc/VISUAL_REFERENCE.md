# Visual Reference Guide

## Architecture Diagrams

### 1. Complete System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                         CLIENT APPLICATION                              │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                    UI LAYER                                   │     │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐  │     │
│  │  │  Task   │  │ Comment │  │Attachment│  │   Conflict   │  │     │
│  │  │  List   │  │  Thread │  │  Upload  │  │  Resolution  │  │     │
│  │  └─────────┘  └─────────┘  └──────────┘  └──────────────┘  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │              APPLICATION LOGIC LAYER                          │     │
│  │  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐ │     │
│  │  │  Optimistic │  │    State     │  │  Business Logic   │ │     │
│  │  │   Updates   │  │  Management  │  │    Validation     │ │     │
│  │  └─────────────┘  └──────────────┘  └────────────────────┘ │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                    SYNC ENGINE                                │     │
│  │  ┌────────────┐  ┌─────────────┐  ┌─────────────────────┐  │     │
│  │  │   Change   │  │   Delta     │  │     Conflict        │  │     │
│  │  │  Detection │  │ Generation  │  │    Resolution       │  │     │
│  │  └────────────┘  └─────────────┘  └─────────────────────┘  │     │
│  │  ┌────────────┐  ┌─────────────┐  ┌─────────────────────┐  │     │
│  │  │  Priority  │  │    Retry    │  │  Vector Clocks      │  │     │
│  │  │   Queue    │  │    Logic    │  │   Management        │  │     │
│  │  └────────────┘  └─────────────┘  └─────────────────────┘  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │              INDEXEDDB ADAPTER                                │     │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  │     │
│  │  │   CRUD   │  │  Search  │  │Transaction │  │  Schema  │  │     │
│  │  │Operations│  │  Engine  │  │  Manager   │  │Migration │  │     │
│  │  └──────────┘  └──────────┘  └────────────┘  └──────────┘  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                     INDEXEDDB                                 │     │
│  │  ┌──────┐  ┌────────┐  ┌───────────┐  ┌──────────────────┐ │     │
│  │  │Tasks │  │Comments│  │Attachments│  │   sync_queue     │ │     │
│  │  └──────┘  └────────┘  └───────────┘  └──────────────────┘ │     │
│  │  ┌──────────────┐  ┌───────────┐  ┌────────────────────┐   │     │
│  │  │vector_clocks │  │tombstones │  │  conflict_queue    │   │     │
│  │  └──────────────┘  └───────────┘  └────────────────────┘   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
                                   ↕
                          HTTPS / WebSocket
                                   ↕
┌────────────────────────────────────────────────────────────────────────┐
│                        SERVER APPLICATION                               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │             API GATEWAY / LOAD BALANCER                       │     │
│  │  ┌────────────┐  ┌──────────┐  ┌────────────┐  ┌─────────┐ │     │
│  │  │    Rate    │  │   Auth   │  │  Request   │  │  CORS   │ │     │
│  │  │  Limiting  │  │  Verify  │  │  Routing   │  │  Policy │ │     │
│  │  └────────────┘  └──────────┘  └────────────┘  └─────────┘ │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │           REST API + WEBSOCKET SERVER                         │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │     │
│  │  │ /api/sync    │  │  /api/tasks  │  │  /api/comments  │   │     │
│  │  │ /push /pull  │  │              │  │                 │   │     │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘   │     │
│  │  ┌──────────────────────────────────────────────────────┐   │     │
│  │  │         WebSocket: Real-time Updates                 │   │     │
│  │  └──────────────────────────────────────────────────────┘   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │              BUSINESS LOGIC LAYER                             │     │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │     │
│  │  │   Sync     │  │  Conflict  │  │    Permission        │   │     │
│  │  │Coordinator │  │  Detector  │  │    Validator         │   │     │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │     │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │     │
│  │  │   Event    │  │   Vector   │  │   Webhook/Event      │   │     │
│  │  │ Publisher  │  │   Clocks   │  │     Triggers         │   │     │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │              DATA ACCESS LAYER                                │     │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │     │
│  │  │   Query    │  │ Connection │  │    Transaction       │   │     │
│  │  │  Builder   │  │    Pool    │  │     Manager          │   │     │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                              ↕                                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                    POSTGRESQL                                 │     │
│  │  ┌────────┐  ┌────────┐  ┌─────────┐  ┌──────────────────┐ │     │
│  │  │  Core  │  │ Sync   │  │ Audit   │  │    Metadata      │ │     │
│  │  │ Tables │  │Metadata│  │  Logs   │  │                  │ │     │
│  │  └────────┘  └────────┘  └─────────┘  └──────────────────┘ │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │                  SUPPORTING SERVICES                          │     │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────┐  │     │
│  │  │  Redis   │  │  S3/CDN  │  │  Message   │  │ Monitor  │  │     │
│  │  │  Cache   │  │  Storage │  │   Queue    │  │  & Logs  │  │     │
│  │  │  Pub/Sub │  │          │  │            │  │          │  │     │
│  │  └──────────┘  └──────────┘  └────────────┘  └──────────┘  │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Sync Flow State Machine

```
┌──────────────┐
│   OFFLINE    │
│  (No Sync)   │
└──────┬───────┘
       │
       │ Network Available
       │ OR Manual Trigger
       │
       ↓
┌──────────────┐
│  SYNC_INIT   │
│              │
└──────┬───────┘
       │
       │ Acquire Lock
       │
       ↓
┌──────────────────────────┐
│    PUSH_PENDING          │
│                          │
│ 1. Get sync queue items  │
│ 2. Group by entity type  │
│ 3. Sort by priority      │
└───────────┬──────────────┘
            │
            │ Items Found
            │
            ↓
┌──────────────────────────┐
│    PUSHING               │
│                          │
│ POST /api/sync/push      │
└───────────┬──────────────┘
            │
            ├───────────────┐
            │               │
    Success │               │ Conflict Detected
            │               │
            ↓               ↓
┌──────────────┐    ┌──────────────────┐
│ PUSH_SUCCESS │    │ CONFLICT_DETECTED│
└──────┬───────┘    └────────┬─────────┘
       │                     │
       │                     │ Run Resolution
       │                     │
       │            ┌────────↓─────────┐
       │            │  AUTO_RESOLVE    │
       │            │  or              │
       │            │  QUEUE_MANUAL    │
       │            └────────┬─────────┘
       │                     │
       └─────────────────────┘
                    │
                    ↓
         ┌──────────────────┐
         │   PULL_PENDING   │
         │                  │
         │ GET /api/sync    │
         │     /pull        │
         └────────┬─────────┘
                  │
                  ↓
         ┌──────────────────┐
         │    PULLING       │
         │                  │
         │ Apply remote     │
         │ changes          │
         └────────┬─────────┘
                  │
                  ↓
         ┌──────────────────┐
         │  UPDATE_LOCAL    │
         │                  │
         │ 1. Tasks         │
         │ 2. Comments      │
         │ 3. Attachments   │
         │ 4. Tombstones    │
         └────────┬─────────┘
                  │
                  ↓
         ┌──────────────────┐
         │ UPDATE_METADATA  │
         │                  │
         │ - Vector clocks  │
         │ - Last sync time │
         │ - Watermarks     │
         └────────┬─────────┘
                  │
                  ↓
         ┌──────────────────┐
         │  SYNC_COMPLETE   │
         │                  │
         │ Emit success     │
         │ Release lock     │
         └────────┬─────────┘
                  │
                  ↓
         ┌──────────────────┐
         │     IDLE         │
         │  (Wait for next  │
         │    trigger)      │
         └──────────────────┘

         ┌──────────────────┐
         │   ERROR States   │
         ├──────────────────┤
         │ - PUSH_FAILED    │
         │ - PULL_FAILED    │
         │ - NETWORK_ERROR  │
         │                  │
         │ → Retry with     │
         │   exponential    │
         │   backoff        │
         └──────────────────┘
```

---

### 3. Conflict Detection Flow

```
┌─────────────────────────────────────────┐
│     CLIENT MODIFIES ENTITY              │
│     (while offline)                     │
└────────────────┬────────────────────────┘
                 │
                 │ User edits task
                 │
                 ↓
┌─────────────────────────────────────────┐
│  INCREMENT LOCAL VECTOR CLOCK           │
│                                         │
│  Before: { "device-a": 42 }            │
│  After:  { "device-a": 43 }            │
└────────────────┬────────────────────────┘
                 │
                 │ Save locally
                 │
                 ↓
┌─────────────────────────────────────────┐
│  WRITE TO INDEXEDDB                     │
│  + Queue in sync_queue                  │
└────────────────┬────────────────────────┘
                 │
                 │ Network available
                 │
                 ↓
┌─────────────────────────────────────────┐
│  PUSH TO SERVER                         │
│  Send:                                  │
│  - Entity data                          │
│  - Vector clock: { "device-a": 43 }    │
└────────────────┬────────────────────────┘
                 │
                 ↓
┌─────────────────────────────────────────┐
│  SERVER CHECKS FOR CONFLICT             │
│                                         │
│  1. Query current server version        │
│  2. Compare vector clocks               │
└────────────────┬────────────────────────┘
                 │
                 ├──────────────┬─────────────┐
                 │              │             │
          No Conflict     Happened-After  Concurrent
                 │              │             │
                 ↓              ↓             ↓
    ┌─────────────────┐  ┌──────────┐  ┌─────────────┐
    │  ACCEPT CHANGE  │  │  ACCEPT  │  │  CONFLICT!  │
    │                 │  │  CHANGE  │  │             │
    │  Write to DB    │  │          │  │  Return to  │
    │                 │  │          │  │  client     │
    └─────────────────┘  └──────────┘  └──────┬──────┘
                                              │
                                              ↓
                           ┌──────────────────────────────┐
                           │   CLIENT CONFLICT HANDLER    │
                           │                              │
                           │   Run resolution strategies  │
                           └─────────────┬────────────────┘
                                         │
                            ┌────────────┴─────────────┐
                            │                          │
                       Auto-Resolve              Manual Resolution
                            │                          │
                            ↓                          ↓
                ┌──────────────────────┐    ┌────────────────────┐
                │  APPLY RESOLUTION    │    │  SHOW CONFLICT UI  │
                │                      │    │                    │
                │  - Merge fields      │    │  User chooses:     │
                │  - Update DB         │    │  - Local version   │
                │  - Re-sync           │    │  - Remote version  │
                └──────────────────────┘    │  - Custom merge    │
                                            └────────────────────┘
```

---

### 4. Vector Clock Comparison Logic

```
Device A Clock: { "device-a": 5, "device-b": 2, "device-c": 1 }
Device B Clock: { "device-a": 4, "device-b": 3, "device-c": 1 }

┌────────────────────────────────────────────────────────┐
│           COMPARISON ALGORITHM                         │
├────────────────────────────────────────────────────────┤
│                                                        │
│  For each device in union of both clocks:             │
│                                                        │
│  Device A:  A.a=5  A.b=2  A.c=1                       │
│  Device B:  B.a=4  B.b=3  B.c=1                       │
│                                                        │
│  Compare:   5>4    2<3    1=1                         │
│             ↑      ↑      ↑                           │
│          A wins  B wins  Equal                        │
│                                                        │
│  Result: A has higher count for device-a              │
│          B has higher count for device-b              │
│                                                        │
│  → CONCURRENT MODIFICATION (Conflict!)                │
│                                                        │
│  If A >= B for all devices: A AFTER B (No conflict)  │
│  If B >= A for all devices: B AFTER A (No conflict)  │
│  If mixed results: CONCURRENT (Conflict!)             │
│                                                        │
└────────────────────────────────────────────────────────┘

Example Scenarios:

1. NO CONFLICT - Happened After
   A: { "a": 5, "b": 2 }
   B: { "a": 4, "b": 2 }
   → A > B for device-a, A >= B for device-b
   → A AFTER B (A wins, no conflict)

2. NO CONFLICT - Same Version
   A: { "a": 5, "b": 2 }
   B: { "a": 5, "b": 2 }
   → All equal
   → EQUAL (no conflict)

3. CONFLICT - Concurrent
   A: { "a": 5, "b": 2 }
   B: { "a": 4, "b": 3 }
   → Mixed: A > B for device-a, A < B for device-b
   → CONCURRENT (conflict!)
```

---

### 5. Priority Queue Visualization

```
┌──────────────────────────────────────────────────────────┐
│              SYNC QUEUE (Priority Ordered)               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Priority 1 (Critical - User-blocking)                  │
│  ┌────────────────────────────────────────────────┐    │
│  │ ✓ Task creation: "Design homepage"             │    │
│  │ ✓ Status change: "todo" → "done"              │    │
│  │ ✓ Delete operation: Task #123                  │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Priority 2 (High - Important updates)                  │
│  ┌────────────────────────────────────────────────┐    │
│  │ ◆ Assignment change: Assign to John            │    │
│  │ ◆ Title edit: "Fix bug" → "Fix critical bug"  │    │
│  │ ◆ Comment creation                              │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Priority 3 (Medium - Regular updates)                  │
│  ┌────────────────────────────────────────────────┐    │
│  │ ● Description edit                              │    │
│  │ ● Due date change                               │    │
│  │ ● Comment edit                                  │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Priority 4 (Low - Non-critical)                        │
│  ┌────────────────────────────────────────────────┐    │
│  │ ○ Tag update: Add "urgent"                     │    │
│  │ ○ Custom field change                           │    │
│  │ ○ Position/order change                         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Priority 5 (Background - Bulk operations)              │
│  ┌────────────────────────────────────────────────┐    │
│  │ ∙ History tracking                              │    │
│  │ ∙ Analytics events                              │    │
│  │ ∙ Cleanup operations                            │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  Processing Strategy:                                    │
│  1. Process Priority 1 items first                      │
│  2. If network slow, only sync Priority 1-2             │
│  3. Batch up to 100 items per sync                      │
│  4. Retry failed items with exponential backoff         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

### 6. Operational Transformation Example

```
Initial Text: "The cat sat on the mat"
                012345678901234567890123

User A (Offline):                User B (Offline):
Insert "black " at position 4    Insert "big " at position 4
"The black cat sat on the mat"   "The big cat sat on the mat"

┌──────────────────────────────────────────────────────────┐
│                CONFLICT SCENARIO                         │
└──────────────────────────────────────────────────────────┘

User A Operations:               User B Operations:
1. Retain 4 chars ("The ")      1. Retain 4 chars ("The ")
2. Insert "black "               2. Insert "big "
3. Retain remaining              3. Retain remaining

┌──────────────────────────────────────────────────────────┐
│            OPERATIONAL TRANSFORMATION                     │
└──────────────────────────────────────────────────────────┘

Transform A's operations against B's:
- A inserts at 4
- B inserts at 4
- Both valid, but we need to order them

Transformation Rules:
1. Both are insertions at same position
2. Use tiebreaker (e.g., device ID alphabetically)
3. If device-a < device-b, A goes first

Result after transformation:
1. Apply A: "The black cat sat on the mat"
2. Transform B's position (4 → 10, accounting for "black ")
3. Apply B: "The black big cat sat on the mat"

Final merged text: "The black big cat sat on the mat"

Both insertions preserved!

┌──────────────────────────────────────────────────────────┐
│              ALTERNATIVE: SMART MERGE                     │
└──────────────────────────────────────────────────────────┘

If we detect adjectives being added:
- Parse: "black" and "big" are both adjectives
- Apply grammar rule: order alphabetically
- Result: "The big black cat sat on the mat"

More natural result!
```

---

### 7. Data Flow: Task Creation to Sync

```
┌──────────────────────────────────────────────────────────────────┐
│                    USER CREATES TASK (OFFLINE)                    │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ↓
                ┌───────────────────────┐
                │   UI Layer            │
                │   Handles form submit │
                └───────────┬───────────┘
                            │
                            ↓ Call createTask()
                ┌───────────────────────┐
                │  Task Repository      │
                │  - Generate UUID      │
                │  - Set defaults       │
                │  - Calc checksum      │
                └───────────┬───────────┘
                            │
                            ↓ Increment counter
                ┌───────────────────────┐
                │  Vector Clock         │
                │  { "device-a": 43 }  │
                └───────────┬───────────┘
                            │
                            ↓ Write transaction
        ┌───────────────────┴────────────────────┐
        │                                        │
        ↓ Add to tasks table                    ↓ Add to sync_queue
┌───────────────────┐                  ┌─────────────────────┐
│   IndexedDB       │                  │   sync_queue        │
│   tasks table     │                  │   Priority: 1       │
│                   │                  │   Status: pending   │
│   id: uuid        │                  └──────────┬──────────┘
│   title: "..."    │                             │
│   vectorClock: {} │                             │
│   _syncStatus:    │                             │
│     "pending"     │                             │
│   _locallyModified│                             │
│     true          │                             │
└───────────────────┘                             │
        │                                         │
        └─────────────┬───────────────────────────┘
                      │
                      ↓ Return to UI
                ┌─────────────┐
                │  UI updates │
                │  Show task  │
                │  (optimistic)│
                └─────────────┘

                ~ Time passes ~
                Network becomes available

                      │
                      ↓ Network event triggers sync
                ┌─────────────────┐
                │  Sync Scheduler │
                │  Debounce 2s    │
                └────────┬────────┘
                         │
                         ↓ runSyncCycle()
                ┌────────────────────┐
                │   Sync Engine      │
                │   Check sync lock  │
                └────────┬───────────┘
                         │
                         ↓ push()
                ┌────────────────────────────┐
                │  1. Get pending from queue │
                │  2. Group by entity type   │
                │  3. Build payload          │
                └────────┬───────────────────┘
                         │
                         ↓ POST /api/sync/push
                ┌────────────────────┐
                │   HTTP Request     │
                │   Body: {          │
                │     deviceId,      │
                │     changes: {...} │
                │     vectorClock    │
                │   }                │
                └────────┬───────────┘
                         │
                         ↓ Server receives
┌────────────────────────────────────────────────────────────────┐
│                          SERVER                                 │
├────────────────────────────────────────────────────────────────┤
│                         │                                       │
│                         ↓ Validate JWT                          │
│                    ┌────────────┐                               │
│                    │ Auth Check │                               │
│                    └─────┬──────┘                               │
│                          │                                       │
│                          ↓ Check permissions                     │
│                    ┌────────────┐                               │
│                    │ Authorize  │                               │
│                    └─────┬──────┘                               │
│                          │                                       │
│                          ↓ Detect conflicts                      │
│                    ┌────────────────────┐                       │
│                    │ Compare vector     │                       │
│                    │ clocks with DB     │                       │
│                    └─────┬──────────────┘                       │
│                          │                                       │
│                ┌─────────┴─────────┐                            │
│                │                   │                            │
│         No Conflict         Conflict Detected                   │
│                │                   │                            │
│                ↓                   ↓                            │
│      ┌─────────────────┐   ┌──────────────┐                   │
│      │ Write to DB     │   │ Return       │                   │
│      │ - tasks table   │   │ conflict data│                   │
│      │ - task_history  │   └──────┬───────┘                   │
│      │ - sync_logs     │          │                            │
│      └────────┬────────┘          │                            │
│               │                   │                            │
│               └───────────────────┘                            │
│                       │                                         │
│                       ↓ Broadcast via WebSocket                │
│                  ┌─────────────┐                               │
│                  │ Notify other│                               │
│                  │   devices   │                               │
│                  └─────────────┘                               │
│                       │                                         │
│                       ↓ Return response                         │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ↓ Response received
                ┌───────────────────┐
                │  Client processes │
                │  - No conflict:   │
                │    Mark synced    │
                │  - Conflict:      │
                │    Queue for      │
                │    resolution     │
                └────────┬──────────┘
                         │
                         ↓ Update UI
                ┌────────────────────┐
                │  Show sync status  │
                │  ✓ Synced          │
                │  or                │
                │  ⚠ Conflict        │
                └────────────────────┘
```

---

### 8. Entity State Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    TASK LIFECYCLE STATES                         │
└─────────────────────────────────────────────────────────────────┘

NEW
 │
 ↓ User creates task
┌───────────────┐
│   CREATED     │
│  (Local only) │  _syncStatus: "pending"
└───────┬───────┘  _locallyModified: true
        │          deletedAt: null
        │
        ↓ Sync push successful
┌───────────────┐
│    SYNCED     │  _syncStatus: "synced"
│   (On server) │  _locallyModified: false
└───────┬───────┘  deletedAt: null
        │
        ├──────────────┬──────────────┬─────────────┐
        │              │              │             │
        ↓              ↓              ↓             ↓
   User edits    Conflict      Server       User deletes
        │         detected       updates         │
        │              │              │           │
        ↓              ↓              ↓           ↓
┌───────────┐  ┌──────────────┐ ┌─────────┐ ┌──────────┐
│  PENDING  │  │  CONFLICTED  │ │ SYNCED  │ │ DELETED  │
│           │  │              │ │(updated)│ │ (local)  │
└─────┬─────┘  └──────┬───────┘ └────┬────┘ └────┬─────┘
      │               │              │           │
      │               ↓              │           │
      │        Resolve conflict      │           │
      │               │              │           │
      │         ┌─────┴──────┐       │           │
      │         │            │       │           │
      │    Auto-resolve  Manual      │           │
      │         │       resolve      │           │
      │         └─────┬──────┘       │           │
      │               │              │           ↓
      │               ↓              │      Sync push
      │         ┌──────────┐         │           │
      │         │ RESOLVED │         │           ↓
      │         └────┬─────┘         │    ┌──────────────┐
      │              │               │    │  TOMBSTONE   │
      └──────────────┴───────────────┘    │  (Server has│
                     │                    │  tombstone)  │
                     ↓                    └──────┬───────┘
              Sync successful                    │
                     │                           │
                     ↓                           ↓
              ┌─────────────┐            After 90 days
              │   SYNCED    │                   │
              │  (Current)  │                   ↓
              └─────────────┘         ┌─────────────────┐
                                      │  PERMANENTLY    │
                                      │   DELETED       │
                                      └─────────────────┘

Legend:
  _syncStatus values:
    - "pending"    : Has local changes not yet synced
    - "syncing"    : Currently being synced
    - "synced"     : In sync with server
    - "conflict"   : Conflict detected, needs resolution

  _locallyModified:
    - true  : User made changes locally
    - false : No pending local changes

  deletedAt:
    - null      : Active entity
    - timestamp : Soft deleted
```

---

### 9. Attachment Upload Flow

```
┌──────────────────────────────────────────────────────────────┐
│               CHUNKED ATTACHMENT UPLOAD                       │
└──────────────────────────────────────────────────────────────┘

FILE: large_document.pdf (10 MB)
CHUNK SIZE: 1 MB
TOTAL CHUNKS: 10

Step 1: Initialize Upload
┌────────────────────────┐
│  Client                │
│  POST /attachments     │
│       /init            │
│                        │
│  {                     │
│    filename,           │
│    fileSize,           │
│    checksumSha256,     │
│    chunksTotal: 10     │
│  }                     │
└───────────┬────────────┘
            │
            ↓
┌────────────────────────┐
│  Server                │
│  - Create DB record    │
│  - Generate upload ID  │
│  - Return upload URL   │
└───────────┬────────────┘
            │
            ↓
┌────────────────────────┐
│  Client stores:        │
│  - uploadId            │
│  - uploadUrls[]        │
└────────────────────────┘

Step 2: Upload Chunks (Parallel)
┌─────────────────────────────────────────────────┐
│  Upload Chunks 1-5 in parallel                  │
│                                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│  │Chunk1│  │Chunk2│  │Chunk3│  │Chunk4│  │Chunk5│
│  │ 1MB  │  │ 1MB  │  │ 1MB  │  │ 1MB  │  │ 1MB  │
│  └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘
│      │         │         │         │         │
│      └─────────┴─────────┴─────────┴─────────┘
│                          ↓
│                    POST /chunks/1
│                    POST /chunks/2
│                    POST /chunks/3
│                    POST /chunks/4
│                    POST /chunks/5
│                          ↓
│  Response: { etag, chunkNumber, progress: 50% }
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  Upload Chunks 6-10 in parallel                 │
│                                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
│  │Chunk6│  │Chunk7│  │Chunk8│  │Chunk9│  │Chunk │
│  │ 1MB  │  │ 1MB  │  │ 1MB  │  │ 1MB  │  │10 1MB│
│  └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘  └───┬──┘
│      │         │         │         │         │
│      └─────────┴─────────┴─────────┴─────────┘
│                          ↓
│                    Completes to 100%
└─────────────────────────────────────────────────┘

Step 3: Complete Upload
┌────────────────────────┐
│  Client                │
│  POST /complete        │
│  {                     │
│    uploadId,           │
│    parts: [            │
│      {chunk: 1, etag}, │
│      {chunk: 2, etag}, │
│      ...               │
│    ]                   │
│  }                     │
└───────────┬────────────┘
            │
            ↓
┌────────────────────────┐
│  Server                │
│  - Verify all chunks   │
│  - Merge into single   │
│    file on S3          │
│  - Generate thumbnail  │
│  - Update DB:          │
│    status: "completed" │
└───────────┬────────────┘
            │
            ↓
┌────────────────────────┐
│  Client                │
│  - Remove temp chunks  │
│  - Show success        │
│  - Mark as synced      │
└────────────────────────┘

Resumable Upload:
If network fails at chunk 7:
1. Client stores progress: chunks 1-6 complete
2. On reconnect, resume from chunk 7
3. Server validates existing chunks
4. Continue upload without re-uploading 1-6
```

---

This visual reference provides comprehensive diagrams for understanding the complete offline-first architecture. Each diagram focuses on a specific aspect of the system, making it easier to understand complex flows and interactions.

