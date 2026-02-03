# ADR-007: Discovery Acquisition Model

## Status

Proposed

## Context

The AIForce Discovery Agent is intended to autonomously enumerate and understand client environments for cloud modernization planning. However, the current implementation operates as an **inspection tool** (requiring explicit targets) rather than a **discovery agent** (autonomously finding what exists within an approved scope).

### Current State

The existing architecture has:

- Collectors with APIs that wait to be invoked with specific targets
- Profile configuration with target subnets, ports, and collector selection
- No orchestration layer that translates profiles into autonomous discovery runs
- No pipeline for: enumeration → candidate identification → deep inspection → correlation

### The Gap

```
Current:  [Manual Config] → [Collector API Call] → [Results]

Needed:   [Scope Approval] → [Autonomous Enumeration] → [Candidate Identification]
                          → [Deep Inspection (with provided creds)] → [Correlation] → [Results]
```

### Key Questions This ADR Answers

1. What is the **source of truth** for "what exists" in a client environment?
2. What is the **minimum autonomous baseline** the agent guarantees without integrations?
3. How are **credentials handled** for deep inspection?
4. What is the **orchestration contract** between approval-api and collectors?
5. How are **runtime dependencies** discovered?

## Decision

We will implement a **hybrid discovery-first model** with active scanning as the baseline and integrations as enrichers.

### 1. Source of Truth: Active Scanning First

The agent MUST be capable of discovering infrastructure **without any external integrations**.

```
Primary:    Active Scanning (network scan + service fingerprinting)
Secondary:  CMDB/APM integrations (enrich, validate, but never replace)
```

**Rationale**: Clients may not have CMDB or APM tooling. The agent must deliver value standalone.

### 2. Minimum Autonomous Baseline

Without any integrations or provided credentials, the agent guarantees discovery of:

| Layer             | Discovery Method                                             | Output                                                                     |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Servers**       | Network scan within approved subnets                         | `discovery.server.discovered` events                                       |
| **Services**      | Port scan + service fingerprinting                           | `discovery.service.discovered` events                                      |
| **DB Candidates** | Service fingerprint matching (ports 3306, 5432, 27017, etc.) | `discovery.service.discovered` with `database_candidate: true` in metadata |

**Note on Candidates vs Discovered**: A "candidate" is a service that _might_ be a database based on port/fingerprint. We don't emit `discovery.database.discovered` until we have strong evidence (banner/protocol match with high confidence). Candidates are flagged via metadata (`database_candidate: true`, `candidate_confidence: 0.85`) on `discovery.service.discovered` events. This avoids conflating "detected endpoint" with "confirmed database."
| **Code Repos** | Mounted volume scanning or Git server discovery | `discovery.repository.discovered` events |

**Event Naming**: All events follow CloudEvents spec with type pattern `discovery.<entity>.<verb>` per `shared/events/schemas/cloudevent-base.json`.

Deep inspection (schema extraction, API introspection) requires credentials provided at scan time.

### 3. Credential Handling: Per-Scan Model (Phase 1)

**Security Principle**: The agent must be easily security-auditable. Credential storage introduces risk and complexity that jeopardizes audit approval.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Credential Flow (Phase 1)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Admin selects targets for deep inspection                  │
│  2. Admin provides credentials in UI (per-target)              │
│  3. Credentials transmitted to collector (internal network)    │
│  4. Collector performs inspection                              │
│  5. Credentials DISCARDED immediately after use                │
│  6. Results stored WITHOUT credentials                         │
│                                                                 │
│  Phase 1: Manual credential entry per scan                     │
│  ✅ Credentials exist only for duration of scan                │
│  ✅ Minimal attack surface                                      │
│  ✅ Easily auditable code path                                  │
│                                                                 │
│  Phase 2+ (Future): Optional vault/secret manager integration  │
│  - ServiceNow credential store                                 │
│  - HashiCorp Vault                                             │
│  - AWS Secrets Manager                                         │
│  (Only if client requires; manual entry remains default)       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Phase 1 Implementation Requirements**:

- Credentials never written to disk, database, or logs
- Credentials held in memory only during active inspection
- Short-lived scope (local variables, not class/module level)
- Avoid storing in global/session state
- Redact credentials in error handling and stack traces
- Request bodies with credentials never logged
- Transport over internal network only (TLS between services)
- Audit log records "inspection performed on {host}:{port}" but never credential values

**Note on Python strings**: Since Python strings are immutable, "zeroing" isn't a real guarantee. Focus on: never persist/log, short-lived scope, redact in errors, internal transport only.

### 4. Discovery Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Discovery Pipeline                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Autonomous Enumeration (no creds required)           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Network Scanner                                          │   │
│  │ - Scan approved subnets (from profile)                  │   │
│  │ - Emit: discovery.server.discovered,                    │   │
│  │         discovery.service.discovered                    │   │
│  │ - Identify DB candidates by port/fingerprint            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Phase 2: Candidate Identification (automatic)                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Unified Processor (candidate-identification module)     │   │
│  │ - Correlate services to known patterns                  │   │
│  │ - Flag candidates via metadata (candidate: true)        │   │
│  │ - Suggest inspection targets to user                    │   │
│  │ NOTE: Module within existing processor, not new service │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Phase 3: Deep Inspection (creds required, user-initiated)     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ DB Inspector / API Inspector                             │   │
│  │ - User selects candidates + provides credentials        │   │
│  │ - Extract schema, endpoints, metadata                   │   │
│  │ - Credentials discarded after inspection                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Phase 4: Correlation & Relationship Mapping                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Unified Processor (correlation module)                   │   │
│  │ - Map servers → services → applications → databases     │   │
│  │ - Infer relationships from network proximity            │   │
│  │ - Merge with APM data if available (Phase 2 feature)    │   │
│  │ NOTE: Module within existing processor, not new service │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Architecture Note: Unified Processor**

The existing `platform/processor` service handles enrichment, PII redaction, and scoring as a unified pipeline. Candidate identification and correlation are **modules within this processor**, not separate microservices. This avoids:

- Pipeline fragmentation
- Duplicate event subscriptions
- Inconsistent routing key handling
- Multiple DLQ configurations

The processor subscribes to `discovery.*.discovered` events and emits `discovery.*.enriched` events with added metadata including `candidate: true` flags where applicable.

### 5. Orchestration Contract

The approval-api orchestrates discovery runs by:

1. **Accepting a scan request** with profile reference
2. **Creating a scan session** with config snapshot (collectors never query gateway DB)
3. **Triggering collectors** with config snapshot (not profile_id):
   - Network Scanner: receives `{ scan_id, subnets, port_ranges, rate_limit_pps, timeout_ms }`
   - Code Analyzer: receives `{ scan_id, scan_paths, callback_url }`
   - DB Inspector: receives `{ scan_id, targets[], credentials[] }` (user-initiated)
4. **Tracking progress** via collector status callbacks
5. **Handling completion/failure** with appropriate cleanup

**Important**: Collectors are stateless workers. They receive all necessary config in the request body and post results to a callback URL. They do not query the gateway database or store profile references.

```typescript
interface ScanRun {
  id: string;
  profile_id: string;
  config_snapshot: ConfigProfile;
  status:
    | "pending"
    | "scanning"
    | "awaiting_inspection"
    | "completed"
    | "failed";
  phases: {
    enumeration: PhaseStatus;
    identification: PhaseStatus;
    inspection: PhaseStatus; // Requires user action
    correlation: PhaseStatus;
  };
  started_at: Date;
  completed_at: Date | null;
}

interface PhaseStatus {
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  progress: number; // 0-100
  discovery_count: number;
  error_message: string | null;
}
```

### 6. Runtime Dependencies: APM/Log Connectors (Phase 2)

Runtime dependencies (app-to-app, app-to-DB calls) are discovered via integration with existing observability tools:

| Integration     | Data Provided            | Implementation |
| --------------- | ------------------------ | -------------- |
| **Datadog APM** | Service maps, trace data | API connector  |
| **Dynatrace**   | Smartscape topology      | API connector  |
| **AppDynamics** | Flow maps                | API connector  |
| **Log Parsing** | Connection patterns      | Log collector  |

**Rationale**: APM tools already capture runtime flows with minimal intrusion. Building our own tracer (eBPF/sidecar) adds deployment complexity and security review burden.

**Fallback**: Without APM, dependencies are inferred from:

- Code analysis (import statements, connection strings)
- Network proximity (services on same host/subnet)
- Configuration files (docker-compose, k8s manifests)

### 7. CMDB Integration: Enrichment Only (Phase 2)

CMDB connectors (ServiceNow, BMC, etc.) provide:

- Business metadata (owner, cost center, SLA)
- Validation (CMDB says X exists, did we discover it?)
- Reconciliation (discovered Y, not in CMDB - flag for review)

CMDB is **never** the source of truth for what exists - only for metadata about discovered entities.

## Consequences

### Positive

- **Standalone capability**: Agent delivers value without any integrations
- **Security-auditable**: No credential storage, minimal attack surface
- **Progressive discovery**: Each phase adds value; deep inspection is optional
- **Clear boundaries**: Autonomous vs user-initiated actions are explicit
- **Integration-ready**: APM/CMDB connectors enhance but don't gate functionality

### Negative

- **Manual credential entry**: Users must provide DB credentials per scan
- **Limited deep inspection**: Without credentials, DB/API details unavailable
- **Dependency gaps**: Without APM, runtime dependencies are best-effort
- **More user interaction**: Inspection phase requires explicit user action

### Mitigations

- UI streamlines credential entry with target selection
- Candidate identification surfaces high-value inspection targets
- Static analysis provides baseline dependency mapping
- Clear messaging about what requires credentials vs what's automatic

## Implementation Phases

### Phase 1: Autonomous Discovery Pipeline (This ADR)

- Network Scanner autonomous mode
- Candidate identification service
- Scan orchestration in approval-api
- Per-scan credential handling for DB Inspector

### Phase 2: Integration Connectors (Future ADR)

- APM connectors (Datadog, Dynatrace, AppDynamics)
- CMDB connectors (ServiceNow, BMC)
- Log parsing for dependency inference

### Phase 3: Advanced Correlation (Future ADR)

- Application boundary detection
- Dependency graph generation
- Migration group recommendations

## References

- ADR-004: Dry-Run Orchestration Model
- ADR-005: Configuration Propagation Model
- ADR-006: Dry-Run Data Partitioning
- GitHub Issue #85: APM/Log Parser Integration
- GitHub Issue #86: CMDB Connectors
- GitHub Issue #88: Phase 2 Extended Discovery
