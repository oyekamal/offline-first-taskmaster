"""
Tests for tasks app.
"""
import pytest
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from core.models import Organization, User, Device
from .models import Task, Comment
import uuid


@pytest.mark.django_db
class TestTaskModel:
    """Test Task model functionality."""

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

    def test_create_task(self):
        """Test creating a task."""
        task = Task.objects.create(
            organization=self.organization,
            title="Test Task",
            description="Test Description",
            created_by=self.user,
            last_modified_by=self.user,
            status='todo'
        )

        assert task.id is not None
        assert task.title == "Test Task"
        assert task.status == 'todo'
        assert task.version == 1
        assert task.deleted_at is None

    def test_task_checksum_calculation(self):
        """Test that checksum is calculated correctly."""
        task = Task.objects.create(
            organization=self.organization,
            title="Test Task",
            created_by=self.user,
            last_modified_by=self.user
        )

        assert task.checksum is not None
        assert len(task.checksum) == 64  # SHA-256 produces 64 hex characters

    def test_task_vector_clock_increment(self):
        """Test vector clock increment."""
        task = Task.objects.create(
            organization=self.organization,
            title="Test Task",
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={}
        )

        device_id = str(self.device.id)
        task.increment_vector_clock(device_id)

        assert task.vector_clock[device_id] == 1

        task.increment_vector_clock(device_id)
        assert task.vector_clock[device_id] == 2

    def test_task_soft_delete(self):
        """Test soft deletion of task."""
        task = Task.objects.create(
            organization=self.organization,
            title="Test Task",
            created_by=self.user,
            last_modified_by=self.user
        )

        task.soft_delete()

        assert task.deleted_at is not None
        # Task should not appear in default queryset
        assert Task.objects.filter(id=task.id).count() == 0
        # But should appear in all_objects queryset
        assert Task.all_objects.filter(id=task.id).count() == 1


@pytest.mark.django_db
class TestTaskAPI:
    """Test Task API endpoints."""

    def setup_method(self):
        """Set up test data and API client."""
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
            device_fingerprint="test-device-123"
        )

        # Authenticate
        self.client.force_authenticate(user=self.user)

    def test_create_task_api(self):
        """Test creating task via API."""
        data = {
            'title': 'New Task',
            'description': 'Task description',
            'status': 'todo',
            'priority': 'medium',
            'last_modified_by': str(self.user.id)
        }

        response = self.client.post(
            '/api/tasks/',
            data,
            HTTP_X_DEVICE_ID=str(self.device.id)
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'New Task'
        assert 'vector_clock' in response.data

    def test_list_tasks_api(self):
        """Test listing tasks via API."""
        # Create test tasks
        Task.objects.create(
            organization=self.organization,
            title="Task 1",
            created_by=self.user,
            last_modified_by=self.user
        )
        Task.objects.create(
            organization=self.organization,
            title="Task 2",
            created_by=self.user,
            last_modified_by=self.user
        )

        response = self.client.get('/api/tasks/')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 2

    def test_update_task_api(self):
        """Test updating task via API."""
        task = Task.objects.create(
            organization=self.organization,
            title="Original Title",
            created_by=self.user,
            last_modified_by=self.user,
            vector_clock={}
        )

        data = {
            'title': 'Updated Title',
            'status': 'in_progress',
            'last_modified_by': str(self.user.id)
        }

        response = self.client.patch(
            f'/api/tasks/{task.id}/',
            data,
            HTTP_X_DEVICE_ID=str(self.device.id)
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'Updated Title'
        assert response.data['status'] == 'in_progress'
        assert response.data['version'] == 2

    def test_filter_tasks_by_status(self):
        """Test filtering tasks by status."""
        Task.objects.create(
            organization=self.organization,
            title="Todo Task",
            status='todo',
            created_by=self.user,
            last_modified_by=self.user
        )
        Task.objects.create(
            organization=self.organization,
            title="Done Task",
            status='done',
            created_by=self.user,
            last_modified_by=self.user
        )

        response = self.client.get('/api/tasks/?status=todo')

        assert response.status_code == status.HTTP_200_OK
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['status'] == 'todo'


@pytest.mark.django_db
class TestCommentModel:
    """Test Comment model functionality."""

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
        self.task = Task.objects.create(
            organization=self.organization,
            title="Test Task",
            created_by=self.user,
            last_modified_by=self.user
        )

    def test_create_comment(self):
        """Test creating a comment."""
        comment = Comment.objects.create(
            task=self.task,
            user=self.user,
            content="Test comment",
            last_modified_by=self.user
        )

        assert comment.id is not None
        assert comment.content == "Test comment"
        assert comment.task == self.task
        assert comment.is_edited is False

    def test_comment_threading(self):
        """Test threaded comments."""
        parent_comment = Comment.objects.create(
            task=self.task,
            user=self.user,
            content="Parent comment",
            last_modified_by=self.user
        )

        reply_comment = Comment.objects.create(
            task=self.task,
            user=self.user,
            content="Reply comment",
            parent=parent_comment,
            last_modified_by=self.user
        )

        assert reply_comment.parent == parent_comment
        assert parent_comment.replies.count() == 1


@pytest.mark.django_db
class TestVectorClockUtils:
    """Test vector clock utility functions."""

    def test_compare_vector_clocks_equal(self):
        """Test comparing equal vector clocks."""
        from sync.utils import compare_vector_clocks, ClockRelation

        clock1 = {"device-a": 5, "device-b": 3}
        clock2 = {"device-a": 5, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.EQUAL

    def test_compare_vector_clocks_before(self):
        """Test comparing when clock1 is before clock2."""
        from sync.utils import compare_vector_clocks, ClockRelation

        clock1 = {"device-a": 5, "device-b": 2}
        clock2 = {"device-a": 5, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.BEFORE

    def test_compare_vector_clocks_concurrent(self):
        """Test comparing concurrent vector clocks."""
        from sync.utils import compare_vector_clocks, ClockRelation

        clock1 = {"device-a": 5, "device-b": 2}
        clock2 = {"device-a": 4, "device-b": 3}

        result = compare_vector_clocks(clock1, clock2)
        assert result == ClockRelation.CONCURRENT

    def test_merge_vector_clocks(self):
        """Test merging vector clocks."""
        from sync.utils import merge_vector_clocks

        clock1 = {"device-a": 5, "device-b": 3}
        clock2 = {"device-a": 4, "device-c": 2}

        merged = merge_vector_clocks(clock1, clock2)

        assert merged == {"device-a": 5, "device-b": 3, "device-c": 2}


if __name__ == '__main__':
    pytest.main([__file__])
