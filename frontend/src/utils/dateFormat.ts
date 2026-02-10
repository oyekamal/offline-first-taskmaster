/**
 * Date formatting utilities
 */

import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns';

export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return 'Never';

  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return 'Invalid date';

  return formatDistanceToNow(dateObj, { addSuffix: true });
}

export function formatDate(date: string | Date | null, formatStr = 'MMM d, yyyy'): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(dateObj)) return 'Invalid date';

  return format(dateObj, formatStr);
}

export function formatDateTime(date: string | Date | null): string {
  return formatDate(date, 'MMM d, yyyy h:mm a');
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const date = parseISO(dueDate);
  return isValid(date) && date < new Date();
}
