# AIForce Discovery Agent

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

**A microservices-based discovery agent for cloud modernization that runs inside your environment.**

Discover applications, map dependencies, analyze technical debt, and feed insights into your modernization journey—all while keeping sensitive data under your control.

---

## Why This Project?

When organizations modernize their application portfolios, they need visibility into what they have:

- **What applications exist?** (servers, services, databases)
- **How are they connected?** (dependencies, API calls, data flows)
- **What's the technical debt?** (outdated frameworks, complexity, security issues)
- **What's the business context?** (criticality, ownership, compliance requirements)

Existing tools (Device42, Cloudamize, AWS ADS) excel at infrastructure discovery but don't provide:

- Business context for modernization decisions
- Direct integration with assessment/planning tools
- Client-controlled data sovereignty
- A reference architecture for microservices patterns

**This agent fills that gap.**

---

## Key Features

### Functional

- **Network Discovery**: Scan subnets, identify services, map network topology
- **Code Analysis**: Analyze repositories for complexity, dependencies, tech stack
- **Database Inspection**: Extract schemas, identify relationships, detect PII
- **Dependency Mapping**: Trace API calls, database connections, service meshes

### Security & Control

- **Runs in YOUR environment**: Nothing leaves your network without approval
- **Outbound-only communication**: No inbound ports required
- **Approval workflow**: Human reviews all data before transmission
- **PII redaction**: Automatic detection and masking of sensitive data
- **Configurable scope**: Include/exclude subnets, servers, applications

### Educational

- **Microservices reference implementation**: Learn patterns by studying real code
- **Event-driven architecture**: See how services communicate via message queues
- **Polyglot design**: Go for performance, Python for analysis, React for UI

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DISCOVERY AGENT PLATFORM                        │
│                        (runs in your environment)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        COLLECTOR TIER                           │   │
│  │                    (deploy only what you need)                  │   │
│  │                                                                 │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │   │
│  │  │   Network    │ │    Code      │ │   Database   │            │   │
│  │  │   Scanner    │ │   Analyzer   │ │   Inspector  │            │   │
│  │  │   (Go)       │ │   (Python)   │ │   (Python)   │            │   │
│  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │   │
│  └─────────┼────────────────┼────────────────┼─────────────────────┘   │
│            └────────────────┼────────────────┘                         │
│                             ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      EVENT BUS (RabbitMQ)                       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      PROCESSING TIER                            │   │
│  │  ┌──────────────────────────────────────────────────────────┐  │   │
│  │  │              Unified Processor (Python)                   │  │   │
│  │  │     Enrichment → PII Redaction → Complexity Scoring       │  │   │
│  │  └──────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      GATEWAY TIER                               │   │
│  │  ┌──────────────────────────┐    ┌──────────────────────────┐  │   │
│  │  │     Approval Gateway     │    │      Transmitter         │  │   │
│  │  │  (React UI + Express)    │    │   (External API client)  │  │   │
│  │  └──────────────────────────┘    └──────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- 4GB RAM minimum
- Network access to systems you want to discover

### Basic Deployment

```bash
# Clone the repository
git clone https://github.com/CryptoYogiLLC/aiforce-discovery-agent.git
cd aiforce-discovery-agent

# Copy and edit configuration
cp config/discovery-agent.example.yaml config/discovery-agent.yaml
# Edit config/discovery-agent.yaml with your settings

# Start core services
docker-compose up -d

# Start specific collectors (pick what you need)
docker-compose --profile network up -d     # Network scanning
docker-compose --profile database up -d    # Database inspection
docker-compose --profile code up -d        # Code analysis
```

### Access the UI

Open http://localhost:3000 to access the Approval Gateway UI.

---

## Configuration

```yaml
# config/discovery-agent.yaml

collection:
  network_scan: true
  code_repos: false
  database_schemas: true

  include_subnets:
    - 10.0.0.0/8
  exclude_subnets:
    - 10.0.99.0/24 # Sensitive zone
  exclude_servers:
    - "*-pci-*"

data_handling:
  redact_emails: true
  redact_ip_addresses: true
  redact_credentials: true

  custom_patterns:
    - "SSN-\\d{3}-\\d{2}-\\d{4}"

transmission:
  mode: approval_required # auto | preview_only | approval_required
  destination: https://your-assess-instance.com/api/v1/discovery
```

See [Configuration Guide](docs/configuration.md) for full options.

---

## Microservices Components

| Service                                        | Language   | Purpose                            | Status      |
| ---------------------------------------------- | ---------- | ---------------------------------- | ----------- |
| [Network Scanner](collectors/network-scanner/) | Go 1.24    | Discover servers, ports, services  | ✅ Complete |
| [Code Analyzer](collectors/code-analyzer/)     | Python     | Analyze repos, detect dependencies | ✅ Complete |
| [Database Inspector](collectors/db-inspector/) | Python     | Extract schemas, detect PII        | ✅ Complete |
| [Event Bus](platform/event-bus/)               | RabbitMQ   | Message routing between services   | ✅ Complete |
| [Unified Processor](platform/processor/)       | Python     | Enrich, redact PII, score          | ✅ Complete |
| [Approval UI](gateway/approval-ui/)            | React/Vite | Web UI for review and approval     | ✅ Complete |
| [Approval API](gateway/approval-api/)          | Express    | REST API for gateway operations    | ✅ Complete |
| [Transmitter](gateway/transmitter/)            | Python     | Secure batch transmission          | ✅ Complete |

> **Note**: The processing tier uses a unified processor that combines enrichment, PII redaction, and complexity scoring into a single service for MVP simplicity.

---

## Microservices Patterns Demonstrated

This project serves as a **reference implementation** of microservices patterns:

| Pattern                       | Implementation                                 |
| ----------------------------- | ---------------------------------------------- |
| **Event-driven architecture** | Services communicate via RabbitMQ events       |
| **Database per service**      | Each service owns its data store               |
| **Polyglot persistence**      | PostgreSQL, Redis, file storage as appropriate |
| **Circuit breaker**           | Graceful degradation when services fail        |
| **Saga pattern**              | Multi-step workflows with compensation         |
| **Sidecar pattern**           | API tracer deploys alongside applications      |
| **Gateway pattern**           | Single exit point for external communication   |

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone with submodules
git clone --recursive https://github.com/CryptoYogiLLC/aiforce-discovery-agent.git

# Install development dependencies
make dev-setup

# Run tests
make test

# Run linting
make lint
```

### Areas for Contribution

- **New collectors**: Support for additional platforms (VMware, Kubernetes, etc.)
- **Database connectors**: Oracle, MongoDB, Cassandra, etc.
- **Enrichment rules**: Industry-specific classification
- **Documentation**: Tutorials, examples, translations

---

## Security

Security is paramount for a tool that accesses sensitive infrastructure.

- **Report vulnerabilities**: See [SECURITY.md](SECURITY.md)
- **Architecture**: [Security Model](docs/security.md)
- **No inbound ports**: Agent initiates all connections
- **Data sovereignty**: You control what leaves your network

---

## Roadmap

### Phase 1: MVP ✅ Complete

- [x] Network Scanner (TCP/UDP scanning, service fingerprinting, banner grabbing)
- [x] Database Inspector (PostgreSQL, MySQL schema extraction, PII detection)
- [x] Code Analyzer (Git repos, 20+ languages, 30+ frameworks, dependency detection)
- [x] Event Bus (RabbitMQ with CloudEvents, topic-based routing)
- [x] Unified Processor (enrichment, PII redaction, complexity scoring)
- [x] Approval Gateway (React UI + Express API)
- [x] Transmitter (batch transmission with retry, circuit breaker)
- [x] Docker Compose deployment with profiles

### Phase 2: Extended Discovery (Current)

- [ ] API Tracer (runtime dependency mapping)
- [ ] CMDB connectors (ServiceNow, Device42)
- [ ] Kubernetes deployment (Helm charts)
- [ ] Additional database connectors (Oracle, MongoDB)

### Phase 3: Advanced Features

- [ ] ML-based application classification
- [ ] Historical trend analysis
- [ ] Multi-environment correlation
- [ ] Custom collector SDK

---

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- Built as a companion to [AIForce Assess](https://github.com/CryptoYogiLLC/migrate-ui-orchestrator)
- Inspired by the challenges of enterprise cloud modernization
- Thanks to all [contributors](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/graphs/contributors)

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/discussions)
