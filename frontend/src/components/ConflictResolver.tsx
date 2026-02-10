/**
 * ConflictResolver - Modal for resolving sync conflicts
 */

import { useState } from 'react';
import { ConflictResolution, Task, Comment } from '../types';
import { formatDateTime } from '../utils/dateFormat';

interface ConflictResolverProps {
  conflicts: ConflictResolution[];
  onResolve: (resolution: ConflictResolution) => void;
  onDismiss: (conflictId: string) => void;
}

export function ConflictResolver({ conflicts, onResolve, onDismiss }: ConflictResolverProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (conflicts.length === 0) return null;

  const conflict = conflicts[currentIndex];
  const isTask = conflict.entity_type === 'task';

  const handleResolve = (resolution: 'use_local' | 'use_server') => {
    onResolve({ ...conflict, resolution });
    if (currentIndex < conflicts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const renderTaskDiff = (local: Task, server: Task) => {
    const fields = ['title', 'description', 'status', 'priority', 'due_date', 'assigned_to_name'];
    const changes = fields.filter(field => (local as any)[field] !== (server as any)[field]);

    return (
      <div className="space-y-4">
        {changes.map(field => (
          <div key={field} className="border-b pb-3">
            <div className="text-sm font-medium text-gray-700 capitalize mb-2">
              {field.replace('_', ' ')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-xs text-blue-600 font-medium mb-1">Your Version</div>
                <div className="text-sm">{String((local as any)[field] || 'Not set')}</div>
              </div>
              <div className="bg-green-50 p-3 rounded">
                <div className="text-xs text-green-600 font-medium mb-1">Server Version</div>
                <div className="text-sm">{String((server as any)[field] || 'Not set')}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderCommentDiff = (local: Comment, server: Comment) => {
    return (
      <div className="space-y-4">
        <div className="border-b pb-3">
          <div className="text-sm font-medium text-gray-700 mb-2">Content</div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded">
              <div className="text-xs text-blue-600 font-medium mb-1">Your Version</div>
              <div className="text-sm whitespace-pre-wrap">{local.content}</div>
            </div>
            <div className="bg-green-50 p-3 rounded">
              <div className="text-xs text-green-600 font-medium mb-1">Server Version</div>
              <div className="text-sm whitespace-pre-wrap">{server.content}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="bg-red-50 border-b border-red-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-red-900">Sync Conflict Detected</h2>
              <p className="text-sm text-red-700 mt-1">
                This {conflict.entity_type} was modified both locally and on the server.
                Choose which version to keep.
              </p>
            </div>
            <button
              onClick={() => onDismiss(conflict.conflict_id)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {conflicts.length > 1 && (
            <div className="mt-3 text-sm text-red-700">
              Conflict {currentIndex + 1} of {conflicts.length}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4 flex items-center gap-4 text-sm text-gray-600">
            <div>
              Local: {formatDateTime((conflict.local_version as any).updated_at)}
            </div>
            <div>
              Server: {formatDateTime((conflict.server_version as any).updated_at)}
            </div>
          </div>

          {isTask
            ? renderTaskDiff(conflict.local_version as Task, conflict.server_version as Task)
            : renderCommentDiff(conflict.local_version as Comment, conflict.server_version as Comment)
          }
        </div>

        {/* Actions */}
        <div className="border-t bg-gray-50 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={() => handleResolve('use_local')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Keep My Version
          </button>
          <button
            onClick={() => handleResolve('use_server')}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            Keep Server Version
          </button>
          <button
            onClick={() => onDismiss(conflict.conflict_id)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
          >
            Decide Later
          </button>
        </div>
      </div>
    </div>
  );
}
