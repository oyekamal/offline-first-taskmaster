/**
 * SyncStatusIndicator - Shows sync status and allows manual sync
 */

import { useSync } from '../hooks';
import { formatRelativeTime } from '../utils/dateFormat';

export function SyncStatusIndicator() {
  const { status, sync, isSyncing, pendingCount, isOnline, lastSyncAt } = useSync();

  const getStatusColor = () => {
    if (!isOnline) return 'text-gray-400';
    if (isSyncing) return 'text-blue-500';
    if (pendingCount > 0) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = () => {
    if (isSyncing) {
      return (
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      );
    }

    if (!isOnline) {
      return (
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
        </svg>
      );
    }

    return (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    );
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (isSyncing) return 'Syncing...';
    if (pendingCount > 0) return `${pendingCount} pending`;
    return 'Synced';
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200">
      <button
        onClick={() => sync()}
        disabled={isSyncing || !isOnline}
        className={`flex items-center gap-2 ${getStatusColor()} hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity`}
        title={lastSyncAt ? `Last synced ${formatRelativeTime(lastSyncAt)}` : 'Never synced'}
      >
        {getStatusIcon()}
        <span className="text-sm font-medium">{getStatusText()}</span>
      </button>

      {lastSyncAt && (
        <span className="text-xs text-gray-500">
          Last: {formatRelativeTime(lastSyncAt)}
        </span>
      )}

      {status.conflict_count > 0 && (
        <span className="text-xs text-red-600 font-medium">
          {status.conflict_count} conflict{status.conflict_count > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
