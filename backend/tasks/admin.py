"""
Django admin configuration for tasks models.
"""
from django.contrib import admin
from .models import Task, Comment, TaskHistory


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    """Admin interface for Task model."""
    list_display = ['title', 'status', 'priority', 'assigned_to', 'organization', 'due_date', 'created_at']
    list_filter = ['status', 'priority', 'organization', 'created_at', 'due_date']
    search_fields = ['title', 'description']
    readonly_fields = ['id', 'checksum', 'version', 'vector_clock', 'created_at', 'updated_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        (None, {
            'fields': ('id', 'organization', 'project', 'title', 'description')
        }),
        ('Status & Priority', {
            'fields': ('status', 'priority', 'due_date', 'completed_at')
        }),
        ('Assignment', {
            'fields': ('created_by', 'assigned_to')
        }),
        ('Metadata', {
            'fields': ('tags', 'custom_fields', 'position')
        }),
        ('Sync Info', {
            'fields': ('version', 'vector_clock', 'last_modified_by', 'last_modified_device', 'checksum')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'deleted_at')
        }),
    )

    def get_queryset(self, request):
        """Include soft-deleted tasks in admin."""
        return Task.all_objects.all()


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    """Admin interface for Comment model."""
    list_display = ['get_preview', 'task', 'user', 'is_edited', 'created_at']
    list_filter = ['is_edited', 'created_at', 'task__organization']
    search_fields = ['content', 'task__title', 'user__name']
    readonly_fields = ['id', 'version', 'vector_clock', 'created_at', 'updated_at']

    fieldsets = (
        (None, {
            'fields': ('id', 'task', 'user', 'content', 'parent')
        }),
        ('Sync Info', {
            'fields': ('version', 'vector_clock', 'last_modified_by', 'last_modified_device', 'is_edited')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at', 'deleted_at')
        }),
    )

    def get_preview(self, obj):
        """Get preview of comment content."""
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    get_preview.short_description = 'Preview'

    def get_queryset(self, request):
        """Include soft-deleted comments in admin."""
        return Comment.all_objects.all()


@admin.register(TaskHistory)
class TaskHistoryAdmin(admin.ModelAdmin):
    """Admin interface for TaskHistory model."""
    list_display = ['task', 'user', 'change_type', 'created_at']
    list_filter = ['change_type', 'created_at']
    search_fields = ['task__title', 'user__name']
    readonly_fields = ['id', 'task', 'user', 'device', 'change_type', 'changes', 'previous_state', 'vector_clock', 'created_at']
    date_hierarchy = 'created_at'

    def has_add_permission(self, request):
        """Prevent manual creation of history records."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Prevent deletion of history records."""
        return False
