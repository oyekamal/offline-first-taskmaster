"""
Utility functions for core app.
"""
import hashlib
import json
import uuid
from typing import Any, Dict, Optional
from django.core.cache import cache
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def generate_id() -> str:
    """
    Generate a unique UUID string.

    Returns:
        UUID string
    """
    return str(uuid.uuid4())


def calculate_entity_checksum(entity_data: Dict[str, Any]) -> str:
    """
    Calculate SHA-256 checksum for entity data.

    Args:
        entity_data: Dictionary of entity fields

    Returns:
        Hexadecimal checksum string
    """
    # Sort keys for consistent serialization
    normalized = json.dumps(entity_data, sort_keys=True)
    return hashlib.sha256(normalized.encode()).hexdigest()


def cache_key(prefix: str, *args) -> str:
    """
    Generate cache key with prefix and arguments.

    Args:
        prefix: Key prefix
        *args: Additional key components

    Returns:
        Cache key string
    """
    parts = [prefix] + [str(arg) for arg in args]
    return ':'.join(parts)


def cached_property_with_ttl(ttl: int = 300):
    """
    Decorator for caching property values with TTL.

    Args:
        ttl: Time to live in seconds

    Usage:
        @cached_property_with_ttl(ttl=600)
        def expensive_property(self):
            return expensive_calculation()
    """
    def decorator(func):
        def wrapper(self):
            key = cache_key('property', self.__class__.__name__, self.id, func.__name__)
            result = cache.get(key)

            if result is None:
                result = func(self)
                cache.set(key, result, ttl)

            return result
        return property(wrapper)
    return decorator


def batch_iterator(queryset, batch_size: int = 1000):
    """
    Iterate over queryset in batches.

    Args:
        queryset: Django queryset
        batch_size: Number of items per batch

    Yields:
        Batches of queryset items
    """
    total = queryset.count()
    for start in range(0, total, batch_size):
        end = min(start + batch_size, total)
        yield queryset[start:end]


def get_client_ip(request) -> Optional[str]:
    """
    Extract client IP address from request.

    Args:
        request: Django request object

    Returns:
        IP address string or None
    """
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def get_user_agent(request) -> str:
    """
    Extract user agent from request.

    Args:
        request: Django request object

    Returns:
        User agent string
    """
    return request.META.get('HTTP_USER_AGENT', '')


def truncate_string(text: str, max_length: int = 100) -> str:
    """
    Truncate string to maximum length.

    Args:
        text: String to truncate
        max_length: Maximum length

    Returns:
        Truncated string with ellipsis if needed
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + '...'


class PerformanceTimer:
    """
    Context manager for timing code execution.

    Usage:
        with PerformanceTimer() as timer:
            # code to time
            pass
        print(f"Took {timer.duration}ms")
    """

    def __init__(self, name: str = None):
        self.name = name
        self.start_time = None
        self.end_time = None
        self.duration = None

    def __enter__(self):
        import time
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        self.end_time = time.time()
        self.duration = (self.end_time - self.start_time) * 1000  # Convert to ms

        if self.name:
            logger.debug(f"Performance: {self.name} took {self.duration:.2f}ms")


def format_file_size(bytes_size: int) -> str:
    """
    Format file size in human-readable format.

    Args:
        bytes_size: Size in bytes

    Returns:
        Formatted string (e.g., "1.5 MB")
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_size < 1024.0:
            return f"{bytes_size:.1f} {unit}"
        bytes_size /= 1024.0
    return f"{bytes_size:.1f} PB"


def validate_uuid(uuid_string: str) -> bool:
    """
    Validate if string is a valid UUID.

    Args:
        uuid_string: String to validate

    Returns:
        True if valid UUID, False otherwise
    """
    try:
        uuid.UUID(uuid_string)
        return True
    except (ValueError, AttributeError):
        return False
