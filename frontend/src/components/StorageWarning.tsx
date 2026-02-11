/**
 * StorageWarning - Displays warning/critical banner when storage is running low
 */

import { useStorageQuota } from '../hooks/useStorageQuota';
import toast from 'react-hot-toast';

export function StorageWarning() {
  const { quotaInfo, isCleaningUp, cleanup, usageFormatted, quotaFormatted, showWarning, isCritical } = useStorageQuota();

  if (!showWarning) return null;

  const handleCleanup = async () => {
    const count = await cleanup();
    if (count > 0) {
      toast.success(`Cleaned up ${count} old items`);
    } else {
      toast('No old data to clean up', { icon: 'ℹ️' });
    }
  };

  const bgColor = isCritical ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200';
  const textColor = isCritical ? 'text-red-800' : 'text-orange-800';
  const btnColor = isCritical
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-orange-600 hover:bg-orange-700 text-white';

  return (
    <div className={`${bgColor} border-b px-4 py-2 flex items-center justify-between`}>
      <div className={`flex items-center gap-2 ${textColor}`}>
        <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-medium">
          {isCritical ? 'Storage critically full' : 'Storage running low'}:
          {' '}{usageFormatted} / {quotaFormatted} ({quotaInfo.percentage.toFixed(1)}%)
        </span>
      </div>
      <button
        onClick={handleCleanup}
        disabled={isCleaningUp}
        className={`${btnColor} px-3 py-1 rounded text-xs font-medium disabled:opacity-50 transition-colors`}
      >
        {isCleaningUp ? 'Cleaning...' : 'Clean Up'}
      </button>
    </div>
  );
}
