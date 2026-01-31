# ADR-001: Development Environment Strategy

## Status
**Accepted** - January 2026

## Context

The AIForce Discovery Agent is a microservices-based system designed to run in client environments to discover applications, servers, and databases. This creates unique development challenges:

1. **Network Discovery Testing**: The agent scans real network subnets, which cannot be simulated in cloud sandboxes
2. **Disk Space Constraints**: Development machines have limited disk space (~8GB free), insufficient to run multiple Docker stacks
3. **Multi-Language Stack**: The project uses Go, Python, and TypeScript, requiring diverse tooling
4. **Team Size**: 6 developers working on different services simultaneously
5. **Cost Sensitivity**: Cloud development environments (Codespaces) have usage limits (60 hrs/month free)

### Options Considered

#### Option A: Full Docker Development (Local)
- Run all services in Docker containers locally
- **Pros**: Consistent environment, close to production
- **Cons**: Requires 10+ GB disk space, slow startup, resource-heavy

#### Option B: GitHub Codespaces Only
- All development in cloud-based Codespaces
- **Pros**: No local disk usage, consistent environment
- **Cons**: 60 hrs/month limit exhausted quickly with 6 developers, ~$200+/month overage costs, cannot test real network discovery

#### Option C: Hybrid Approach (Selected)
- Native development for day-to-day coding
- Randomized Docker environment for integration testing
- Codespaces for PR reviews and CI validation
- **Pros**: Minimal disk usage, no cloud costs, realistic testing
- **Cons**: Requires local language tooling setup

#### Option D: Railway/Vercel Development Environments
- Use existing Railway deployment for development
- **Pros**: Already configured for production
- **Cons**: Cannot test network discovery, costs per environment

## Decision

We adopt **Option C: Hybrid Approach** with three tiers:

### Tier 1: Native Local Development (Daily)
Developers run services natively without Docker:
```bash
# Go service
cd collectors/network-scanner && go run cmd/main.go

# Python service
cd collectors/code-analyzer && python -m src.main

# TypeScript service
cd gateway/approval-ui && npm run dev
```

**Rationale**:
- Zero Docker overhead
- Fast iteration cycles
- Minimal disk usage
- IDE debugging works natively

### Tier 2: Randomized Target Environment (Integration Testing)
A Python script generates unique Docker Compose configurations:
```bash
make generate-env   # Creates docker-compose.generated.yml
make target-up      # Starts randomized target network
```

**Rationale**:
- Prevents developers from coding for specific configurations
- Simulates real client environments with varied:
  - Server types (nginx, Apache, Spring Boot, etc.)
  - Database types (PostgreSQL, MySQL, MongoDB, etc.)
  - Network topologies (random IPs in 172.28.0.0/24)
  - Credentials and naming conventions
- Can be torn down when not in use to save disk space

### Tier 3: GitHub Codespaces (PR Reviews & CI)
Cloud environments used sparingly for:
- PR review and testing
- CI pipeline validation
- Onboarding new developers
- Demo/showcase purposes

**Rationale**:
- 60 hrs/month is sufficient for occasional use
- Ensures consistent CI environment
- No local setup required for reviewers

## Consequences

### Positive
- **Minimal disk usage**: Only ~2GB when target environment is running
- **No cloud costs**: Stays within Codespaces free tier
- **Realistic testing**: Randomized environments catch hardcoded assumptions
- **Fast iteration**: Native development has no container overhead
- **Flexible**: Developers can work offline

### Negative
- **Initial setup required**: Each developer must install Go, Python, Node.js
- **Environment drift risk**: Local environments may differ slightly
- **Cannot test all scenarios**: Some edge cases require full Docker stack

### Mitigations
- Pre-commit hooks ensure code quality regardless of local setup
- CI runs full integration tests in consistent environment
- `.devcontainer` provided for developers who prefer containerized development

## Implementation

### Files Added
- `scripts/generate-test-env.py` - Randomized environment generator
- `docker-compose.generated.yml` - Generated target environment (gitignored)
- `.devcontainer/` - Codespaces/devcontainer configuration

### Makefile Commands
```bash
make generate-env    # Generate new random target environment
make target-up       # Start target environment
make target-down     # Stop target environment
make target-refresh  # Regenerate and restart
make target-list     # Show running target services
```

### Developer Workflow
1. Clone repo, install Go/Python/Node.js
2. Run `make dev-setup` for dependencies
3. Code changes with native tooling
4. Run `make generate-env && make target-up` for integration testing
5. Run `make target-down` when done to free resources
6. Push PR, CI validates in Codespaces

## References
- [GitHub Codespaces Pricing](https://docs.github.com/en/billing/managing-billing-for-github-codespaces)
- [docs/TESTING_STRATEGY.md](../TESTING_STRATEGY.md)
- [docs/DEVELOPMENT.md](../DEVELOPMENT.md)
