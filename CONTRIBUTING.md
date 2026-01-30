# Contributing to AIForce Discovery Agent

First off, thank you for considering contributing to AIForce Discovery Agent! It's people like you that make this tool useful for the cloud modernization community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

---

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the maintainers.

---

## Getting Started

### Understanding the Architecture

Before contributing, please familiarize yourself with:

1. **[Architecture Overview](docs/architecture.md)**: How the microservices interact
2. **[Event Schemas](docs/event-schemas.md)**: The message formats between services
3. **[Security Model](docs/security.md)**: How we protect client data

### Finding Something to Work On

- **Good first issues**: Look for issues labeled [`good first issue`](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/labels/good%20first%20issue)
- **Help wanted**: Issues labeled [`help wanted`](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/labels/help%20wanted) are ready for community contribution
- **Feature requests**: Check [Discussions](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/discussions) for requested features

---

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting a bug, include:**
- Your environment (OS, Docker version, etc.)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (redact any sensitive information!)

### Suggesting Features

Feature suggestions are welcome! Please:
1. Check if it's already been suggested
2. Open a Discussion first for major features
3. Explain the use case and benefit

### Contributing Code

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write/update tests
5. Ensure all tests pass
6. Submit a Pull Request

### Contributing Documentation

Documentation improvements are highly valued! This includes:
- Fixing typos or unclear explanations
- Adding examples
- Improving tutorials
- Translating documentation

---

## Development Setup

### Prerequisites

- Docker & Docker Compose
- Go 1.21+ (for network-scanner)
- Python 3.11+ (for Python services)
- Node.js 20+ (for approval-ui)
- Make

### Initial Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/aiforce-discovery-agent.git
cd aiforce-discovery-agent

# Add upstream remote
git remote add upstream https://github.com/CryptoYogiLLC/aiforce-discovery-agent.git

# Install development dependencies
make dev-setup

# Start infrastructure (RabbitMQ, PostgreSQL, Redis)
docker-compose -f docker-compose.dev.yml up -d

# Verify setup
make verify
```

### Running Individual Services

```bash
# Network Scanner (Go)
cd collectors/network-scanner
go run cmd/main.go

# Code Analyzer (Python)
cd collectors/code-analyzer
pip install -r requirements-dev.txt
python -m src.main

# Approval UI (React)
cd gateway/approval-ui
npm install
npm run dev
```

### Running Tests

```bash
# All tests
make test

# Specific service
make test-network-scanner
make test-code-analyzer
make test-approval-ui

# With coverage
make test-coverage
```

---

## Project Structure

```
aiforce-discovery-agent/
├── collectors/                 # Data collection microservices
│   ├── network-scanner/        # Go - Network discovery
│   ├── code-analyzer/          # Python - Source code analysis
│   └── db-inspector/           # Python - Database inspection
│
├── platform/                   # Core platform services
│   ├── event-bus/              # RabbitMQ configuration
│   ├── config-service/         # Centralized configuration
│   ├── enrichment/             # Data enrichment service
│   ├── pii-redactor/           # PII detection and masking
│   └── scoring/                # Complexity/effort scoring
│
├── gateway/                    # External interface
│   ├── approval-api/           # Node.js API for approval workflow
│   ├── approval-ui/            # React web interface
│   └── transmitter/            # Secure external transmission
│
├── shared/                     # Shared resources
│   └── events/                 # Event schema definitions
│
├── docs/                       # Documentation
├── helm/                       # Kubernetes Helm charts
└── config/                     # Configuration examples
```

### Service Ownership

Each service should be self-contained:
- Own Dockerfile
- Own README with service-specific docs
- Own tests
- Own CI configuration

---

## Coding Standards

### Go (Network Scanner)

- Follow [Effective Go](https://golang.org/doc/effective_go)
- Use `gofmt` for formatting
- Run `golangci-lint` before committing
- Write table-driven tests

```go
// Good
func ScanPort(host string, port int) (bool, error) {
    // ...
}

// Avoid
func scan(h string, p int) bool {
    // ...
}
```

### Python (Analyzers, Processing)

- Follow PEP 8
- Use type hints
- Format with `black`
- Lint with `ruff`
- Use `pytest` for testing

```python
# Good
async def analyze_repository(repo_url: str) -> AnalysisResult:
    """Analyze a git repository for dependencies and complexity."""
    ...

# Avoid
def analyze(url):
    ...
```

### TypeScript/React (Approval UI)

- Use TypeScript strict mode
- Follow React hooks best practices
- Use functional components
- Format with Prettier
- Lint with ESLint

```typescript
// Good
interface DiscoveryItem {
  id: string;
  type: 'server' | 'database' | 'application';
  name: string;
  metadata: Record<string, unknown>;
}

// Avoid
const item: any = { ... };
```

### Event Schemas

All events follow [CloudEvents](https://cloudevents.io/) specification:

```json
{
  "specversion": "1.0",
  "type": "discovery.server.discovered",
  "source": "/collectors/network-scanner",
  "id": "unique-event-id",
  "time": "2024-01-15T10:00:00Z",
  "data": {
    "hostname": "app-server-01",
    "ip": "10.0.1.50",
    "ports": [22, 80, 443, 5432]
  }
}
```

---

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, no code change
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(network-scanner): add UDP port scanning support

fix(pii-redactor): handle regex timeout on large strings

docs(readme): add Kubernetes deployment instructions

refactor(enrichment): extract correlation logic to separate module
```

---

## Pull Request Process

### Before Submitting

1. **Update your fork**: `git fetch upstream && git rebase upstream/main`
2. **Run all tests**: `make test`
3. **Run linting**: `make lint`
4. **Update documentation** if needed
5. **Add/update tests** for your changes

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Checklist
- [ ] Tests pass locally
- [ ] Linting passes
- [ ] Documentation updated
- [ ] Commit messages follow convention
```

### Review Process

1. Maintainers will review within 3-5 business days
2. Address any requested changes
3. Once approved, a maintainer will merge
4. Your contribution will be in the next release!

---

## Questions?

- **General questions**: [GitHub Discussions](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/discussions)
- **Bug reports**: [GitHub Issues](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/issues)
- **Security issues**: See [SECURITY.md](SECURITY.md)

Thank you for contributing!
