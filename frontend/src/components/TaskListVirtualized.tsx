/**
 * TaskListVirtualized - Virtualized task list with infinite scroll
 * Uses @tanstack/react-virtual for performance with large datasets
 */

import { useRef, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Task, TaskFilters, TaskOrderBy } from '../types';
import { useTasks } from '../hooks';
import { TaskCard } from './TaskCard';

interface TaskListVirtualizedProps {
  filters?: TaskFilters;
  orderBy?: TaskOrderBy;
  onTaskClick: (task: Task) => void;
}

export function TaskListVirtualized({ filters, orderBy = 'position', onTaskClick }: TaskListVirtualizedProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [loadLimit, setLoadLimit] = useState(50);
  const { tasks, isLoading } = useTasks(filters, orderBy, loadLimit);

  // Virtual scrolling setup
  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimated height of each task card
    overscan: 5 // Render 5 items above and below visible area
  });

  // Infinite scroll - load more when near bottom
  useEffect(() => {
    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return;

    const lastItem = items[items.length - 1];
    if (lastItem && lastItem.index >= tasks.length - 10 && tasks.length === loadLimit) {
      setLoadLimit(prev => prev + 50);
    }
  }, [virtualizer.getVirtualItems(), tasks.length, loadLimit]);

  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading tasks...</p>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-gray-600 text-lg">No tasks found</p>
          <p className="text-gray-400 text-sm mt-1">Create a new task to get started</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const task = tasks[virtualRow.index];
          return (
            <div
              key={task.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              <div className="p-2">
                <TaskCard task={task} onClick={onTaskClick} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
