"""
Views for synchronization operations.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import SimpleRateThrottle
from django.db import transaction
from django.utils import timezone
from datetime import datetime, timedelta, timezone as dt_timezone
import json
import logging
import time

from .models import SyncLog, Conflict, Tombstone
from .serializers import (
    SyncPushSerializer, SyncPushResponseSerializer,
    SyncPullSerializer, SyncPullResponseSerializer,
    ConflictDetailSerializer, ConflictResolutionSerializer,
    SyncLogSerializer
)
from .utils import (
    compare_vector_clocks, merge_vector_clocks,
    detect_conflict, get_organization_vector_clock,
    ClockRelation,
    auto_resolve_task_conflict, auto_resolve_comment_conflict
)
from tasks.models import Task, Comment
from tasks.serializers import TaskSerializer, CommentSerializer
from core.models import Device
from core.permissions import IsOrganizationMember

logger = logging.getLogger(__name__)


def _json_safe(data):
    """Convert serializer data to JSON-safe dict (handles UUID objects)."""
    return json.loads(json.dumps(data, default=str))


class ParentDeletedError(Exception):
    """Raised when a comment's parent task has been soft-deleted."""
    pass


# --- Rate Limiting Throttle Classes --- #

class SyncPushThrottle(SimpleRateThrottle):
    scope = 'sync_push'

    def get_cache_key(self, request, view):
        if request.user.is_authenticated:
            return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}
        return self.get_ident(request)


class SyncPullThrottle(SimpleRateThrottle):
    scope = 'sync_pull'

    def get_cache_key(self, request, view):
        if request.user.is_authenticated:
            return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}
        return self.get_ident(request)


class ConflictResolutionThrottle(SimpleRateThrottle):
    scope = 'conflict_resolution'

    def get_cache_key(self, request, view):
        if request.user.is_authenticated:
            return self.cache_format % {'scope': self.scope, 'ident': request.user.pk}
        return self.get_ident(request)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@throttle_classes([SyncPushThrottle])
def sync_push(request):
    """
    Handle push synchronization from client to server.

    Request format:
    {
        "deviceId": "uuid",
        "vectorClock": {"device-uuid": 42, ...},
        "timestamp": 1707580800000,
        "changes": {
            "tasks": [{"id": "uuid", "operation": "update", "data": {...}}],
            "comments": [...]
        }
    }

    Response format:
    {
        "success": true,
        "processed": 2,
        "conflicts": [...],
        "serverVectorClock": {...},
        "timestamp": 1707580900000
    }
    """
    start_time = time.time()

    # Validate request
    serializer = SyncPushSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    device_id = data['deviceId']
    client_vector_clock = data['vectorClock']
    changes = data['changes']

    # Verify device belongs to user
    try:
        device = Device.objects.get(id=device_id, user=request.user)
    except Device.DoesNotExist:
        return Response(
            {'error': 'Invalid device ID'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Create sync log
    sync_log = SyncLog.objects.create(
        device=device,
        user=request.user,
        sync_type='push',
        status='success'
    )

    conflicts = []
    processed_ids = []

    try:
        with transaction.atomic():
            # Process tasks
            if 'tasks' in changes:
                task_conflicts, task_processed = _process_task_changes(
                    changes['tasks'],
                    request.user,
                    device,
                    client_vector_clock
                )
                conflicts.extend(task_conflicts)
                processed_ids.extend(task_processed)
                sync_log.entities_pushed += len(task_processed)

            # Process comments
            if 'comments' in changes:
                comment_conflicts, comment_processed = _process_comment_changes(
                    changes['comments'],
                    request.user,
                    device,
                    client_vector_clock
                )
                conflicts.extend(comment_conflicts)
                processed_ids.extend(comment_processed)
                sync_log.entities_pushed += len(comment_processed)

            # Update device sync metadata
            device.update_vector_clock(
                merge_vector_clocks(device.vector_clock, client_vector_clock)
            )
            device.update_sync_time()

            # Update sync log
            sync_log.conflicts_detected = len(conflicts)
            sync_log.complete('success')

        # Get server vector clock
        server_vector_clock = get_organization_vector_clock(
            request.user.organization_id
        )

        response_data = {
            'success': True,
            'processed': len(processed_ids),
            'conflicts': [_format_conflict(c) for c in conflicts],
            'serverVectorClock': server_vector_clock,
            'timestamp': int(time.time() * 1000)
        }

        return Response(response_data)

    except Exception as e:
        logger.error(f"Sync push error: {str(e)}", exc_info=True)
        sync_log.complete('failed', str(e))
        return Response(
            {'error': 'Sync push failed', 'details': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def _process_task_changes(changes, user, device, client_vector_clock):
    """
    Process task changes from sync push.

    Returns:
        Tuple of (conflicts, processed_ids)
    """
    conflicts = []
    processed = []

    for change in changes:
        change_id = change['id']
        operation = change['operation']
        change_data = change['data']

        try:
            if operation == 'create':
                # Create new task
                task = _create_task(change_data, user, device)
                processed.append(str(task.id))

            elif operation == 'update':
                # Update existing task
                conflict = _update_task(change_data, user, device, client_vector_clock)
                if conflict:
                    conflicts.append(conflict)
                else:
                    processed.append(str(change_id))

            elif operation == 'delete':
                # Soft delete task
                conflict = _delete_task(change_id, change_data, user, device)
                if conflict:
                    conflicts.append(conflict)
                else:
                    processed.append(str(change_id))

        except Exception as e:
            logger.error(f"Error processing task change {change_id}: {str(e)}")
            continue

    return conflicts, processed


def _create_task(data, user, device):
    """Create a new task from sync data."""
    task = Task(
        id=data['id'],
        organization=user.organization,
        project_id=data.get('project'),
        title=data['title'],
        description=data.get('description'),
        status=data.get('status', 'todo'),
        priority=data.get('priority', 'medium'),
        due_date=_parse_timestamp(data.get('due_date')),
        position=data.get('position', 1000),
        created_by=user,
        assigned_to_id=data.get('assigned_to'),
        tags=data.get('tags', []),
        custom_fields=data.get('custom_fields', {}),
        version=data.get('version', 1),
        vector_clock=data.get('vector_clock', {}),
        last_modified_by=user,
        last_modified_device=device,
        created_at=_parse_timestamp(data.get('created_at')),
    )
    task.save()
    return task


def _update_task(data, user, device, client_vector_clock):
    """
    Update an existing task from sync data.

    Returns:
        Conflict object if conflict detected, None otherwise
    """
    task_id = data['id']

    try:
        task = Task.all_objects.get(id=task_id, organization=user.organization)
    except Task.DoesNotExist:
        # Task doesn't exist on server, create it
        _create_task(data, user, device)
        return None

    # Check for conflicts
    has_conflict, reason = detect_conflict(
        {'vector_clock': data.get('vector_clock', {})},
        {'vector_clock': task.vector_clock},
        client_vector_clock
    )

    if has_conflict:
        # Attempt auto-resolution before creating manual Conflict
        server_data = _json_safe(TaskSerializer(task).data)
        resolved_data, auto_resolved, unresolvable = auto_resolve_task_conflict(
            data, server_data
        )

        if auto_resolved:
            logger.info(f"Auto-resolved task conflict for {task_id}")
            task.title = resolved_data.get('title', task.title)
            task.description = resolved_data.get('description', task.description)
            task.status = resolved_data.get('status', task.status)
            task.priority = resolved_data.get('priority', task.priority)
            task.due_date = _parse_timestamp(resolved_data.get('due_date')) if 'due_date' in resolved_data else task.due_date
            task.assigned_to_id = resolved_data.get('assigned_to', task.assigned_to_id)
            task.tags = resolved_data.get('tags', task.tags)
            task.custom_fields = resolved_data.get('custom_fields', task.custom_fields)
            task.position = resolved_data.get('position', task.position)
            task.vector_clock = merge_vector_clocks(
                data.get('vector_clock', {}), task.vector_clock
            )
            task.version = max(data.get('version', 1), task.version) + 1
            task.last_modified_by = user
            task.last_modified_device = device
            task.save(recalculate_checksum=True)

            Conflict.objects.create(
                entity_type='task',
                entity_id=task.id,
                device=device,
                user=user,
                local_version=data,
                server_version=server_data,
                local_vector_clock=data.get('vector_clock', {}),
                server_vector_clock=task.vector_clock,
                conflict_reason=reason,
                resolution_strategy='auto_resolved',
                resolved_version=resolved_data,
                resolved_by=user,
                resolved_at=timezone.now()
            )
            return None  # No conflict to surface to client

        # Cannot auto-resolve - create manual conflict
        conflict = Conflict.objects.create(
            entity_type='task',
            entity_id=task.id,
            device=device,
            user=user,
            local_version=data,
            server_version=server_data,
            local_vector_clock=data.get('vector_clock', {}),
            server_vector_clock=task.vector_clock,
            conflict_reason=f"{reason}. Unresolvable fields: {', '.join(unresolvable)}"
        )
        return conflict

    # No conflict, apply changes
    task.title = data.get('title', task.title)
    task.description = data.get('description', task.description)
    task.status = data.get('status', task.status)
    task.priority = data.get('priority', task.priority)
    task.due_date = _parse_timestamp(data.get('due_date')) if 'due_date' in data else task.due_date
    task.assigned_to_id = data.get('assigned_to', task.assigned_to_id)
    task.tags = data.get('tags', task.tags)
    task.custom_fields = data.get('custom_fields', task.custom_fields)
    task.position = data.get('position', task.position)
    task.version = data.get('version', task.version)
    task.vector_clock = data.get('vector_clock', task.vector_clock)
    task.last_modified_by = user
    task.last_modified_device = device

    task.save(recalculate_checksum=True)
    return None


def _delete_task(task_id, data, user, device):
    """
    Soft delete a task and create tombstone.

    Returns:
        Conflict object if conflict detected, None otherwise
    """
    try:
        task = Task.objects.get(id=task_id, organization=user.organization)
    except Task.DoesNotExist:
        return None

    # Soft delete
    task.soft_delete()

    # Create tombstone
    Tombstone.objects.create(
        entity_type='task',
        entity_id=task.id,
        organization=user.organization,
        deleted_by=user,
        deleted_from_device=device,
        vector_clock=data.get('vector_clock', {}),
        entity_snapshot=_json_safe(TaskSerializer(task).data)
    )

    return None


def _process_comment_changes(changes, user, device, client_vector_clock):
    """
    Process comment changes from sync push.

    Returns:
        Tuple of (conflicts, processed_ids)
    """
    conflicts = []
    processed = []

    for change in changes:
        change_id = change['id']
        operation = change['operation']
        change_data = change['data']

        try:
            if operation == 'create':
                comment = _create_comment(change_data, user, device)
                processed.append(str(comment.id))

            elif operation == 'update':
                conflict = _update_comment(change_data, user, device, client_vector_clock)
                if conflict:
                    conflicts.append(conflict)
                else:
                    processed.append(str(change_id))

            elif operation == 'delete':
                _delete_comment(change_id, change_data, user, device)
                processed.append(str(change_id))

        except ParentDeletedError as e:
            # Parent task was deleted - mark comment as processed so
            # client removes it from sync queue (orphan cleanup)
            logger.info(f"Orphaned comment {change_id}: {str(e)}")
            processed.append(str(change_id))
        except Exception as e:
            logger.error(f"Error processing comment change {change_id}: {str(e)}")
            continue

    return conflicts, processed


def _create_comment(data, user, device):
    """Create a new comment from sync data."""
    # Check if parent task exists and isn't soft-deleted
    task_id = data.get('task')
    if task_id:
        try:
            task = Task.all_objects.get(id=task_id, organization=user.organization)
            if task.deleted_at is not None:
                raise ParentDeletedError(
                    f"Parent task {task_id} has been deleted"
                )
        except Task.DoesNotExist:
            raise ParentDeletedError(
                f"Parent task {task_id} does not exist"
            )

    comment = Comment(
        id=data['id'],
        task_id=data['task'],
        user=user,
        content=data['content'],
        parent_id=data.get('parent'),
        version=data.get('version', 1),
        vector_clock=data.get('vector_clock', {}),
        last_modified_by=user,
        last_modified_device=device,
        created_at=_parse_timestamp(data.get('created_at')),
    )
    comment.save()
    return comment


def _update_comment(data, user, device, client_vector_clock):
    """
    Update an existing comment from sync data.

    Returns:
        Conflict object if conflict detected, None otherwise
    """
    comment_id = data['id']

    try:
        comment = Comment.all_objects.get(id=comment_id)
    except Comment.DoesNotExist:
        _create_comment(data, user, device)
        return None

    # Check if parent task has been soft-deleted
    if comment.task.deleted_at is not None:
        raise ParentDeletedError(
            f"Parent task {comment.task_id} has been deleted"
        )

    # Check for conflicts
    has_conflict, reason = detect_conflict(
        {'vector_clock': data.get('vector_clock', {})},
        {'vector_clock': comment.vector_clock},
        client_vector_clock
    )

    if has_conflict:
        server_data = _json_safe(CommentSerializer(comment).data)
        resolved_data, auto_resolved, unresolvable = auto_resolve_comment_conflict(
            data, server_data
        )

        if auto_resolved:
            logger.info(f"Auto-resolved comment conflict for {comment_id}")
            comment.content = resolved_data.get('content', comment.content)
            comment.vector_clock = merge_vector_clocks(
                data.get('vector_clock', {}), comment.vector_clock
            )
            comment.version = max(data.get('version', 1), comment.version) + 1
            comment.last_modified_by = user
            comment.last_modified_device = device
            comment.is_edited = True
            comment.save()
            return None

        conflict = Conflict.objects.create(
            entity_type='comment',
            entity_id=comment.id,
            device=device,
            user=user,
            local_version=data,
            server_version=server_data,
            local_vector_clock=data.get('vector_clock', {}),
            server_vector_clock=comment.vector_clock,
            conflict_reason=f"{reason}. Unresolvable fields: {', '.join(unresolvable)}"
        )
        return conflict

    # No conflict, apply changes
    comment.content = data.get('content', comment.content)
    comment.version = data.get('version', comment.version)
    comment.vector_clock = data.get('vector_clock', comment.vector_clock)
    comment.last_modified_by = user
    comment.last_modified_device = device
    comment.is_edited = True

    comment.save()
    return None


def _delete_comment(comment_id, data, user, device):
    """Soft delete a comment and create tombstone."""
    try:
        comment = Comment.objects.get(id=comment_id)
        comment.soft_delete()

        Tombstone.objects.create(
            entity_type='comment',
            entity_id=comment.id,
            organization=user.organization,
            deleted_by=user,
            deleted_from_device=device,
            vector_clock=data.get('vector_clock', {}),
            entity_snapshot=_json_safe(CommentSerializer(comment).data)
        )
    except Comment.DoesNotExist:
        pass


@api_view(['GET'])
@permission_classes([IsAuthenticated])
@throttle_classes([SyncPullThrottle])
def sync_pull(request):
    """
    Handle pull synchronization from server to client.

    Query parameters:
    - since: Unix timestamp in milliseconds
    - limit: Max entities per type (default: 100)

    Response format:
    {
        "tasks": [...],
        "comments": [...],
        "tombstones": [...],
        "serverVectorClock": {...},
        "hasMore": false,
        "timestamp": 1707580900000
    }
    """
    # Validate query parameters
    serializer = SyncPullSerializer(data=request.query_params)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    since_timestamp = serializer.validated_data['since']
    limit = serializer.validated_data['limit']
    device_id = request.META.get('HTTP_X_DEVICE_ID')

    # Verify device
    try:
        device = Device.objects.get(id=device_id, user=request.user)
    except Device.DoesNotExist:
        return Response(
            {'error': 'Invalid device ID'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Create sync log
    sync_log = SyncLog.objects.create(
        device=device,
        user=request.user,
        sync_type='pull',
        status='success'
    )

    try:
        since_datetime = datetime.fromtimestamp(since_timestamp / 1000, tz=dt_timezone.utc)

        # Fetch tasks
        tasks = Task.all_objects.filter(
            organization=request.user.organization,
            updated_at__gt=since_datetime
        ).exclude(
            last_modified_device=device
        ).order_by('updated_at')[:limit]

        # Fetch comments
        comments = Comment.all_objects.filter(
            task__organization=request.user.organization,
            updated_at__gt=since_datetime
        ).exclude(
            last_modified_device=device
        ).order_by('updated_at')[:limit]

        # Fetch tombstones
        tombstones = Tombstone.objects.filter(
            organization=request.user.organization,
            created_at__gt=since_datetime,
            expires_at__gt=timezone.now()
        ).exclude(
            deleted_from_device=device
        ).order_by('created_at')[:limit]

        # Serialize data
        task_serializer = TaskSerializer(tasks, many=True, context={'request': request})
        comment_serializer = CommentSerializer(comments, many=True, context={'request': request})

        # Get server vector clock
        server_vector_clock = get_organization_vector_clock(request.user.organization_id)

        # Update sync log
        sync_log.entities_pulled = len(tasks) + len(comments)
        sync_log.complete('success')

        # Update device sync time
        device.update_sync_time()

        response_data = {
            'tasks': task_serializer.data,
            'comments': comment_serializer.data,
            'tombstones': [_format_tombstone(t) for t in tombstones],
            'serverVectorClock': server_vector_clock,
            'hasMore': len(tasks) == limit or len(comments) == limit,
            'timestamp': int(time.time() * 1000)
        }

        return Response(response_data)

    except Exception as e:
        logger.error(f"Sync pull error: {str(e)}", exc_info=True)
        sync_log.complete('failed', str(e))
        return Response(
            {'error': 'Sync pull failed', 'details': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


class ConflictViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing and resolving conflicts.
    """
    serializer_class = ConflictDetailSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]
    throttle_classes = [ConflictResolutionThrottle]

    def get_queryset(self):
        """Get unresolved conflicts for current user."""
        return Conflict.objects.filter(
            user=request.user,
            resolved_at__isnull=True
        )

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        """Resolve a conflict manually."""
        conflict = self.get_object()

        serializer = ConflictResolutionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        resolution_choice = serializer.validated_data['resolution']

        if resolution_choice == 'local':
            resolved_version = conflict.local_version
        elif resolution_choice == 'remote':
            resolved_version = conflict.server_version
        else:
            resolved_version = serializer.validated_data['customResolution']

        # Apply resolution
        conflict.resolve(request.user, resolution_choice, resolved_version)

        # Update entity with resolved version
        if conflict.entity_type == 'task':
            _apply_task_resolution(conflict.entity_id, resolved_version, request.user)
        elif conflict.entity_type == 'comment':
            _apply_comment_resolution(conflict.entity_id, resolved_version, request.user)

        return Response({'success': True, 'resolvedEntity': resolved_version})


def _apply_task_resolution(task_id, resolved_data, user):
    """Apply resolved task data."""
    try:
        task = Task.objects.get(id=task_id)
        # Update task fields from resolved data
        for field, value in resolved_data.items():
            if hasattr(task, field) and field not in ['id', 'organization', 'created_by', 'created_at']:
                setattr(task, field, value)
        task.last_modified_by = user
        task.save(recalculate_checksum=True)
    except Task.DoesNotExist:
        pass


def _apply_comment_resolution(comment_id, resolved_data, user):
    """Apply resolved comment data."""
    try:
        comment = Comment.objects.get(id=comment_id)
        for field, value in resolved_data.items():
            if hasattr(comment, field) and field not in ['id', 'task', 'user', 'created_at']:
                setattr(comment, field, value)
        comment.last_modified_by = user
        comment.save()
    except Comment.DoesNotExist:
        pass


def _format_conflict(conflict):
    """Format conflict for API response."""
    return {
        'entityType': conflict.entity_type,
        'entityId': str(conflict.entity_id),
        'conflictReason': conflict.conflict_reason,
        'serverVersion': conflict.server_version,
        'serverVectorClock': conflict.server_vector_clock
    }


def _format_tombstone(tombstone):
    """Format tombstone for API response."""
    return {
        'id': str(tombstone.id),
        'entity_type': tombstone.entity_type,
        'entity_id': str(tombstone.entity_id),
        'deleted_by': str(tombstone.deleted_by_id),
        'deleted_from_device': str(tombstone.deleted_from_device_id) if tombstone.deleted_from_device_id else None,
        'vector_clock': tombstone.vector_clock,
        'created_at': int(tombstone.created_at.timestamp() * 1000),
        'expires_at': int(tombstone.expires_at.timestamp() * 1000)
    }


def _parse_timestamp(timestamp_value):
    """Parse timestamp from various formats."""
    if timestamp_value is None:
        return None
    if isinstance(timestamp_value, (int, float)):
        return datetime.fromtimestamp(timestamp_value / 1000, tz=dt_timezone.utc)
    if isinstance(timestamp_value, str):
        return datetime.fromisoformat(timestamp_value.replace('Z', '+00:00'))
    return timestamp_value
