# Development Guide

This guide covers setting up your local development environment for the AIForce Discovery Agent.

## Prerequisites

- **Docker** 24.0+ and Docker Compose v2
- **Go** 1.21+ (for Network Scanner)
- **Python** 3.11+ (for Code Analyzer, DB Inspector, Processing services)
- **Node.js** 20+ (for Approval UI)
- **Make** (for build commands)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/CryptoYogiLLC/aiforce-discovery-agent.git
cd aiforce-discovery-agent

# Copy environment template
cp .env.example .env

# Install pre-commit hooks
pip install pre-commit
pre-commit install

# Start infrastructure (RabbitMQ, PostgreSQL, Redis)
docker-compose up -d rabbitmq postgres redis

# Install dependencies for all services
make dev-setup

# Verify setup
make verify
```

## Project Structure

```
aiforce-discovery-agent/
├── collectors/                 # Data collection services
│   ├── network-scanner/        # Go - TCP/UDP scanning
│   ├── code-analyzer/          # Python - Repository analysis
│   └── db-inspector/           # Python - Schema extraction
├── platform/                   # Processing services
│   ├── config-service/         # Central configuration
│   ├── enrichment/             # Data correlation
│   └── pii-redactor/           # Data sanitization
├── gateway/                    # External interface
│   ├── approval-api/           # REST API for approvals
│   ├── approval-ui/            # React web interface
│   └── transmitter/            # Secure data transmission
├── shared/                     # Shared resources
│   └── events/                 # CloudEvents schemas
├── deploy/                     # Deployment configs
│   └── helm/                   # Kubernetes Helm charts
└── docs/                       # Documentation
```

## Development Workflow

### 1. Working on a Service

Each service can be developed independently:

```bash
# Network Scanner (Go)
cd collectors/network-scanner
go mod download
go test ./...
go run cmd/main.go

# Code Analyzer (Python)
cd collectors/code-analyzer
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest tests/
python -m src.main

# Approval UI (TypeScript)
cd gateway/approval-ui
npm install
npm run dev
npm run test
```

### 2. Running with Docker Compose

```bash
# Start everything
docker-compose --profile all up -d

# Start specific collectors
docker-compose --profile network up -d  # Network scanner only
docker-compose --profile code up -d     # Code analyzer only
docker-compose --profile database up -d # DB inspector only

# View logs
docker-compose logs -f network-scanner
docker-compose logs -f code-analyzer

# Rebuild after changes
docker-compose build network-scanner
docker-compose up -d network-scanner
```

### 3. Running Tests

```bash
# All tests
make test

# Individual services
make test-network-scanner
make test-code-analyzer
make test-db-inspector
make test-approval-ui

# With coverage
make test-coverage
```

### 4. Linting

```bash
# All linters
make lint

# Individual
make lint-go
make lint-python
make lint-typescript

# Or use pre-commit
pre-commit run --all-files
```

## Event-Driven Development

### Publishing Events

All services communicate via CloudEvents through RabbitMQ:

```python
# Python example
from cloudevents.http import CloudEvent
import pika

event = CloudEvent({
    "type": "discovery.server.discovered",
    "source": "/collectors/network-scanner",
    "data": {
        "ip_address": "10.0.0.50",
        "hostname": "web-server-01",
        "open_ports": [80, 443, 22]
    }
})

# Publish to RabbitMQ exchange
channel.basic_publish(
    exchange='discovery.events',
    routing_key='discovered.server',
    body=event.to_json()
)
```

### Consuming Events

```python
# Subscribe to events
def callback(ch, method, properties, body):
    event = CloudEvent.from_json(body)
    if event['type'] == 'discovery.server.discovered':
        process_server(event.data)

channel.basic_consume(
    queue='enrichment.server.queue',
    on_message_callback=callback,
    auto_ack=False
)
```

### RabbitMQ Management

Access the RabbitMQ management UI at http://localhost:15672
- Username: `discovery`
- Password: (from .env or default `discovery`)

## Database Development

### PostgreSQL (Approval Gateway)

```bash
# Access psql
docker exec -it discovery-postgres psql -U discovery -d discovery_agent

# Run migrations (when added)
cd gateway/approval-api
alembic upgrade head
```

### Schema Changes

1. Create migration in `gateway/approval-api/alembic/versions/`
2. Test locally: `alembic upgrade head`
3. Test downgrade: `alembic downgrade -1`

## Debugging

### Service Logs

```bash
# Docker logs
docker-compose logs -f <service-name>

# Log level (set in .env)
LOG_LEVEL=DEBUG
```

### RabbitMQ Queues

```bash
# List queues
docker exec discovery-rabbitmq rabbitmqctl list_queues

# Purge a queue (dev only!)
docker exec discovery-rabbitmq rabbitmqctl purge_queue <queue-name>
```

### Network Scanner Debugging

```bash
# Run with debug output
cd collectors/network-scanner
go run cmd/main.go -debug -target 192.168.1.0/24
```

## Code Style

### Go
- Follow [Effective Go](https://golang.org/doc/effective_go)
- Use `gofmt` and `golangci-lint`
- Error wrapping with `fmt.Errorf("context: %w", err)`

### Python
- Follow PEP 8 (enforced by Ruff)
- Type hints required for public functions
- Async preferred for I/O operations

### TypeScript
- Follow Airbnb style guide
- Strict TypeScript mode enabled
- Functional components with hooks

## Common Issues

### "Connection refused" to RabbitMQ

```bash
# Ensure RabbitMQ is running
docker-compose ps rabbitmq

# Check if port is available
lsof -i :5672

# Restart RabbitMQ
docker-compose restart rabbitmq
```

### Go module issues

```bash
cd collectors/network-scanner
go mod tidy
go mod download
```

### Python dependency conflicts

```bash
# Use fresh virtual environment
rm -rf .venv
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

### Node.js issues

```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes with tests
3. Run pre-commit: `pre-commit run --all-files`
4. Submit PR following the template

See [CONTRIBUTING.md](../CONTRIBUTING.md) for full guidelines.
