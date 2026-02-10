"""
Signal handlers for tasks app.
"""
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver
from .models import Task, Comment
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Task)
def task_post_save(sender, instance, created, **kwargs):
    """Handle post-save actions for Task model."""
    if created:
        logger.info(f"New task created: {instance.title} by {instance.created_by.name}")


@receiver(post_save, sender=Comment)
def comment_post_save(sender, instance, created, **kwargs):
    """Handle post-save actions for Comment model."""
    if created:
        logger.info(f"New comment created on task {instance.task.title} by {instance.user.name}")
