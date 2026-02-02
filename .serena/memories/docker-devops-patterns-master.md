# Docker & DevOps Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
>
> 1. Docker-first development only
> 2. NEVER downgrade database versions on existing volumes
> 3. Always check for docker-compose.override.yml
> 4. Update BOTH requirements.txt and requirements-docker.txt
> 5. Clean volumes when changing DB versions

---

## Critical Pattern: Docker-First Development

"Works on my machine" syndrome killed productivity in parent project.

### Wrong

```bash
# Local development causes inconsistency
python -m pytest tests/  # Different Python, different deps
npm run dev              # Different Node version
```

### Correct

```bash
# All development in containers
docker exec -it discovery-agent-backend bash
pytest tests/

# Or use docker-compose
docker-compose exec code-analyzer pytest tests/
```

---

## Critical Pattern: Never Downgrade Database Versions

Caused **3 data corruption events** in parent project.

### The Problem

```yaml
# If postgres data exists with version 17:
postgres:
  image: postgres:16 # CRASHES: "database files incompatible"
```

### Solution

```yaml
# Must match or upgrade:
postgres:
  image: postgres:17 # Matches existing data
```

### If You Need to Downgrade

```bash
# ONLY option: destroy data
docker-compose down -v  # Removes volumes
docker-compose up -d    # Fresh start
```

---

## Critical Pattern: Check for Override Files

Hidden version conflicts caused mysterious failures.

### Before Any Docker Debugging

```bash
# ALWAYS check for override files
ls -la docker-compose*.yml

# docker-compose.override.yml is auto-loaded!
# If found with wrong versions:
rm docker-compose.override.yml
docker-compose down -v
docker-compose up -d --force-recreate
```

---

## Pattern: Dual Requirements Files

```
requirements.txt           # Local development
requirements-docker.txt    # Docker/deployment (may differ)
```

**When adding dependencies, update BOTH files.**

---

## Pattern: Clean Rebuild

When things go wrong:

```bash
# Nuclear option - full cleanup
make clean
# or manually:
docker-compose down -v
docker system prune -a
docker-compose up -d --build
```

---

## Service-Specific Commands

```bash
# Rebuild single service after changes
docker-compose build network-scanner
docker-compose up -d network-scanner

# View logs for debugging
docker-compose logs -f network-scanner

# Shell into container
docker-compose exec network-scanner sh
```

---

## Anti-Patterns

| Anti-Pattern             | Why Bad               | Do Instead            |
| ------------------------ | --------------------- | --------------------- |
| Local dev without Docker | "Works on my machine" | Docker-first          |
| Downgrading DB version   | Data corruption       | Match or upgrade only |
| Ignoring override files  | Hidden conflicts      | Check ls -la docker\* |
| Single requirements.txt  | Deploy mismatch       | Dual requirements     |

---

## Pattern: Configurable Port Mappings (Added 2026-02-01)

**Problem**: Docker services conflict with existing services on standard ports.
**Context**: Development environment may have multiple projects running.

**Solution**:

```yaml
services:
  rabbitmq:
    ports:
      - "${RABBITMQ_PORT:-5674}:5672"
      - "${RABBITMQ_MGMT_PORT:-15674}:15672"

  postgres:
    ports:
      - "${POSTGRES_PORT:-5434}:5432"

  redis:
    ports:
      - "${REDIS_PORT:-6381}:6379"
```

**Why**: Environment variable defaults avoid hardcoded port conflicts while still allowing customization.

**Source**: Session 2026-02-01 / Commit 32bbd4b

---

## Pattern: RabbitMQ Definitions with Password Hash (Added 2026-02-01)

**Problem**: RabbitMQ `load_definitions` ignores `RABBITMQ_DEFAULT_USER/PASS` environment variables.
**Context**: When mounting definitions.json for exchange/queue setup.

**Solution**: Include user in definitions.json with proper password hash:

```python
import hashlib, base64, os

password = 'discovery'
salt = os.urandom(4)
hash_input = salt + password.encode('utf-8')
hash_output = hashlib.sha256(hash_input).digest()
password_hash = base64.b64encode(salt + hash_output).decode('ascii')
```

```json
{
  "users": [{
    "name": "discovery",
    "password_hash": "<generated_hash>",
    "hashing_algorithm": "rabbit_password_hashing_sha256",
    "tags": ["administrator"]
  }],
  "vhosts": [{"name": "/"}],
  "permissions": [{...}],
  "exchanges": [{...}],
  "queues": [{...}]
}
```

**Why**: Definitions override environment-based user creation. Must include vhosts and permissions too.

**Source**: Session 2026-02-01 / Commit ae097a8

---

## Pattern: Go Lint Fixes for golangci-lint (Added 2026-02-02)

**Problem**: golangci-lint fails with errcheck, govet, and staticcheck errors.

### errcheck: Deferred Close() error handling

```go
// Wrong - linter flags unhandled error
defer conn.Close()
defer file.Sync()

// Correct - explicit ignore with anonymous function
defer func() { _ = conn.Close() }()
defer func() { _ = file.Sync() }()
```

### govet: IPv6-compatible address formatting

```go
// Wrong - not IPv6-safe
address := fmt.Sprintf("%s:%d", host, port)

// Correct - handles IPv6 addresses properly
address := net.JoinHostPort(host, fmt.Sprintf("%d", port))
```

### staticcheck: Deprecated RabbitMQ methods

```go
// Wrong - deprecated channel.Publish
err := channel.Publish(exchange, routingKey, false, false, msg)

// Correct - use PublishWithContext
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
err := channel.PublishWithContext(ctx, exchange, routingKey, false, false, msg)
```

**Source**: Session 2026-02-02, Commit e570a36

---

## Pattern: Go Version and Security Updates (Added 2026-02-02)

**Problem**: Dependabot alerts for golang.org/x/crypto, golang.org/x/net vulnerabilities.

**Solution**: Upgrade Go version in Dockerfile and run go mod tidy:

```dockerfile
# Upgrade from Go 1.22 → 1.24
FROM golang:1.24-alpine AS builder
```

```bash
# Update dependencies
go get -u golang.org/x/crypto golang.org/x/net golang.org/x/sys golang.org/x/text
go mod tidy
```

**Key versions (as of 2026-02):**

- Go 1.24 (required for latest crypto fixes)
- golang.org/x/crypto v0.45.0+ (CVE-2025-47914, CVE-2025-58181)
- golang.org/x/net v0.47.0+ (CVE-2025-22870, CVE-2025-22872)

**Source**: Session 2026-02-02, Commits 85783aa, 0d077ee, 037049a

---

## Search Keywords

docker, docker-compose, postgres, volumes, requirements, override, container, rabbitmq, port, definitions, golang, golangci-lint, errcheck, govet, staticcheck, dependabot, security
