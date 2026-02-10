"""
Serializers for Task and Comment models.
"""
from rest_framework import serializers
from django.utils import timezone
from .models import Task, Comment, TaskHistory
from core.serializers import UserSerializer


class TaskSerializer(serializers.ModelSerializer):
    """
    Comprehensive Task serializer with vector clock support.
    """

    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True, allow_null=True)
    last_modified_by_name = serializers.CharField(source='last_modified_by.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)
    comment_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            'id', 'organization', 'project', 'project_name',
            'title', 'description', 'status', 'priority',
            'due_date', 'completed_at', 'position',
            'created_by', 'created_by_name',
            'assigned_to', 'assigned_to_name',
            'tags', 'custom_fields',
            'version', 'vector_clock',
            'last_modified_by', 'last_modified_by_name',
            'last_modified_device', 'checksum',
            'comment_count',
            'created_at', 'updated_at', 'deleted_at'
        ]
        read_only_fields = [
            'id', 'organization', 'created_by', 'checksum',
            'created_at', 'updated_at', 'deleted_at',
            'last_modified_by', 'last_modified_device', 'vector_clock',
        ]

    def get_comment_count(self, obj):
        """Get count of non-deleted comments."""
        return obj.comments.filter(deleted_at__isnull=True).count()

    def validate_status(self, value):
        """Validate status transitions."""
        if self.instance:
            # Status transition validation could be added here
            pass
        return value

    def create(self, validated_data):
        """Create task with proper vector clock initialization."""
        request = self.context.get('request')
        device_id = request.META.get('HTTP_X_DEVICE_ID') if request else None

        # Set organization from user
        validated_data['organization'] = request.user.organization
        validated_data['created_by'] = request.user
        validated_data['last_modified_by'] = request.user

        # Initialize vector clock
        if device_id:
            validated_data['vector_clock'] = {str(device_id): 1}
            # Set device if it exists
            from core.models import Device
            try:
                device = Device.objects.get(id=device_id, user=request.user)
                validated_data['last_modified_device'] = device
            except Device.DoesNotExist:
                pass

        task = Task.objects.create(**validated_data)
        return task

    def update(self, instance, validated_data):
        """Update task with vector clock increment."""
        request = self.context.get('request')
        device_id = request.META.get('HTTP_X_DEVICE_ID') if request else None

        # Increment vector clock
        if device_id:
            instance.increment_vector_clock(device_id)

            # Update device
            from core.models import Device
            try:
                device = Device.objects.get(id=device_id, user=request.user)
                instance.last_modified_device = device
            except Device.DoesNotExist:
                pass

        # Increment version
        instance.increment_version()
        instance.last_modified_by = request.user

        # Update fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save(recalculate_checksum=True)
        return instance


class TaskListSerializer(serializers.ModelSerializer):
    """Lightweight Task serializer for list views."""

    assigned_to_name = serializers.CharField(source='assigned_to.name', read_only=True, allow_null=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)

    class Meta:
        model = Task
        fields = [
            'id', 'title', 'status', 'priority', 'due_date',
            'assigned_to', 'assigned_to_name',
            'project', 'project_name',
            'tags', 'updated_at'
        ]


class CommentSerializer(serializers.ModelSerializer):
    """
    Comprehensive Comment serializer with vector clock support.
    """

    user_name = serializers.CharField(source='user.name', read_only=True)
    user_avatar_url = serializers.URLField(source='user.avatar_url', read_only=True, allow_null=True)
    last_modified_by_name = serializers.CharField(source='last_modified_by.name', read_only=True)

    class Meta:
        model = Comment
        fields = [
            'id', 'task', 'user', 'user_name', 'user_avatar_url',
            'content', 'parent',
            'version', 'vector_clock',
            'last_modified_by', 'last_modified_by_name',
            'last_modified_device', 'is_edited',
            'created_at', 'updated_at', 'deleted_at'
        ]
        read_only_fields = [
            'id', 'user', 'is_edited',
            'created_at', 'updated_at', 'deleted_at',
            'last_modified_by', 'last_modified_device', 'vector_clock',
        ]

    def create(self, validated_data):
        """Create comment with proper vector clock initialization."""
        request = self.context.get('request')
        device_id = request.META.get('HTTP_X_DEVICE_ID') if request else None

        validated_data['user'] = request.user
        validated_data['last_modified_by'] = request.user

        # Initialize vector clock
        if device_id:
            validated_data['vector_clock'] = {str(device_id): 1}
            # Set device if it exists
            from core.models import Device
            try:
                device = Device.objects.get(id=device_id, user=request.user)
                validated_data['last_modified_device'] = device
            except Device.DoesNotExist:
                pass

        comment = Comment.objects.create(**validated_data)
        return comment

    def update(self, instance, validated_data):
        """Update comment with vector clock increment."""
        request = self.context.get('request')
        device_id = request.META.get('HTTP_X_DEVICE_ID') if request else None

        # Increment vector clock
        if device_id:
            instance.increment_vector_clock(device_id)

            # Update device
            from core.models import Device
            try:
                device = Device.objects.get(id=device_id, user=request.user)
                instance.last_modified_device = device
            except Device.DoesNotExist:
                pass

        # Increment version and mark as edited
        instance.increment_version()
        instance.is_edited = True
        instance.last_modified_by = request.user

        # Update fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class TaskHistorySerializer(serializers.ModelSerializer):
    """Serializer for TaskHistory model."""

    user_name = serializers.CharField(source='user.name', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True, allow_null=True)

    class Meta:
        model = TaskHistory
        fields = [
            'id', 'task', 'user', 'user_name',
            'device', 'device_name', 'change_type',
            'changes', 'previous_state', 'vector_clock',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']
