/**
 * useStorageQuota - React hook for storage quota monitoring
 */

import { useEffect, useState } from 'react';
import { storageManager, StorageQuotaInfo, StorageManager } from '../services/storageManager';

export function useStorageQuota() {
  const [quotaInfo, setQuotaInfo] = useState<StorageQuotaInfo>({
    usage: 0,
    quota: 0,
    percentage: 0,
    level: 'ok'
  });
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  useEffect(() => {
    const unsubscribe = storageManager.onQuotaChange(setQuotaInfo);
    return unsubscribe;
  }, []);

  const cleanup = async (): Promise<number> => {
    setIsCleaningUp(true);
    try {
      const count = await storageManager.cleanupOldSyncedData();
      // Refresh quota info after cleanup
      const newInfo = await storageManager.getQuotaInfo();
      setQuotaInfo(newInfo);
      return count;
    } finally {
      setIsCleaningUp(false);
    }
  };

  return {
    quotaInfo,
    isCleaningUp,
    cleanup,
    usageFormatted: StorageManager.formatBytes(quotaInfo.usage),
    quotaFormatted: StorageManager.formatBytes(quotaInfo.quota),
    isWarning: quotaInfo.level === 'warning',
    isCritical: quotaInfo.level === 'critical',
    showWarning: quotaInfo.level !== 'ok'
  };
}
