# Task Manager Backend - Offline-First with Vector Clock Sync

A production-ready Django REST API backend for an offline-first task management application with vector clock-based synchronization.

## Features

- **Vector Clock Synchronization**: Causality tracking for distributed updates
- **Conflict Detection & Resolution**: Automatic and manual conflict resolution
- **Offline-First Architecture**: Delta sync with push/pull operations
- **Soft Deletion**: Tombstone tracking for proper sync propagation
- **Optimistic Locking**: Version-based concurrent update handling
- **Organization Scoping**: Multi-tenant with row-level security
- **Comprehensive Audit Trail**: Full history tracking for tasks
- **JWT Authentication**: Secure token-based auth with device registration
- **REST API**: Clean, documented endpoints with DRF

## Tech Stack

- **Django 5.0**: Web framework
- **PostgreSQL**: Primary database with JSONB support
- **Django REST Framework**: API framework
- **Redis**: Caching and Celery broker
- **Celery**: Background task processing
- **JWT**: Token-based authentication

## Project Structure

```
backend/
├── taskmanager/          # Main Django project
│   ├── settings.py       # Django settings
│   ├── urls.py           # Root URL configuration
│   ├── celery.py         # Celery configuration
│   └── wsgi.py           # WSGI configuration
├── core/                 # Core app (User, Organization, Device)
│   ├── models.py         # Core models
│   ├── serializers.py    # Core serializers
│   ├── views.py          # Core views
│   ├── permissions.py    # Custom permissions
│   └── admin.py          # Admin configuration
├── tasks/                # Tasks app (Task, Comment)
│   ├── models.py         # Task and Comment models
│   ├── serializers.py    # Task serializers
│   ├── views.py          # Task ViewSets
│   └── admin.py          # Admin configuration
├── sync/                 # Sync app (Sync logic, Conflicts)
│   ├── models.py         # SyncLog, Conflict, Tombstone
│   ├── serializers.py    # Sync serializers
│   ├── views.py          # Sync views
│   ├── utils.py          # Vector clock utilities
│   ├── tasks.py          # Celery tasks
│   └── admin.py          # Admin configuration
├── requirements.txt      # Python dependencies
├── manage.py             # Django management script
└── README.md             # This file
```

## Setup Instructions

### Prerequisites

- Python 3.10+
- PostgreSQL 14+
- Redis 7+
- pip and virtualenv

### Installation

1. **Clone and navigate to backend directory:**
   ```bash
   cd /home/oye/Documents/offline_first_architecture/backend
   ```

2. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Create PostgreSQL database:**
   ```bash
   createdb taskmanager_db
   # Or using psql:
   psql -U postgres -c "CREATE DATABASE taskmanager_db;"
   ```

6. **Run migrations:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

7. **Create superuser:**
   ```bash
   python manage.py createsuperuser
   ```

8. **Start Redis (if not running):**
   ```bash
   redis-server
   ```

9. **Start Celery worker (in separate terminal):**
   ```bash
   celery -A taskmanager worker -l info
   ```

10. **Start Celery beat (in separate terminal):**
    ```bash
    celery -A taskmanager beat -l info
    ```

11. **Run development server:**
    ```bash
    python manage.py runserver
    ```

The API will be available at http://localhost:8000/

## API Endpoints

### Authentication

- `POST /api/auth/login/` - Login and get JWT token
- `POST /api/auth/refresh/` - Refresh JWT token

### Tasks

- `GET /api/tasks/` - List tasks
- `POST /api/tasks/` - Create task
- `GET /api/tasks/{id}/` - Get task details
- `PATCH /api/tasks/{id}/` - Update task
- `DELETE /api/tasks/{id}/` - Soft delete task
- `GET /api/tasks/{id}/comments/` - Get task comments
- `GET /api/tasks/{id}/history/` - Get task history

### Comments

- `GET /api/comments/` - List comments
- `POST /api/comments/` - Create comment
- `PATCH /api/comments/{id}/` - Update comment
- `DELETE /api/comments/{id}/` - Delete comment

### Synchronization

- `POST /api/sync/push/` - Push local changes to server
- `GET /api/sync/pull/` - Pull server changes
- `GET /api/sync/conflicts/` - Get unresolved conflicts
- `POST /api/sync/conflicts/{id}/resolve/` - Resolve conflict

### Users & Devices

- `GET /api/users/` - List organization users
- `GET /api/users/me/` - Get current user
- `GET /api/devices/` - List user devices
- `POST /api/devices/` - Register new device

### Projects

- `GET /api/projects/` - List projects
- `POST /api/projects/` - Create project
- `PATCH /api/projects/{id}/` - Update project
- `POST /api/projects/{id}/archive/` - Archive project

## Vector Clock Synchronization

### How it Works

1. **Each device maintains a vector clock** - a dictionary mapping device IDs to counters
2. **Local changes increment the device's counter** in the vector clock
3. **Sync operations merge vector clocks** by taking max of each device counter
4. **Conflict detection** compares vector clocks to determine causality:
   - `BEFORE`: Server has newer version (accept server)
   - `AFTER`: Local has newer version (accept local)
   - `CONCURRENT`: Simultaneous updates (conflict!)
   - `EQUAL`: Same version (no change)

### Example

```json
{
  "vector_clock": {
    "device-a123": 42,
    "device-b456": 18,
    "device-c789": 7
  }
}
```

## Sync Flow

### Push Sync

1. Client collects pending changes
2. Sends changes with vector clock to server
3. Server validates and detects conflicts
4. Server applies non-conflicting changes
5. Returns conflicts for manual resolution

### Pull Sync

1. Client requests changes since last sync
2. Server returns all changes excluding client's own
3. Client applies changes and updates vector clock
4. Client detects local conflicts and queues for resolution

## Conflict Resolution

### Automatic Resolution

- **Text fields**: Operational transformation (OT) merges changes
- **Priority**: Higher priority wins
- **Tags**: Union of both sets
- **Status**: State machine rules
- **Due date**: Earlier date wins

### Manual Resolution

- User chooses local, remote, or custom version
- Applied through conflict resolution endpoint
- Logged in audit trail

## Database Schema

### Core Models

- **Organization**: Multi-tenant container
- **User**: Extended Django user with organization
- **Device**: Tracks individual devices for sync
- **Project**: Optional task grouping

### Task Models

- **Task**: Main task entity with vector clock
- **Comment**: Task comments with threading
- **TaskHistory**: Complete audit trail

### Sync Models

- **SyncLog**: Tracks sync operations
- **Conflict**: Unresolved conflicts
- **Tombstone**: Tracks deletions for 90 days

## Testing

Run tests with pytest:

```bash
# Run all tests
pytest

# Run specific app tests
pytest tasks/tests.py

# Run with coverage
pytest --cov=. --cov-report=html
```

## Production Deployment

### Environment Variables

Set these in production:

```bash
SECRET_KEY=your-secure-secret-key
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DB_NAME=taskmanager_prod
DB_USER=taskmanager_user
DB_PASSWORD=strong-password
DB_HOST=db.yourdomain.com
REDIS_URL=redis://redis.yourdomain.com:6379/0
SENTRY_DSN=your-sentry-dsn
```

### Gunicorn

```bash
gunicorn taskmanager.wsgi:application --bind 0.0.0.0:8000 --workers 4
```

### Nginx Configuration

```nginx
upstream taskmanager {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://taskmanager;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /static/ {
        alias /path/to/staticfiles/;
    }
}
```

## Celery Tasks

### Scheduled Tasks

- `cleanup_expired_tombstones`: Runs daily to remove old tombstones
- `cleanup_old_sync_logs`: Removes logs older than 30 days
- `generate_sync_metrics`: Calculates sync statistics

## Admin Interface

Access the Django admin at http://localhost:8000/admin/

Features:
- Manage organizations, users, devices
- View and edit tasks, comments
- Monitor sync logs and conflicts
- View tombstones

## API Documentation

Interactive API documentation available at:
- Swagger UI: http://localhost:8000/api/docs/
- OpenAPI Schema: http://localhost:8000/api/schema/

## Monitoring & Logging

### Logging

Logs are written to:
- Console (stdout)
- File: `logs/django.log` (rotating, 15MB max, 10 backups)

### Metrics

Monitor these metrics:
- Sync success rate
- Conflict rate
- Average sync duration
- Active devices per user

## Security

- JWT authentication with refresh tokens
- Organization-scoped data access
- Row-level permissions
- CORS configuration
- CSRF protection
- Input validation and sanitization

## Performance Optimization

- Database query optimization with select_related/prefetch_related
- Strategic indexes on frequently queried fields
- Redis caching for frequently accessed data
- Pagination for large result sets
- Bulk operations for sync

## Troubleshooting

### Common Issues

1. **Migration errors**: Delete db and recreate
   ```bash
   python manage.py flush
   python manage.py migrate
   ```

2. **Celery not running**: Check Redis connection
   ```bash
   redis-cli ping
   ```

3. **Sync conflicts**: Check vector clock consistency
   ```bash
   python manage.py shell
   >>> from sync.utils import compare_vector_clocks
   ```

## Contributing

1. Follow PEP 8 style guide
2. Write comprehensive tests
3. Add docstrings to all functions
4. Update documentation for new features

## License

MIT License - See LICENSE file for details

## Support

For issues and questions:
- GitHub Issues: [project-repo]
- Email: support@example.com
- Documentation: [docs-url]
