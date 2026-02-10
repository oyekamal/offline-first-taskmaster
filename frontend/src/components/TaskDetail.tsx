/**
 * TaskDetail - Modal for viewing and editing task details
 */

import { useState } from 'react';
import { Task, UpdateTaskInput } from '../types';
import { useTask, useTaskMutations } from '../hooks';
import { TaskForm } from './TaskForm';
import { CommentSection } from './CommentSection';
import { formatDateTime } from '../utils/dateFormat';

interface TaskDetailProps {
  taskId: string;
  onClose: () => void;
}

export function TaskDetail({ taskId, onClose }: TaskDetailProps) {
  const { task, isLoading: taskLoading } = useTask(taskId);
  const { updateTask, deleteTask, isLoading } = useTaskMutations();
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Catch any rendering errors
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h3 className="text-lg font-bold text-red-600 mb-4">Error Loading Task</h3>
          <p className="text-gray-700 mb-4">{error.message}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!task && !taskLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Task Not Found</h3>
          <p className="text-gray-700 mb-4">The task you're looking for doesn't exist or has been deleted.</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!task || taskLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      </div>
    );
  }

  const handleUpdate = async (data: UpdateTaskInput) => {
    try {
      const result = await updateTask(taskId, data);
      if (result) {
        setIsEditing(false);
      }
    } catch (err) {
      setError(err as Error);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this task?')) {
      try {
        const result = await deleteTask(taskId);
        if (result) {
          onClose();
        }
      } catch (err) {
        setError(err as Error);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gray-50 border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900">Task Details</h2>
            {/* Dynamic sync status badges */}
            {task._sync_status === 'pending' && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                Pending Sync
              </span>
            )}
            {task._sync_status === 'syncing' && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Syncing...
              </span>
            )}
            {task._sync_status === 'error' && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                Sync Error
              </span>
            )}
            {task._sync_status === 'synced' && !task._conflict && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Synced
              </span>
            )}
            {task._conflict && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Conflict
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isEditing ? (
            <TaskForm
              task={task}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isLoading={isLoading}
            />
          ) : (
            <div className="space-y-6">
              {/* Task Info */}
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{task.title}</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
                    {task.status.replace('_', ' ')}
                  </span>
                  <span className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                    {task.priority}
                  </span>
                  {task.due_date && (
                    <span className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full">
                      Due: {formatDateTime(task.due_date)}
                    </span>
                  )}
                  {task.assigned_to_name && (
                    <span className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full">
                      Assigned to: {task.assigned_to_name}
                    </span>
                  )}
                </div>
                {task.description && (
                  <div className="prose max-w-none">
                    <p className="text-gray-700 whitespace-pre-wrap">{task.description}</p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {task.tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {task.tags.map(tag => (
                      <span key={tag} className="text-sm bg-gray-100 text-gray-600 px-3 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Metadata</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Created:</span>
                    <span className="ml-2 text-gray-900">{formatDateTime(task.created_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Updated:</span>
                    <span className="ml-2 text-gray-900">{formatDateTime(task.updated_at)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Version:</span>
                    <span className="ml-2 text-gray-900">{task.version}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Position:</span>
                    <span className="ml-2 text-gray-900">{Number(task.position).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Comments */}
              <div className="border-t pt-6">
                <CommentSection taskId={taskId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
