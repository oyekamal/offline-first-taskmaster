# Deployment Guide

Complete guide for deploying the TaskManager backend to production.

## Prerequisites

- Ubuntu 20.04+ or similar Linux distribution
- Python 3.10+
- PostgreSQL 14+
- Redis 7+
- Nginx
- Supervisor (for process management)
- Domain name with DNS configured

## Production Setup

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3-pip python3-venv postgresql postgresql-contrib \
    redis-server nginx supervisor git

# Install PostgreSQL development files
sudo apt install -y libpq-dev python3-dev
```

### 2. Create Application User

```bash
# Create user
sudo useradd -m -s /bin/bash taskmanager
sudo su - taskmanager
```

### 3. Clone and Setup Application

```bash
# Clone repository
git clone https://github.com/yourusername/taskmanager.git
cd taskmanager/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Install production dependencies
pip install gunicorn psycopg2-binary
```

### 4. Configure PostgreSQL

```bash
# Switch to postgres user
sudo su - postgres

# Create database and user
psql
```

```sql
CREATE DATABASE taskmanager_prod;
CREATE USER taskmanager_user WITH PASSWORD 'your-secure-password';
ALTER ROLE taskmanager_user SET client_encoding TO 'utf8';
ALTER ROLE taskmanager_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE taskmanager_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE taskmanager_prod TO taskmanager_user;
\q
```

```bash
exit  # Exit postgres user
```

### 5. Configure Environment Variables

```bash
# Create production .env file
nano /home/taskmanager/taskmanager/backend/.env
```

```bash
# Django Settings
SECRET_KEY=your-super-secret-production-key-change-this
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Database
DB_NAME=taskmanager_prod
DB_USER=taskmanager_user
DB_PASSWORD=your-secure-password
DB_HOST=localhost
DB_PORT=5432

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT Settings
JWT_SECRET_KEY=your-jwt-secret-key-change-this
JWT_ACCESS_TOKEN_LIFETIME=86400
JWT_REFRESH_TOKEN_LIFETIME=604800

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# CORS
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Email
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password

# Sentry (optional)
SENTRY_DSN=your-sentry-dsn
```

### 6. Run Migrations and Setup

```bash
# Activate virtual environment
source venv/bin/activate

# Run migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Collect static files
python manage.py collectstatic --noinput

# Create logs directory
mkdir -p logs
```

### 7. Configure Gunicorn

Create `/home/taskmanager/taskmanager/backend/gunicorn_config.py`:

```python
import multiprocessing

bind = "127.0.0.1:8000"
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "sync"
worker_connections = 1000
timeout = 60
keepalive = 5

# Logging
accesslog = "/home/taskmanager/taskmanager/backend/logs/gunicorn-access.log"
errorlog = "/home/taskmanager/taskmanager/backend/logs/gunicorn-error.log"
loglevel = "info"

# Process naming
proc_name = "taskmanager"

# Server mechanics
daemon = False
pidfile = "/home/taskmanager/taskmanager/backend/gunicorn.pid"
user = "taskmanager"
group = "taskmanager"
```

### 8. Configure Supervisor

Create `/etc/supervisor/conf.d/taskmanager.conf`:

```ini
[program:taskmanager_web]
command=/home/taskmanager/taskmanager/backend/venv/bin/gunicorn taskmanager.wsgi:application -c /home/taskmanager/taskmanager/backend/gunicorn_config.py
directory=/home/taskmanager/taskmanager/backend
user=taskmanager
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/home/taskmanager/taskmanager/backend/logs/supervisor-web.log

[program:taskmanager_celery]
command=/home/taskmanager/taskmanager/backend/venv/bin/celery -A taskmanager worker -l info
directory=/home/taskmanager/taskmanager/backend
user=taskmanager
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/home/taskmanager/taskmanager/backend/logs/supervisor-celery.log

[program:taskmanager_celery_beat]
command=/home/taskmanager/taskmanager/backend/venv/bin/celery -A taskmanager beat -l info
directory=/home/taskmanager/taskmanager/backend
user=taskmanager
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/home/taskmanager/taskmanager/backend/logs/supervisor-beat.log
```

```bash
# Update supervisor
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start all
```

### 9. Configure Nginx

Create `/etc/nginx/sites-available/taskmanager`:

```nginx
upstream taskmanager_backend {
    server 127.0.0.1:8000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL Configuration (use certbot to generate)
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 100M;

    # Static files
    location /static/ {
        alias /home/taskmanager/taskmanager/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Media files
    location /media/ {
        alias /home/taskmanager/taskmanager/backend/mediafiles/;
        expires 7d;
        add_header Cache-Control "public";
    }

    # Health check
    location /health/ {
        access_log off;
        proxy_pass http://taskmanager_backend;
    }

    # API endpoints
    location / {
        proxy_pass http://taskmanager_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_redirect off;

        # WebSocket support (if needed later)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/taskmanager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 10. Setup SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test auto-renewal
sudo certbot renew --dry-run
```

## Docker Deployment

### Using Docker Compose

```bash
# Build and start services
docker-compose up -d

# Run migrations
docker-compose exec web python manage.py migrate

# Create superuser
docker-compose exec web python manage.py createsuperuser

# View logs
docker-compose logs -f web
```

## Monitoring and Maintenance

### Log Monitoring

```bash
# View application logs
tail -f /home/taskmanager/taskmanager/backend/logs/django.log

# View Gunicorn logs
tail -f /home/taskmanager/taskmanager/backend/logs/gunicorn-error.log

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Database Backup

```bash
# Create backup script
cat > /home/taskmanager/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/taskmanager/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup database
pg_dump -U taskmanager_user taskmanager_prod | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete
EOF

chmod +x /home/taskmanager/backup.sh

# Add to crontab (daily at 2am)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/taskmanager/backup.sh") | crontab -
```

### Performance Monitoring

```bash
# Monitor Celery
sudo supervisorctl status taskmanager_celery

# Check Redis
redis-cli ping
redis-cli info stats

# Check PostgreSQL
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"
```

### Updating Application

```bash
# Switch to app user
sudo su - taskmanager
cd taskmanager/backend

# Activate virtual environment
source venv/bin/activate

# Pull latest code
git pull origin main

# Install new dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Collect static files
python manage.py collectstatic --noinput

# Restart services
sudo supervisorctl restart all
```

## Security Best Practices

1. **Firewall Configuration:**
```bash
sudo ufw allow 22     # SSH
sudo ufw allow 80     # HTTP
sudo ufw allow 443    # HTTPS
sudo ufw enable
```

2. **PostgreSQL Security:**
```bash
# Edit pg_hba.conf to restrict connections
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Use md5 authentication, not trust
```

3. **Regular Updates:**
```bash
# Update system packages weekly
sudo apt update && sudo apt upgrade -y
```

4. **Fail2Ban:**
```bash
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Troubleshooting

### Service Won't Start

```bash
# Check supervisor status
sudo supervisorctl status

# View error logs
tail -n 50 /home/taskmanager/taskmanager/backend/logs/supervisor-web.log
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U taskmanager_user -d taskmanager_prod -h localhost
```

### High Memory Usage

```bash
# Check process memory
ps aux | grep gunicorn
ps aux | grep celery

# Adjust worker count in gunicorn_config.py
```

## Rollback Procedure

```bash
# Switch to app user
sudo su - taskmanager
cd taskmanager/backend

# Checkout previous version
git log --oneline
git checkout <previous-commit-hash>

# Rollback migrations if needed
python manage.py migrate <app_name> <previous_migration>

# Restart services
sudo supervisorctl restart all
```

## Support and Monitoring Tools

- **Sentry**: Error tracking and monitoring
- **Datadog**: Application performance monitoring
- **Prometheus + Grafana**: Metrics and dashboards
- **ELK Stack**: Centralized logging

## Production Checklist

- [ ] Environment variables configured
- [ ] Database created and migrated
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] Backup script scheduled
- [ ] Monitoring tools configured
- [ ] Error tracking enabled (Sentry)
- [ ] Rate limiting configured
- [ ] Security headers configured
- [ ] CORS settings verified
- [ ] Static files collected
- [ ] Services auto-start on boot
- [ ] Log rotation configured
- [ ] Health checks working
- [ ] Documentation updated
