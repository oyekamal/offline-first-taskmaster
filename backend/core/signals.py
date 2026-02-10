"""
Signal handlers for core app.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import User, Device
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def user_post_save(sender, instance, created, **kwargs):
    """Handle post-save actions for User model."""
    if created:
        logger.info(f"New user created: {instance.email} in organization {instance.organization.name}")


@receiver(post_save, sender=Device)
def device_post_save(sender, instance, created, **kwargs):
    """Handle post-save actions for Device model."""
    if created:
        logger.info(f"New device registered: {instance.device_name} for user {instance.user.email}")
