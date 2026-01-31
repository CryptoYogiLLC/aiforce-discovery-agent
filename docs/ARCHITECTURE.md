# Discovery Agent Architecture

This document defines the technical architecture for the AIForce Discovery Agent, a microservices-based system for application discovery in client environments.

---

## Architecture Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deployment | Docker Compose + Helm + Binaries | Maximum client flexibility |
| Service Architecture | 6 microservices | Educational value, clear separation |
| Message Broker | RabbitMQ | Enterprise standard, full-featured |
| Event Schemas | JSON Schema | Simple, human-readable, no build step |
| Go Framework | Gin | Most popular, fast, good ecosystem |
| Python Framework | FastAPI | Async, modern, matches main platform |
| TypeScript Runtime | Node.js + Express | Standard, well-understood |
| Configuration | YAML + env override | Flexible, 12-factor compatible |
| Databases | Mixed (SQLite collectors, PostgreSQL gateway) | Right tool for each job |

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT ENVIRONMENT                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        COLLECTOR TIER                                  │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │ Network Scanner │  │  Code Analyzer  │  │  DB Inspector   │       │ │
│  │  │     (Go/Gin)    │  │ (Python/FastAPI)│  │ (Python/FastAPI)│       │ │
│  │  │                 │  │                 │  │                 │       │ │
│  │  │  [SQLite]       │  │  [SQLite]       │  │  [SQLite]       │       │ │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘       │ │
│  │           │                    │                    │                 │ │
│  └───────────┼────────────────────┼────────────────────┼─────────────────┘ │
│              │                    │                    │                   │
│              └────────────────────┼────────────────────┘                   │
│                                   ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         EVENT BUS (RabbitMQ)                           │ │
│  │                                                                        │ │
│  │   Exchanges: discovery.events, processing.events, gateway.events      │ │
│  │   Queues: Per-service consumption queues with DLQ                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                        │
│              ┌────────────────────┼────────────────────┐                   │
│              ▼                    ▼                    ▼                   │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       PROCESSING TIER                                  │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │ │
│  │  │   Enrichment    │  │  PII Redactor   │  │    Scoring      │       │ │
│  │  │    Service      │  │    Service      │  │    Service      │       │ │
│  │  │ (Python/FastAPI)│  │ (Python/FastAPI)│  │ (Python/FastAPI)│       │ │
│  │  │                 │  │                 │  │                 │       │ │
│  │  │  [Stateless]    │  │  [Stateless]    │  │  [Stateless]    │       │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                        │
│                                   ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        GATEWAY TIER                                    │ │
│  │                                                                        │ │
│  │  ┌──────────────────────────────┐    ┌──────────────────────────────┐ │ │
│  │  │      Approval Gateway        │    │        Transmitter           │ │ │
│  │  │    (Node.js/Express/React)   │    │      (Python/FastAPI)        │ │ │
│  │  │                              │    │                              │ │ │
│  │  │  [PostgreSQL] [Redis]        │    │  [PostgreSQL - shared]       │ │ │
│  │  └──────────────────────────────┘    └──────────────────────────────┘ │ │
│  │                                                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   │                                        │
│                                   │ HTTPS (outbound only)                  │
└───────────────────────────────────┼────────────────────────────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   AIForce Assess    │
                         │   (External SaaS)   │
                         └─────────────────────┘
```

---

## Service Specifications

### 1. Network Scanner (Go)

| Attribute | Value |
|-----------|-------|
| **Language** | Go 1.22+ |
| **Framework** | Gin |
| **Database** | SQLite (embedded) |
| **Port** | 8001 |
| **Owner** | Dev 1 |

**Responsibilities:**
- TCP/UDP port scanning
- Service fingerprinting
- Network topology discovery
- Rate-limited subnet crawling

**Events Published:**
| CloudEvents Type | Routing Key | Payload |
|------------------|-------------|---------|
| `discovery.server.discovered` | `discovered.server` | Server metadata, IPs, open ports |
| `discovery.service.discovered` | `discovered.service` | Service type, version, port |
| `discovery.networkflow.discovered` | `discovered.networkflow` | Source, destination, protocol |

**Configuration:**
```yaml
network_scanner:
  subnets:
    - 10.0.0.0/8
  port_ranges:
    - 1-1024
    - 3306
    - 5432
    - 27017
  rate_limit_pps: 100
  timeout_ms: 1000
  workers: 10
```

---

### 2. Code Analyzer (Python)

| Attribute | Value |
|-----------|-------|
| **Language** | Python 3.11+ |
| **Framework** | FastAPI |
| **Database** | SQLite (embedded) |
| **Port** | 8002 |
| **Owner** | Dev 2 |

**Responsibilities:**
- Git repository scanning
- Language/framework detection
- Dependency extraction
- Complexity metrics calculation
- Technical debt signal detection

**Events Published:**
| CloudEvents Type | Routing Key | Payload |
|------------------|-------------|---------|
| `discovery.repository.discovered` | `discovered.repository` | Repo URL, languages, size |
| `discovery.codebase.discovered` | `discovered.codebase` | LOC, complexity, frameworks |
| `discovery.dependency.discovered` | `discovered.dependency` | Package name, version, vulnerabilities |

**Configuration:**
```yaml
code_analyzer:
  git_credentials_env: GIT_TOKEN
  max_repo_size_mb: 500
  analyze_depth: full  # full | shallow
  include_patterns:
    - "*.java"
    - "*.py"
    - "*.ts"
  exclude_patterns:
    - "node_modules/**"
    - "vendor/**"
```

---

### 3. Database Inspector (Python)

| Attribute | Value |
|-----------|-------|
| **Language** | Python 3.11+ |
| **Framework** | FastAPI |
| **Database** | SQLite (embedded) |
| **Port** | 8003 |
| **Owner** | Dev 3 |

**Responsibilities:**
- Multi-database connectivity (PostgreSQL, MySQL, Oracle, SQL Server, MongoDB)
- Schema extraction
- Relationship mapping
- PII detection in schemas
- Data volume estimation

**Events Published:**
| CloudEvents Type | Routing Key | Payload |
|------------------|-------------|---------|
| `discovery.database.discovered` | `discovered.database` | DB type, version, size |
| `discovery.schema.discovered` | `discovered.schema` | Tables, columns, types |
| `discovery.relationship.discovered` | `discovered.relationship` | FK relationships, cardinality |

**Configuration:**
```yaml
db_inspector:
  connection_timeout_s: 30
  sample_rows: 100  # For PII detection
  supported_databases:
    - postgresql
    - mysql
    - mongodb
  pii_detection:
    enabled: true
    patterns:
      - email
      - phone
      - ssn
      - credit_card
```

---

### 4. Processing Services (Python)

Three stateless services sharing common patterns:

| Service | Port | Responsibility |
|---------|------|----------------|
| **Enrichment** | 8010 | Correlate discoveries, add context |
| **PII Redactor** | 8011 | Detect and mask sensitive data |
| **Scoring** | 8012 | Calculate complexity/effort scores |

| Attribute | Value |
|-----------|-------|
| **Language** | Python 3.11+ |
| **Framework** | FastAPI |
| **Database** | None (stateless) |
| **Cache** | Redis (optional) |
| **Owner** | Dev 4 |

**Event Flow:**
```
discovered.* → Enrichment → enriched.*
enriched.*   → PII Redactor → redacted.*
redacted.*   → Scoring → scored.*
scored.*     → Approval Gateway
```

---

### 5. Approval Gateway (TypeScript/React)

| Attribute | Value |
|-----------|-------|
| **Language** | TypeScript |
| **Backend** | Node.js + Express |
| **Frontend** | React + Vite |
| **Database** | PostgreSQL |
| **Cache** | Redis |
| **Port** | 3000 (UI), 3001 (API) |
| **Owner** | Dev 5 |

**Responsibilities:**
- Web UI for reviewing discoveries
- Approval/rejection workflow
- Audit trail
- Local authentication
- Preview mode

**API Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/discoveries` | List pending discoveries |
| GET | `/api/discoveries/:id` | Get discovery details |
| POST | `/api/discoveries/:id/approve` | Approve for transmission |
| POST | `/api/discoveries/:id/reject` | Reject with reason |
| POST | `/api/discoveries/batch/approve` | Bulk approve |
| GET | `/api/audit` | View audit log |

---

### 6. Transmitter (Python)

| Attribute | Value |
|-----------|-------|
| **Language** | Python 3.11+ |
| **Framework** | FastAPI |
| **Database** | PostgreSQL (shared with Gateway) |
| **Port** | 8020 |
| **Owner** | Dev 6 |

**Responsibilities:**
- Batch approved discoveries
- Compress and sign payloads
- Transmit to AIForce Assess
- Retry with exponential backoff
- Circuit breaker for failures

**Configuration:**
```yaml
transmitter:
  destination_url: ${ASSESS_API_URL}
  auth_token_env: ASSESS_API_TOKEN
  batch_size: 100
  batch_interval_s: 60
  retry:
    max_attempts: 3
    backoff_multiplier: 2
    max_delay_s: 300
  circuit_breaker:
    failure_threshold: 5
    reset_timeout_s: 60
```

---

## Infrastructure Components

### RabbitMQ Configuration

```yaml
# Exchanges
discovery.events:    # fanout - all collectors publish here
processing.events:   # topic - processing pipeline
gateway.events:      # direct - approved items

# Queues (with DLQ)
enrichment.queue:
  bind: processing.events
  routing_key: "discovered.*"
  x-dead-letter-exchange: dlx.processing

pii-redactor.queue:
  bind: processing.events
  routing_key: "enriched.*"

scoring.queue:
  bind: processing.events
  routing_key: "redacted.*"

gateway.queue:
  bind: gateway.events
  routing_key: "scored.*"

transmitter.queue:
  bind: gateway.events
  routing_key: "approved.*"
```

### PostgreSQL Schema

```sql
-- Gateway schema
CREATE SCHEMA gateway;

CREATE TABLE gateway.discoveries (
    id UUID PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gateway.audit_log (
    id UUID PRIMARY KEY,
    discovery_id UUID REFERENCES gateway.discoveries(id),
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Transmitter schema
CREATE SCHEMA transmitter;

CREATE TABLE transmitter.batches (
    id UUID PRIMARY KEY,
    status VARCHAR(20) DEFAULT 'pending',
    item_count INTEGER,
    payload_size_bytes INTEGER,
    transmitted_at TIMESTAMP,
    response_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE transmitter.batch_items (
    id UUID PRIMARY KEY,
    batch_id UUID REFERENCES transmitter.batches(id),
    discovery_id UUID,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Event Schema (JSON Schema)

All events follow CloudEvents specification with custom data payload.

### Base Event Structure

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aiforce.dev/schemas/base-event.json",
  "type": "object",
  "required": ["specversion", "type", "source", "id", "time", "data"],
  "properties": {
    "specversion": { "const": "1.0" },
    "type": { "type": "string", "pattern": "^discovery\\.[a-z][a-z0-9]*\\.(discovered|enriched|redacted|scored|approved|rejected|failed)$" },
    "source": { "type": "string", "format": "uri-reference" },
    "id": { "type": "string", "format": "uuid" },
    "time": { "type": "string", "format": "date-time" },
    "datacontenttype": { "const": "application/json" },
    "data": { "type": "object" }
  }
}
```

### Example: Server Discovery Payload Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://aiforce.dev/schemas/discovered-server.json",
  "type": "object",
  "required": ["server_id", "hostname", "discovered_at"],
  "properties": {
    "server_id": { "type": "string", "format": "uuid" },
    "hostname": { "type": "string", "maxLength": 255 },
    "ip_addresses": {
      "type": "array",
      "items": { "type": "string", "format": "ipv4" }
    },
    "open_ports": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "port": { "type": "integer", "minimum": 1, "maximum": 65535 },
          "protocol": { "enum": ["tcp", "udp"] },
          "service": { "type": "string" }
        }
      }
    },
    "os_fingerprint": { "type": "string" },
    "discovered_at": { "type": "string", "format": "date-time" }
  }
}
```

---

## Configuration Management

### Layered Configuration

```
1. defaults.yaml        # Shipped with agent (lowest priority)
2. discovery-agent.yaml # User configuration
3. Environment variables # Override any setting (highest priority)
```

### Environment Variable Mapping

```yaml
# YAML path → Environment variable
network_scanner.subnets → NETWORK_SCANNER_SUBNETS (comma-separated)
transmitter.destination_url → TRANSMITTER_DESTINATION_URL
```

### Shared Config Loader (All Languages)

```go
// Go
config := LoadConfig("discovery-agent.yaml")
subnet := os.Getenv("NETWORK_SCANNER_SUBNETS")
if subnet != "" {
    config.NetworkScanner.Subnets = strings.Split(subnet, ",")
}
```

```python
# Python
config = load_config("discovery-agent.yaml")
subnet = os.environ.get("NETWORK_SCANNER_SUBNETS")
if subnet:
    config["network_scanner"]["subnets"] = subnet.split(",")
```

---

## Deployment Options

### Option 1: Docker Compose (Development / Small Deployments)

```bash
docker-compose up -d
```

Single command, all services, suitable for:
- Development
- Small client environments
- Demo/POC

### Option 2: Helm Chart (Kubernetes)

```bash
helm install discovery-agent ./helm/discovery-agent \
  --namespace discovery \
  --set transmitter.destination_url=https://assess.example.com
```

Suitable for:
- Enterprise Kubernetes clusters
- Production deployments
- Auto-scaling requirements

### Option 3: Binary Distribution

```bash
# Download and run collectors as standalone binaries
./network-scanner --config discovery-agent.yaml
./db-inspector --config discovery-agent.yaml
```

Suitable for:
- Air-gapped environments
- Minimal footprint requirements
- Edge deployments

---

## Cross-Cutting Concerns

### Logging (Structured JSON)

All services log in consistent JSON format:

```json
{
  "timestamp": "2024-01-15T10:00:00Z",
  "level": "INFO",
  "service": "network-scanner",
  "message": "Discovered server",
  "context": {
    "server_id": "abc123",
    "hostname": "web-01"
  }
}
```

### Health Checks

All services expose:

| Endpoint | Response |
|----------|----------|
| `GET /health` | `{"status": "healthy", "version": "1.0.0"}` |
| `GET /ready` | `{"ready": true}` (after initialization) |

### Metrics (Prometheus)

All services expose `GET /metrics` with:
- `discovery_events_published_total`
- `discovery_events_processed_total`
- `discovery_processing_duration_seconds`
- `discovery_errors_total`

---

## Security Model

See [SECURITY.md](../SECURITY.md) for full details.

**Key Points:**
- Outbound-only communication
- TLS 1.3 for all external traffic
- No inbound ports required
- Data encrypted at rest (SQLite encryption, PostgreSQL TDE)
- Audit trail for all approvals

---

## Development Workflow

### Adding a New Collector

1. Create directory: `collectors/my-collector/`
2. Implement health endpoint
3. Implement event publishing to RabbitMQ
4. Add JSON Schema for events in `shared/events/`
5. Add Docker configuration
6. Update docker-compose.yml with new profile
7. Document in README

### Adding a New Event Type

1. Create schema: `shared/events/my-event.schema.json`
2. Update processing services to handle event
3. Add TypeScript interface for Gateway UI
4. Test end-to-end flow

---

## Appendix: Technology Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Languages** | Go, Python, TypeScript | 1.22+, 3.11+, 5.0+ |
| **Go Framework** | Gin | 1.9+ |
| **Python Framework** | FastAPI | 0.109+ |
| **Node Framework** | Express | 4.18+ |
| **Frontend** | React + Vite | 18+, 5+ |
| **Message Broker** | RabbitMQ | 3.12+ |
| **Database** | PostgreSQL, SQLite | 16+, 3.40+ |
| **Cache** | Redis | 7+ |
| **Containers** | Docker | 24+ |
| **Orchestration** | Docker Compose, Kubernetes | 2.20+, 1.28+ |
