"""
Health check endpoints for monitoring.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db import connection
from django.core.cache import cache
import sys


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """
    Basic health check endpoint.

    Returns HTTP 200 if service is healthy.
    """
    return Response({'status': 'healthy'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def health_detailed(request):
    """
    Detailed health check with component status.

    Checks:
    - Database connectivity
    - Redis cache connectivity
    - Python version
    """
    checks = {
        'database': check_database(),
        'cache': check_cache(),
        'python_version': sys.version
    }

    all_healthy = all(
        check.get('status') == 'healthy'
        for check in [checks['database'], checks['cache']]
    )

    http_status = status.HTTP_200_OK if all_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return Response({
        'status': 'healthy' if all_healthy else 'unhealthy',
        'checks': checks
    }, status=http_status)


def check_database():
    """Check database connectivity."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return {
            'status': 'healthy',
            'message': 'Database connection successful'
        }
    except Exception as e:
        return {
            'status': 'unhealthy',
            'message': f'Database connection failed: {str(e)}'
        }


def check_cache():
    """Check Redis cache connectivity."""
    try:
        cache.set('health_check', 'ok', 10)
        value = cache.get('health_check')
        if value == 'ok':
            return {
                'status': 'healthy',
                'message': 'Cache connection successful'
            }
        else:
            return {
                'status': 'unhealthy',
                'message': 'Cache read/write failed'
            }
    except Exception as e:
        return {
            'status': 'unhealthy',
            'message': f'Cache connection failed: {str(e)}'
        }
