"""
Sync-related models: SyncLog, Conflict, Tombstone
"""
import uuid
from django.db import models
from django.utils import timezone
from core.models import Organization, User, Device


class SyncLog(models.Model):
    """
    Tracks synchronization events for debugging and monitoring.

    Attributes:
        id: UUID primary key
        device: Foreign key to Device (syncing device)
        user: Foreign key to User (device owner)
        sync_type: Type of sync (push, pull, conflict)
        entities_pushed: Number of entities sent
        entities_pulled: Number of entities received
        conflicts_detected: Number of conflicts found
        conflicts_resolved: Auto-resolved conflicts
        duration_ms: Sync duration in milliseconds
        status: Sync status (success, partial, failed)
        error_message: Error details if failed
        metadata: Additional context (JSONB)
        created_at: Sync start time
        completed_at: Sync completion time
    """
    SYNC_TYPE_CHOICES = [
        ('push', 'Push'),
        ('pull', 'Pull'),
        ('conflict', 'Conflict'),
    ]

    STATUS_CHOICES = [
        ('success', 'Success'),
        ('partial', 'Partial'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='sync_logs')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sync_logs')

    sync_type = models.CharField(max_length=50, choices=SYNC_TYPE_CHOICES)
    entities_pushed = models.IntegerField(default=0)
    entities_pulled = models.IntegerField(default=0)
    conflicts_detected = models.IntegerField(default=0)
    conflicts_resolved = models.IntegerField(default=0)
    duration_ms = models.IntegerField(null=True, blank=True)

    status = models.CharField(max_length=50, choices=STATUS_CHOICES)
    error_message = models.TextField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'sync_logs'
        indexes = [
            models.Index(fields=['device']),
            models.Index(fields=['user']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['status']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.sync_type} sync by {self.user.name} at {self.created_at}"

    def complete(self, status='success', error_message=None):
        """
        Mark sync as completed.

        Args:
            status: Sync status (success, partial, failed)
            error_message: Error message if failed
        """
        self.completed_at = timezone.now()
        self.status = status
        self.error_message = error_message
        if self.created_at:
            self.duration_ms = int((self.completed_at - self.created_at).total_seconds() * 1000)
        self.save(update_fields=['completed_at', 'status', 'error_message', 'duration_ms'])


class Conflict(models.Model):
    """
    Stores unresolved conflicts requiring user intervention.

    Attributes:
        id: UUID primary key
        entity_type: Type of entity (task, comment, attachment)
        entity_id: UUID of conflicting entity
        device: Foreign key to Device (detected conflict)
        user: Foreign key to User (needs to resolve)
        local_version: Client version of entity (JSONB)
        server_version: Server version of entity (JSONB)
        local_vector_clock: Local causality
        server_vector_clock: Server causality
        conflict_reason: Human-readable explanation
        resolution_strategy: How resolved (manual, auto_merge, local_wins, server_wins)
        resolved_version: Final resolved state (JSONB)
        resolved_by: Foreign key to User (who resolved)
        created_at: Conflict detection time
        resolved_at: Resolution time
    """
    ENTITY_TYPE_CHOICES = [
        ('task', 'Task'),
        ('comment', 'Comment'),
        ('attachment', 'Attachment'),
    ]

    RESOLUTION_STRATEGY_CHOICES = [
        ('manual', 'Manual'),
        ('auto_merge', 'Auto Merge'),
        ('local_wins', 'Local Wins'),
        ('server_wins', 'Server Wins'),
        ('auto_resolved', 'Auto Resolved'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity_type = models.CharField(max_length=50, choices=ENTITY_TYPE_CHOICES)
    entity_id = models.UUIDField()

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='conflicts')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='conflicts')

    local_version = models.JSONField()
    server_version = models.JSONField()
    local_vector_clock = models.JSONField()
    server_vector_clock = models.JSONField()

    conflict_reason = models.TextField(null=True, blank=True)
    resolution_strategy = models.CharField(
        max_length=50,
        choices=RESOLUTION_STRATEGY_CHOICES,
        null=True,
        blank=True
    )
    resolved_version = models.JSONField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_conflicts'
    )

    created_at = models.DateTimeField(default=timezone.now)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'conflicts'
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['user']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['resolved_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.entity_type} conflict for {self.entity_id}"

    def is_resolved(self) -> bool:
        """Check if conflict is resolved."""
        return self.resolved_at is not None

    def resolve(self, resolved_by: User, strategy: str, resolved_version: dict):
        """
        Mark conflict as resolved.

        Args:
            resolved_by: User who resolved the conflict
            strategy: Resolution strategy used
            resolved_version: Final resolved entity state
        """
        self.resolved_by = resolved_by
        self.resolution_strategy = strategy
        self.resolved_version = resolved_version
        self.resolved_at = timezone.now()
        self.save(update_fields=[
            'resolved_by',
            'resolution_strategy',
            'resolved_version',
            'resolved_at'
        ])


class Tombstone(models.Model):
    """
    Tracks deleted entities for proper sync propagation.

    Tombstones ensure that deletions are properly synchronized across devices.
    They expire after 90 days to prevent indefinite growth.

    Attributes:
        id: UUID primary key
        entity_type: Type of deleted entity (task, comment, attachment)
        entity_id: UUID of deleted entity
        organization: Foreign key to Organization
        deleted_by: Foreign key to User (who deleted)
        deleted_from_device: Foreign key to Device (deletion device)
        vector_clock: Deletion causality
        entity_snapshot: Pre-deletion state (JSONB)
        created_at: Deletion time
        expires_at: Tombstone expiry (90 days)
    """
    ENTITY_TYPE_CHOICES = [
        ('task', 'Task'),
        ('comment', 'Comment'),
        ('attachment', 'Attachment'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entity_type = models.CharField(max_length=50, choices=ENTITY_TYPE_CHOICES)
    entity_id = models.UUIDField()

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='tombstones'
    )
    deleted_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tombstones')
    deleted_from_device = models.ForeignKey(
        Device,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tombstones'
    )

    vector_clock = models.JSONField()
    entity_snapshot = models.JSONField(null=True, blank=True)

    created_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'tombstones'
        indexes = [
            models.Index(fields=['entity_type', 'entity_id']),
            models.Index(fields=['organization']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['expires_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Tombstone for {self.entity_type} {self.entity_id}"

    def save(self, *args, **kwargs):
        """Override save to set expiry date."""
        if not self.expires_at:
            from datetime import timedelta
            from django.conf import settings
            expiry_days = getattr(settings, 'TOMBSTONE_EXPIRY_DAYS', 90)
            self.expires_at = self.created_at + timedelta(days=expiry_days)
        super().save(*args, **kwargs)

    @classmethod
    def cleanup_expired(cls):
        """Delete expired tombstones."""
        now = timezone.now()
        deleted_count, _ = cls.objects.filter(expires_at__lt=now).delete()
        return deleted_count
