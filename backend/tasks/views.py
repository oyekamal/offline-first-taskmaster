"""
ViewSets for Task and Comment models.
"""
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from .models import Task, Comment, TaskHistory
from .serializers import (
    TaskSerializer, TaskListSerializer,
    CommentSerializer, TaskHistorySerializer
)
from core.permissions import IsOrganizationMember
import logging

logger = logging.getLogger(__name__)


class TaskViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Task model with sync-aware operations.

    Provides:
    - CRUD operations for tasks
    - Filtering by status, assignee, project
    - Full-text search
    - Task history retrieval
    """
    permission_classes = [IsAuthenticated, IsOrganizationMember]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'priority', 'assigned_to', 'project']
    search_fields = ['title', 'description']
    ordering_fields = ['created_at', 'updated_at', 'due_date', 'position']
    ordering = ['position', '-created_at']

    def get_queryset(self):
        """
        Get tasks for current organization with optional filters.
        """
        queryset = Task.objects.filter(
            organization=self.request.user.organization
        ).select_related(
            'created_by', 'assigned_to', 'project', 'last_modified_by'
        )

        # Filter by assigned user
        assigned_to = self.request.query_params.get('assignedTo')
        if assigned_to == 'me':
            queryset = queryset.filter(assigned_to=self.request.user)
        elif assigned_to:
            queryset = queryset.filter(assigned_to=assigned_to)

        # Filter by search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(description__icontains=search)
            )

        return queryset

    def get_serializer_class(self):
        """Use list serializer for list action."""
        if self.action == 'list':
            return TaskListSerializer
        return TaskSerializer

    def perform_create(self, serializer):
        """Create task with proper initialization."""
        serializer.save()

        # Log creation in history
        task = serializer.instance
        TaskHistory.objects.create(
            task=task,
            user=self.request.user,
            device=self._get_device(),
            change_type='created',
            changes={'created': True},
            vector_clock=task.vector_clock
        )

    def perform_update(self, serializer):
        """Update task and log changes."""
        # Store previous state
        previous_state = self._serialize_task_state(serializer.instance)

        # Perform update
        serializer.save()

        # Calculate changes
        task = serializer.instance
        current_state = self._serialize_task_state(task)
        changes = self._calculate_changes(previous_state, current_state)

        # Log update in history
        TaskHistory.objects.create(
            task=task,
            user=self.request.user,
            device=self._get_device(),
            change_type='updated',
            changes=changes,
            previous_state=previous_state,
            vector_clock=task.vector_clock
        )

    def perform_destroy(self, instance):
        """Soft delete task."""
        instance.soft_delete()

        # Log deletion in history
        TaskHistory.objects.create(
            task=instance,
            user=self.request.user,
            device=self._get_device(),
            change_type='deleted',
            changes={'deleted': True},
            vector_clock=instance.vector_clock
        )

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        """Get task change history."""
        task = self.get_object()
        history = TaskHistory.objects.filter(task=task)
        serializer = TaskHistorySerializer(history, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'])
    def comments(self, request, pk=None):
        """Get all comments for a task."""
        task = self.get_object()
        comments = Comment.objects.for_task(task)
        serializer = CommentSerializer(comments, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a soft-deleted task."""
        task = self.get_object()
        task.deleted_at = None
        task.save(update_fields=['deleted_at'])

        # Log restoration
        TaskHistory.objects.create(
            task=task,
            user=request.user,
            device=self._get_device(),
            change_type='restored',
            changes={'restored': True},
            vector_clock=task.vector_clock
        )

        serializer = self.get_serializer(task)
        return Response(serializer.data)

    def _get_device(self):
        """Get device from request header."""
        device_id = self.request.META.get('HTTP_X_DEVICE_ID')
        if device_id:
            from core.models import Device
            try:
                return Device.objects.get(id=device_id, user=self.request.user)
            except Device.DoesNotExist:
                pass
        return None

    def _serialize_task_state(self, task):
        """Serialize task state for history."""
        return {
            'title': task.title,
            'description': task.description,
            'status': task.status,
            'priority': task.priority,
            'due_date': task.due_date.isoformat() if task.due_date else None,
            'assigned_to': str(task.assigned_to_id) if task.assigned_to_id else None,
            'tags': task.tags,
            'custom_fields': task.custom_fields,
        }

    def _calculate_changes(self, old_state, new_state):
        """Calculate changes between two states."""
        changes = {}
        for key in new_state.keys():
            if old_state.get(key) != new_state.get(key):
                changes[key] = {
                    'old': old_state.get(key),
                    'new': new_state.get(key)
                }
        return changes


class CommentViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Comment model.

    Provides:
    - CRUD operations for comments
    - Filtering by task
    - Threaded comment support
    """
    serializer_class = CommentSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['task', 'user', 'parent']

    def get_queryset(self):
        """Get comments for current organization's tasks."""
        return Comment.objects.filter(
            task__organization=self.request.user.organization
        ).select_related('user', 'task', 'parent')

    def perform_destroy(self, instance):
        """Soft delete comment."""
        instance.soft_delete()
