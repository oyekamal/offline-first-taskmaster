/**
 * TaskFilters - Sidebar with filter and search controls
 */

import { TaskFilters as TaskFiltersType, TaskStatus, TaskPriority } from '../types';

interface TaskFiltersProps {
  filters: TaskFiltersType;
  onChange: (filters: TaskFiltersType) => void;
}

const statusOptions: TaskStatus[] = ['todo', 'in_progress', 'done', 'blocked', 'cancelled'];
const priorityOptions: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export function TaskFilters({ filters, onChange }: TaskFiltersProps) {
  const toggleStatus = (status: TaskStatus) => {
    const current = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onChange({ ...filters, status: updated.length > 0 ? updated : undefined });
  };

  const togglePriority = (priority: TaskPriority) => {
    const current = Array.isArray(filters.priority) ? filters.priority : filters.priority ? [filters.priority] : [];
    const updated = current.includes(priority)
      ? current.filter(p => p !== priority)
      : [...current, priority];
    onChange({ ...filters, priority: updated.length > 0 ? updated : undefined });
  };

  const clearFilters = () => {
    onChange({});
  };

  const hasFilters = filters.status || filters.priority || filters.search;

  return (
    <div className="bg-white border-r border-gray-200 p-4 space-y-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div>
        <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-2">
          Search
        </label>
        <input
          type="text"
          id="search"
          value={filters.search || ''}
          onChange={e => onChange({ ...filters, search: e.target.value || undefined })}
          placeholder="Search tasks..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Status Filter */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Status</h3>
        <div className="space-y-2">
          {statusOptions.map(status => {
            const current = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : [];
            const isSelected = current.includes(status);
            return (
              <label key={status} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleStatus(status)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 capitalize">
                  {status.replace('_', ' ')}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Priority Filter */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Priority</h3>
        <div className="space-y-2">
          {priorityOptions.map(priority => {
            const current = Array.isArray(filters.priority) ? filters.priority : filters.priority ? [filters.priority] : [];
            const isSelected = current.includes(priority);
            return (
              <label key={priority} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => togglePriority(priority)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 capitalize">
                  {priority}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
