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
  const { task } = useTask(taskId);
  const { updateTask, deleteTask, isLoading } = useTaskMutations();
  const [isEditing, setIsEditing] = useState(false);

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      </div>
    );
  }

  const handleUpdate = async (data: UpdateTaskInput) => {
    const result = await updateTask(taskId, data);
    if (result) {
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this task?')) {
      const result = await deleteTask(taskId);
      if (result) {
        onClose();
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
            {task._local_only && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                Not Synced
              </span>
            )}
            {task._conflict && (
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
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
                    <span className="ml-2 text-gray-900">{task.position.toFixed(2)}</span>
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
