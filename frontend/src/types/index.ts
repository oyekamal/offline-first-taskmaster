/**
 * Core TypeScript type definitions for the offline-first task management application.
 * These types mirror the backend API structure and include additional client-side metadata.
 */

/**
 * Task status enumeration
 */
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked' | 'cancelled';

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

/**
 * Vector clock for conflict resolution
 * Maps device/user IDs to their logical clock values
 */
export type VectorClock = Record<string, number>;

/**
 * Main Task interface matching backend model
 */
export interface Task {
  id: string; // UUID
  title: string;
  description: string; // Supports markdown
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null; // ISO 8601 datetime
  position: number; // Decimal for fractional indexing
  assigned_to: string | null; // User UUID
  assigned_to_name: string | null;
  tags: string[];
  custom_fields: Record<string, any>;
  version: number;
  vector_clock: VectorClock;
  checksum: string;
  comment_count: number;
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
  deleted_at: string | null; // ISO 8601 datetime
  // Client-side metadata
  _local_only?: boolean; // True if not yet synced to server
  _conflict?: boolean; // True if sync conflict detected
  _sync_status?: SyncStatus;
}

/**
 * Comment interface for task comments with threading support
 */
export interface Comment {
  id: string; // UUID
  task: string; // Task UUID
  user: string; // User UUID
  user_name: string;
  user_avatar_url: string | null;
  content: string; // Supports markdown
  parent: string | null; // Parent comment UUID for threading
  version: number;
  vector_clock: VectorClock;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Client-side metadata
  _local_only?: boolean;
  _conflict?: boolean;
  _sync_status?: SyncStatus;
}

/**
 * Sync queue operation types
 */
export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Entity types that can be synced
 */
export type SyncEntityType = 'task' | 'comment';

/**
 * Sync status for individual items
 */
export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict' | 'error';

/**
 * Sync queue entry for offline operations
 */
export interface SyncQueueEntry {
  id: string; // UUID
  entity_type: SyncEntityType;
  entity_id: string; // UUID of the task/comment
  operation: SyncOperation;
  data: Partial<Task> | Partial<Comment>;
  vector_clock: VectorClock;
  attempt_count: number;
  last_attempt_at: string | null;
  created_at: string;
  error_message: string | null;
}

/**
 * Conflict resolution options
 */
export interface ConflictResolution {
  conflict_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  local_version: Task | Comment;
  server_version: Task | Comment;
  resolution: 'use_local' | 'use_server' | 'merge';
  merged_data?: Partial<Task> | Partial<Comment>;
}

/**
 * Task filter options for querying
 */
export interface TaskFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  assigned_to?: string;
  project?: string;
  search?: string;
  tags?: string[];
  show_deleted?: boolean;
}

/**
 * Task ordering options
 */
export type TaskOrderBy = 'position' | 'created_at' | 'updated_at' | 'due_date' | '-position' | '-created_at' | '-updated_at' | '-due_date';

/**
 * Pagination options
 */
export interface PaginationOptions {
  page: number;
  page_size: number;
}

/**
 * API response wrapper for paginated results
 */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * API error response structure
 */
export interface ApiError {
  detail?: string;
  message?: string;
  errors?: Record<string, string[]>;
  status?: number;
}

/**
 * Sync status summary
 */
export interface SyncStatusInfo {
  is_syncing: boolean;
  pending_count: number;
  conflict_count: number;
  error_count: number;
  last_sync_at: string | null;
  is_online: boolean;
}

/**
 * Task history entry
 */
export interface TaskHistory {
  id: string;
  task: string;
  user: string;
  user_name: string;
  action: string; // e.g., "created", "updated status", "assigned to"
  changes: Record<string, any>;
  created_at: string;
}

/**
 * User information (minimal for assignment)
 */
export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

/**
 * Device information for sync
 */
export interface DeviceInfo {
  device_id: string;
  last_sync_at: string;
  device_name?: string;
}

/**
 * Authentication tokens
 */
export interface AuthTokens {
  access: string;
  refresh: string;
}

/**
 * Create task input (subset of Task without server-generated fields)
 */
export type CreateTaskInput = Pick<Task, 'title' | 'description' | 'status' | 'priority'> & {
  due_date?: string | null;
  assigned_to?: string | null;
  tags?: string[];
  custom_fields?: Record<string, any>;
};

/**
 * Update task input (partial task data)
 */
export type UpdateTaskInput = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'version' | 'vector_clock' | 'checksum'>>;

/**
 * Create comment input
 */
export type CreateCommentInput = {
  task: string;
  content: string;
  parent?: string | null;
};

/**
 * Update comment input
 */
export type UpdateCommentInput = {
  content: string;
};

/**
 * Hook return type for data operations
 */
export interface UseDataResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook return type for list operations
 */
export interface UseListResult<T> {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Optimistic update metadata
 */
export interface OptimisticUpdate<T> {
  id: string;
  type: SyncOperation;
  entity: T;
  timestamp: number;
  rollback: () => void;
}
