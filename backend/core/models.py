"""
Core models: Organization, User, Device
"""
import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class OrganizationManager(models.Manager):
    """Custom manager for Organization model."""

    def get_queryset(self):
        """Exclude soft-deleted organizations by default."""
        return super().get_queryset().filter(deleted_at__isnull=True)


class Organization(models.Model):
    """
    Organization model representing a company or team.

    Attributes:
        id: UUID primary key
        name: Organization name
        slug: URL-friendly identifier
        settings: JSON field for organization settings
        storage_quota_mb: Storage limit in MB
        storage_used_mb: Current storage usage
        created_at: Creation timestamp
        updated_at: Last update timestamp
        deleted_at: Soft delete timestamp
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100, unique=True)
    settings = models.JSONField(default=dict, blank=True)
    storage_quota_mb = models.IntegerField(default=10240)  # 10GB
    storage_used_mb = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = OrganizationManager()
    all_objects = models.Manager()  # Manager that includes soft-deleted objects

    class Meta:
        db_table = 'organizations'
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['deleted_at']),
        ]
        ordering = ['name']

    def __str__(self):
        return self.name

    def soft_delete(self):
        """Soft delete the organization."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])


class UserManager(BaseUserManager):
    """Custom manager for User model."""

    def create_user(self, email, password=None, **extra_fields):
        """Create and return a regular user."""
        if not email:
            raise ValueError('Users must have an email address')

        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create and return a superuser."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True')

        # Create or get default organization if not provided
        if 'organization' not in extra_fields:
            org, created = Organization.objects.get_or_create(
                slug='default',
                defaults={
                    'name': 'Default Organization',
                    'settings': {},
                }
            )
            extra_fields['organization'] = org

        return self.create_user(email, password, **extra_fields)

    def get_queryset(self):
        """Exclude soft-deleted users by default."""
        return super().get_queryset().filter(deleted_at__isnull=True)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model extending Django's AbstractBaseUser.

    Attributes:
        id: UUID primary key
        organization: Foreign key to Organization
        email: User email (used as username)
        name: Full name
        avatar_url: Profile picture URL
        role: User role (admin, manager, member)
        is_active: Account active status
        is_staff: Django admin access
        last_seen_at: Last activity timestamp
        created_at: Account creation time
        updated_at: Last update time
        deleted_at: Soft delete timestamp
    """
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('member', 'Member'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='users'
    )
    email = models.EmailField(max_length=255, unique=True)
    name = models.CharField(max_length=255)
    avatar_url = models.URLField(max_length=500, null=True, blank=True)
    role = models.CharField(max_length=50, choices=ROLE_CHOICES, default='member')

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()
    all_objects = models.Manager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    class Meta:
        db_table = 'users'
        indexes = [
            models.Index(fields=['organization', 'email']),
            models.Index(fields=['organization']),
            models.Index(fields=['last_seen_at']),
            models.Index(fields=['deleted_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['email', 'organization'],
                condition=models.Q(deleted_at__isnull=True),
                name='unique_email_per_org'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.email})"

    def soft_delete(self):
        """Soft delete the user."""
        self.deleted_at = timezone.now()
        self.is_active = False
        self.save(update_fields=['deleted_at', 'is_active'])

    def update_last_seen(self):
        """Update last seen timestamp."""
        self.last_seen_at = timezone.now()
        self.save(update_fields=['last_seen_at'])


class DeviceManager(models.Manager):
    """Custom manager for Device model."""

    def get_queryset(self):
        """Return only active devices by default."""
        return super().get_queryset().filter(is_active=True)


class Device(models.Model):
    """
    Device model for tracking individual devices in vector clock sync.

    Attributes:
        id: UUID primary key
        user: Foreign key to User
        device_name: User-friendly device name
        device_fingerprint: Browser/device fingerprint
        last_sync_at: Last successful sync time
        vector_clock: Current vector clock state (JSONB)
        is_active: Device active status
        created_at: First registration time
        updated_at: Last update time
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='devices')
    device_name = models.CharField(max_length=255, null=True, blank=True)
    device_fingerprint = models.CharField(max_length=255)

    last_sync_at = models.DateTimeField(null=True, blank=True)
    vector_clock = models.JSONField(default=dict)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = DeviceManager()
    all_objects = models.Manager()

    class Meta:
        db_table = 'devices'
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['device_fingerprint']),
            models.Index(fields=['last_sync_at']),
        ]

    def __str__(self):
        return f"{self.device_name or 'Unknown Device'} ({self.user.name})"

    def update_vector_clock(self, new_clock: dict):
        """
        Update the device's vector clock.

        Args:
            new_clock: New vector clock dictionary
        """
        self.vector_clock = new_clock
        self.save(update_fields=['vector_clock'])

    def update_sync_time(self):
        """Update last sync timestamp."""
        self.last_sync_at = timezone.now()
        self.save(update_fields=['last_sync_at'])


class Project(models.Model):
    """
    Project model for optional task grouping.

    Attributes:
        id: UUID primary key
        organization: Foreign key to Organization
        name: Project name
        description: Project description
        color: Hex color code
        is_archived: Archive status
        created_by: Foreign key to User (creator)
        created_at: Creation time
        updated_at: Last update time
        deleted_at: Soft delete timestamp
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='projects'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    color = models.CharField(max_length=7, default='#3B82F6')
    is_archived = models.BooleanField(default=False)

    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_projects')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'projects'
        indexes = [
            models.Index(fields=['organization']),
            models.Index(fields=['is_archived']),
            models.Index(fields=['deleted_at']),
        ]
        ordering = ['name']

    def __str__(self):
        return self.name

    def soft_delete(self):
        """Soft delete the project."""
        self.deleted_at = timezone.now()
        self.save(update_fields=['deleted_at'])
