/**
 * useTasks Hook - React hook for task operations with live updates
 *
 * Features:
 * - Live queries that auto-update on database changes
 * - CRUD operations with optimistic updates
 * - Filtering and sorting
 * - Loading and error states
 */

import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { taskRepository } from '../db/repositories/TaskRepository';
import {
  Task,
  TaskFilters,
  TaskOrderBy,
  CreateTaskInput,
  UpdateTaskInput
} from '../types';
import toast from 'react-hot-toast';

/**
 * Main hook for task list with live updates
 */
export function useTasks(
  filters?: TaskFilters,
  orderBy: TaskOrderBy = 'position',
  limit = 50
) {
  const tasks = useLiveQuery(
    () => taskRepository.list(filters, orderBy, limit),
    [JSON.stringify(filters), orderBy, limit],
    []
  );

  const isLoading = tasks === undefined;

  return {
    tasks: tasks || [],
    isLoading,
    refresh: () => taskRepository.list(filters, orderBy, limit)
  };
}

/**
 * Hook for a single task with live updates
 */
export function useTask(id: string | null) {
  const task = useLiveQuery(
    () => (id ? taskRepository.get(id) : Promise.resolve(undefined)),
    [id]
  );

  return {
    task: task || null,
    isLoading: task === undefined && id !== null
  };
}

/**
 * Hook for task mutations (create, update, delete)
 */
export function useTaskMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createTask = async (input: CreateTaskInput): Promise<Task | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const task = await taskRepository.create(input);
      toast.success('Task created successfully');
      return task;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to create task: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateTask = async (id: string, updates: UpdateTaskInput): Promise<Task | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const task = await taskRepository.update(id, updates);
      toast.success('Task updated successfully');
      return task;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to update task: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteTask = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await taskRepository.delete(id);
      toast.success('Task deleted successfully');
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to delete task: ${error.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePosition = async (id: string, newPosition: number): Promise<boolean> => {
    try {
      await taskRepository.updatePosition(id, newPosition);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to reorder task: ${error.message}`);
      return false;
    }
  };

  const bulkUpdate = async (ids: string[], updates: UpdateTaskInput): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await taskRepository.bulkUpdate(ids, updates);
      toast.success(`${ids.length} tasks updated successfully`);
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to update tasks: ${error.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createTask,
    updateTask,
    deleteTask,
    updatePosition,
    bulkUpdate,
    isLoading,
    error
  };
}

/**
 * Hook for task statistics
 */
export function useTaskStats(filters?: TaskFilters) {
  const [stats, setStats] = useState({
    total: 0,
    todo: 0,
    in_progress: 0,
    done: 0,
    blocked: 0,
    overdue: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [total, todo, inProgress, done, blocked, overdue] = await Promise.all([
        taskRepository.count(filters),
        taskRepository.count({ ...filters, status: 'todo' }),
        taskRepository.count({ ...filters, status: 'in_progress' }),
        taskRepository.count({ ...filters, status: 'done' }),
        taskRepository.count({ ...filters, status: 'blocked' }),
        taskRepository.getOverdue().then(tasks => tasks.length)
      ]);

      setStats({
        total,
        todo,
        in_progress: inProgress,
        done,
        blocked,
        overdue
      });
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [filters]);

  return stats;
}

/**
 * Hook for due soon tasks
 */
export function useDueSoonTasks(days = 7) {
  const tasks = useLiveQuery(
    () => taskRepository.getDueSoon(days),
    [days],
    []
  );

  return {
    tasks: tasks || [],
    isLoading: tasks === undefined
  };
}

/**
 * Hook for overdue tasks
 */
export function useOverdueTasks() {
  const tasks = useLiveQuery(
    () => taskRepository.getOverdue(),
    [],
    []
  );

  return {
    tasks: tasks || [],
    isLoading: tasks === undefined
  };
}

/**
 * Hook for task search
 */
export function useTaskSearch(query: string, limit = 20) {
  const [results, setResults] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const timeoutId = setTimeout(async () => {
      const searchResults = await taskRepository.search(query, limit);
      setResults(searchResults);
      setIsLoading(false);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [query, limit]);

  return { results, isLoading };
}
