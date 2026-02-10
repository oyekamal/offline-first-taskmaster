# Makefile for TaskManager Backend

.PHONY: help install migrate run test clean shell

help:
	@echo "TaskManager Backend - Makefile Commands"
	@echo ""
	@echo "install      - Install dependencies"
	@echo "migrate      - Run database migrations"
	@echo "makemigrations - Create new migrations"
	@echo "run          - Start development server"
	@echo "celery       - Start Celery worker"
	@echo "test         - Run tests"
	@echo "coverage     - Run tests with coverage"
	@echo "shell        - Open Django shell"
	@echo "createsuperuser - Create Django superuser"
	@echo "clean        - Remove Python artifacts"
	@echo "format       - Format code with black"
	@echo "lint         - Run linting checks"

install:
	pip install -r requirements.txt

migrate:
	python manage.py migrate

makemigrations:
	python manage.py makemigrations

run:
	python manage.py runserver

celery:
	celery -A taskmanager worker -l info

celery-beat:
	celery -A taskmanager beat -l info

test:
	pytest

coverage:
	pytest --cov=. --cov-report=html

shell:
	python manage.py shell

createsuperuser:
	python manage.py createsuperuser

clean:
	find . -type f -name '*.pyc' -delete
	find . -type d -name '__pycache__' -delete
	find . -type d -name '*.egg-info' -exec rm -rf {} +
	rm -rf htmlcov/
	rm -rf .pytest_cache/
	rm -rf .coverage

format:
	black .

lint:
	flake8 .
	pylint **/*.py

setup: install migrate createsuperuser
	@echo "Setup complete! Run 'make run' to start the server"
