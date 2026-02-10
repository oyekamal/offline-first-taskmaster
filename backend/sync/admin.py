"""
Django admin configuration for sync models.
"""
from django.contrib import admin
from .models import SyncLog, Conflict, Tombstone


@admin.register(SyncLog)
class SyncLogAdmin(admin.ModelAdmin):
    """Admin interface for SyncLog model."""
    list_display = ['sync_type', 'user', 'device', 'status', 'entities_pushed', 'entities_pulled', 'conflicts_detected', 'duration_ms', 'created_at']
    list_filter = ['sync_type', 'status', 'created_at']
    search_fields = ['user__email', 'user__name', 'device__device_name']
    readonly_fields = ['id', 'device', 'user', 'sync_type', 'entities_pushed', 'entities_pulled', 'conflicts_detected', 'conflicts_resolved', 'duration_ms', 'status', 'error_message', 'metadata', 'created_at', 'completed_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        (None, {
            'fields': ('id', 'device', 'user', 'sync_type', 'status')
        }),
        ('Metrics', {
            'fields': ('entities_pushed', 'entities_pulled', 'conflicts_detected', 'conflicts_resolved', 'duration_ms')
        }),
        ('Error Info', {
            'fields': ('error_message',)
        }),
        ('Metadata', {
            'fields': ('metadata',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'completed_at')
        }),
    )

    def has_add_permission(self, request):
        """Prevent manual creation of sync logs."""
        return False


@admin.register(Conflict)
class ConflictAdmin(admin.ModelAdmin):
    """Admin interface for Conflict model."""
    list_display = ['entity_type', 'entity_id', 'user', 'is_resolved', 'resolution_strategy', 'created_at']
    list_filter = ['entity_type', 'resolution_strategy', 'created_at', 'resolved_at']
    search_fields = ['entity_id', 'user__email', 'conflict_reason']
    readonly_fields = ['id', 'entity_type', 'entity_id', 'device', 'user', 'local_version', 'server_version', 'local_vector_clock', 'server_vector_clock', 'conflict_reason', 'created_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        (None, {
            'fields': ('id', 'entity_type', 'entity_id', 'device', 'user')
        }),
        ('Versions', {
            'fields': ('local_version', 'server_version', 'local_vector_clock', 'server_vector_clock')
        }),
        ('Conflict Info', {
            'fields': ('conflict_reason',)
        }),
        ('Resolution', {
            'fields': ('resolution_strategy', 'resolved_version', 'resolved_by', 'resolved_at')
        }),
        ('Timestamps', {
            'fields': ('created_at',)
        }),
    )

    def is_resolved(self, obj):
        """Check if conflict is resolved."""
        return obj.is_resolved()
    is_resolved.boolean = True
    is_resolved.short_description = 'Resolved'


@admin.register(Tombstone)
class TombstoneAdmin(admin.ModelAdmin):
    """Admin interface for Tombstone model."""
    list_display = ['entity_type', 'entity_id', 'organization', 'deleted_by', 'created_at', 'expires_at']
    list_filter = ['entity_type', 'organization', 'created_at', 'expires_at']
    search_fields = ['entity_id', 'deleted_by__email']
    readonly_fields = ['id', 'entity_type', 'entity_id', 'organization', 'deleted_by', 'deleted_from_device', 'vector_clock', 'entity_snapshot', 'created_at', 'expires_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        (None, {
            'fields': ('id', 'entity_type', 'entity_id', 'organization')
        }),
        ('Deletion Info', {
            'fields': ('deleted_by', 'deleted_from_device', 'vector_clock')
        }),
        ('Snapshot', {
            'fields': ('entity_snapshot',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'expires_at')
        }),
    )

    def has_add_permission(self, request):
        """Prevent manual creation of tombstones."""
        return False
