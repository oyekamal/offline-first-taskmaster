"""
Utility functions for vector clock operations and conflict detection.
"""
from enum import Enum
from typing import Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

VectorClock = Dict[str, int]


class ClockRelation(Enum):
    """Relationship between two vector clocks."""
    EQUAL = 'equal'
    BEFORE = 'before'
    AFTER = 'after'
    CONCURRENT = 'concurrent'


def compare_vector_clocks(clock1: VectorClock, clock2: VectorClock) -> ClockRelation:
    """
    Compare two vector clocks to determine their relationship.

    Args:
        clock1: First vector clock
        clock2: Second vector clock

    Returns:
        ClockRelation indicating the relationship between the clocks

    Example:
        >>> compare_vector_clocks(
        ...     {"device-a": 5, "device-b": 3},
        ...     {"device-a": 5, "device-b": 2}
        ... )
        ClockRelation.AFTER
    """
    if not isinstance(clock1, dict):
        clock1 = {}
    if not isinstance(clock2, dict):
        clock2 = {}

    # Get all device IDs from both clocks
    all_devices = set(clock1.keys()) | set(clock2.keys())

    clock1_greater = False
    clock2_greater = False

    for device_id in all_devices:
        v1 = clock1.get(device_id, 0)
        v2 = clock2.get(device_id, 0)

        if v1 > v2:
            clock1_greater = True
        elif v2 > v1:
            clock2_greater = True

    # Determine relationship
    if clock1_greater and clock2_greater:
        return ClockRelation.CONCURRENT
    elif clock1_greater:
        return ClockRelation.AFTER
    elif clock2_greater:
        return ClockRelation.BEFORE
    else:
        return ClockRelation.EQUAL


def merge_vector_clocks(clock1: VectorClock, clock2: VectorClock) -> VectorClock:
    """
    Merge two vector clocks by taking the maximum value for each device.

    Args:
        clock1: First vector clock
        clock2: Second vector clock

    Returns:
        Merged vector clock

    Example:
        >>> merge_vector_clocks(
        ...     {"device-a": 5, "device-b": 3},
        ...     {"device-a": 4, "device-c": 2}
        ... )
        {"device-a": 5, "device-b": 3, "device-c": 2}
    """
    if not isinstance(clock1, dict):
        clock1 = {}
    if not isinstance(clock2, dict):
        clock2 = {}

    all_devices = set(clock1.keys()) | set(clock2.keys())

    merged = {}
    for device_id in all_devices:
        merged[device_id] = max(
            clock1.get(device_id, 0),
            clock2.get(device_id, 0)
        )

    return merged


def increment_vector_clock(device_id: str, clock: VectorClock) -> VectorClock:
    """
    Increment the counter for a specific device in the vector clock.

    Args:
        device_id: Device ID to increment
        clock: Current vector clock

    Returns:
        Updated vector clock

    Example:
        >>> increment_vector_clock("device-a", {"device-a": 5})
        {"device-a": 6}
    """
    if not isinstance(clock, dict):
        clock = {}

    new_clock = clock.copy()
    current_value = new_clock.get(device_id, 0)
    new_clock[device_id] = current_value + 1

    return new_clock


def detect_conflict(
    local_entity: dict,
    server_entity: dict,
    client_vector_clock: VectorClock
) -> Tuple[bool, Optional[str]]:
    """
    Detect if there's a conflict between local and server versions.

    Args:
        local_entity: Local version of entity with vector_clock
        server_entity: Server version of entity with vector_clock
        client_vector_clock: Client's current vector clock state

    Returns:
        Tuple of (has_conflict, conflict_reason)

    Example:
        >>> detect_conflict(
        ...     {"id": "task-1", "vector_clock": {"device-a": 5}},
        ...     {"id": "task-1", "vector_clock": {"device-b": 3}},
        ...     {"device-a": 5, "device-b": 2}
        ... )
        (True, "Concurrent modification detected")
    """
    local_clock = local_entity.get('vector_clock', {})
    server_clock = server_entity.get('vector_clock', {})

    relation = compare_vector_clocks(local_clock, server_clock)

    if relation == ClockRelation.CONCURRENT:
        return True, "Concurrent modification detected"
    elif relation == ClockRelation.BEFORE:
        # Server has newer version, no conflict
        return False, None
    elif relation == ClockRelation.AFTER:
        # Local has newer version, should be accepted
        return False, None
    else:
        # Equal clocks, no conflict
        return False, None


def should_accept_change(
    local_entity: Optional[dict],
    incoming_entity: dict,
    device_vector_clock: VectorClock
) -> Tuple[bool, Optional[str]]:
    """
    Determine if an incoming change should be accepted.

    Args:
        local_entity: Current local version (None if doesn't exist)
        incoming_entity: Incoming entity from sync
        device_vector_clock: Device's current vector clock

    Returns:
        Tuple of (should_accept, reason)
    """
    if local_entity is None:
        # New entity, always accept
        return True, "New entity"

    local_clock = local_entity.get('vector_clock', {})
    incoming_clock = incoming_entity.get('vector_clock', {})

    relation = compare_vector_clocks(incoming_clock, local_clock)

    if relation == ClockRelation.AFTER:
        # Incoming is newer
        return True, "Incoming version is newer"
    elif relation == ClockRelation.BEFORE:
        # Incoming is older
        return False, "Incoming version is older"
    elif relation == ClockRelation.EQUAL:
        # Same version
        return False, "Same version"
    else:
        # Concurrent - need conflict resolution
        return False, "Concurrent modification - conflict detected"


def get_organization_vector_clock(organization_id) -> VectorClock:
    """
    Get the aggregated vector clock for an organization.

    This represents the highest counter value for each device
    across all entities in the organization.

    Args:
        organization_id: Organization UUID

    Returns:
        Aggregated vector clock
    """
    from tasks.models import Task, Comment
    from django.db.models import Q

    organization_clock = {}

    # Get all tasks and comments for organization
    tasks = Task.all_objects.filter(organization_id=organization_id)
    comments = Comment.all_objects.filter(task__organization_id=organization_id)

    # Aggregate vector clocks
    for task in tasks:
        if task.vector_clock:
            organization_clock = merge_vector_clocks(
                organization_clock,
                task.vector_clock
            )

    for comment in comments:
        if comment.vector_clock:
            organization_clock = merge_vector_clocks(
                organization_clock,
                comment.vector_clock
            )

    return organization_clock


def calculate_sync_priority(entity_type: str, operation: str, changes: dict) -> int:
    """
    Calculate sync priority for a change.

    Priority levels:
    1 - Critical (task creation, status changes)
    2 - High (assignment changes, title edits)
    3 - Medium (description edits, due date changes)
    4 - Low (tag updates, position changes)
    5 - Background (bulk operations)

    Args:
        entity_type: Type of entity (task, comment)
        operation: Operation type (create, update, delete)
        changes: Dictionary of changed fields

    Returns:
        Priority level (1-5)
    """
    # Critical: New entity creation
    if operation == 'create':
        return 1

    # Critical: Task status changes
    if entity_type == 'task' and 'status' in changes:
        return 1

    # High: Assignment changes
    if entity_type == 'task' and 'assigned_to' in changes:
        return 2

    # High: Title/name changes
    if 'title' in changes or 'name' in changes:
        return 2

    # High: Comment creation/deletion
    if entity_type == 'comment' and operation != 'update':
        return 2

    # Medium: Content updates
    if 'description' in changes or 'content' in changes:
        return 3

    # Medium: Date changes
    if 'due_date' in changes or 'completed_at' in changes:
        return 3

    # Low: Metadata changes
    if 'tags' in changes or 'custom_fields' in changes:
        return 4

    # Background: Everything else
    return 5
