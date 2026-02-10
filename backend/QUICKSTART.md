# Quick Start Guide

Get the TaskManager backend running in 5 minutes.

## Prerequisites

- Python 3.10+
- PostgreSQL 14+
- Redis 7+

## Option 1: Docker (Recommended)

```bash
# Clone and navigate
cd /home/oye/Documents/offline_first_architecture/backend

# Start all services
docker-compose up -d

# Run migrations
docker-compose exec web python manage.py migrate

# Create superuser
docker-compose exec web python manage.py createsuperuser

# Create test data (optional)
docker-compose exec web python manage.py create_test_data

# Access API
curl http://localhost:8000/health/
```

**API will be available at:** http://localhost:8000/

**Admin interface:** http://localhost:8000/admin/

**API Documentation:** http://localhost:8000/api/docs/

## Option 2: Local Development

### 1. Setup Environment

```bash
# Navigate to backend
cd /home/oye/Documents/offline_first_architecture/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Database

```bash
# Create PostgreSQL database
createdb taskmanager_db

# Or using psql
psql -U postgres
CREATE DATABASE taskmanager_db;
\q
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your settings
nano .env
```

Minimum required settings:
```bash
SECRET_KEY=your-secret-key-change-this
DEBUG=True
DB_NAME=taskmanager_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
REDIS_URL=redis://localhost:6379/0
```

### 4. Run Migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Create Superuser

```bash
python manage.py createsuperuser
```

### 6. Start Services

**Terminal 1 - Django Server:**
```bash
python manage.py runserver
```

**Terminal 2 - Redis:**
```bash
redis-server
```

**Terminal 3 - Celery Worker:**
```bash
celery -A taskmanager worker -l info
```

**Terminal 4 - Celery Beat (optional):**
```bash
celery -A taskmanager beat -l info
```

### 7. Create Test Data (Optional)

```bash
python manage.py create_test_data --users 5 --tasks 20
```

Test credentials will be:
- Email: `user1@test.com`
- Password: `testpass123`

## Verify Installation

### 1. Health Check

```bash
curl http://localhost:8000/health/
# Should return: {"status":"healthy"}
```

### 2. Login and Get Token

```bash
curl -X POST http://localhost:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user1@test.com",
    "password": "testpass123",
    "deviceFingerprint": "test-device-123",
    "deviceName": "Test Device"
  }'
```

Save the `access` token from the response.

### 3. Create a Task

```bash
curl -X POST http://localhost:8000/api/tasks/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "X-Device-ID: YOUR_DEVICE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Task",
    "description": "Testing the API",
    "status": "todo",
    "priority": "medium",
    "last_modified_by": "USER_ID"
  }'
```

### 4. List Tasks

```bash
curl http://localhost:8000/api/tasks/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Using the API

### Available Endpoints

- **Authentication:**
  - `POST /api/auth/login/` - Login
  - `POST /api/auth/refresh/` - Refresh token

- **Tasks:**
  - `GET /api/tasks/` - List tasks
  - `POST /api/tasks/` - Create task
  - `GET /api/tasks/{id}/` - Get task
  - `PATCH /api/tasks/{id}/` - Update task
  - `DELETE /api/tasks/{id}/` - Delete task

- **Sync:**
  - `POST /api/sync/push/` - Push changes
  - `GET /api/sync/pull/` - Pull changes
  - `GET /api/sync/conflicts/` - List conflicts

- **Documentation:**
  - `GET /api/docs/` - Interactive API docs
  - `GET /api/schema/` - OpenAPI schema

See **API_EXAMPLES.md** for detailed usage examples.

## Admin Interface

1. Navigate to: http://localhost:8000/admin/
2. Login with your superuser credentials
3. Browse and manage:
   - Organizations
   - Users
   - Devices
   - Tasks
   - Comments
   - Sync Logs
   - Conflicts

## Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest tasks/tests.py

# Run specific test
pytest tasks/tests.py::TestTaskModel::test_create_task
```

## Useful Commands

### Makefile Commands

```bash
make install         # Install dependencies
make migrate         # Run migrations
make run            # Start dev server
make test           # Run tests
make shell          # Open Django shell
make clean          # Remove artifacts
```

### Django Management Commands

```bash
# Create test data
python manage.py create_test_data --users 10 --tasks 50

# Cleanup sync data
python manage.py cleanup_sync_data --dry-run

# Database shell
python manage.py dbshell

# Django shell
python manage.py shell
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>
```

### Database Connection Error

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Or on macOS
brew services list
```

### Redis Connection Error

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Start Redis
redis-server
```

### Migration Issues

```bash
# Reset database (WARNING: Deletes all data)
python manage.py flush
python manage.py migrate

# Or delete database and recreate
dropdb taskmanager_db
createdb taskmanager_db
python manage.py migrate
```

### Module Not Found

```bash
# Ensure virtual environment is activated
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt
```

## Next Steps

1. **Read the Documentation:**
   - `README.md` - Comprehensive setup guide
   - `API_EXAMPLES.md` - API usage examples
   - `DEPLOYMENT.md` - Production deployment
   - `PROJECT_SUMMARY.md` - Architecture overview

2. **Explore the Admin Interface:**
   - Create organizations
   - Add users and devices
   - Monitor sync operations
   - View conflicts

3. **Test the Sync:**
   - Create tasks via API
   - Push changes to server
   - Pull changes from server
   - Test conflict detection

4. **Customize:**
   - Add custom fields to tasks
   - Extend user model
   - Add new API endpoints
   - Implement webhooks

## Getting Help

- **Documentation:** Read the markdown files in this directory
- **Code Examples:** Check `API_EXAMPLES.md`
- **Tests:** Review test files for usage examples
- **Issues:** Check GitHub issues

## Development Workflow

1. **Create Feature Branch:**
```bash
git checkout -b feature/my-feature
```

2. **Make Changes:**
- Write code
- Add tests
- Update documentation

3. **Test:**
```bash
pytest
```

4. **Commit:**
```bash
git add .
git commit -m "Add feature description"
```

5. **Push:**
```bash
git push origin feature/my-feature
```

## Production Deployment

For production deployment, see **DEPLOYMENT.md** for complete instructions including:
- Server setup
- SSL configuration
- Nginx configuration
- Supervisor setup
- Monitoring
- Backups

---

**You're all set!** 🚀

The TaskManager backend is now running. Start building your offline-first application!
