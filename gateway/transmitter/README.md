# Transmitter

**Language:** Python 3.11+
**Framework:** FastAPI
**Port:** 8020
**Status:** ✅ Implemented

## Purpose

Securely transmit approved discovery data to external systems (AIForce Assess). Batches approved events, compresses payloads, and handles transmission with retry and circuit breaker patterns.

## Features

- [x] FastAPI service scaffolding
- [x] RabbitMQ consumer for approved.* events
- [x] Batch processing (configurable size and interval)
- [x] Payload compression (gzip)
- [x] HTTPS client with authentication
- [x] Retry with exponential backoff
- [x] Circuit breaker pattern
- [x] Transmission tracking in PostgreSQL
- [x] Health/ready endpoints
- [x] Prometheus metrics

## Events Consumed

| Event Pattern | Action |
|--------------|--------|
| `approved.*` | Queue for transmission |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check (DB, RabbitMQ, circuit breaker) |
| GET | `/api/v1/stats` | Transmission statistics |
| GET | `/metrics` | Prometheus metrics |

## Configuration

Environment variables (prefix: `TRANSMITTER_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSMITTER_SERVER_HOST` | `0.0.0.0` | Server bind host |
| `TRANSMITTER_SERVER_PORT` | `8020` | Server port |
| `TRANSMITTER_RABBITMQ_URL` | `amqp://discovery:discovery@localhost:5672/` | RabbitMQ URL |
| `TRANSMITTER_RABBITMQ_EXCHANGE` | `discovery.events` | RabbitMQ exchange |
| `TRANSMITTER_RABBITMQ_QUEUE` | `transmitter.approved` | Queue name |
| `TRANSMITTER_DATABASE_URL` | `postgresql://...` | PostgreSQL URL |
| `TRANSMITTER_DESTINATION_URL` | `https://api.example.com/v1/discovery` | External API URL |
| `TRANSMITTER_AUTH_TOKEN` | `` | API authentication token |
| `TRANSMITTER_BATCH_SIZE` | `100` | Max items per batch |
| `TRANSMITTER_BATCH_INTERVAL_S` | `60` | Batch interval (seconds) |
| `TRANSMITTER_RETRY_MAX_ATTEMPTS` | `3` | Max retry attempts |
| `TRANSMITTER_RETRY_BACKOFF_MULTIPLIER` | `2` | Exponential backoff multiplier |
| `TRANSMITTER_RETRY_MAX_DELAY_S` | `300` | Max retry delay (seconds) |
| `TRANSMITTER_CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures to open circuit |
| `TRANSMITTER_CIRCUIT_RESET_TIMEOUT_S` | `60` | Circuit reset timeout |
| `TRANSMITTER_LOG_LEVEL` | `INFO` | Logging level |

## Batch Processing

The transmitter batches approved discoveries to reduce API calls:

1. Events accumulate in an in-memory queue
2. A batch is sent when:
   - Queue reaches `BATCH_SIZE` items, OR
   - `BATCH_INTERVAL_S` seconds have passed
3. Payloads are compressed with gzip before transmission
4. Batch status is tracked in PostgreSQL

## Retry & Circuit Breaker

### Retry Logic
- Failed requests are retried with exponential backoff
- `wait = multiplier^attempt` (capped at `max_delay`)
- Only server errors (5xx) trigger retries
- Client errors (4xx) fail immediately

### Circuit Breaker
- Opens after `failure_threshold` consecutive failures
- When open, requests fail fast without calling API
- Closes after `reset_timeout` seconds

## Database Schema

```sql
CREATE SCHEMA transmitter;

CREATE TABLE transmitter.batches (
    id UUID PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    item_count INTEGER NOT NULL,
    payload_size INTEGER NOT NULL,
    destination_url TEXT NOT NULL,
    http_status INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    sent_at TIMESTAMP,
    completed_at TIMESTAMP
);
```

## Development

```bash
cd gateway/transmitter
python -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
python -m src.main
```

## Docker

```bash
# Build
docker build -t transmitter .

# Run
docker run -p 8020:8020 \
  -e TRANSMITTER_RABBITMQ_URL=amqp://discovery:discovery@rabbitmq:5672/ \
  -e TRANSMITTER_DESTINATION_URL=https://api.example.com/v1/discovery \
  -e TRANSMITTER_AUTH_TOKEN=your-token \
  transmitter
```

## Testing

```bash
pytest tests/
pytest tests/ --cov=src --cov-report=term-missing
```

## Project Structure

```
gateway/transmitter/
├── src/
│   ├── __init__.py
│   ├── main.py          # FastAPI application
│   ├── config.py        # Pydantic settings
│   ├── consumer.py      # RabbitMQ consumer
│   ├── batch.py         # Batch processing logic
│   ├── client.py        # External API client
│   └── database.py      # PostgreSQL client
├── tests/
│   └── test_batch.py
├── requirements.txt
├── requirements-dev.txt
└── Dockerfile
```
