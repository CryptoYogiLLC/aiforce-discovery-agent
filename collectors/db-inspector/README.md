# Database Inspector

**Language:** Python 3.11+
**Framework:** FastAPI
**Port:** 8003
**Status:** ✅ Implemented

## Purpose

Inspect database schemas, identify relationships, and detect sensitive (PII) data in PostgreSQL and MySQL databases.

## Features

- [x] PostgreSQL schema extraction (asyncpg)
- [x] MySQL schema extraction (aiomysql)
- [x] Table and column metadata extraction
- [x] Index information
- [x] Foreign key / relationship mapping
- [x] Row count estimation
- [x] PII detection by column name patterns
- [x] PII detection by data sampling (configurable)
- [x] CloudEvents publishing to RabbitMQ
- [x] REST API for on-demand inspection
- [ ] Oracle support (planned)
- [ ] SQL Server support (planned)
- [ ] MongoDB support (planned)

## Events Published

| CloudEvents Type | Routing Key | Description |
|------------------|-------------|-------------|
| `discovery.database.discovered` | `discovered.database` | Database instance found |
| `discovery.schema.discovered` | `discovered.schema` | Table/column information |
| `discovery.relationship.discovered` | `discovered.relationship` | FK relationships |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check (includes RabbitMQ status) |
| GET | `/metrics` | Prometheus metrics |
| POST | `/api/v1/inspect` | Inspect database with provided credentials |
| POST | `/api/v1/inspect/postgres` | Inspect PostgreSQL using default config |
| POST | `/api/v1/inspect/mysql` | Inspect MySQL using default config |

### Inspect Request Body

```json
{
  "db_type": "postgres",
  "host": "localhost",
  "port": 5432,
  "user": "myuser",
  "password": "mypassword",
  "database": "mydb"
}
```

### Inspect Response

```json
{
  "database": "mydb",
  "db_type": "postgres",
  "tables": [
    {
      "name": "users",
      "schema": "public",
      "columns": [
        {
          "name": "id",
          "data_type": "integer",
          "nullable": false,
          "primary_key": true,
          "default": "nextval('users_id_seq'::regclass)"
        },
        {
          "name": "email",
          "data_type": "character varying",
          "nullable": false,
          "primary_key": false,
          "default": null
        }
      ],
      "indexes": [...],
      "row_count_estimate": 1500
    }
  ],
  "relationships": [
    {
      "name": "orders_user_fk",
      "source_table": "public.orders",
      "source_column": "user_id",
      "target_table": "public.users",
      "target_column": "id"
    }
  ],
  "pii_findings": [
    {
      "table": "public.users",
      "column": "email",
      "pii_type": "email",
      "confidence": 0.95,
      "detection_method": "column_name"
    }
  ]
}
```

## Configuration

Environment variables (prefix: `DBINSPECTOR_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DBINSPECTOR_SERVER_HOST` | `0.0.0.0` | Server bind host |
| `DBINSPECTOR_SERVER_PORT` | `8003` | Server port |
| `DBINSPECTOR_RABBITMQ_URL` | `amqp://discovery:discovery@localhost:5672/` | RabbitMQ URL |
| `DBINSPECTOR_RABBITMQ_EXCHANGE` | `discovery.events` | RabbitMQ exchange |
| `DBINSPECTOR_POSTGRES_HOST` | `localhost` | Default PostgreSQL host |
| `DBINSPECTOR_POSTGRES_PORT` | `5432` | Default PostgreSQL port |
| `DBINSPECTOR_POSTGRES_USER` | `postgres` | Default PostgreSQL user |
| `DBINSPECTOR_POSTGRES_PASSWORD` | `` | Default PostgreSQL password |
| `DBINSPECTOR_POSTGRES_DATABASE` | `postgres` | Default PostgreSQL database |
| `DBINSPECTOR_MYSQL_HOST` | `localhost` | Default MySQL host |
| `DBINSPECTOR_MYSQL_PORT` | `3306` | Default MySQL port |
| `DBINSPECTOR_MYSQL_USER` | `root` | Default MySQL user |
| `DBINSPECTOR_MYSQL_PASSWORD` | `` | Default MySQL password |
| `DBINSPECTOR_MYSQL_DATABASE` | `mysql` | Default MySQL database |
| `DBINSPECTOR_PII_SAMPLE_SIZE` | `100` | Rows to sample for PII detection |
| `DBINSPECTOR_PII_DETECTION_ENABLED` | `true` | Enable data sampling for PII |
| `DBINSPECTOR_LOG_LEVEL` | `INFO` | Logging level |

## PII Detection

### Column Name Patterns

Detects potential PII by column names:
- **email**: email, user_email, contact_email, etc.
- **phone**: phone, mobile, telephone, cell, etc.
- **ssn**: ssn, social_security, tax_id, national_id, etc.
- **credit_card**: credit_card, card_number, pan, etc.
- **address**: address, street, city, zip, postal, etc.
- **name**: first_name, last_name, full_name, etc.
- **dob**: dob, birth, date_of_birth, birthdate, etc.
- **ip_address**: ip, ip_address, client_ip, etc.
- **passport**: passport, passport_number, etc.
- **driver_license**: driver_license, license_number, etc.

### Data Pattern Detection

When enabled, samples data from text columns to detect:
- Email addresses (regex pattern)
- Phone numbers (various formats)
- SSN patterns (XXX-XX-XXXX)
- Credit card numbers (major card types)
- IP addresses (IPv4)
- ZIP codes (US format)

**Note**: Sampled data is NOT stored. Only patterns are matched and discarded.

## Development

```bash
cd collectors/db-inspector
python -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
python -m src.main
```

## Docker

```bash
# Build
docker build -t db-inspector .

# Run
docker run -p 8003:8003 \
  -e DBINSPECTOR_RABBITMQ_URL=amqp://discovery:discovery@rabbitmq:5672/ \
  db-inspector
```

## Testing

```bash
# Run all tests
pytest tests/

# Run with coverage
pytest tests/ --cov=src --cov-report=term-missing
```

## Project Structure

```
collectors/db-inspector/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Pydantic settings
│   ├── publisher.py         # CloudEvents to RabbitMQ
│   ├── connectors/
│   │   ├── __init__.py
│   │   ├── base.py          # Abstract base connector
│   │   ├── postgres.py      # PostgreSQL connector
│   │   └── mysql.py         # MySQL connector
│   └── analyzers/
│       ├── __init__.py
│       └── pii_detector.py  # PII detection logic
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_api.py
│   └── test_pii_detector.py
├── requirements.txt
├── requirements-dev.txt
├── Dockerfile
└── README.md
```
