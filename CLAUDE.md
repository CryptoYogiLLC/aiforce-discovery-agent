# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIForce Discovery Agent is a microservices-based system for application discovery in client environments. It discovers network topology, analyzes code repositories, inspects databases, and transmits approved data to AIForce Assess for cloud modernization planning.

## Build and Test Commands

```bash
# Setup
make dev-setup           # Install all dev dependencies
make verify              # Check dev environment

# Testing
make test                # Run all tests
make test-network-scanner   # Go: cd collectors/network-scanner && go test ./...
make test-code-analyzer     # Python: cd collectors/code-analyzer && pytest tests/
make test-db-inspector      # Python: cd collectors/db-inspector && pytest tests/
make test-approval-ui       # TypeScript: cd gateway/approval-ui && npm run test
make test-coverage       # Run tests with coverage

# Linting
make lint                # All linters
make lint-go             # golangci-lint
make lint-python         # ruff
make lint-typescript     # eslint
pre-commit run --all-files  # Run all pre-commit hooks

# Build
make build               # docker-compose build
make build-network-scanner  # go build -o bin/network-scanner cmd/main.go

# Docker
make up                  # Start core services
make up-all              # Start all services (all profiles)
make down                # Stop services
make logs                # Tail logs
make clean               # Stop and remove volumes, clear build artifacts

# Test Environment (simulated target network)
make generate-env        # Generate randomized target network
make target-up           # Start target network on 172.28.0.0/24
make target-down         # Stop target network
make target-refresh      # Regenerate and restart target network
```

## Architecture

Three-tier microservices with event-driven communication:

```
Collectors (Go/Python) → RabbitMQ Event Bus → Processing Services → Gateway (React/Node) → External API
```

**Collector Tier** (deploy selectively via Docker profiles):
- `network-scanner` (Go/Gin, port 8001) - TCP/UDP scanning, service fingerprinting
- `code-analyzer` (Python/FastAPI, port 8002) - Git repo analysis, dependency detection
- `db-inspector` (Python/FastAPI, port 8003) - Schema extraction, PII detection

**Processing Tier** (stateless Python/FastAPI):
- `enrichment` (port 8010) - Correlate discoveries, add context
- `pii-redactor` (port 8011) - Detect and mask sensitive data
- `scoring` (port 8012) - Calculate complexity/effort scores

**Gateway Tier**:
- `approval-ui` (React/Vite, port 3000) - Web UI for review/approval
- `approval-api` (Node/Express, port 3001) - REST API
- `transmitter` (Python/FastAPI, port 8020) - Secure external transmission

**Infrastructure**: RabbitMQ (5672/15672), PostgreSQL (5432), Redis (6379)

## Event Flow

All services communicate via CloudEvents through RabbitMQ:
```
discovered.* → Enrichment → enriched.* → PII Redactor → redacted.* → Scoring → scored.* → Gateway
```

Event schemas live in `shared/events/schemas/` as JSON Schema files.

## Technology Stack

| Language | Framework | Used By |
|----------|-----------|---------|
| Go 1.22+ | Gin | Network Scanner |
| Python 3.11+ | FastAPI | Code Analyzer, DB Inspector, Processing services, Transmitter |
| TypeScript 5+ | React/Vite, Express | Approval UI, Approval API |

## Docker Compose Profiles

Start specific collectors with profiles:
```bash
docker-compose --profile network up -d   # Network scanner only
docker-compose --profile code up -d      # Code analyzer only
docker-compose --profile database up -d  # DB inspector only
docker-compose --profile all up -d       # Everything
```

## Commit Convention

Follow Conventional Commits: `<type>(<scope>): <description>`
- Types: feat, fix, docs, style, refactor, test, chore
- Example: `feat(network-scanner): add UDP port scanning support`

Pre-commit hooks enforce linting, formatting, and secret detection. Install with:
```bash
pip install pre-commit && pre-commit install
```

## Serena Memory System

Project knowledge is stored in `.serena/memories/`. Check these BEFORE making changes:

| Memory | When to Check |
|--------|--------------|
| `api-design-patterns-master.md` | Creating/modifying API endpoints |
| `database-transaction-patterns-master.md` | Database operations, migrations |
| `docker-devops-patterns-master.md` | Docker, deployment issues |
| `testing-patterns-master.md` | Writing tests, debugging flaky tests |
| `event-driven-patterns-master.md` | Event publishing/consuming |
| `code-quality-patterns-master.md` | General code patterns |

## Critical Rules (from docs/LESSONS_LEARNED.md)

| # | Rule | Consequence of Breaking |
|---|------|------------------------|
| 1 | POST/PUT/DELETE use request body, never query params | 422 errors, recurring bugs |
| 2 | Never nest database transactions | "Transaction already begun" errors |
| 3 | snake_case everywhere (frontend AND backend) | Schema mismatch bugs |
| 4 | Docker-first development only | "Works on my machine" syndrome |
| 5 | Never downgrade database versions on existing volumes | Data corruption |
| 6 | Check for docker-compose.override.yml | Hidden version conflicts |
| 7 | Use explicit waits in E2E tests, never timeouts | Flaky tests |
| 8 | Run pre-commit before every commit | CI failures |
| 9 | **Fix root causes, NEVER band-aid solutions** | Technical debt |
| 10 | Event handlers MUST be idempotent | Duplicates on retry |
