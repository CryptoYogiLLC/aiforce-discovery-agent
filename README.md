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
- **Infrastructure Probing**: SSH-based system information collection
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

- **Docker** & **Docker Compose** (v2.0+)
- **4GB RAM** minimum
- Network access to systems you want to discover

### Step 1: Clone the Repository

```bash
git clone https://github.com/CryptoYogiLLC/aiforce-discovery-agent.git
cd aiforce-discovery-agent
```

### Step 2: Create Environment File

```bash
# Copy the environment template
cp .env.template .env

# Generate secure secrets and update .env
# IMPORTANT: Set these values before starting services

# Generate JWT secret (required)
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env

# Generate session secret (required)
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

# Set admin password (required, minimum 12 characters)
echo "DEFAULT_ADMIN_PASSWORD=YourSecurePassword123" >> .env

# Set internal API key for service communication
echo "INTERNAL_API_KEY=$(openssl rand -hex 16)" >> .env
```

Or manually edit `.env` and set the required values:

```bash
# Required settings in .env
DEFAULT_ADMIN_PASSWORD=YourSecurePassword123  # Min 12 characters
JWT_SECRET=<64-character-hex-string>
SESSION_SECRET=<64-character-hex-string>
INTERNAL_API_KEY=<32-character-hex-string>
```

### Step 3: Start the Services

```bash
# Start infrastructure (RabbitMQ, PostgreSQL, Redis)
docker compose up -d

# Wait for infrastructure to be healthy (~30 seconds)
docker compose ps

# Start the gateway (UI and API) - required to access the application
docker compose --profile gateway up -d

# Start the processor (enrichment, PII redaction, scoring)
docker compose --profile processor up -d
```

### Step 4: Access the Application

Open http://localhost:3000 in your browser.

**Login credentials:**

- Username: `admin`
- Password: (the value you set for `DEFAULT_ADMIN_PASSWORD`)

### Step 5: Start Collectors (Optional)

Start the collectors you need based on what you want to discover:

```bash
# Network scanning (discover servers, ports, services)
docker compose --profile network up -d

# Code analysis (analyze git repositories)
docker compose --profile code up -d

# Database inspection (extract schemas, detect PII)
docker compose --profile database up -d

# Infrastructure probing (SSH-based system info)
docker compose --profile infra up -d

# Or start everything at once
docker compose --profile all up -d
```

### Verify Services are Running

```bash
# Check all running containers
docker compose --profile all ps

# Check service logs
docker compose --profile all logs -f

# Check specific service logs
docker compose logs approval-api -f
```

---

## Service Ports

| Service             | Port  | URL                    |
| ------------------- | ----- | ---------------------- |
| Approval UI         | 3000  | http://localhost:3000  |
| Approval API        | 3001  | http://localhost:3001  |
| RabbitMQ Management | 15674 | http://localhost:15674 |
| PostgreSQL          | 5434  | localhost:5434         |
| Redis               | 6381  | localhost:6381         |

---

## Docker Compose Profiles

Services are organized into profiles for selective deployment:

| Profile     | Services                               | Use Case                    |
| ----------- | -------------------------------------- | --------------------------- |
| (default)   | rabbitmq, postgres, redis              | Infrastructure only         |
| `gateway`   | approval-ui, approval-api, transmitter | Web UI and API              |
| `processor` | processor                              | Data enrichment and scoring |
| `network`   | network-scanner                        | Network discovery           |
| `code`      | code-analyzer                          | Repository analysis         |
| `database`  | db-inspector                           | Database schema inspection  |
| `infra`     | infra-probe                            | SSH-based system probing    |
| `all`       | All services                           | Complete deployment         |

**Examples:**

```bash
# Minimal setup (infrastructure + UI)
docker compose up -d
docker compose --profile gateway up -d

# Full discovery setup
docker compose --profile all up -d

# Network scanning only
docker compose up -d
docker compose --profile gateway --profile processor --profile network up -d
```

---

## Stopping Services

```bash
# Stop all services
docker compose --profile all down

# Stop and remove volumes (WARNING: deletes all data)
docker compose --profile all down -v

# Stop specific profile
docker compose --profile gateway down
```

---

## Troubleshooting

### Services fail to start

1. **Check if ports are available:**

   ```bash
   lsof -i :3000 -i :3001 -i :5674 -i :5434 -i :6381
   ```

2. **Check Docker logs:**

   ```bash
   docker compose --profile all logs --tail=50
   ```

3. **Verify .env file exists and has required values:**
   ```bash
   grep -E "DEFAULT_ADMIN_PASSWORD|JWT_SECRET" .env
   ```

### Cannot login to the UI

1. **Ensure DEFAULT_ADMIN_PASSWORD is set** (minimum 12 characters):

   ```bash
   grep DEFAULT_ADMIN_PASSWORD .env
   ```

2. **Check approval-api logs for errors:**

   ```bash
   docker compose logs approval-api --tail=100
   ```

3. **Reset the database** (if needed):
   ```bash
   docker compose --profile all down -v
   docker compose --profile all up -d
   ```

### RabbitMQ connection errors

1. **Wait for RabbitMQ to be healthy:**

   ```bash
   docker compose ps rabbitmq
   ```

2. **Check RabbitMQ logs:**
   ```bash
   docker compose logs rabbitmq --tail=50
   ```

---

## Development Setup

For local development without Docker:

```bash
# Install development dependencies
make dev-setup

# Verify environment
make verify

# Run tests
make test

# Run linting
make lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed development guidelines.

---

## Microservices Components

| Service                                         | Language   | Purpose                            | Status      |
| ----------------------------------------------- | ---------- | ---------------------------------- | ----------- |
| [Network Scanner](collectors/network-scanner/)  | Go 1.24    | Discover servers, ports, services  | ✅ Complete |
| [Code Analyzer](collectors/code-analyzer/)      | Python     | Analyze repos, detect dependencies | ✅ Complete |
| [Database Inspector](collectors/db-inspector/)  | Python     | Extract schemas, detect PII        | ✅ Complete |
| [Infrastructure Probe](collectors/infra-probe/) | Python     | SSH-based system info collection   | ✅ Complete |
| [Event Bus](platform/event-bus/)                | RabbitMQ   | Message routing between services   | ✅ Complete |
| [Unified Processor](platform/processor/)        | Python     | Enrich, redact PII, score          | ✅ Complete |
| [Approval UI](gateway/approval-ui/)             | React/Vite | Web UI for review and approval     | ✅ Complete |
| [Approval API](gateway/approval-api/)           | Express    | REST API for gateway operations    | ✅ Complete |
| [Transmitter](gateway/transmitter/)             | Python     | Secure batch transmission          | ✅ Complete |

---

## Security

Security is paramount for a tool that accesses sensitive infrastructure.

- **Report vulnerabilities**: See [SECURITY.md](SECURITY.md)
- **Architecture**: [Security Model](docs/security.md)
- **No inbound ports**: Agent initiates all connections
- **Data sovereignty**: You control what leaves your network

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Areas for Contribution

- **New collectors**: Support for additional platforms (VMware, Kubernetes, etc.)
- **Database connectors**: Oracle, MongoDB, Cassandra, etc.
- **Enrichment rules**: Industry-specific classification
- **Documentation**: Tutorials, examples, translations

---

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/issues)
- **Discussions**: [GitHub Discussions](https://github.com/CryptoYogiLLC/aiforce-discovery-agent/discussions)
