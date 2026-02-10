"""
URL configuration for sync app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import sync_push, sync_pull, ConflictViewSet

router = DefaultRouter()
router.register(r'conflicts', ConflictViewSet, basename='conflict')

urlpatterns = [
    path('push/', sync_push, name='sync_push'),
    path('pull/', sync_pull, name='sync_pull'),
    path('', include(router.urls)),
]
