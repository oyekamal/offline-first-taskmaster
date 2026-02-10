/**
 * useOnlineStatus Hook - Detects network connectivity changes
 *
 * Features:
 * - Real-time online/offline status
 * - Event-based updates
 * - Toast notifications on status change
 */

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

export function useOnlineStatus(showNotifications = true) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (showNotifications) {
        toast.success('You are back online');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (showNotifications) {
        toast.error('You are offline. Changes will be synced when you reconnect.');
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showNotifications]);

  return isOnline;
}
