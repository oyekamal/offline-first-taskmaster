"""
Task and Comment models with vector clock support.
"""
import uuid
import hashlib
import json
from decimal import Decimal
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.utils import timezone
from core.models import Organization, User, Device, Project


class TaskManager(models.Manager):
    """Custom manager for Task model."""

    def get_queryset(self):
        """Exclude soft-deleted tasks by default."""
        return super().get_queryset().filter(deleted_at__isnull=True)

    def for_organization(self, organization):
        """Get tasks for a specific organization."""
        return self.filter(organization=organization)

    def for_user(self, user):
        """Get tasks for a specific user."""
        return self.filter(organization=user.organization)

    def assigned_to_user(self, user):
        """Get tasks assigned to a specific user."""
        return self.filter(assigned_to=user, organization=user.organization)


class Task(models.Model):
    """
    Task model with vector clock synchronization support.

    Attributes:
        id: UUID primary key
        organization: Foreign key to Organization
        project: Foreign key to Project (optional)
        title: Task title
        description: Task description (markdown)
        status: Task status (todo, in_progress, done, blocked, cancelled)
        priority: Task priority (low, medium, high, urgent)
        due_date: Due date/time
        completed_at: Completion timestamp
        position: Sort position (fractional indexing for drag-and-drop)
        created_by: Foreign key to User (creator)
        assigned_to: Foreign key to User (assigned user)
        tags: Array of tag strings
        custom_fields: JSON field for extensible metadata
        version: Optimistic locking version
        vector_clock: Vector clock for causality tracking (JSONB)
        last_modified_by: Foreign key to User (last editor)
        last_modified_device: Foreign key to Device (last editing device)
        checksum: SHA-256 content hash for change detection
        created_at: Creation time
        updated_at: Last update time
        deleted_at: Soft delete timestamp
    """
    STATUS_CHOICES = [
        ('todo', 'To Do'),
        ('in_progress', 'In Progress'),
        ('done', 'Done'),
        ('blocked', 'Blocked'),
        ('cancelled', 'Cancelled'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='tasks'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='tasks'
    )

    # Core fields
    title = models.CharField(max_length=500)
    description = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='todo')
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default='medium')
    due_date = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    position = models.DecimalField(max_digits=20, decimal_places=10, default=Decimal('1000.0'))

    # User relationships
    created_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='created_tasks'
    )
    assigned_to = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_tasks'
    )

    # Flexible fields
    tags = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)

    # Sync metadata
    version = models.IntegerField(default=1)
    vector_clock = models.JSONField(default=dict)
    last_modified_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='last_modified_tasks'
    )
    last_modified_device = models.ForeignKey(
        Device,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='last_modified_tasks'
    )
    checksum = models.CharField(max_length=64, null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = TaskManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'tasks'
        indexes = [
            models.Index(fields=['organization']),
            models.Index(fields=['project']),
            models.Index(fields=['assigned_to']),
            models.Index(fields=['status']),
            models.Index(fields=['due_date']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['deleted_at']),
            GinIndex(fields=['tags']),
            GinIndex(fields=['vector_clock']),
        ]
        constraints = [
            models.CheckConstraint(
                check=models.Q(status__in=['todo', 'in_progress', 'done', 'blocked', 'cancelled']),
                name='valid_task_status'
            ),
            models.CheckConstraint(
                check=models.Q(priority__in=['low', 'medium', 'high', 'urgent']),
                name='valid_task_priority'
            ),
        ]
        ordering = ['position', '-created_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        """Override save to calculate checksum."""
        if not self.checksum or kwargs.pop('recalculate_checksum', False):
            self.checksum = self.calculate_checksum()
        super().save(*args, **kwargs)

    def calculate_checksum(self) -> str:
        """
        Calculate SHA-256 checksum of task content.

        Returns:
            Hexadecimal checksum string
        """
        content = {
            'title': self.title,
            'description': self.description or '',
            'status': self.status,
            'priority': self.priority,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'assigned_to': str(self.assigned_to_id) if self.assigned_to_id else None,
            'tags': sorted(self.tags) if self.tags else [],
            'custom_fields': self.custom_fields,
        }
        content_str = json.dumps(content, sort_keys=True)
        return hashlib.sha256(content_str.encode()).hexdigest()

    def soft_delete(self):
        """Soft delete the task."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])

    def increment_vector_clock(self, device_id: str):
        """
        Increment vector clock for the given device.

        Args:
            device_id: UUID string of the device making the change
        """
        if not isinstance(self.vector_clock, dict):
            self.vector_clock = {}

        current_value = self.vector_clock.get(str(device_id), 0)
        self.vector_clock[str(device_id)] = current_value + 1

    def increment_version(self):
        """Increment the version for optimistic locking."""
        self.version += 1


class CommentManager(models.Manager):
    """Custom manager for Comment model."""

    def get_queryset(self):
        """Exclude soft-deleted comments by default."""
        return super().get_queryset().filter(deleted_at__isnull=True)

    def for_task(self, task):
        """Get comments for a specific task."""
        return self.filter(task=task).select_related('user')


class Comment(models.Model):
    """
    Comment model for task discussions.

    Attributes:
        id: UUID primary key
        task: Foreign key to Task
        user: Foreign key to User (author)
        content: Comment text (markdown)
        parent: Foreign key to Comment (for threading)
        version: Edit version number
        vector_clock: Vector clock for causality tracking (JSONB)
        last_modified_by: Foreign key to User (last editor)
        last_modified_device: Foreign key to Device (last editing device)
        is_edited: Edit indicator
        created_at: Creation time
        updated_at: Last update time
        deleted_at: Soft delete timestamp
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='comments')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='comments')
    content = models.TextField()
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='replies'
    )

    # Sync metadata
    version = models.IntegerField(default=1)
    vector_clock = models.JSONField(default=dict)
    last_modified_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='last_modified_comments'
    )
    last_modified_device = models.ForeignKey(
        Device,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='last_modified_comments'
    )
    is_edited = models.BooleanField(default=False)

    # Timestamps
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = CommentManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'comments'
        indexes = [
            models.Index(fields=['task']),
            models.Index(fields=['user']),
            models.Index(fields=['parent']),
            models.Index(fields=['updated_at']),
            models.Index(fields=['deleted_at']),
        ]
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.user.name} on {self.task.title}"

    def soft_delete(self):
        """Soft delete the comment."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])

    def increment_vector_clock(self, device_id: str):
        """
        Increment vector clock for the given device.

        Args:
            device_id: UUID string of the device making the change
        """
        if not isinstance(self.vector_clock, dict):
            self.vector_clock = {}

        current_value = self.vector_clock.get(str(device_id), 0)
        self.vector_clock[str(device_id)] = current_value + 1

    def increment_version(self):
        """Increment the version for optimistic locking."""
        self.version += 1


class TaskHistory(models.Model):
    """
    Complete audit trail of task changes.

    Attributes:
        id: UUID primary key
        task: Foreign key to Task
        user: Foreign key to User (who made change)
        device: Foreign key to Device (device that made change)
        change_type: Type of change (created, updated, deleted, restored)
        changes: JSON diff of changes
        previous_state: Full previous state (JSONB)
        vector_clock: Change causality
        created_at: Change timestamp
    """
    CHANGE_TYPE_CHOICES = [
        ('created', 'Created'),
        ('updated', 'Updated'),
        ('deleted', 'Deleted'),
        ('restored', 'Restored'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='history')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='task_history')
    device = models.ForeignKey(
        Device,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='task_history'
    )

    change_type = models.CharField(max_length=50, choices=CHANGE_TYPE_CHOICES)
    changes = models.JSONField()
    previous_state = models.JSONField(null=True, blank=True)
    vector_clock = models.JSONField()

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'task_history'
        indexes = [
            models.Index(fields=['task']),
            models.Index(fields=['user']),
            models.Index(fields=['-created_at']),
            models.Index(fields=['change_type']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.change_type} by {self.user.name} at {self.created_at}"
