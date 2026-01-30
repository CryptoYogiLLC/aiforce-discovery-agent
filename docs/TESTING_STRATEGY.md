# Testing Strategy

## The Challenge

The Discovery Agent is designed to run in **client environments** where it scans:
- Network subnets for servers
- Databases for schema information
- Code repositories for dependencies

**You cannot test this in a cloud sandbox** - you need a realistic target environment.

## Solution: Simulated Target Network

We provide `docker-compose.dev.yml` which creates a **simulated client environment**:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Simulated Client Network                      │
│                      (172.28.0.0/24)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│   │ Web Server  │  │ App Server  │  │ App Server  │             │
│   │   nginx     │  │   Flask     │  │    Java     │             │
│   │ 172.28.0.10 │  │ 172.28.0.20 │  │ 172.28.0.21 │             │
│   └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│   │ PostgreSQL  │  │   MySQL     │  │  MongoDB    │             │
│   │  (ERP DB)   │  │ (Legacy CRM)│  │ (Analytics) │             │
│   │ 172.28.0.30 │  │ 172.28.0.31 │  │ 172.28.0.32 │             │
│   └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐                              │
│   │    Redis    │  │   Gitea     │                              │
│   │   (Cache)   │  │  (Git Repos)│                              │
│   │ 172.28.0.40 │  │ 172.28.0.50 │                              │
│   └─────────────┘  └─────────────┘                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Development Workflow

### 1. Start the Simulated Network

```bash
# Start target environment
docker-compose -f docker-compose.dev.yml up -d

# Verify targets are running
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 2. Start Discovery Agent Infrastructure

```bash
# Start RabbitMQ, PostgreSQL (agent's own DB), Redis
docker-compose up -d rabbitmq postgres redis
```

### 3. Run Collectors Against Simulated Network

```bash
# Network Scanner - scan the simulated network
cd collectors/network-scanner
go run cmd/main.go --subnet 172.28.0.0/24

# Database Inspector - connect to simulated databases
cd collectors/db-inspector
python -m src.main --host 172.28.0.30 --port 5432 --type postgres

# Code Analyzer - analyze repos from Gitea
cd collectors/code-analyzer
python -m src.main --repo-url http://172.28.0.50:3000/user/repo
```

### 4. Verify Events Flow

```bash
# Check RabbitMQ for events
open http://localhost:15672  # admin/discovery
```

## Testing Levels

### Unit Tests
- Test individual functions
- Mock external dependencies
- Run in CI without Docker

```bash
make test-network-scanner
make test-code-analyzer
make test-db-inspector
```

### Integration Tests
- Test with simulated network
- Requires `docker-compose.dev.yml`
- Run locally or in CI with Docker

```bash
# Start simulated network first
docker-compose -f docker-compose.dev.yml up -d

# Run integration tests
make test-integration
```

### End-to-End Tests
- Full pipeline from discovery to approval UI
- Requires all services running

```bash
# Start everything
docker-compose -f docker-compose.dev.yml up -d
docker-compose up -d

# Run E2E
make test-e2e
```

## CI/CD Testing

GitHub Actions runs tests in this order:
1. **Unit tests** - No Docker required
2. **Lint/Format** - Code quality
3. **Build** - Compile all services
4. **Integration** - With Docker services

## Local Machine Requirements

For local development with simulated network:

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 8 GB | 16 GB |
| Disk | 10 GB free | 20 GB free |
| CPU | 4 cores | 8 cores |

## Production Testing

Before deploying to a real client:

1. **Staging Environment**
   - Deploy to isolated network segment
   - Use non-production servers
   - Verify no false positives

2. **Pilot Run**
   - Start with small subnet
   - Manual approval for all data
   - Review everything before transmission

3. **Full Deployment**
   - Expand subnet coverage
   - Monitor for issues
   - Gradual rollout

## Disk Space Tips

If disk space is limited:

```bash
# Stop simulated network when not testing
docker-compose -f docker-compose.dev.yml down

# Remove unused images
docker system prune -a

# Keep only what you're actively developing
docker-compose down  # Stop agent services too
```
