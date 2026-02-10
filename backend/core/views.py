"""
Core views for authentication and user management.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.utils import timezone
from .models import User, Device, Organization, Project
from .serializers import (
    UserSerializer, UserCreateSerializer,
    DeviceSerializer, OrganizationSerializer, ProjectSerializer
)
from .permissions import IsOrganizationMember
import uuid


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Custom JWT serializer with device information."""

    def validate(self, attrs):
        data = super().validate(attrs)

        # Add user information
        data['user'] = {
            'id': str(self.user.id),
            'email': self.user.email,
            'name': self.user.name,
            'organization_id': str(self.user.organization_id),
            'role': self.user.role
        }

        # Handle device registration
        device_fingerprint = self.context['request'].data.get('deviceFingerprint')
        device_name = self.context['request'].data.get('deviceName')

        if device_fingerprint:
            device, created = Device.objects.get_or_create(
                user=self.user,
                device_fingerprint=device_fingerprint,
                defaults={'device_name': device_name}
            )
            if not created and device_name:
                device.device_name = device_name
                device.save(update_fields=['device_name'])

            data['device'] = {
                'id': str(device.id),
                'name': device.device_name or 'Unknown Device'
            }

        # Update last seen
        self.user.update_last_seen()

        return data


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom token view with device registration."""
    serializer_class = CustomTokenObtainPairSerializer


class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet for User model.

    Provides CRUD operations for users with organization scoping.
    """
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        """Get users for current organization."""
        return User.objects.filter(organization=self.request.user.organization)

    def get_serializer_class(self):
        """Use different serializer for create."""
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    @action(detail=False, methods=['get'])
    def me(self, request):
        """Get current user profile."""
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)


class DeviceViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Device model.

    Allows users to manage their registered devices.
    """
    serializer_class = DeviceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Get devices for current user."""
        return Device.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        """Set user when creating device."""
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate a device."""
        device = self.get_object()
        device.is_active = False
        device.save(update_fields=['is_active'])
        return Response({'status': 'device deactivated'})


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for Organization model (read-only).

    Users can view their organization details.
    """
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Get current user's organization."""
        return Organization.objects.filter(id=self.request.user.organization_id)


class ProjectViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Project model.

    Provides CRUD operations for projects with organization scoping.
    """
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        """Get projects for current organization."""
        queryset = Project.objects.filter(
            organization=self.request.user.organization,
            deleted_at__isnull=True
        )

        # Filter by archived status
        is_archived = self.request.query_params.get('is_archived')
        if is_archived is not None:
            queryset = queryset.filter(is_archived=is_archived.lower() == 'true')

        return queryset

    def perform_create(self, serializer):
        """Set organization and creator when creating project."""
        serializer.save(
            organization=self.request.user.organization,
            created_by=self.request.user
        )

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive a project."""
        project = self.get_object()
        project.is_archived = True
        project.save(update_fields=['is_archived'])
        return Response({'status': 'project archived'})

    @action(detail=True, methods=['post'])
    def unarchive(self, request, pk=None):
        """Unarchive a project."""
        project = self.get_object()
        project.is_archived = False
        project.save(update_fields=['is_archived'])
        return Response({'status': 'project unarchived'})
