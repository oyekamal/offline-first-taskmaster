"""
Management command to create test data for development.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Organization, User, Device, Project
from tasks.models import Task, Comment
import random


class Command(BaseCommand):
    help = 'Create test data for development'

    def add_arguments(self, parser):
        parser.add_argument(
            '--users',
            type=int,
            default=5,
            help='Number of users to create'
        )
        parser.add_argument(
            '--tasks',
            type=int,
            default=20,
            help='Number of tasks to create'
        )

    def handle(self, *args, **options):
        num_users = options['users']
        num_tasks = options['tasks']

        self.stdout.write('Creating test data...')

        # Create organization
        org, created = Organization.objects.get_or_create(
            slug='test-org',
            defaults={
                'name': 'Test Organization',
                'storage_quota_mb': 10240
            }
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created organization: {org.name}'))
        else:
            self.stdout.write(f'Using existing organization: {org.name}')

        # Create users
        users = []
        for i in range(num_users):
            email = f'user{i+1}@test.com'
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    'name': f'Test User {i+1}',
                    'organization': org,
                    'role': 'member' if i > 0 else 'admin'
                }
            )
            if created:
                user.set_password('testpass123')
                user.save()
                self.stdout.write(self.style.SUCCESS(f'Created user: {email}'))

                # Create device for user
                Device.objects.create(
                    user=user,
                    device_name=f'Test Device {i+1}',
                    device_fingerprint=f'test-device-{i+1}'
                )
            users.append(user)

        # Create projects
        projects = []
        for i in range(3):
            project, created = Project.objects.get_or_create(
                organization=org,
                name=f'Project {i+1}',
                defaults={
                    'description': f'Test project {i+1}',
                    'color': random.choice(['#3B82F6', '#EF4444', '#10B981', '#F59E0B']),
                    'created_by': users[0]
                }
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created project: {project.name}'))
            projects.append(project)

        # Create tasks
        statuses = ['todo', 'in_progress', 'done', 'blocked']
        priorities = ['low', 'medium', 'high', 'urgent']

        for i in range(num_tasks):
            creator = random.choice(users)
            assignee = random.choice(users) if random.random() > 0.3 else None

            task, created = Task.objects.get_or_create(
                organization=org,
                title=f'Task {i+1}: {random.choice(["Implement", "Fix", "Design", "Update"])} {random.choice(["feature", "bug", "UI", "API"])}',
                defaults={
                    'description': f'This is a test task description for task {i+1}.\n\nIt contains multiple lines and some **markdown** formatting.',
                    'status': random.choice(statuses),
                    'priority': random.choice(priorities),
                    'project': random.choice(projects) if random.random() > 0.3 else None,
                    'created_by': creator,
                    'assigned_to': assignee,
                    'last_modified_by': creator,
                    'tags': random.sample(['urgent', 'bug', 'feature', 'frontend', 'backend', 'design'], k=random.randint(0, 3)),
                    'vector_clock': {}
                }
            )

            if created:
                # Create some comments
                if random.random() > 0.5:
                    num_comments = random.randint(1, 5)
                    for j in range(num_comments):
                        commenter = random.choice(users)
                        Comment.objects.create(
                            task=task,
                            user=commenter,
                            content=f'Test comment {j+1} on task {i+1}',
                            last_modified_by=commenter,
                            vector_clock={}
                        )

        self.stdout.write(self.style.SUCCESS(f'\nTest data created successfully!'))
        self.stdout.write(f'Organization: {org.name}')
        self.stdout.write(f'Users: {len(users)}')
        self.stdout.write(f'Projects: {len(projects)}')
        self.stdout.write(f'Tasks: {num_tasks}')
        self.stdout.write(f'\nYou can login with:')
        self.stdout.write(f'  Email: user1@test.com')
        self.stdout.write(f'  Password: testpass123')
