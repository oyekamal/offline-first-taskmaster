"""
URL configuration for taskmanager project.
"""
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from core.views_health import health_check, health_detailed

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),

    # Health checks
    path('health/', health_check, name='health_check'),
    path('api/health/', health_detailed, name='health_detailed'),

    # API Schema
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),

    # API endpoints
    path('api/auth/', include('core.urls.auth')),
    path('api/', include('tasks.urls')),
    path('api/sync/', include('sync.urls')),
]
