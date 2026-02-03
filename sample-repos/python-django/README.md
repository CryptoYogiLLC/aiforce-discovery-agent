# Sample Django E-Commerce API

A sample Django REST API application for the Discovery Agent dry-run testing.

## Features

- Product catalog with categories
- Order management
- Customer profiles with loyalty tiers
- Celery async tasks for email and inventory
- PostgreSQL database
- Redis for caching and Celery broker

## Expected Discoveries

When analyzed by the Code Analyzer, this repository should produce:

### Dependencies

- Django 4.2.0 (Web Framework)
- PostgreSQL (Database)
- Redis (Cache/Message Broker)
- Celery (Task Queue)

### Security Findings

- `requests==2.25.0` has known vulnerability CVE-2023-32681

### Code Metrics

- ~1500 lines of Python code
- 4 main models with relationships
- 3 API ViewSets
- 4 Celery tasks
- Comprehensive test coverage

## Running Locally

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start development server
python manage.py runserver
```

## Environment Variables

| Variable          | Description           | Default                  |
| ----------------- | --------------------- | ------------------------ |
| DJANGO_SECRET_KEY | Secret key for Django | dev-secret-key           |
| DJANGO_DEBUG      | Enable debug mode     | True                     |
| DB_HOST           | PostgreSQL host       | localhost                |
| DB_NAME           | Database name         | myapp                    |
| CELERY_BROKER_URL | Redis URL for Celery  | redis://localhost:6379/0 |
