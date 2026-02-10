"""
Core serializers for User, Organization, Device models.
"""
from rest_framework import serializers
from .models import User, Organization, Device, Project


class OrganizationSerializer(serializers.ModelSerializer):
    """Serializer for Organization model."""

    class Meta:
        model = Organization
        fields = [
            'id', 'name', 'slug', 'settings',
            'storage_quota_mb', 'storage_used_mb',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'storage_used_mb']


class UserSerializer(serializers.ModelSerializer):
    """Serializer for User model."""

    organization_name = serializers.CharField(source='organization.name', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'organization', 'organization_name', 'email', 'name',
            'avatar_url', 'role', 'is_active', 'last_seen_at',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_seen_at']
        extra_kwargs = {
            'password': {'write_only': True}
        }


class UserCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new users."""

    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['email', 'name', 'password', 'organization', 'role']

    def create(self, validated_data):
        """Create user with hashed password."""
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class DeviceSerializer(serializers.ModelSerializer):
    """Serializer for Device model."""

    user_name = serializers.CharField(source='user.name', read_only=True)

    class Meta:
        model = Device
        fields = [
            'id', 'user', 'user_name', 'device_name', 'device_fingerprint',
            'last_sync_at', 'vector_clock', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_sync_at']


class ProjectSerializer(serializers.ModelSerializer):
    """Serializer for Project model."""

    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    task_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            'id', 'organization', 'name', 'description', 'color',
            'is_archived', 'created_by', 'created_by_name', 'task_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_task_count(self, obj):
        """Get count of non-deleted tasks in project."""
        return obj.tasks.filter(deleted_at__isnull=True).count()
