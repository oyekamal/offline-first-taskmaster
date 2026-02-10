"""
Celery tasks for sync operations.
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from .models import Tombstone, SyncLog
import logging

logger = logging.getLogger(__name__)


@shared_task
def cleanup_expired_tombstones():
    """
    Clean up expired tombstones.

    This task should run daily to remove tombstones older than 90 days.
    """
    logger.info("Starting tombstone cleanup task")

    try:
        deleted_count = Tombstone.cleanup_expired()
        logger.info(f"Deleted {deleted_count} expired tombstones")
        return {
            'status': 'success',
            'deleted_count': deleted_count
        }
    except Exception as e:
        logger.error(f"Error cleaning up tombstones: {str(e)}", exc_info=True)
        return {
            'status': 'error',
            'error': str(e)
        }


@shared_task
def cleanup_old_sync_logs():
    """
    Clean up old sync logs.

    Keep logs for 30 days, then delete them.
    """
    logger.info("Starting sync log cleanup task")

    try:
        cutoff_date = timezone.now() - timedelta(days=30)
        deleted_count, _ = SyncLog.objects.filter(created_at__lt=cutoff_date).delete()
        logger.info(f"Deleted {deleted_count} old sync logs")
        return {
            'status': 'success',
            'deleted_count': deleted_count
        }
    except Exception as e:
        logger.error(f"Error cleaning up sync logs: {str(e)}", exc_info=True)
        return {
            'status': 'error',
            'error': str(e)
        }


@shared_task
def generate_sync_metrics():
    """
    Generate sync metrics for monitoring.

    Calculate average sync times, conflict rates, etc.
    """
    logger.info("Generating sync metrics")

    try:
        # Get metrics for last 24 hours
        since = timezone.now() - timedelta(hours=24)

        logs = SyncLog.objects.filter(created_at__gte=since, status='success')

        total_syncs = logs.count()
        total_conflicts = sum(log.conflicts_detected for log in logs)
        avg_duration = logs.filter(duration_ms__isnull=False).aggregate(
            avg=models.Avg('duration_ms')
        )['avg'] or 0

        metrics = {
            'total_syncs': total_syncs,
            'total_conflicts': total_conflicts,
            'conflict_rate': (total_conflicts / total_syncs * 100) if total_syncs > 0 else 0,
            'avg_sync_duration_ms': round(avg_duration, 2),
            'period': '24h'
        }

        logger.info(f"Sync metrics: {metrics}")
        return metrics

    except Exception as e:
        logger.error(f"Error generating metrics: {str(e)}", exc_info=True)
        return {
            'status': 'error',
            'error': str(e)
        }
