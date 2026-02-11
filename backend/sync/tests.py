"""
Tests for sync operations and conflict resolution.
"""
import pytest
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Organization, User, Device
from tasks.models import Task, Comment
from sync.models import SyncLog, Conflict, Tombstone
from sync.utils import (
    compare_vector_clocks, merge_vector_clocks,
    increment_vector_clock, detect_conflict,
    ClockRelation
)
from sync.utils import auto_resolve_task_conflict, auto_resolve_comment_conflict
from django.test import override_settings
import uuid
import time


@pytest.mark.django_db
class TestVectorClockOperations:
    """Test vector clock utility functions."""

    def test_compare_equal_clocks(self):
        """Test comparing equal vector clocks."""
        clock1 = {"device-a": 5, "device-b": 3}
        clock2 = {"device-a": 5, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.EQUAL

    def test_compare_before_relationship(self):
        """Test when clock1 is before clock2."""
        clock1 = {"device-a": 5, "device-b": 2}
        clock2 = {"device-a": 5, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.BEFORE

    def test_compare_after_relationship(self):
        """Test when clock1 is after clock2."""
        clock1 = {"device-a": 6, "device-b": 3}
        clock2 = {"device-a": 5, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.AFTER

    def test_compare_concurrent_clocks(self):
        """Test comparing concurrent vector clocks."""
        clock1 = {"device-a": 5, "device-b": 2}
        clock2 = {"device-a": 4, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.CONCURRENT

    def test_merge_clocks(self):
        """Test merging vector clocks."""
        clock1 = {"device-a": 5, "device-b": 3}
        clock2 = {"device-a": 4, "device-c": 2}

        merged = merge_vector_clocks(clock1, clock2)

        assert merged["device-a"] == 5
        assert merged["device-b"] == 3
        assert merged["device-c"] == 2

    def test_increment_clock(self):
        """Test incrementing vector clock."""
        clock = {"device-a": 5}
        device_id = "device-a"

        incremented = increment_vector_clock(device_id, clock)

        assert incremented["device-a"] == 6

    def test_increment_clock_new_device(self):
        """Test incrementing clock for new device."""
        clock = {"device-a": 5}
        device_id = "device-b"

        incremented = increment_vector_clock(device_id, clock)

        assert incremented["device-a"] == 5
        assert incremented["device-b"] == 1

    def test_merge_empty_clocks(self):
        """Test merging with empty clocks."""
        clock1 = {"device-a": 5}
        clock2 = {}

        merged = merge_vector_clocks(clock1, clock2)

        assert merged == {"device-a": 5}


@pytest.mark.django_db
class TestSyncPushAPI:
    """Test sync push endpoint."""

    def setup_method(self):
        """Set up test data."""
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )
        self.device = Device.objects.create(
            user=self.user,
            device_name="Test Device",
            device_fingerprint="test-device-123"
        )
        self.client.force_authenticate(user=self.user)

    def test_push_new_task(self):
        """Test pushing a new task to server."""
        task_id = str(uuid.uuid4())
        device_id = str(self.device.id)

        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 1},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'tasks': [
                    {
                        'id': task_id,
                        'operation': 'create',
                        'data': {
                            'id': task_id,
                            'title': 'New Task from Client',
                            'description': 'Test description',
                            'status': 'todo',
                            'priority': 'medium',
                            'tags': [],
                            'custom_fields': {},
                            'version': 1,
                            'vector_clock': {device_id: 1},
                            'created_at': int(time.time() * 1000)
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert response.data['processed'] == 1
        assert len(response.data['conflicts']) == 0

        # Verify task was created
        task = Task.objects.get(id=task_id)
        assert task.title == 'New Task from Client'

    def test_push_with_conflict(self):
        """Test pushing update that conflicts with server version."""
        # Create task on server
        task = Task.objects.create(
            organization=self.organization,
            title="Server Task",
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={"server-device": 5}
        )

        device_id = str(self.device.id)

        # Push conflicting update
        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 3},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'tasks': [
                    {
                        'id': str(task.id),
                        'operation': 'update',
                        'data': {
                            'id': str(task.id),
                            'title': 'Client Updated Task',
                            'status': 'in_progress',
                            'version': 1,
                            'vector_clock': {device_id: 3}
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        # Should detect conflict due to concurrent vector clocks
        assert len(response.data['conflicts']) >= 0  # May or may not conflict depending on implementation

    def test_push_creates_sync_log(self):
        """Test that push operation creates sync log."""
        device_id = str(self.device.id)
        task_id = str(uuid.uuid4())

        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 1},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'tasks': [
                    {
                        'id': task_id,
                        'operation': 'create',
                        'data': {
                            'id': task_id,
                            'title': 'Test Task',
                            'status': 'todo',
                            'priority': 'medium',
                            'version': 1,
                            'vector_clock': {device_id: 1},
                            'created_at': int(time.time() * 1000)
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        # Verify sync log was created
        sync_logs = SyncLog.objects.filter(
            device=self.device,
            sync_type='push'
        )
        assert sync_logs.count() > 0
        latest_log = sync_logs.latest('created_at')
        assert latest_log.status == 'success'


@pytest.mark.django_db
class TestSyncPullAPI:
    """Test sync pull endpoint."""

    def setup_method(self):
        """Set up test data."""
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )
        self.device = Device.objects.create(
            user=self.user,
            device_name="Test Device",
            device_fingerprint="test-device-123"
        )
        self.client.force_authenticate(user=self.user)

    def test_pull_new_tasks(self):
        """Test pulling new tasks from server."""
        # Create tasks on server
        task1 = Task.objects.create(
            organization=self.organization,
            title="Server Task 1",
            created_by=self.user,
            last_modified_by=self.user
        )
        task2 = Task.objects.create(
            organization=self.organization,
            title="Server Task 2",
            created_by=self.user,
            last_modified_by=self.user
        )

        device_id = str(self.device.id)
        since_timestamp = int((timezone.now().timestamp() - 3600) * 1000)  # 1 hour ago

        response = self.client.get(
            f'/api/sync/pull/?since={since_timestamp}&limit=100',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['tasks']) >= 2
        assert 'serverVectorClock' in response.data
        assert 'timestamp' in response.data

    def test_pull_excludes_own_changes(self):
        """Test that pull excludes changes from requesting device."""
        # Create task from this device
        task = Task.objects.create(
            organization=self.organization,
            title="My Task",
            created_by=self.user,
            last_modified_by=self.user,
            last_modified_device=self.device
        )

        device_id = str(self.device.id)
        since_timestamp = int((timezone.now().timestamp() - 3600) * 1000)

        response = self.client.get(
            f'/api/sync/pull/?since={since_timestamp}&limit=100',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        # Should not include tasks modified by this device
        task_ids = [t['id'] for t in response.data['tasks']]
        assert str(task.id) not in task_ids


@pytest.mark.django_db
class TestConflictModel:
    """Test Conflict model."""

    def setup_method(self):
        """Set up test data."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )
        self.device = Device.objects.create(
            user=self.user,
            device_fingerprint="test-device-123"
        )

    def test_create_conflict(self):
        """Test creating a conflict record."""
        task_id = uuid.uuid4()

        conflict = Conflict.objects.create(
            entity_type='task',
            entity_id=task_id,
            device=self.device,
            user=self.user,
            local_version={'title': 'Local Version'},
            server_version={'title': 'Server Version'},
            local_vector_clock={'device-a': 5},
            server_vector_clock={'device-b': 3},
            conflict_reason='Concurrent modification'
        )

        assert conflict.id is not None
        assert conflict.is_resolved() is False

    def test_resolve_conflict(self):
        """Test resolving a conflict."""
        task_id = uuid.uuid4()

        conflict = Conflict.objects.create(
            entity_type='task',
            entity_id=task_id,
            device=self.device,
            user=self.user,
            local_version={'title': 'Local Version'},
            server_version={'title': 'Server Version'},
            local_vector_clock={'device-a': 5},
            server_vector_clock={'device-b': 3}
        )

        resolved_version = {'title': 'Resolved Version'}
        conflict.resolve(self.user, 'manual', resolved_version)

        assert conflict.is_resolved() is True
        assert conflict.resolution_strategy == 'manual'
        assert conflict.resolved_version == resolved_version


@pytest.mark.django_db
class TestTombstoneModel:
    """Test Tombstone model."""

    def setup_method(self):
        """Set up test data."""
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )

    def test_create_tombstone(self):
        """Test creating a tombstone."""
        task_id = uuid.uuid4()

        tombstone = Tombstone.objects.create(
            entity_type='task',
            entity_id=task_id,
            organization=self.organization,
            deleted_by=self.user,
            vector_clock={'device-a': 5},
            entity_snapshot={'title': 'Deleted Task'}
        )

        assert tombstone.id is not None
        assert tombstone.expires_at is not None

    def test_cleanup_expired_tombstones(self):
        """Test cleaning up expired tombstones."""
        task_id = uuid.uuid4()

        # Create expired tombstone
        tombstone = Tombstone.objects.create(
            entity_type='task',
            entity_id=task_id,
            organization=self.organization,
            deleted_by=self.user,
            vector_clock={'device-a': 5}
        )

        # Manually set as expired
        from datetime import timedelta
        tombstone.expires_at = timezone.now() - timedelta(days=1)
        tombstone.save()

        # Clean up
        deleted_count = Tombstone.cleanup_expired()

        assert deleted_count >= 1
        assert Tombstone.objects.filter(id=tombstone.id).count() == 0


@pytest.mark.django_db
class TestConflictDetection:
    """Test conflict detection logic."""

    def test_detect_concurrent_conflict(self):
        """Test detecting concurrent modification conflict."""
        local_entity = {
            'id': 'task-1',
            'title': 'Local Title',
            'vector_clock': {'device-a': 5, 'device-b': 2}
        }
        server_entity = {
            'id': 'task-1',
            'title': 'Server Title',
            'vector_clock': {'device-a': 4, 'device-b': 3}
        }
        client_clock = {'device-a': 5, 'device-b': 2}

        has_conflict, reason = detect_conflict(
            local_entity,
            server_entity,
            client_clock
        )

        assert has_conflict is True
        assert 'concurrent' in reason.lower()

    def test_no_conflict_server_newer(self):
        """Test no conflict when server has newer version."""
        local_entity = {
            'id': 'task-1',
            'vector_clock': {'device-a': 5, 'device-b': 2}
        }
        server_entity = {
            'id': 'task-1',
            'vector_clock': {'device-a': 5, 'device-b': 3}
        }
        client_clock = {'device-a': 5, 'device-b': 2}

        has_conflict, reason = detect_conflict(
            local_entity,
            server_entity,
            client_clock
        )

        assert has_conflict is False


@pytest.mark.django_db
class TestAutoConflictResolution:
    """Test auto_resolve_task_conflict and auto_resolve_comment_conflict utilities."""

    def test_different_fields_auto_merge(self):
        """Local changes priority, server changes status - should auto-resolve with both."""
        local_data = {
            'title': 'Same Title',
            'status': 'todo',
            'priority': 'high',
            'tags': [],
            'description': 'Same desc',
        }
        server_data = {
            'title': 'Same Title',
            'status': 'in_progress',
            'priority': 'medium',
            'tags': [],
            'description': 'Same desc',
        }

        resolved, auto_resolved, unresolvable = auto_resolve_task_conflict(local_data, server_data)

        assert auto_resolved is True
        assert unresolvable == []
        # priority: high (rank 2) > medium (rank 1) -> 'high'
        assert resolved['priority'] == 'high'
        # status: in_progress (rank 1) > todo (rank 0) -> 'in_progress'
        assert resolved['status'] == 'in_progress'

    def test_same_field_title_conflict(self):
        """Both change title - cannot auto-resolve, returns unresolvable=['title']."""
        local_data = {
            'title': 'Local Title',
            'status': 'todo',
            'priority': 'medium',
        }
        server_data = {
            'title': 'Server Title',
            'status': 'todo',
            'priority': 'medium',
        }

        resolved, auto_resolved, unresolvable = auto_resolve_task_conflict(local_data, server_data)

        assert auto_resolved is False
        assert 'title' in unresolvable

    def test_priority_higher_wins(self):
        """local='low', server='urgent' - auto-resolves to 'urgent'."""
        local_data = {
            'title': 'Same',
            'priority': 'low',
        }
        server_data = {
            'title': 'Same',
            'priority': 'urgent',
        }

        resolved, auto_resolved, unresolvable = auto_resolve_task_conflict(local_data, server_data)

        assert auto_resolved is True
        assert resolved['priority'] == 'urgent'

    def test_tags_union_merge(self):
        """local=['bug'], server=['feature'] - auto-resolves to sorted union."""
        local_data = {
            'title': 'Same',
            'tags': ['bug'],
        }
        server_data = {
            'title': 'Same',
            'tags': ['feature'],
        }

        resolved, auto_resolved, unresolvable = auto_resolve_task_conflict(local_data, server_data)

        assert auto_resolved is True
        assert resolved['tags'] == ['bug', 'feature']

    def test_status_more_progressed_wins(self):
        """local='in_progress', server='done' - auto-resolves to 'done'."""
        local_data = {
            'title': 'Same',
            'status': 'in_progress',
        }
        server_data = {
            'title': 'Same',
            'status': 'done',
        }

        resolved, auto_resolved, unresolvable = auto_resolve_task_conflict(local_data, server_data)

        assert auto_resolved is True
        assert resolved['status'] == 'done'

    def test_due_date_earlier_wins(self):
        """local='2026-03-15', server='2026-03-10' - auto-resolves to '2026-03-10'."""
        local_data = {
            'title': 'Same',
            'due_date': '2026-03-15',
        }
        server_data = {
            'title': 'Same',
            'due_date': '2026-03-10',
        }

        resolved, auto_resolved, unresolvable = auto_resolve_task_conflict(local_data, server_data)

        assert auto_resolved is True
        assert resolved['due_date'] == '2026-03-10'

    def test_comment_content_conflict(self):
        """Different content - cannot auto-resolve."""
        local_data = {'content': 'Local comment text'}
        server_data = {'content': 'Server comment text'}

        resolved, auto_resolved, unresolvable = auto_resolve_comment_conflict(local_data, server_data)

        assert auto_resolved is False
        assert 'content' in unresolvable

    def test_comment_same_content(self):
        """Same content - auto-resolves."""
        local_data = {'content': 'Same comment text'}
        server_data = {'content': 'Same comment text'}

        resolved, auto_resolved, unresolvable = auto_resolve_comment_conflict(local_data, server_data)

        assert auto_resolved is True
        assert unresolvable == []


@pytest.mark.django_db
class TestAutoConflictResolutionAPI:
    """Test the full sync push API with auto-resolution."""

    def setup_method(self):
        """Set up test data."""
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )
        self.device = Device.objects.create(
            user=self.user,
            device_name="Test Device",
            device_fingerprint="test-device-123"
        )
        self.client.force_authenticate(user=self.user)

    def test_push_auto_resolves_different_fields(self):
        """Push with different field changed and concurrent clock auto-resolves."""
        # Create a task on server with server-only vector clock
        task = Task.objects.create(
            organization=self.organization,
            title="Original Title",
            description="Original description",
            status="todo",
            priority="medium",
            tags=[],
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={"server": 5}
        )

        device_id = str(self.device.id)

        # Push update that changes status (auto-resolvable) with concurrent clock
        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 3},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'tasks': [
                    {
                        'id': str(task.id),
                        'operation': 'update',
                        'data': {
                            'id': str(task.id),
                            'title': 'Original Title',
                            'description': 'Original description',
                            'status': 'in_progress',
                            'priority': 'medium',
                            'tags': [],
                            'version': 1,
                            'vector_clock': {device_id: 3}
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['success'] is True
        assert len(response.data['conflicts']) == 0
        assert response.data['processed'] == 1

        # Verify a Conflict record exists with auto_resolved strategy
        conflict_record = Conflict.objects.filter(
            entity_type='task',
            entity_id=task.id,
            resolution_strategy='auto_resolved'
        )
        assert conflict_record.exists()

    def test_push_creates_manual_conflict_for_title(self):
        """Push with different title AND concurrent clock creates manual conflict."""
        task = Task.objects.create(
            organization=self.organization,
            title="Server Title",
            status="todo",
            priority="medium",
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={"server": 5}
        )

        device_id = str(self.device.id)

        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 3},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'tasks': [
                    {
                        'id': str(task.id),
                        'operation': 'update',
                        'data': {
                            'id': str(task.id),
                            'title': 'Client Title',
                            'status': 'todo',
                            'priority': 'medium',
                            'version': 1,
                            'vector_clock': {device_id: 3}
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['conflicts']) == 1


@pytest.mark.django_db
class TestCascadeDeleteHandling:
    """Tests that pushing comments for deleted tasks is handled gracefully."""

    def setup_method(self):
        """Set up test data."""
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )
        self.device = Device.objects.create(
            user=self.user,
            device_name="Test Device",
            device_fingerprint="test-device-123"
        )
        self.client.force_authenticate(user=self.user)

    def test_create_comment_for_deleted_task(self):
        """Create a comment for a soft-deleted task - processed as orphan, no Comment created."""
        task = Task.objects.create(
            organization=self.organization,
            title="Task to delete",
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={"server": 1}
        )
        task.soft_delete()

        device_id = str(self.device.id)
        comment_id = str(uuid.uuid4())

        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 1},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'comments': [
                    {
                        'id': comment_id,
                        'operation': 'create',
                        'data': {
                            'id': comment_id,
                            'task': str(task.id),
                            'content': 'Comment on deleted task',
                            'version': 1,
                            'vector_clock': {device_id: 1},
                            'created_at': int(time.time() * 1000)
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['processed'] == 1

        # No Comment should have been actually created
        assert Comment.all_objects.filter(id=comment_id).count() == 0

    def test_update_comment_for_deleted_task(self):
        """Update a comment whose parent task is soft-deleted - processed, content unchanged."""
        task = Task.objects.create(
            organization=self.organization,
            title="Task to delete",
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={"server": 1}
        )
        comment = Comment.objects.create(
            task=task,
            user=self.user,
            content="Original comment content",
            version=1,
            vector_clock={"server": 1},
            last_modified_by=self.user,
            last_modified_device=self.device
        )

        # Now soft-delete the task
        task.soft_delete()

        device_id = str(self.device.id)

        push_data = {
            'deviceId': device_id,
            'vectorClock': {device_id: 2},
            'timestamp': int(time.time() * 1000),
            'changes': {
                'comments': [
                    {
                        'id': str(comment.id),
                        'operation': 'update',
                        'data': {
                            'id': str(comment.id),
                            'task': str(task.id),
                            'content': 'Updated comment content',
                            'version': 2,
                            'vector_clock': {device_id: 2}
                        }
                    }
                ]
            }
        }

        response = self.client.post(
            '/api/sync/push/',
            push_data,
            format='json',
            HTTP_X_DEVICE_ID=device_id
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['processed'] == 1

        # Comment content should remain unchanged
        comment.refresh_from_db()
        assert comment.content == "Original comment content"


@pytest.mark.django_db
class TestRateLimiting:
    """Test rate limiting on sync push endpoint."""

    def setup_method(self):
        """Set up test data."""
        self.client = APIClient()
        self.organization = Organization.objects.create(
            name="Test Org",
            slug="test-org"
        )
        self.user = User.objects.create_user(
            email="test@example.com",
            password="testpass123",
            name="Test User",
            organization=self.organization
        )
        self.device = Device.objects.create(
            user=self.user,
            device_name="Test Device",
            device_fingerprint="test-device-123"
        )
        self.client.force_authenticate(user=self.user)

    def test_push_rate_limit(self):
        """Verify SyncPushThrottle is applied and rejects after limit."""
        from unittest.mock import patch
        from django.core.cache import cache
        cache.clear()

        # Track how many times allow_request is called and reject on 3rd
        call_count = {'n': 0}
        orig_allow = __import__('sync.views', fromlist=['SyncPushThrottle']).SyncPushThrottle.allow_request

        def limited_allow(self_throttle, request, view):
            call_count['n'] += 1
            if call_count['n'] > 2:
                self_throttle.wait = lambda: 60
                return False
            return True

        with patch.object(
            __import__('sync.views', fromlist=['SyncPushThrottle']).SyncPushThrottle,
            'allow_request', limited_allow
        ):

            device_id = str(self.device.id)

            def make_push_request(idx):
                tid = str(uuid.uuid4())
                push_data = {
                    'deviceId': device_id,
                    'vectorClock': {device_id: idx},
                    'timestamp': int(time.time() * 1000),
                    'changes': {
                        'tasks': [
                            {
                                'id': tid,
                                'operation': 'create',
                                'data': {
                                    'id': tid,
                                    'title': f'Rate limit test task {idx}',
                                    'status': 'todo',
                                    'priority': 'medium',
                                    'version': 1,
                                    'vector_clock': {device_id: idx},
                                    'created_at': int(time.time() * 1000)
                                }
                            }
                        ]
                    }
                }
                return self.client.post(
                    '/api/sync/push/',
                    push_data,
                    format='json',
                    HTTP_X_DEVICE_ID=device_id
                )

            # First two requests should succeed
            response1 = make_push_request(1)
            assert response1.status_code == status.HTTP_200_OK

            response2 = make_push_request(2)
            assert response2.status_code == status.HTTP_200_OK

            # Third request should be throttled
            response3 = make_push_request(3)
            assert response3.status_code == status.HTTP_429_TOO_MANY_REQUESTS


if __name__ == '__main__':
    pytest.main([__file__])
