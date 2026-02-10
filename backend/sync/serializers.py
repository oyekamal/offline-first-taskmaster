"""
Serializers for sync operations and conflict resolution.
"""
from rest_framework import serializers
from .models import SyncLog, Conflict, Tombstone
from tasks.serializers import TaskSerializer, CommentSerializer


class SyncPushChangeSerializer(serializers.Serializer):
    """Serializer for individual change in sync push."""

    id = serializers.UUIDField()
    operation = serializers.ChoiceField(choices=['create', 'update', 'delete'])
    data = serializers.JSONField()


class SyncPushSerializer(serializers.Serializer):
    """
    Serializer for push synchronization request.

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
    """

    deviceId = serializers.UUIDField()
    vectorClock = serializers.JSONField()
    timestamp = serializers.IntegerField()
    changes = serializers.DictField(
        child=serializers.ListField(child=SyncPushChangeSerializer())
    )

    def validate_changes(self, value):
        """Validate changes dictionary."""
        valid_entity_types = ['tasks', 'comments']
        for entity_type in value.keys():
            if entity_type not in valid_entity_types:
                raise serializers.ValidationError(
                    f"Invalid entity type: {entity_type}"
                )
        return value


class ConflictSerializer(serializers.Serializer):
    """Serializer for conflict information in sync response."""

    entityType = serializers.CharField()
    entityId = serializers.UUIDField()
    conflictReason = serializers.CharField()
    serverVersion = serializers.JSONField()
    serverVectorClock = serializers.JSONField()


class SyncPushResponseSerializer(serializers.Serializer):
    """
    Serializer for push synchronization response.

    Response format:
    {
        "success": true,
        "processed": 2,
        "conflicts": [...],
        "serverVectorClock": {...},
        "timestamp": 1707580900000
    }
    """

    success = serializers.BooleanField()
    processed = serializers.IntegerField()
    conflicts = ConflictSerializer(many=True)
    serverVectorClock = serializers.JSONField()
    timestamp = serializers.IntegerField()


class SyncPullSerializer(serializers.Serializer):
    """
    Serializer for pull synchronization request.

    Query parameters:
    - since: Unix timestamp in milliseconds
    - limit: Max entities per type (default: 100)
    """

    since = serializers.IntegerField()
    limit = serializers.IntegerField(default=100, max_value=500)


class TombstoneSerializer(serializers.ModelSerializer):
    """Serializer for Tombstone model."""

    class Meta:
        model = Tombstone
        fields = [
            'id', 'entity_type', 'entity_id', 'deleted_by',
            'deleted_from_device', 'vector_clock', 'created_at', 'expires_at'
        ]


class SyncPullResponseSerializer(serializers.Serializer):
    """
    Serializer for pull synchronization response.

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

    tasks = TaskSerializer(many=True)
    comments = CommentSerializer(many=True)
    tombstones = TombstoneSerializer(many=True)
    serverVectorClock = serializers.JSONField()
    hasMore = serializers.BooleanField()
    timestamp = serializers.IntegerField()


class ConflictDetailSerializer(serializers.ModelSerializer):
    """Detailed serializer for Conflict model."""

    user_name = serializers.CharField(source='user.name', read_only=True)
    resolved_by_name = serializers.CharField(
        source='resolved_by.name',
        read_only=True,
        allow_null=True
    )

    class Meta:
        model = Conflict
        fields = [
            'id', 'entity_type', 'entity_id',
            'user', 'user_name', 'device',
            'local_version', 'server_version',
            'local_vector_clock', 'server_vector_clock',
            'conflict_reason', 'resolution_strategy',
            'resolved_version', 'resolved_by', 'resolved_by_name',
            'created_at', 'resolved_at'
        ]
        read_only_fields = ['id', 'created_at', 'resolved_at']


class ConflictResolutionSerializer(serializers.Serializer):
    """Serializer for manual conflict resolution."""

    resolution = serializers.ChoiceField(choices=['local', 'remote', 'custom'])
    customResolution = serializers.JSONField(required=False, allow_null=True)

    def validate(self, data):
        """Validate that customResolution is provided when resolution is 'custom'."""
        if data['resolution'] == 'custom' and not data.get('customResolution'):
            raise serializers.ValidationError(
                "customResolution is required when resolution is 'custom'"
            )
        return data


class SyncLogSerializer(serializers.ModelSerializer):
    """Serializer for SyncLog model."""

    user_name = serializers.CharField(source='user.name', read_only=True)
    device_name = serializers.CharField(source='device.device_name', read_only=True)

    class Meta:
        model = SyncLog
        fields = [
            'id', 'device', 'device_name', 'user', 'user_name',
            'sync_type', 'entities_pushed', 'entities_pulled',
            'conflicts_detected', 'conflicts_resolved',
            'duration_ms', 'status', 'error_message', 'metadata',
            'created_at', 'completed_at'
        ]
        read_only_fields = ['id', 'created_at', 'completed_at']
