/**
 * TaskCard - Individual task card component
 */

import { Task, TaskPriority, TaskStatus } from '../types';
import { formatDate, isOverdue } from '../utils/dateFormat';
import clsx from 'clsx';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  isDragging?: boolean;
}

const priorityColors: Record<TaskPriority, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700'
};

const statusColors: Record<TaskStatus, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  blocked: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500'
};

export function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
  const overdue = isOverdue(task.due_date);

  return (
    <div
      onClick={() => onClick(task)}
      className={clsx(
        'bg-white border border-gray-200 rounded-lg p-4 cursor-pointer transition-all hover:shadow-md',
        isDragging && 'opacity-50',
        // Sync status indicators on left border
        task._conflict && 'border-l-4 border-l-red-500',
        !task._conflict && task._sync_status === 'error' && 'border-l-4 border-l-red-400',
        !task._conflict && task._sync_status === 'pending' && 'border-l-4 border-l-yellow-500',
        !task._conflict && task._sync_status === 'syncing' && 'border-l-4 border-l-blue-500'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-semibold text-gray-900 flex-1 line-clamp-2">
          {task.title}
        </h3>
        <div className="flex items-center gap-2">
          {/* Sync status indicators */}
          {task._sync_status === 'pending' && (
            <div className="text-xs text-yellow-600" title="Pending sync">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {task._sync_status === 'syncing' && (
            <div className="text-xs text-blue-600" title="Syncing...">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          {task._sync_status === 'error' && (
            <div className="text-xs text-red-600" title="Sync error - will retry">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {task._conflict && (
            <div className="text-xs text-red-600" title="Conflict - needs resolution">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          {task._sync_status === 'synced' && !task._conflict && (
            <div className="text-xs text-green-600" title="Synced">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Description preview */}
      {task.description && (
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {task.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-xs text-gray-500">+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={clsx('text-xs px-2 py-1 rounded font-medium', statusColors[task.status])}>
            {task.status.replace('_', ' ')}
          </span>
          <span className={clsx('text-xs px-2 py-1 rounded font-medium', priorityColors[task.priority])}>
            {task.priority}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500">
          {task.comment_count > 0 && (
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
              </svg>
              {task.comment_count}
            </div>
          )}

          {task.due_date && (
            <div className={clsx('flex items-center gap-1', overdue && 'text-red-600 font-medium')}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              {formatDate(task.due_date, 'MMM d')}
            </div>
          )}

          {task.assigned_to_name && (
            <div className="flex items-center gap-1" title={`Assigned to ${task.assigned_to_name}`}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span className="max-w-[100px] truncate">{task.assigned_to_name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
