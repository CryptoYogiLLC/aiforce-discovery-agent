# AIForce Discovery Agent - Full Implementation Prompt

## Project Overview

You are implementing the **AIForce Discovery Agent**, a microservices-based system for application discovery in client environments. The system discovers servers, databases, code repositories, and correlates them into applications for migration assessment.

## Before Starting

1. **Read CLAUDE.md** - Contains project conventions, build commands, and critical rules
2. **Read Serena memories** - Check `.serena/memories/` for patterns and lessons learned
3. **Read issue details** - Use `gh issue view <number>` to get full requirements for each issue

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                      COLLECTOR TIER                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Network Scanner │  │  Code Analyzer  │  │  DB Inspector   │  │
│  │     (Go/Gin)    │  │ (Python/FastAPI)│  │ (Python/FastAPI)│  │
│  │    Port 8001    │  │    Port 8002    │  │    Port 8003    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼───────────┘
            └────────────────────┼────────────────────┘
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT BUS (RabbitMQ)                          │
│   Exchanges: discovery.events, processing.events, gateway.events │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING TIER                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Unified Processor (MVP)                       │  │
│  │         Enrichment + PII Redaction + Scoring              │  │
│  │              (Python/FastAPI) Port 8010                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GATEWAY TIER                                │
│  ┌──────────────────────────┐    ┌──────────────────────────┐   │
│  │    Approval Gateway      │    │      Transmitter         │   │
│  │  (Express/React) 3000/01 │    │  (Python/FastAPI) 8020   │   │
│  │      [PostgreSQL]        │    │                          │   │
│  └──────────────────────────┘    └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                        AIForce Assess (External)
```

## Critical Conventions

### Event Naming (MUST FOLLOW)

| Component | Pattern | Example |
|-----------|---------|---------|
| CloudEvents `type` | `discovery.<entity>.<verb>` | `discovery.server.discovered` |
| RabbitMQ routing key | `<verb>.<entity>` | `discovered.server` |
| Schema filename | kebab-case | `discovered-server.json` |
| Entity names | `[a-z][a-z0-9]*` (no underscores) | `server`, `networkflow`, `ec2` |
| Allowed verbs | whitelist | `discovered`, `enriched`, `redacted`, `scored`, `approved`, `rejected`, `failed` |

### Code Quality Rules

1. **Fix root causes, NEVER band-aid solutions**
2. **Keep files under 400 lines** - split if approaching limit
3. **Never hardcode credentials** - use environment variables
4. **No `except: pass`** - always handle exceptions specifically
5. **Shared libraries over copy-paste** - use `shared/` directory

### Testing Rules

1. **Explicit waits in E2E tests** - never `waitForTimeout(ms)`
2. **Test against Docker** - not local dev server
3. **Validate database state** - don't just check API responses
4. **Run pre-commit before commits** - `pre-commit run --all-files`

## Implementation Order

### Phase 1A: Infrastructure Foundation
```
#26 → #41 → #50
```
1. **#26** [Event Bus 4.1] RabbitMQ configuration and exchange setup
2. **#41** [DevOps 6.4] Docker Compose orchestration
3. **#50** [MVP Simplification] Unified Processor service

### Phase 1B: Network Scanner (Go)
```
#12 → #13 → #14 → #15 → #16 → #17 → #18 → #19
```
4. **#12** Project scaffolding and Go module setup
5. **#13** Configuration loading (YAML + env)
6. **#14** TCP port scanning core logic
7. **#15** Service fingerprinting
8. **#16** Rate limiting
9. **#17** Health, Ready, and Metrics endpoints
10. **#18** RabbitMQ connection and event publishing
11. **#19** Dockerfile and Docker Compose integration

### Phase 1C: Database Inspector (Python)
```
#20 → #21 → #22 → #23 → #24 → #25
```
12. **#20** Project scaffolding and FastAPI setup
13. **#21** PostgreSQL connector and schema extraction
14. **#22** MySQL connector and schema extraction
15. **#23** PII detection in database schemas
16. **#24** RabbitMQ publishing and CloudEvents
17. **#25** Dockerfile and health endpoints

### Phase 1D: Approval Gateway (TypeScript/React)
```
#31 → #32 → #33 → #34 → #35 → #36 → #37
```
18. **#31** API scaffolding (Express/TypeScript)
19. **#32** PostgreSQL schema and database connection
20. **#33** Discovery REST API endpoints
21. **#34** RabbitMQ consumer for scored events
22. **#35** React UI scaffolding (Vite)
23. **#36** Discovery list and detail views
24. **#37** Approval workflow UI

### Phase 1E: Transmitter & DevOps
```
#38 → #39 → #40 → #42 → #43
```
25. **#38** Transmitter service scaffolding
26. **#39** Batch processing logic
27. **#40** External API client with retry and circuit breaker
28. **#42** CI/CD pipeline (GitHub Actions)
29. **#43** Helm chart basics

### Phase 2: Code Analyzer (Python) - Optional
```
#44 → #45 → #46 → #47 → #48 → #49
```
30-35. Code Analyzer issues #44-49

## Per-Issue Workflow

For each issue:

1. **Read the issue**: `gh issue view <number>`
2. **Create the implementation** following project conventions
3. **Write tests** (unit + integration where applicable)
4. **Update Docker configuration** if needed
5. **Test with Docker**: `docker-compose up -d --build <service>`
6. **Commit with conventional format**:
   ```
   feat(<scope>): <description>

   Implements #<issue-number>

   Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
   ```
7. **Close the issue**: `gh issue close <number>`

## Key File Locations

```
/collectors/network-scanner/     # Go service
/collectors/code-analyzer/       # Python service
/collectors/db-inspector/        # Python service
/platform/event-bus/             # RabbitMQ config
/platform/unified-processor/     # MVP processor (replaces enrichment/pii/scoring)
/gateway/approval-api/           # Express/TypeScript API
/gateway/approval-ui/            # React/Vite UI
/gateway/transmitter/            # Python service
/shared/events/schemas/          # JSON schemas (kebab-case filenames)
/shared/config/                  # Shared configuration
/docker-compose.yml              # Main orchestration
/.github/workflows/              # CI/CD
/helm/                           # Kubernetes charts
```

## Environment Setup

```bash
# Start infrastructure
docker-compose up -d rabbitmq postgres redis

# Run specific service profile
docker-compose --profile network up -d
docker-compose --profile db up -d
docker-compose --profile gateway up -d

# View logs
docker-compose logs -f <service-name>

# Run tests
docker-compose exec <service> pytest tests/  # Python
docker-compose exec <service> go test ./...  # Go
```

## Validation Checklist

Before marking an issue complete:

- [ ] Code follows project conventions (check CLAUDE.md)
- [ ] CloudEvents use correct `type` format: `discovery.<entity>.<verb>`
- [ ] RabbitMQ uses correct routing key format: `<verb>.<entity>`
- [ ] No hardcoded credentials (use env vars)
- [ ] Health endpoint works: `GET /health`
- [ ] Docker build succeeds
- [ ] Tests pass
- [ ] Pre-commit passes: `pre-commit run --all-files`

## Commands Reference

```bash
# Issue management
gh issue view <number>           # Read issue details
gh issue close <number>          # Close completed issue

# Git workflow
git add <files>
git commit -m "feat(scope): description"
git push

# Docker
docker-compose build <service>
docker-compose up -d <service>
docker-compose logs -f <service>
docker-compose down

# Testing
pre-commit run --all-files
pytest tests/                    # Python
go test ./...                    # Go
npm test                         # TypeScript
```

## Start Implementation

Begin with Issue #26 (RabbitMQ configuration) to establish the event bus foundation, then proceed through the implementation order above.

For each issue, read the full details with `gh issue view <number>` before implementing.
