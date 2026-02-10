#!/bin/bash

# TaskManager Backend Setup Script

echo "==================================="
echo "TaskManager Backend Setup"
echo "==================================="

# Check for Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check for PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "Warning: PostgreSQL client not found. Please ensure PostgreSQL is installed."
fi

# Check for Redis
if ! command -v redis-cli &> /dev/null; then
    echo "Warning: Redis client not found. Please ensure Redis is installed."
fi

# Create virtual environment
echo "Creating virtual environment..."
python3 -m venv venv

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Copy environment file
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "Please edit .env file with your configuration"
fi

# Create logs directory
mkdir -p logs

# Run migrations
echo "Running migrations..."
python manage.py makemigrations
python manage.py migrate

# Create superuser (optional)
echo ""
read -p "Do you want to create a superuser? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    python manage.py createsuperuser
fi

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

echo ""
echo "==================================="
echo "Setup Complete!"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Start Redis: redis-server"
echo "3. Start Celery worker: celery -A taskmanager worker -l info"
echo "4. Start development server: python manage.py runserver"
echo ""
echo "API will be available at: http://localhost:8000/"
echo "Admin interface: http://localhost:8000/admin/"
echo "API docs: http://localhost:8000/api/docs/"
echo ""
