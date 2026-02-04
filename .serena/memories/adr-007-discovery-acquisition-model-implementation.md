# ADR-007: Discovery Acquisition Model - Implementation Guide

**Date**: 2026-02-03
**Commits**: 76536cd, 620fa1e, c1e07ac
**Status**: ✅ ADR CREATED, Implementation Pending
**GitHub Issues**: #106, #107, #108, #109, #110, #111, #112
**Milestone**: #6 "Autonomous Discovery Pipeline"

## Summary

ADR-007 defines the architecture for transitioning from an "inspection tool" (requiring explicit targets) to an "autonomous discovery agent" (finding what exists within approved scope).

## Key Architecture Decisions

### 1. Active Scanning as Primary Source of Truth

```
Primary:    Active Scanning (network scan + service fingerprinting)
Secondary:  CMDB/APM integrations (enrich, validate, but never replace)
```

**Why**: Clients may not have CMDB or APM tooling. The agent must deliver value standalone.

### 2. CloudEvents Naming Convention

Event types MUST follow pattern: `discovery.<entity>.<verb>`

| Event Type                        | Use Case                        |
| --------------------------------- | ------------------------------- |
| `discovery.server.discovered`     | Host found on network           |
| `discovery.service.discovered`    | Service identified on port      |
| `discovery.repository.discovered` | Git repo found                  |
| `discovery.service.enriched`      | Service with candidate metadata |

**Entity naming rules:**

- Lowercase letters and digits only
- NO underscores (use `ec2instance` not `ec2_instance`)

**Allowed verbs:** `discovered`, `enriched`, `redacted`, `scored`, `approved`, `rejected`, `failed`

### 3. Unified Processor for Candidate Identification

**CRITICAL**: Candidate identification is a MODULE in `platform/processor`, NOT a new microservice.

```
platform/processor/src/modules/
├── enrichment/
├── pii_redaction/
├── scoring/
└── candidate_identification/  # NEW MODULE
```

**Why**: Avoids pipeline fragmentation, keeps event handling centralized, single DLQ configuration.

### 4. Per-Scan Credentials (Never Stored)

```
Phase 1: Manual credential entry per scan
- Credentials exist only for duration of scan
- Internal network transport (NOT TLS in dev)
- Credentials discarded after use

Phase 2+: Optional vault integration if client requires
```

### 5. Callback-Based Orchestration

Collectors receive **config snapshots**, NOT profile IDs. They never query gateway DB.

```typescript
// Orchestration triggers collector with full config
await fetch(`${collectorUrl}/api/v1/scan/start`, {
  method: "POST",
  headers: { "X-Internal-API-Key": process.env.INTERNAL_API_KEY },
  body: JSON.stringify({
    scan_id: scanRun.id,
    subnets: configSnapshot.network.subnets,
    port_ranges: ["1-1024", "3306", "5432"],
    callback_url: `${selfUrl}/api/scans/${scanRun.id}`,
  }),
});
```

### 6. Callback Contract (Authoritative)

All collectors use shared `INTERNAL_API_KEY` from environment (NOT per-scan secrets).

**Progress Callback:**

```
POST /api/scans/{scan_id}/progress
X-Internal-API-Key: {INTERNAL_API_KEY}
{
  "scan_id": "uuid",
  "collector": "network-scanner",
  "phase": "port_scanning",
  "progress": 45,
  "discovery_count": 12,
  "timestamp": "ISO8601"
}
```

**Idempotency Rules:**

- Start: If already started, return 200 with current status
- Progress: Last-write-wins by timestamp
- Complete: First-write-wins

### 7. SSE for Real-Time Progress (Not WebSockets)

**Why SSE:**

- Server → client only (sufficient for progress)
- Works with existing cookie auth (ADR-003)
- Simpler reconnection logic

**Nginx config for SSE:**

```nginx
proxy_buffering off;
proxy_cache off;
X-Accel-Buffering: no;
```

## Candidate Flags Location

Flags stored in `data.metadata` (NOT top-level fields):

```json
{
  "type": "discovery.service.enriched",
  "data": {
    "ip_address": "192.168.1.10",
    "port": 5432,
    "service": "postgresql",
    "metadata": {
      "database_candidate": true,
      "candidate_confidence": 0.95,
      "candidate_reason": "Port 5432 + PostgreSQL banner"
    }
  }
}
```

## Implementation Order

1. **#108 Scan Orchestration** - approval-api routes, callback endpoints
2. **#106 Network Scanner** - autonomous TCP connect scan
3. **#111 Code Analyzer** - discovery only (no analysis)
4. **#107 Candidate Identification** - processor module
5. **#112 SSE Progress** - real-time updates
6. **#109 DB Inspector** - batch targets, SecretStr
7. **#110 UI** - candidate selection, credential entry

## Files Modified (Dry-Run Preparation)

| File                                                                | Changes                                         |
| ------------------------------------------------------------------- | ----------------------------------------------- |
| `platform/dryrun-orchestrator/main.py`                              | Use shared network, trigger collectors          |
| `collectors/code-analyzer/src/main.py`                              | Add `/api/v1/dryrun/scan` endpoint              |
| `gateway/approval-api/src/middleware/auth.ts`                       | Add `internalApiKeyAuth`                        |
| `gateway/approval-api/src/routes/dryrun.ts`                         | Use `internalApiKeyAuth` for internal endpoints |
| `gateway/approval-ui/src/components/dryrun/DryRunActiveSession.tsx` | Derive collector status from discoveries        |

## Related ADRs

- ADR-003: Session Security Model (cookie auth for SSE)
- ADR-005: Configuration Propagation Model (config snapshots to collectors)
- ADR-006: Dry-Run Data Partitioning (separate routing keys)

## Prompt for New Session

```
Implement the Autonomous Discovery Pipeline defined in ADR-007.

Read `docs/adr/007-discovery-acquisition-model.md` and GitHub Issues #106-#112 (Milestone #6).

Key decisions:
- CloudEvents: `discovery.<entity>.<verb>` per base schema
- Candidate identification is a MODULE in `platform/processor`
- Callback-based orchestration with config snapshots
- Shared INTERNAL_API_KEY from environment (not per-scan)
- SSE for progress (not WebSockets)

Start with #108 (Scan Orchestration) - it's the foundation.
```
