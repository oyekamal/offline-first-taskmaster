/**
 * useComments Hook - React hook for comment operations
 *
 * Features:
 * - Live queries for task comments
 * - Threading support (parent-child relationships)
 * - CRUD operations with optimistic updates
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { commentRepository } from '../db/repositories/CommentRepository';
import {
  Comment,
  CreateCommentInput,
  UpdateCommentInput
} from '../types';
import toast from 'react-hot-toast';

/**
 * Hook for fetching comments for a task
 */
export function useComments(taskId: string | null) {
  const comments = useLiveQuery(
    () => (taskId ? commentRepository.getByTask(taskId) : Promise.resolve([])),
    [taskId],
    []
  );

  return {
    comments: comments || [],
    isLoading: comments === undefined
  };
}

/**
 * Hook for threaded comments
 */
export function useThreadedComments(taskId: string | null) {
  const comments = useLiveQuery(
    () => (taskId ? commentRepository.getThreaded(taskId) : Promise.resolve([])),
    [taskId],
    []
  );

  return {
    comments: comments || [],
    isLoading: comments === undefined
  };
}

/**
 * Hook for comment mutations
 */
export function useCommentMutations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Default user info (in a real app, get from auth context)
  const currentUser = {
    id: localStorage.getItem('user_id') || 'local-user',
    name: localStorage.getItem('user_name') || 'Local User',
    avatar_url: localStorage.getItem('user_avatar') || undefined
  };

  const createComment = async (input: CreateCommentInput): Promise<Comment | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const comment = await commentRepository.create(input, currentUser);
      toast.success('Comment added successfully');
      return comment;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to add comment: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateComment = async (id: string, updates: UpdateCommentInput): Promise<Comment | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const comment = await commentRepository.update(id, updates);
      toast.success('Comment updated successfully');
      return comment;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to update comment: ${error.message}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteComment = async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await commentRepository.delete(id);
      toast.success('Comment deleted successfully');
      return true;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast.error(`Failed to delete comment: ${error.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createComment,
    updateComment,
    deleteComment,
    isLoading,
    error
  };
}

/**
 * Hook for single comment
 */
export function useComment(id: string | null) {
  const comment = useLiveQuery(
    () => (id ? commentRepository.get(id) : Promise.resolve(undefined)),
    [id]
  );

  return {
    comment: comment || null,
    isLoading: comment === undefined && id !== null
  };
}

/**
 * Hook for comment replies
 */
export function useCommentReplies(parentId: string | null) {
  const replies = useLiveQuery(
    () => (parentId ? commentRepository.getReplies(parentId) : Promise.resolve([])),
    [parentId],
    []
  );

  return {
    replies: replies || [],
    isLoading: replies === undefined
  };
}
