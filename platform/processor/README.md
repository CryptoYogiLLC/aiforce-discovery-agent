# Unified Processor Service

The unified processor handles all event processing for the AIForce Discovery Agent:

- **Enrichment**: Adds context and metadata to discovered items
- **PII Redaction**: Removes sensitive information before data leaves the environment
- **Scoring**: Calculates complexity and effort scores for migration planning

## Architecture

```
discovered.* events → [Unified Processor] → scored.* events
                            │
                            ├── Enrichment Module
                            ├── PII Redaction Module
                            └── Scoring Module
```

## Quick Start

```bash
# Start infrastructure
docker-compose up -d

# Start processor with infrastructure
docker-compose --profile processor up -d
```

## Configuration

Environment variables:

| Variable                | Default                                     | Description               |
| ----------------------- | ------------------------------------------- | ------------------------- |
| `RABBITMQ_URL`          | `amqp://discovery:discovery@rabbitmq:5672/` | RabbitMQ connection URL   |
| `POSTGRES_URL`          | `postgresql+asyncpg://...`                  | PostgreSQL connection URL |
| `REDIS_URL`             | `redis://redis:6379`                        | Redis connection URL      |
| `LOG_LEVEL`             | `info`                                      | Logging level             |
| `ENRICHMENT_ENABLED`    | `true`                                      | Enable enrichment stage   |
| `PII_REDACTION_ENABLED` | `true`                                      | Enable PII redaction      |
| `SCORING_ENABLED`       | `true`                                      | Enable scoring stage      |
| `PII_REDACT_EMAILS`     | `true`                                      | Redact email addresses    |
| `PII_REDACT_IPS`        | `true`                                      | Redact IP addresses       |
| `PII_REDACT_HOSTNAMES`  | `false`                                     | Redact hostnames          |
| `PII_REDACT_USERNAMES`  | `true`                                      | Redact usernames in paths |

## API Endpoints

| Endpoint  | Method | Description                           |
| --------- | ------ | ------------------------------------- |
| `/health` | GET    | Health check for probes               |
| `/ready`  | GET    | Readiness check (RabbitMQ connection) |
| `/config` | GET    | Current configuration (non-sensitive) |

## Event Flow

### Input Events (Consumed)

- `discovered.server` - Server/host discovered on network
- `discovered.database` - Database instance found
- `discovered.repository` - Code repository analyzed

### Output Events (Published)

- `scored.server` - Server with scores
- `scored.database` - Database with scores
- `scored.repository` - Repository with scores

## Modules

### Enrichment Module

Adds contextual information:

- Environment classification (prod/staging/dev)
- Technology stack identification
- OS family classification
- Framework detection

### PII Redactor Module

Detects and redacts:

- Email addresses
- IP addresses (v4 and v6)
- SSN and credit card numbers
- API keys and secrets
- Usernames in paths

### Scoring Module

Calculates:

- **Complexity Score** (1-10): Technology complexity
- **Risk Score** (1-10): Migration risk based on environment and data sensitivity
- **Effort Score** (1-10): Estimated migration effort
- **Overall Score** (1-10): Weighted priority score

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run locally (requires RabbitMQ)
python -m uvicorn src.main:app --reload --port 8010
```

## Docker

```bash
# Build image
docker build -t discovery-processor .

# Run container
docker run -p 8010:8010 \
  -e RABBITMQ_URL=amqp://discovery:discovery@host.docker.internal:5672/ \
  discovery-processor
```
