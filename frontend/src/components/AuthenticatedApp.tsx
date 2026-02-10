/**
 * Authenticated App Component
 * Main app that only renders when user is authenticated
 */

import { useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { syncManager } from '../services/syncManager';
import { useSync, useTaskMutations } from '../hooks';
import { Task, TaskFilters, CreateTaskInput, TaskOrderBy } from '../types';

// Components
import { OfflineIndicator } from './OfflineIndicator';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { ConflictResolver } from './ConflictResolver';
import { TaskFilters as TaskFiltersComponent } from './TaskFilters';
import { TaskListDraggable } from './TaskListDraggable';
import { TaskListVirtualized } from './TaskListVirtualized';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';

interface AuthenticatedAppProps {
  currentUser: any;
  onLogout: () => void;
}

export function AuthenticatedApp({ currentUser, onLogout }: AuthenticatedAppProps) {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [orderBy, setOrderBy] = useState<TaskOrderBy>('position');
  const [useVirtualization, setUseVirtualization] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showFilters, setShowFilters] = useState(true);

  // Only call hooks when authenticated (this component only renders when authenticated)
  const { conflicts, resolveConflict, dismissConflict } = useSync();
  const { createTask, isLoading } = useTaskMutations();

  // Initialize sync manager once
  useEffect(() => {
    syncManager.initialize();
    return () => syncManager.destroy();
  }, []);

  const handleCreateTask = async (data: CreateTaskInput) => {
    const result = await createTask(data);
    if (result) {
      setShowCreateForm(false);
    }
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTaskId(task.id);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Toast notifications */}
      <Toaster position="top-right" />

      {/* Offline indicator */}
      <OfflineIndicator />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Task Manager</h1>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="lg:hidden px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200"
            >
              {showFilters ? 'Hide' : 'Show'} Filters
            </button>
          </div>

          <div className="flex items-center gap-3">
            {/* View mode toggle */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setUseVirtualization(false)}
                className={`px-3 py-1 text-sm rounded ${!useVirtualization ? 'bg-white shadow' : ''}`}
              >
                Drag & Drop
              </button>
              <button
                onClick={() => setUseVirtualization(true)}
                className={`px-3 py-1 text-sm rounded ${useVirtualization ? 'bg-white shadow' : ''}`}
              >
                Virtual Scroll
              </button>
            </div>

            {/* Sort order */}
            <select
              value={orderBy}
              onChange={e => setOrderBy(e.target.value as TaskOrderBy)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="position">Position</option>
              <option value="created_at">Created (Oldest)</option>
              <option value="-created_at">Created (Newest)</option>
              <option value="updated_at">Updated (Oldest)</option>
              <option value="-updated_at">Updated (Newest)</option>
              <option value="due_date">Due Date</option>
            </select>

            {/* Create button */}
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </button>

            {/* User menu */}
            <div className="flex items-center gap-3 pl-3 border-l border-gray-300">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {currentUser?.name?.[0] || 'U'}
                  </span>
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{currentUser?.name || 'User'}</p>
                  <p className="text-xs text-gray-500">{currentUser?.role || 'Member'}</p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                title="Logout"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sync status */}
        <SyncStatusIndicator />
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Filters sidebar */}
        {showFilters && (
          <div className="w-64 flex-shrink-0">
            <TaskFiltersComponent filters={filters} onChange={setFilters} />
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-hidden">
          {useVirtualization ? (
            <TaskListVirtualized
              filters={filters}
              orderBy={orderBy}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <div className="h-full overflow-y-auto p-4">
              <TaskListDraggable
                filters={filters}
                orderBy={orderBy}
                onTaskClick={handleTaskClick}
              />
            </div>
          )}
        </div>
      </div>

      {/* Create task modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Task</h2>
            <TaskForm
              onSubmit={handleCreateTask}
              onCancel={() => setShowCreateForm(false)}
              isLoading={isLoading}
            />
          </div>
        </div>
      )}

      {/* Task detail modal */}
      {selectedTaskId && (
        <TaskDetail
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}

      {/* Conflict resolver */}
      {conflicts.length > 0 && (
        <ConflictResolver
          conflicts={conflicts}
          onResolve={resolveConflict}
          onDismiss={dismissConflict}
        />
      )}
    </div>
  );
}
