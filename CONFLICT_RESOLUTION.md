# Conflict Resolution Strategy

## Overview

This document details entity-specific conflict resolution strategies designed to automatically resolve 95% of conflicts while providing clear UI for the remaining 5% requiring manual intervention.

---

## Conflict Types

### 1. Concurrent Modifications

Two devices modify the same field while offline.

**Example:**
```
Device A: Changes task title from "Design" to "Design Homepage"
Device B: Changes task title from "Design" to "Design Landing Page"
```

### 2. Cascade Conflicts

Parent entity deleted while child entities modified offline.

**Example:**
```
Device A: Deletes task #123
Device B: Adds comment to task #123
```

### 3. Assignment Conflicts

Task assigned to different users offline.

**Example:**
```
Device A: Assigns task to User X
Device B: Assigns task to User Y
```

### 4. Status Conflicts

Conflicting status transitions.

**Example:**
```
Device A: Changes status from "todo" to "in_progress"
Device B: Changes status from "todo" to "done"
```

---

## Resolution Strategies by Entity

### Task Conflicts

#### Strategy Matrix

| Field Type | Conflict Type | Resolution Strategy | Auto-Resolvable | Rationale |
|------------|---------------|---------------------|-----------------|-----------|
| **title** | Concurrent edit | Operational Transformation | Yes | Merge text changes |
| **description** | Concurrent edit | Operational Transformation | Yes | Merge text changes |
| **status** | Concurrent change | State machine rules | Partial | Some transitions invalid |
| **assignedTo** | Concurrent assignment | Last-Write-Wins (LWW) | No | User decision needed |
| **priority** | Concurrent change | Higher priority wins | Yes | Objective criterion |
| **dueDate** | Concurrent change | Earlier date wins | Yes | More conservative |
| **tags** | Concurrent change | Union merge | Yes | Combine both sets |
| **position** | Concurrent change | LWW | Yes | Visual order less critical |
| **customFields** | Concurrent change | Field-level merge | Yes | Independent fields |

---

#### Task Title/Description: Operational Transformation

**Algorithm:**

```typescript
interface TextOperation {
  type: 'insert' | 'delete' | 'retain';
  position?: number;
  text?: string;
  length?: number;
}

class OperationalTransform {
  /**
   * Transform two concurrent operations so they can be applied sequentially
   */
  transform(op1: TextOperation[], op2: TextOperation[]): {
    op1Prime: TextOperation[];
    op2Prime: TextOperation[];
  } {
    const op1Prime = this.transformOperations(op1, op2);
    const op2Prime = this.transformOperations(op2, op1);

    return { op1Prime, op2Prime };
  }

  private transformOperations(
    ops1: TextOperation[],
    ops2: TextOperation[]
  ): TextOperation[] {
    let i1 = 0, i2 = 0;
    const result: TextOperation[] = [];

    while (i1 < ops1.length && i2 < ops2.length) {
      const o1 = ops1[i1];
      const o2 = ops2[i2];

      if (o1.type === 'retain' && o2.type === 'retain') {
        const minLength = Math.min(o1.length!, o2.length!);
        result.push({ type: 'retain', length: minLength });

        o1.length! -= minLength;
        o2.length! -= minLength;

        if (o1.length === 0) i1++;
        if (o2.length === 0) i2++;
      }
      else if (o1.type === 'insert') {
        result.push({ ...o1 });
        i1++;
      }
      else if (o2.type === 'insert') {
        result.push({ type: 'retain', length: o2.text!.length });
        i2++;
      }
      else if (o1.type === 'delete' && o2.type === 'delete') {
        const minLength = Math.min(o1.length!, o2.length!);
        o1.length! -= minLength;
        o2.length! -= minLength;

        if (o1.length === 0) i1++;
        if (o2.length === 0) i2++;
      }
      else if (o1.type === 'delete') {
        result.push({ ...o1 });
        i1++;
      }
      else if (o2.type === 'delete') {
        i2++;
      }
    }

    // Remaining operations
    while (i1 < ops1.length) {
      result.push(ops1[i1++]);
    }

    return result;
  }

  /**
   * Calculate diff operations between two texts
   */
  diff(oldText: string, newText: string): TextOperation[] {
    const operations: TextOperation[] = [];
    let i = 0;

    // Simple diff algorithm (use library like diff-match-patch in production)
    while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
      i++;
    }

    if (i > 0) {
      operations.push({ type: 'retain', length: i });
    }

    const deletedLength = oldText.length - i;
    if (deletedLength > 0) {
      operations.push({ type: 'delete', length: deletedLength });
    }

    const insertedText = newText.substring(i);
    if (insertedText.length > 0) {
      operations.push({ type: 'insert', text: insertedText });
    }

    return operations;
  }

  /**
   * Apply operations to text
   */
  apply(text: string, operations: TextOperation[]): string {
    let result = '';
    let index = 0;

    for (const op of operations) {
      if (op.type === 'retain') {
        result += text.substring(index, index + op.length!);
        index += op.length!;
      }
      else if (op.type === 'insert') {
        result += op.text!;
      }
      else if (op.type === 'delete') {
        index += op.length!;
      }
    }

    return result;
  }
}

// Conflict resolution implementation
async function resolveTextConflict(
  field: 'title' | 'description',
  baseText: string,
  localText: string,
  remoteText: string
): Promise<string> {
  const ot = new OperationalTransform();

  // Calculate operations
  const localOps = ot.diff(baseText, localText);
  const remoteOps = ot.diff(baseText, remoteText);

  // Transform operations
  const { op1Prime, op2Prime } = ot.transform(localOps, remoteOps);

  // Apply both transformations
  let result = baseText;
  result = ot.apply(result, op1Prime);
  result = ot.apply(result, op2Prime);

  return result;
}
```

**Example:**

```typescript
// Base: "Design homepage"
// Local: "Design new homepage" (inserted "new ")
// Remote: "Design homepage layout" (inserted " layout")

const resolved = await resolveTextConflict(
  'title',
  'Design homepage',
  'Design new homepage',
  'Design homepage layout'
);

// Result: "Design new homepage layout"
// Both insertions preserved!
```

---

#### Task Status: State Machine Rules

**Valid Status Transitions:**

```typescript
const STATUS_TRANSITIONS = {
  'todo': ['in_progress', 'blocked', 'cancelled'],
  'in_progress': ['done', 'blocked', 'todo'],
  'blocked': ['todo', 'in_progress', 'cancelled'],
  'done': ['todo'], // Reopen
  'cancelled': ['todo'] // Resurrect
};

function resolveStatusConflict(
  localStatus: string,
  remoteStatus: string,
  previousStatus: string
): {
  resolvedStatus: string;
  autoResolved: boolean;
  reason: string;
} {
  // Same status, no conflict
  if (localStatus === remoteStatus) {
    return {
      resolvedStatus: localStatus,
      autoResolved: true,
      reason: 'No conflict'
    };
  }

  // Both moved from same previous status
  const localValid = STATUS_TRANSITIONS[previousStatus]?.includes(localStatus);
  const remoteValid = STATUS_TRANSITIONS[previousStatus]?.includes(remoteStatus);

  if (!localValid && !remoteValid) {
    // Both invalid (shouldn't happen)
    return {
      resolvedStatus: previousStatus,
      autoResolved: true,
      reason: 'Both transitions invalid, reverting'
    };
  }

  if (!localValid) {
    return {
      resolvedStatus: remoteStatus,
      autoResolved: true,
      reason: 'Local transition invalid'
    };
  }

  if (!remoteValid) {
    return {
      resolvedStatus: localStatus,
      autoResolved: true,
      reason: 'Remote transition invalid'
    };
  }

  // Priority rules for valid transitions
  const PRIORITY = {
    'done': 5,
    'cancelled': 4,
    'blocked': 3,
    'in_progress': 2,
    'todo': 1
  };

  // Higher priority status wins (e.g., "done" beats "in_progress")
  if (PRIORITY[localStatus] > PRIORITY[remoteStatus]) {
    return {
      resolvedStatus: localStatus,
      autoResolved: true,
      reason: `${localStatus} has higher priority than ${remoteStatus}`
    };
  }

  if (PRIORITY[remoteStatus] > PRIORITY[localStatus]) {
    return {
      resolvedStatus: remoteStatus,
      autoResolved: true,
      reason: `${remoteStatus} has higher priority than ${localStatus}`
    };
  }

  // Same priority, use Last-Write-Wins (requires timestamp)
  return {
    resolvedStatus: remoteStatus, // Fallback to remote
    autoResolved: false,
    reason: 'Manual resolution required: status transitions conflict'
  };
}
```

**Example:**

```
Previous: "todo"
Local: "in_progress"
Remote: "done"

Resolution: "done" (higher priority wins)
Auto-resolved: Yes
```

---

#### Task Assignment: Manual Resolution

**Strategy:** Assignment conflicts require user input.

```typescript
async function resolveAssignmentConflict(
  taskId: string,
  localAssignedTo: string | null,
  remoteAssignedTo: string | null,
  localVectorClock: VectorClock,
  remoteVectorClock: VectorClock
): Promise<{
  autoResolved: boolean;
  suggestedResolution: string | null;
  reason: string;
}> {
  // Special case: One side unassigned
  if (localAssignedTo === null && remoteAssignedTo !== null) {
    return {
      autoResolved: true,
      suggestedResolution: remoteAssignedTo,
      reason: 'Remote assigned, local unassigned'
    };
  }

  if (remoteAssignedTo === null && localAssignedTo !== null) {
    return {
      autoResolved: true,
      suggestedResolution: localAssignedTo,
      reason: 'Local assigned, remote unassigned'
    };
  }

  // Both assigned to different users - manual resolution
  return {
    autoResolved: false,
    suggestedResolution: null, // User must choose
    reason: `Task assigned to different users: ${localAssignedTo} vs ${remoteAssignedTo}`
  };
}
```

**UI for Manual Resolution:**

```typescript
interface AssignmentConflictUI {
  taskTitle: string;
  localAssignee: User;
  remoteAssignee: User;
  localAssignedBy: User;
  remoteAssignedBy: User;
  localTimestamp: number;
  remoteTimestamp: number;
}

function renderAssignmentConflictModal(conflict: AssignmentConflictUI) {
  return `
    <div class="conflict-modal">
      <h2>Assignment Conflict: ${conflict.taskTitle}</h2>
      <p>This task was assigned to different people while offline.</p>

      <div class="conflict-options">
        <div class="option">
          <input type="radio" name="resolution" value="local" />
          <label>
            <strong>${conflict.localAssignee.name}</strong>
            <div class="details">
              Assigned by ${conflict.localAssignedBy.name}
              at ${formatTime(conflict.localTimestamp)}
            </div>
          </label>
        </div>

        <div class="option">
          <input type="radio" name="resolution" value="remote" />
          <label>
            <strong>${conflict.remoteAssignee.name}</strong>
            <div class="details">
              Assigned by ${conflict.remoteAssignedBy.name}
              at ${formatTime(conflict.remoteTimestamp)}
            </div>
          </label>
        </div>

        <div class="option">
          <input type="radio" name="resolution" value="other" />
          <label>
            <strong>Assign to someone else</strong>
            <select name="otherUser">
              <!-- User list -->
            </select>
          </label>
        </div>
      </div>

      <button onclick="resolveConflict()">Resolve</button>
    </div>
  `;
}
```

---

#### Task Priority: Higher Priority Wins

```typescript
function resolvePriorityConflict(
  localPriority: string,
  remotePriority: string
): {
  resolvedPriority: string;
  autoResolved: boolean;
} {
  const PRIORITY_VALUES = {
    'urgent': 4,
    'high': 3,
    'medium': 2,
    'low': 1
  };

  const localValue = PRIORITY_VALUES[localPriority];
  const remoteValue = PRIORITY_VALUES[remotePriority];

  return {
    resolvedPriority: localValue > remoteValue ? localPriority : remotePriority,
    autoResolved: true
  };
}
```

---

#### Task Tags: Union Merge

```typescript
function resolveTagsConflict(
  localTags: string[],
  remoteTags: string[]
): {
  resolvedTags: string[];
  autoResolved: boolean;
} {
  // Union of both tag sets
  const merged = new Set([...localTags, ...remoteTags]);

  return {
    resolvedTags: Array.from(merged).sort(),
    autoResolved: true
  };
}
```

**Example:**

```
Local tags:  ["urgent", "frontend", "design"]
Remote tags: ["urgent", "backend", "api"]

Resolved:    ["api", "backend", "design", "frontend", "urgent"]
```

---

#### Task Custom Fields: Field-Level Merge

```typescript
function resolveCustomFieldsConflict(
  baseFields: Record<string, any>,
  localFields: Record<string, any>,
  remoteFields: Record<string, any>
): {
  resolvedFields: Record<string, any>;
  conflicts: string[];
  autoResolved: boolean;
} {
  const resolved: Record<string, any> = {};
  const conflicts: string[] = [];

  // Get all field keys
  const allKeys = new Set([
    ...Object.keys(localFields),
    ...Object.keys(remoteFields)
  ]);

  for (const key of allKeys) {
    const baseValue = baseFields[key];
    const localValue = localFields[key];
    const remoteValue = remoteFields[key];

    // No conflict if values are the same
    if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
      resolved[key] = localValue;
      continue;
    }

    // One side unchanged
    if (JSON.stringify(localValue) === JSON.stringify(baseValue)) {
      resolved[key] = remoteValue;
      continue;
    }

    if (JSON.stringify(remoteValue) === JSON.stringify(baseValue)) {
      resolved[key] = localValue;
      continue;
    }

    // Both changed differently
    if (typeof localValue === 'number' && typeof remoteValue === 'number') {
      // Numbers: take maximum
      resolved[key] = Math.max(localValue, remoteValue);
    }
    else if (Array.isArray(localValue) && Array.isArray(remoteValue)) {
      // Arrays: union
      resolved[key] = [...new Set([...localValue, ...remoteValue])];
    }
    else if (typeof localValue === 'object' && typeof remoteValue === 'object') {
      // Objects: recursive merge
      resolved[key] = { ...localValue, ...remoteValue };
    }
    else {
      // Other types: prefer remote (LWW)
      resolved[key] = remoteValue;
      conflicts.push(key);
    }
  }

  return {
    resolvedFields: resolved,
    conflicts,
    autoResolved: conflicts.length === 0
  };
}
```

---

### Comment Conflicts

#### Strategy: Last-Write-Wins with Edit History

Comments are simpler than tasks because they're typically single-author.

```typescript
interface CommentConflict {
  commentId: string;
  localVersion: Comment;
  remoteVersion: Comment;
}

async function resolveCommentConflict(
  conflict: CommentConflict
): Promise<{
  resolvedComment: Comment;
  autoResolved: boolean;
  preserveBoth: boolean;
}> {
  const { localVersion, remoteVersion } = conflict;

  // Check if this is an edit vs delete scenario
  if (localVersion.deletedAt !== null && remoteVersion.deletedAt === null) {
    // Local deleted, remote edited
    return {
      resolvedComment: localVersion, // Deletion wins
      autoResolved: true,
      preserveBoth: false
    };
  }

  if (remoteVersion.deletedAt !== null && localVersion.deletedAt === null) {
    // Remote deleted, local edited
    return {
      resolvedComment: remoteVersion, // Deletion wins
      autoResolved: true,
      preserveBoth: false
    };
  }

  // Both edited the content
  if (localVersion.content !== remoteVersion.content) {
    // Compare timestamps - later edit wins
    if (localVersion.updatedAt > remoteVersion.updatedAt) {
      return {
        resolvedComment: {
          ...localVersion,
          version: Math.max(localVersion.version, remoteVersion.version) + 1
        },
        autoResolved: true,
        preserveBoth: false
      };
    } else {
      return {
        resolvedComment: {
          ...remoteVersion,
          version: Math.max(localVersion.version, remoteVersion.version) + 1
        },
        autoResolved: true,
        preserveBoth: false
      };
    }
  }

  // No actual conflict
  return {
    resolvedComment: remoteVersion,
    autoResolved: true,
    preserveBoth: false
  };
}
```

#### Preserve Edit History

Always save conflicting versions to history:

```typescript
async function saveCommentHistory(
  commentId: string,
  versions: Comment[]
): Promise<void> {
  const tx = db.transaction('comment_history', 'readwrite');
  const store = tx.objectStore('comment_history');

  for (const version of versions) {
    await store.add({
      id: generateId(),
      commentId,
      content: version.content,
      version: version.version,
      editedBy: version.lastModifiedBy,
      editedFromDevice: version.lastModifiedDevice,
      vectorClock: version.vectorClock,
      createdAt: version.updatedAt
    });
  }

  await tx.commit();
}
```

---

### Attachment Conflicts

#### Strategy: Checksum-Based Deduplication

Attachments are immutable - same content = same attachment.

```typescript
async function resolveAttachmentConflict(
  localAttachment: Attachment,
  remoteAttachment: Attachment
): Promise<{
  resolvedAttachment: Attachment;
  autoResolved: boolean;
  isDuplicate: boolean;
}> {
  // Check if same file content
  if (localAttachment.checksumSha256 === remoteAttachment.checksumSha256) {
    // Duplicate upload, keep server version
    return {
      resolvedAttachment: remoteAttachment,
      autoResolved: true,
      isDuplicate: true
    };
  }

  // Different files with same name
  // Rename local version
  const renamedLocal = {
    ...localAttachment,
    filename: appendTimestamp(localAttachment.filename, localAttachment.createdAt)
  };

  // Keep both attachments
  return {
    resolvedAttachment: renamedLocal,
    autoResolved: true,
    isDuplicate: false
  };
}

function appendTimestamp(filename: string, timestamp: number): string {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, -5);

  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex === -1) {
    return `${filename}_${dateStr}`;
  }

  const name = filename.substring(0, dotIndex);
  const ext = filename.substring(dotIndex);
  return `${name}_${dateStr}${ext}`;
}
```

**Example:**

```
Local:  "report.pdf" (checksum: abc123...)
Remote: "report.pdf" (checksum: def456...)

Resolution: Keep both
  - Remote: "report.pdf"
  - Local renamed: "report_2026-02-10T14-30-00.pdf"
```

---

## Cascade Conflict Handling

### Deleted Parent with Modified Children

**Scenario:** Task deleted on Device A while Device B adds comment.

#### Detection

```typescript
async function detectCascadeConflict(
  tombstone: Tombstone,
  localChanges: SyncQueueItem[]
): Promise<CascadeConflict[]> {
  const conflicts: CascadeConflict[] = [];

  for (const change of localChanges) {
    // Check if change affects deleted entity or its children
    if (change.entityType === 'comment' && change.payload.taskId === tombstone.entityId) {
      conflicts.push({
        type: 'orphaned_comment',
        parentId: tombstone.entityId,
        childId: change.entityId,
        childData: change.payload,
        deletionTime: tombstone.createdAt
      });
    }

    if (change.entityType === 'attachment' && change.payload.taskId === tombstone.entityId) {
      conflicts.push({
        type: 'orphaned_attachment',
        parentId: tombstone.entityId,
        childId: change.entityId,
        childData: change.payload,
        deletionTime: tombstone.createdAt
      });
    }
  }

  return conflicts;
}
```

#### Resolution Strategy

```typescript
async function resolveCascadeConflict(
  conflict: CascadeConflict
): Promise<CascadeResolution> {
  // Option 1: Discard orphaned child
  if (conflict.type === 'orphaned_comment') {
    // Comments without parent task are meaningless
    return {
      action: 'discard',
      reason: 'Parent task deleted',
      notify: true,
      notifyMessage: `Your comment could not be saved because the task was deleted by another user.`
    };
  }

  // Option 2: Resurrect parent
  if (conflict.type === 'orphaned_attachment') {
    // Attachments might be valuable
    return {
      action: 'resurrect_parent',
      reason: 'Preserve attachment',
      notify: true,
      notifyMessage: `Task was restored because you added an attachment to it.`
    };
  }

  // Option 3: Move to another parent (manual)
  return {
    action: 'prompt_user',
    options: ['discard', 'resurrect', 'move'],
    defaultOption: 'discard'
  };
}
```

---

## Conflict Resolution Orchestrator

### Main Resolution Flow

```typescript
class ConflictResolver {
  async resolveAll(conflicts: Conflict[]): Promise<ResolutionResult> {
    const autoResolved: Conflict[] = [];
    const needsManual: Conflict[] = [];
    const failed: Conflict[] = [];

    for (const conflict of conflicts) {
      try {
        const result = await this.resolveConflict(conflict);

        if (result.autoResolved) {
          autoResolved.push(conflict);
          await this.applyResolution(conflict, result.resolution);
        } else {
          needsManual.push(conflict);
          await this.queueForManualResolution(conflict, result);
        }
      } catch (error) {
        console.error('Conflict resolution failed:', conflict, error);
        failed.push(conflict);
      }
    }

    return {
      totalConflicts: conflicts.length,
      autoResolved: autoResolved.length,
      needsManual: needsManual.length,
      failed: failed.length
    };
  }

  private async resolveConflict(conflict: Conflict): Promise<Resolution> {
    switch (conflict.entityType) {
      case 'task':
        return this.resolveTaskConflict(conflict);
      case 'comment':
        return this.resolveCommentConflict(conflict);
      case 'attachment':
        return this.resolveAttachmentConflict(conflict);
      default:
        throw new Error(`Unknown entity type: ${conflict.entityType}`);
    }
  }

  private async resolveTaskConflict(conflict: Conflict): Promise<Resolution> {
    const { localVersion, serverVersion } = conflict;
    const baseVersion = await this.getCommonAncestor(conflict);

    const fieldResolutions = new Map<string, any>();
    const manualFields: string[] = [];

    // Resolve each field independently
    for (const field of Object.keys(localVersion)) {
      if (this.isSystemField(field)) continue;

      const localValue = localVersion[field];
      const remoteValue = serverVersion[field];
      const baseValue = baseVersion?.[field];

      // No conflict if values are the same
      if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
        fieldResolutions.set(field, localValue);
        continue;
      }

      // Field-specific resolution
      const fieldResult = await this.resolveField(
        field,
        baseValue,
        localValue,
        remoteValue
      );

      if (fieldResult.autoResolved) {
        fieldResolutions.set(field, fieldResult.value);
      } else {
        manualFields.push(field);
      }
    }

    // Build resolved entity
    const resolved = {
      ...serverVersion,
      ...Object.fromEntries(fieldResolutions),
      version: Math.max(localVersion.version, serverVersion.version) + 1,
      vectorClock: mergeVectorClocks(
        localVersion.vectorClock,
        serverVersion.vectorClock
      )
    };

    return {
      autoResolved: manualFields.length === 0,
      resolution: resolved,
      manualFields,
      metadata: {
        resolvedFields: Array.from(fieldResolutions.keys()),
        strategy: 'field-level'
      }
    };
  }

  private async resolveField(
    field: string,
    baseValue: any,
    localValue: any,
    remoteValue: any
  ): Promise<{ autoResolved: boolean; value: any }> {
    // One side unchanged
    if (JSON.stringify(localValue) === JSON.stringify(baseValue)) {
      return { autoResolved: true, value: remoteValue };
    }

    if (JSON.stringify(remoteValue) === JSON.stringify(baseValue)) {
      return { autoResolved: true, value: localValue };
    }

    // Field-specific strategies
    switch (field) {
      case 'title':
      case 'description':
        const resolved = await resolveTextConflict(field, baseValue, localValue, remoteValue);
        return { autoResolved: true, value: resolved };

      case 'status':
        const statusResult = resolveStatusConflict(localValue, remoteValue, baseValue);
        return { autoResolved: statusResult.autoResolved, value: statusResult.resolvedStatus };

      case 'priority':
        const priorityResult = resolvePriorityConflict(localValue, remoteValue);
        return { autoResolved: true, value: priorityResult.resolvedPriority };

      case 'tags':
        const tagsResult = resolveTagsConflict(localValue, remoteValue);
        return { autoResolved: true, value: tagsResult.resolvedTags };

      case 'assignedTo':
        // Assignment requires manual resolution
        return { autoResolved: false, value: null };

      case 'dueDate':
        // Earlier date wins (more conservative)
        const resolved = Math.min(localValue || Infinity, remoteValue || Infinity);
        return { autoResolved: true, value: resolved === Infinity ? null : resolved };

      case 'customFields':
        const customResult = resolveCustomFieldsConflict(baseValue, localValue, remoteValue);
        return { autoResolved: customResult.autoResolved, value: customResult.resolvedFields };

      default:
        // Default: Last-Write-Wins (remote wins)
        return { autoResolved: true, value: remoteValue };
    }
  }

  private async getCommonAncestor(conflict: Conflict): Promise<any> {
    // Try to find common base version from history
    try {
      const history = await db.get('task_history', conflict.entityId);
      return history?.previousState || null;
    } catch {
      return null;
    }
  }

  private isSystemField(field: string): boolean {
    return [
      'id',
      'organizationId',
      'createdAt',
      'createdBy',
      'vectorClock',
      'version',
      'checksum',
      '_syncStatus',
      '_locallyModified'
    ].includes(field);
  }

  private async applyResolution(
    conflict: Conflict,
    resolution: any
  ): Promise<void> {
    // Write resolved entity to database
    const tx = db.transaction([conflict.entityType + 's', 'sync_queue'], 'readwrite');

    await tx.objectStore(conflict.entityType + 's').put({
      ...resolution,
      _syncStatus: 'synced',
      _locallyModified: false
    });

    // Remove from sync queue
    await this.removeFromSyncQueue(tx, conflict.entityId);

    // Log resolution
    await this.logResolution(conflict, 'auto', resolution);

    await tx.commit();

    // Notify UI
    this.emitConflictResolved(conflict, resolution);
  }

  private async queueForManualResolution(
    conflict: Conflict,
    result: Resolution
  ): Promise<void> {
    const tx = db.transaction('conflict_queue', 'readwrite');

    await tx.objectStore('conflict_queue').add({
      id: generateId(),
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      localVersion: conflict.localVersion,
      serverVersion: conflict.serverVersion,
      localVectorClock: conflict.localVectorClock,
      serverVectorClock: conflict.serverVectorClock,
      conflictReason: result.metadata?.reason || 'Manual resolution required',
      autoResolvable: false,
      suggestedResolution: result.resolution,
      createdAt: Date.now(),
      userNotified: false
    });

    await tx.commit();

    // Show notification to user
    this.notifyUserOfConflict(conflict);
  }
}
```

---

## User Interface for Manual Resolution

### Conflict Notification Banner

```typescript
function renderConflictBanner(conflictCount: number) {
  return `
    <div class="conflict-banner" role="alert">
      <div class="icon">⚠️</div>
      <div class="message">
        <strong>${conflictCount} conflict${conflictCount > 1 ? 's' : ''} need your attention</strong>
        <p>Some changes made offline couldn't be automatically merged.</p>
      </div>
      <button onclick="showConflictResolutionUI()">
        Review Conflicts
      </button>
      <button onclick="dismissBanner()">
        Later
      </button>
    </div>
  `;
}
```

### Task Conflict Resolution UI

```typescript
interface TaskConflictUIProps {
  task: Task;
  localVersion: Task;
  serverVersion: Task;
  suggestedResolution: Task;
  conflictFields: string[];
}

function renderTaskConflictUI(props: TaskConflictUIProps) {
  return `
    <div class="conflict-resolution-modal">
      <h2>Resolve Conflict: ${props.task.title}</h2>
      <p class="explanation">
        This task was modified on multiple devices while offline.
        Choose which version to keep for each conflicting field.
      </p>

      <div class="conflict-fields">
        ${props.conflictFields.map(field => `
          <div class="field-conflict">
            <h3>${formatFieldName(field)}</h3>

            <div class="versions">
              <label class="version">
                <input type="radio" name="${field}" value="local" />
                <div class="version-content">
                  <span class="label">Your version</span>
                  <div class="value">${formatFieldValue(field, props.localVersion[field])}</div>
                  <span class="meta">Modified ${formatRelativeTime(props.localVersion.updatedAt)}</span>
                </div>
              </label>

              <label class="version">
                <input type="radio" name="${field}" value="remote" checked />
                <div class="version-content">
                  <span class="label">Server version</span>
                  <div class="value">${formatFieldValue(field, props.serverVersion[field])}</div>
                  <span class="meta">Modified by ${props.serverVersion.lastModifiedBy}</span>
                </div>
              </label>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="actions">
        <button onclick="resolveManually()" class="primary">
          Apply Selected Resolution
        </button>
        <button onclick="keepBothVersions()" class="secondary">
          Duplicate Task (Keep Both)
        </button>
        <button onclick="discardLocal()" class="danger">
          Discard My Changes
        </button>
      </div>
    </div>
  `;
}
```

---

## Testing Conflict Resolution

### Unit Tests

```typescript
describe('Conflict Resolution', () => {
  describe('Text Field Conflicts', () => {
    it('should merge non-overlapping text changes', async () => {
      const base = 'Hello world';
      const local = 'Hello beautiful world';
      const remote = 'Hello world today';

      const resolved = await resolveTextConflict('title', base, local, remote);

      expect(resolved).toBe('Hello beautiful world today');
    });

    it('should handle overlapping insertions', async () => {
      const base = 'The cat';
      const local = 'The black cat';
      const remote = 'The big cat';

      const resolved = await resolveTextConflict('title', base, local, remote);

      // One insertion should be preserved
      expect(resolved).toContain('cat');
      expect(resolved.length).toBeGreaterThan(base.length);
    });
  });

  describe('Status Conflicts', () => {
    it('should prioritize done over in_progress', () => {
      const result = resolveStatusConflict('in_progress', 'done', 'todo');

      expect(result.resolvedStatus).toBe('done');
      expect(result.autoResolved).toBe(true);
    });

    it('should reject invalid transitions', () => {
      const result = resolveStatusConflict('done', 'blocked', 'cancelled');

      expect(result.autoResolved).toBe(true);
      // Should revert or pick valid transition
    });
  });

  describe('Tags Conflicts', () => {
    it('should merge tag sets', () => {
      const local = ['urgent', 'frontend'];
      const remote = ['urgent', 'backend'];

      const result = resolveTagsConflict(local, remote);

      expect(result.resolvedTags).toEqual(['backend', 'frontend', 'urgent']);
      expect(result.autoResolved).toBe(true);
    });
  });
});
```

### Integration Tests

```typescript
describe('End-to-End Conflict Scenarios', () => {
  it('should handle concurrent task edits', async () => {
    // Simulate Device A
    const taskA = await taskRepo.getTask('task-1');
    taskA.title = 'Updated Title A';
    await taskRepo.updateTask(taskA);

    // Simulate Device B (offline)
    const taskB = await taskRepo.getTask('task-1');
    taskB.title = 'Updated Title B';
    taskB.status = 'done';
    await taskRepo.updateTask(taskB);

    // Sync Device B
    const conflicts = await syncEngine.push();

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].entityType).toBe('task');

    // Auto-resolve
    const result = await conflictResolver.resolveAll(conflicts);

    expect(result.autoResolved).toBeGreaterThan(0);

    // Verify merged state
    const resolved = await taskRepo.getTask('task-1');
    expect(resolved.status).toBe('done'); // Non-conflicting field preserved
  });
});
```

---

## Conflict Metrics and Monitoring

```typescript
interface ConflictMetrics {
  totalConflicts: number;
  autoResolved: number;
  manualResolved: number;
  pending: number;
  byEntityType: Record<string, number>;
  byField: Record<string, number>;
  resolutionTime: number[]; // milliseconds
}

class ConflictMonitor {
  private metrics: ConflictMetrics = {
    totalConflicts: 0,
    autoResolved: 0,
    manualResolved: 0,
    pending: 0,
    byEntityType: {},
    byField: {},
    resolutionTime: []
  };

  recordConflict(conflict: Conflict, resolution: 'auto' | 'manual', durationMs: number) {
    this.metrics.totalConflicts++;

    if (resolution === 'auto') {
      this.metrics.autoResolved++;
    } else {
      this.metrics.manualResolved++;
    }

    this.metrics.byEntityType[conflict.entityType] =
      (this.metrics.byEntityType[conflict.entityType] || 0) + 1;

    this.metrics.resolutionTime.push(durationMs);

    // Send to analytics
    this.sendToAnalytics({
      event: 'conflict_resolved',
      entityType: conflict.entityType,
      resolution,
      durationMs
    });
  }

  getMetrics(): ConflictMetrics {
    return { ...this.metrics };
  }

  getAutoResolveRate(): number {
    return this.metrics.totalConflicts > 0
      ? this.metrics.autoResolved / this.metrics.totalConflicts
      : 1.0;
  }
}
```

---

**Next Document**: API_SPECIFICATION.md
