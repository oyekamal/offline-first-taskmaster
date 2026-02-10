"""
Custom permissions for organization-scoped access control.
"""
from rest_framework import permissions


class IsOrganizationMember(permissions.BasePermission):
    """
    Permission to check if user belongs to the same organization.

    For objects, checks if the object belongs to user's organization.
    """

    def has_permission(self, request, view):
        """Check if user is authenticated and has an organization."""
        return request.user and request.user.is_authenticated and request.user.organization

    def has_object_permission(self, request, view, obj):
        """Check if object belongs to user's organization."""
        # Check if object has organization attribute
        if hasattr(obj, 'organization'):
            return obj.organization_id == request.user.organization_id

        # Check if object is a user in same organization
        if hasattr(obj, 'organization_id'):
            return obj.organization_id == request.user.organization_id

        # Check if object belongs to task in same organization
        if hasattr(obj, 'task'):
            return obj.task.organization_id == request.user.organization_id

        return False


class IsOrganizationAdmin(permissions.BasePermission):
    """Permission to check if user is organization admin."""

    def has_permission(self, request, view):
        """Check if user is admin of their organization."""
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ['admin', 'manager']
        )
