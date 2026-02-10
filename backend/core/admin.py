"""
Django admin configuration for core models.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import Organization, User, Device, Project


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    """Admin interface for Organization model."""
    list_display = ['name', 'slug', 'storage_used_mb', 'storage_quota_mb', 'created_at']
    list_filter = ['created_at']
    search_fields = ['name', 'slug']
    readonly_fields = ['id', 'created_at', 'updated_at', 'storage_used_mb']
    fieldsets = (
        (None, {
            'fields': ('id', 'name', 'slug')
        }),
        ('Storage', {
            'fields': ('storage_quota_mb', 'storage_used_mb')
        }),
        ('Settings', {
            'fields': ('settings',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'deleted_at')
        }),
    )


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Admin interface for User model."""
    list_display = ['email', 'name', 'organization', 'role', 'is_active', 'last_seen_at']
    list_filter = ['role', 'is_active', 'organization', 'created_at']
    search_fields = ['email', 'name']
    readonly_fields = ['id', 'created_at', 'updated_at', 'last_seen_at', 'last_login']

    fieldsets = (
        (None, {
            'fields': ('id', 'email', 'password')
        }),
        ('Personal Info', {
            'fields': ('name', 'avatar_url')
        }),
        ('Organization', {
            'fields': ('organization', 'role')
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')
        }),
        ('Timestamps', {
            'fields': ('last_login', 'last_seen_at', 'created_at', 'updated_at', 'deleted_at')
        }),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'name', 'organization', 'password1', 'password2', 'role'),
        }),
    )

    ordering = ['email']


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    """Admin interface for Device model."""
    list_display = ['device_name', 'user', 'device_fingerprint', 'is_active', 'last_sync_at']
    list_filter = ['is_active', 'created_at', 'last_sync_at']
    search_fields = ['device_name', 'device_fingerprint', 'user__email']
    readonly_fields = ['id', 'created_at', 'updated_at', 'last_sync_at']
    fieldsets = (
        (None, {
            'fields': ('id', 'user', 'device_name', 'device_fingerprint')
        }),
        ('Sync State', {
            'fields': ('vector_clock', 'last_sync_at')
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    """Admin interface for Project model."""
    list_display = ['name', 'organization', 'color', 'is_archived', 'created_by', 'created_at']
    list_filter = ['is_archived', 'organization', 'created_at']
    search_fields = ['name', 'description']
    readonly_fields = ['id', 'created_at', 'updated_at']
    fieldsets = (
        (None, {
            'fields': ('id', 'organization', 'name', 'description', 'color')
        }),
        ('Status', {
            'fields': ('is_archived',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at', 'deleted_at')
        }),
    )
