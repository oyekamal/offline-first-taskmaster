# TaskManager Backend - Documentation Index

## Quick Navigation

### Getting Started
1. **[QUICKSTART.md](QUICKSTART.md)** ⚡ - Get running in 5 minutes
2. **[README.md](README.md)** 📖 - Comprehensive setup guide
3. **[setup.sh](setup.sh)** 🔧 - Automated setup script

### Development
4. **[API_EXAMPLES.md](API_EXAMPLES.md)** 💻 - Complete API usage examples
5. **[requirements.txt](requirements.txt)** 📦 - Python dependencies
6. **[Makefile](Makefile)** ⚙️ - Convenience commands
7. **[pytest.ini](pytest.ini)** 🧪 - Test configuration

### Deployment
8. **[DEPLOYMENT.md](DEPLOYMENT.md)** 🚀 - Production deployment guide
9. **[Dockerfile](Dockerfile)** 🐳 - Docker image configuration
10. **[docker-compose.yml](docker-compose.yml)** 🐳 - Multi-container setup
11. **[nginx.conf](nginx.conf)** 🌐 - Nginx reverse proxy config

### Architecture
12. **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** 🏗️ - Complete project overview
13. **[.env.example](.env.example)** 🔐 - Environment variables template
14. **[.gitignore](.gitignore)** 📝 - Git ignore patterns

---

## File Structure

```
backend/
├── 📁 core/                 # Core app (Organization, User, Device)
│   ├── models.py           # Core models
│   ├── serializers.py      # Core serializers
│   ├── views.py            # Authentication & user management
│   ├── views_health.py     # Health check endpoints
│   ├── permissions.py      # Custom permissions
│   ├── middleware.py       # Custom middleware
│   ├── utils.py            # Utility functions
│   ├── admin.py            # Admin interface
│   ├── signals.py          # Signal handlers
│   ├── exceptions.py       # Error handlers
│   └── management/         # Management commands
│       └── commands/
│           └── create_test_data.py
│
├── 📁 tasks/               # Tasks app (Task, Comment, History)
│   ├── models.py           # Task and Comment models
│   ├── serializers.py      # Task serializers
│   ├── views.py            # Task ViewSets
│   ├── admin.py            # Task admin interface
│   ├── signals.py          # Task signals
│   └── tests.py            # Task tests
│
├── 📁 sync/                # Synchronization app
│   ├── models.py           # SyncLog, Conflict, Tombstone
│   ├── serializers.py      # Sync serializers
│   ├── views.py            # Push/pull sync endpoints
│   ├── utils.py            # Vector clock utilities
│   ├── tasks.py            # Celery background tasks
│   ├── admin.py            # Sync admin interface
│   ├── tests.py            # Sync tests
│   └── management/
│       └── commands/
│           └── cleanup_sync_data.py
│
├── 📁 taskmanager/         # Django project
│   ├── settings.py         # Django configuration
│   ├── urls.py             # URL routing
│   ├── celery.py           # Celery configuration
│   └── wsgi.py             # WSGI entry point
│
└── 📄 Documentation & Config Files
    ├── README.md           # Main documentation
    ├── QUICKSTART.md       # Quick start guide
    ├── API_EXAMPLES.md     # API usage examples
    ├── DEPLOYMENT.md       # Production deployment
    ├── PROJECT_SUMMARY.md  # Architecture overview
    ├── INDEX.md            # This file
    ├── requirements.txt    # Dependencies
    ├── Dockerfile          # Docker image
    ├── docker-compose.yml  # Multi-container
    ├── nginx.conf          # Nginx config
    ├── Makefile            # Convenience commands
    ├── pytest.ini          # Test config
    ├── setup.sh            # Setup script
    └── .env.example        # Environment template
```

---

## Key Features Implemented

### ✅ Core Functionality
- Multi-tenant organization system
- Extended user model with roles
- Device tracking for sync
- JWT authentication
- Project management

### ✅ Task Management
- Full CRUD operations
- Status and priority tracking
- Task assignment
- Soft deletion
- Complete audit trail
- Comment threading

### ✅ Offline-First Synchronization
- Vector clock causality tracking
- Push/pull delta sync
- Automatic conflict detection
- Manual conflict resolution
- Tombstone propagation
- Batch operations

### ✅ REST API
- 20+ endpoints
- JWT authentication
- Organization scoping
- Filtering and search
- Pagination
- OpenAPI documentation

### ✅ Background Tasks
- Tombstone cleanup
- Sync log cleanup
- Metrics generation
- Extensible framework

### ✅ Production Ready
- Docker support
- Nginx configuration
- Health checks
- Monitoring hooks
- Database optimization
- Caching infrastructure

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Framework | Django 5.0 |
| API | Django REST Framework |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| Task Queue | Celery |
| Auth | JWT |
| Docs | drf-spectacular |
| Testing | pytest |
| Server | Gunicorn |
| Proxy | Nginx |
| Container | Docker |

---

## Quick Commands

### Development
```bash
make install    # Install dependencies
make migrate    # Run migrations
make run        # Start dev server
make test       # Run tests
make shell      # Django shell
```

### Docker
```bash
docker-compose up -d              # Start all services
docker-compose logs -f web        # View logs
docker-compose exec web bash     # Enter container
docker-compose down              # Stop services
```

### Management
```bash
python manage.py create_test_data       # Create test data
python manage.py cleanup_sync_data      # Cleanup old data
python manage.py createsuperuser        # Create admin user
```

---

## API Endpoints Summary

### Authentication
- `POST /api/auth/login/` - Login with device registration
- `POST /api/auth/refresh/` - Refresh JWT token

### Tasks
- `GET/POST /api/tasks/` - List/create tasks
- `GET/PATCH/DELETE /api/tasks/{id}/` - Task operations
- `GET /api/tasks/{id}/history/` - Task audit trail
- `GET /api/tasks/{id}/comments/` - Task comments

### Synchronization
- `POST /api/sync/push/` - Push local changes
- `GET /api/sync/pull/` - Pull server changes
- `GET /api/sync/conflicts/` - List conflicts
- `POST /api/sync/conflicts/{id}/resolve/` - Resolve conflict

### Users & Management
- `GET /api/users/me/` - Current user profile
- `GET/POST /api/devices/` - Device management
- `GET/POST /api/projects/` - Project management

### Health & Monitoring
- `GET /health/` - Basic health check
- `GET /api/health/` - Detailed component health
- `GET /api/docs/` - Interactive API documentation

---

## Documentation by Role

### For Developers
1. Start with **[QUICKSTART.md](QUICKSTART.md)**
2. Read **[README.md](README.md)** for detailed setup
3. Study **[API_EXAMPLES.md](API_EXAMPLES.md)** for API usage
4. Review **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** for architecture

### For DevOps
1. Start with **[DEPLOYMENT.md](DEPLOYMENT.md)**
2. Review **[Dockerfile](Dockerfile)** and **[docker-compose.yml](docker-compose.yml)**
3. Configure **[nginx.conf](nginx.conf)**
4. Set up monitoring using health endpoints

### For Team Leads
1. Read **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** for overview
2. Review architecture and technology decisions
3. Check test coverage and documentation
4. Plan scaling strategy

---

## Support

- **Code Issues**: Check tests and error logs
- **Setup Problems**: Review QUICKSTART.md and README.md
- **API Questions**: See API_EXAMPLES.md
- **Deployment**: Follow DEPLOYMENT.md
- **Architecture**: Read PROJECT_SUMMARY.md

---

## Contributing

1. Fork the repository
2. Create feature branch
3. Write tests
4. Update documentation
5. Submit pull request

See **README.md** for detailed guidelines.

---

## License

MIT License - See LICENSE file for details.

---

**Last Updated**: February 10, 2026

**Version**: 1.0.0

**Status**: Production Ready ✅
