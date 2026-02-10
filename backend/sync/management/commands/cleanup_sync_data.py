"""
Management command to cleanup old sync data.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from sync.models import Tombstone, SyncLog


class Command(BaseCommand):
    help = 'Cleanup expired tombstones and old sync logs'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be deleted without actually deleting'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No data will be deleted'))

        # Cleanup expired tombstones
        self.stdout.write('\nCleaning up expired tombstones...')
        now = timezone.now()
        expired_tombstones = Tombstone.objects.filter(expires_at__lt=now)
        tombstone_count = expired_tombstones.count()

        if tombstone_count > 0:
            if not dry_run:
                expired_tombstones.delete()
                self.stdout.write(self.style.SUCCESS(f'Deleted {tombstone_count} expired tombstones'))
            else:
                self.stdout.write(f'Would delete {tombstone_count} expired tombstones')
        else:
            self.stdout.write('No expired tombstones found')

        # Cleanup old sync logs (older than 30 days)
        self.stdout.write('\nCleaning up old sync logs...')
        cutoff_date = now - timedelta(days=30)
        old_logs = SyncLog.objects.filter(created_at__lt=cutoff_date)
        log_count = old_logs.count()

        if log_count > 0:
            if not dry_run:
                old_logs.delete()
                self.stdout.write(self.style.SUCCESS(f'Deleted {log_count} old sync logs'))
            else:
                self.stdout.write(f'Would delete {log_count} old sync logs')
        else:
            self.stdout.write('No old sync logs found')

        # Summary
        self.stdout.write('\n' + '='*50)
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN COMPLETE - No data was deleted'))
        else:
            self.stdout.write(self.style.SUCCESS('CLEANUP COMPLETE'))
        self.stdout.write(f'Tombstones: {tombstone_count}')
        self.stdout.write(f'Sync logs: {log_count}')
