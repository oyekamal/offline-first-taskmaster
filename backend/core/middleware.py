"""
Custom middleware for request processing.
"""
import time
import uuid
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


class RequestTimingMiddleware:
    """
    Middleware to track request processing time.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Record start time
        start_time = time.time()
        request._request_start_time = start_time

        # Add request ID for tracking
        request.request_id = str(uuid.uuid4())

        # Process request
        response = self.get_response(request)

        # Calculate duration
        duration = time.time() - start_time

        # Add timing header
        response['X-Request-Duration'] = f"{duration:.3f}"
        response['X-Request-ID'] = request.request_id

        # Log slow requests
        if duration > 1.0:  # Log requests taking more than 1 second
            logger.warning(
                f"Slow request: {request.method} {request.path} took {duration:.3f}s",
                extra={
                    'request_id': request.request_id,
                    'method': request.method,
                    'path': request.path,
                    'duration': duration
                }
            )

        return response


class DeviceTrackingMiddleware:
    """
    Middleware to track device information from headers.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Extract device ID from header
        device_id = request.META.get('HTTP_X_DEVICE_ID')
        if device_id:
            request.device_id = device_id

        # Extract client version
        client_version = request.META.get('HTTP_X_CLIENT_VERSION')
        if client_version:
            request.client_version = client_version

        response = self.get_response(request)
        return response


class LastSeenMiddleware:
    """
    Middleware to update user's last_seen_at timestamp.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Update last seen for authenticated users
        if hasattr(request, 'user') and request.user.is_authenticated:
            # Use update() to avoid triggering signals
            from core.models import User
            User.objects.filter(id=request.user.id).update(
                last_seen_at=timezone.now()
            )

        return response
