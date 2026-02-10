/**
 * CommentSection - Displays and manages comments for a task
 */

import { useState } from 'react';
import { Comment } from '../types';
import { useComments, useCommentMutations } from '../hooks';
import { formatRelativeTime } from '../utils/dateFormat';
import ReactMarkdown from 'react-markdown';

interface CommentSectionProps {
  taskId: string;
}

export function CommentSection({ taskId }: CommentSectionProps) {
  const { comments, isLoading } = useComments(taskId);
  const { createComment, updateComment, deleteComment, isLoading: isMutating } = useCommentMutations();
  const [newCommentContent, setNewCommentContent] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);

  const handleCreateComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentContent.trim()) return;

    const result = await createComment({
      task: taskId,
      content: newCommentContent,
      parent: replyToId
    });

    if (result) {
      setNewCommentContent('');
      setReplyToId(null);
    }
  };

  const handleUpdateComment = async (commentId: string) => {
    if (!editContent.trim()) return;

    const result = await updateComment(commentId, { content: editContent });
    if (result) {
      setEditingCommentId(null);
      setEditContent('');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      await deleteComment(commentId);
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditContent('');
  };

  const startReply = (commentId: string) => {
    setReplyToId(commentId);
  };

  const cancelReply = () => {
    setReplyToId(null);
  };

  // Organize comments into threads
  const rootComments = comments.filter(c => !c.parent);
  const getReplies = (parentId: string) => comments.filter(c => c.parent === parentId);

  const renderComment = (comment: Comment, depth = 0) => {
    const isEditing = editingCommentId === comment.id;
    const replies = getReplies(comment.id);

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-8 mt-4' : 'mt-4'}`}>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                {comment.user_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="font-medium text-sm text-gray-900">{comment.user_name}</div>
                <div className="text-xs text-gray-500">
                  {formatRelativeTime(comment.created_at)}
                  {comment.is_edited && ' (edited)'}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {comment._local_only && (
                <span className="text-xs text-yellow-600" title="Not synced">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </span>
              )}
              <button
                onClick={() => startEdit(comment)}
                className="text-xs text-gray-500 hover:text-blue-600"
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteComment(comment.id)}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Content */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdateComment(comment.id)}
                  disabled={isMutating}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown>{comment.content}</ReactMarkdown>
            </div>
          )}

          {/* Reply button */}
          {!isEditing && depth === 0 && (
            <button
              onClick={() => startReply(comment.id)}
              className="text-xs text-gray-500 hover:text-blue-600 mt-2"
            >
              Reply
            </button>
          )}
        </div>

        {/* Replies */}
        {replies.map(reply => renderComment(reply, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        Comments ({comments.length})
      </h3>

      {/* New comment form */}
      <form onSubmit={handleCreateComment} className="space-y-2">
        {replyToId && (
          <div className="text-sm text-gray-600 flex items-center gap-2">
            Replying to comment
            <button
              type="button"
              onClick={cancelReply}
              className="text-blue-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
        <textarea
          value={newCommentContent}
          onChange={e => setNewCommentContent(e.target.value)}
          placeholder="Write a comment... (Markdown supported)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isMutating || !newCommentContent.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMutating ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>

      {/* Comments list */}
      {isLoading && comments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No comments yet. Be the first to comment!
        </div>
      ) : (
        <div className="space-y-0">
          {rootComments.map(comment => renderComment(comment))}
        </div>
      )}
    </div>
  );
}
