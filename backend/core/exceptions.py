"""
Custom exception handler for REST framework.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Custom exception handler that provides consistent error responses.

    Returns:
        Response with standardized error format
    """
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)

    if response is not None:
        # Customize the response data
        error_data = {
            'error': str(exc),
            'code': exc.__class__.__name__,
            'timestamp': int(context['request']._request.META.get('REQUEST_TIME', 0) * 1000),
            'requestId': context['request'].META.get('HTTP_X_REQUEST_ID', 'unknown')
        }

        # Add details if available
        if hasattr(response, 'data') and isinstance(response.data, dict):
            if 'detail' in response.data:
                error_data['details'] = response.data['detail']
            elif response.data:
                error_data['details'] = response.data

        response.data = error_data

    else:
        # Handle unexpected exceptions
        logger.error(
            f"Unhandled exception: {str(exc)}",
            exc_info=True,
            extra={'context': context}
        )

        error_data = {
            'error': 'Internal server error',
            'code': 'INTERNAL_ERROR',
            'timestamp': int(context['request']._request.META.get('REQUEST_TIME', 0) * 1000),
            'requestId': context['request'].META.get('HTTP_X_REQUEST_ID', 'unknown')
        }

        response = Response(error_data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    return response
