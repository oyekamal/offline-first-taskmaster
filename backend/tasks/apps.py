"""
Tasks application configuration.
"""
from django.apps import AppConfig


class TasksConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'tasks'
    verbose_name = 'Tasks'

    def ready(self):
        """Import signals when app is ready."""
        import tasks.signals
