# ADR-005: Configuration Propagation Model

## Status

Accepted

## Context

The Control Center allows users to create and manage configuration profiles that define scan parameters (subnets, ports, rate limits, enabled collectors, etc.). We need to decide how profile changes propagate to the actual collectors.

Options considered:

1. **Dynamic config service**: Collectors poll for config changes and hot-reload
2. **Restart collectors**: Change profile, then restart affected services
3. **Gateway-side only**: Profiles only affect gateway behavior; collectors use static config

## Decision

We will use a **hybrid model**: profiles are stored in the gateway and applied when **starting a new scan**, not dynamically during operation.

### Configuration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Control Center                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐       ┌──────────────┐                       │
│  │   Profiles   │──────▶│ Active       │                       │
│  │   (stored)   │       │ Profile      │                       │
│  └──────────────┘       └──────┬───────┘                       │
│                                │                                │
│                                ▼                                │
│                    ┌───────────────────────┐                   │
│                    │    Scan Trigger       │                   │
│                    │  (start scan button)  │                   │
│                    └───────────┬───────────┘                   │
│                                │                                │
│                                │ Profile config passed          │
│                                │ to collectors at scan start    │
│                                ▼                                │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Collectors                              ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   ││
│  │  │Network Scanner│  │ Code Analyzer │  │ DB Inspector  │   ││
│  │  │               │  │               │  │               │   ││
│  │  │ Receives:     │  │ Receives:     │  │ Receives:     │   ││
│  │  │ - subnets     │  │ - repo_paths  │  │ - db_hosts    │   ││
│  │  │ - ports       │  │ - patterns    │  │ - timeout     │   ││
│  │  │ - rate_limit  │  │ - depth       │  │ - pii_enabled │   ││
│  │  └───────────────┘  └───────────────┘  └───────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Choices

1. **Profile at scan start**: When user clicks "Start Scan" (or dry-run), the active profile's config is read and passed to collectors
2. **No hot-reload**: Running scans are not affected by profile changes mid-execution
3. **Collectors accept config via API**: Each collector exposes `POST /scan` that accepts config parameters
4. **Fallback to defaults**: If no profile config provided, collectors use their default configuration
5. **Scan-level configuration**: Each scan execution is associated with the profile config used (for audit)

### Collector API Contract

```typescript
// POST /api/scan (each collector)
{
  "scan_id": "uuid",
  "config": {
    "subnets": ["10.0.0.0/24"],
    "port_ranges": ["1-1024"],
    "rate_limit_pps": 100,
    "timeout_ms": 1000,
    "workers": 10
  }
}
```

### Profile Application Points

| Action                | Profile Applied?    | Notes                                                |
| --------------------- | ------------------- | ---------------------------------------------------- |
| Start production scan | Yes                 | Active profile config sent to collectors             |
| Start dry-run         | Yes                 | Active profile config used for test env + collectors |
| Change active profile | No immediate effect | Takes effect on next scan start                      |
| Edit profile          | No immediate effect | Saved to database only                               |

## Consequences

### Positive

- **Simple**: No complex hot-reload or config watching infrastructure
- **Predictable**: Running scans unaffected by config changes
- **Auditable**: Each scan records which profile/config was used
- **No collector restarts**: No downtime to apply config changes

### Negative

- **Delayed effect**: Profile changes don't take effect until next scan
- **Duplicate config**: Config passed per-scan, some redundancy

### Trade-offs Accepted

- We accept that profile changes are not instant in favor of simplicity and auditability
- Users must start a new scan to see profile changes take effect

## Implementation Notes

### Scan Orchestration Location

The "start scan" orchestration lives in **`approval-api`** (not a separate service). This keeps the architecture simple:

```
┌─────────────────────────────────────────────────────────────┐
│                      approval-api                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  POST /api/scans              ← User clicks "Start Scan"     │
│    │                                                         │
│    ├── 1. Load active profile from DB                        │
│    ├── 2. Create scan record with profile_config snapshot    │
│    ├── 3. Call each collector's POST /scan endpoint          │
│    └── 4. Return scan ID to UI                               │
│                                                              │
│  For Dry-Run:                                                │
│    POST /api/dryrun/sessions  ← User clicks "Start Dry-Run"  │
│      │                                                       │
│      ├── 1. Call dryrun-orchestrator to start test env       │
│      ├── 2. Wait for containers to be healthy                │
│      ├── 3. Call collectors with test network config         │
│      └── 4. Return session ID to UI                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

The `approval-api` is the single point of control for scan operations. The `dryrun-orchestrator` is only responsible for container lifecycle, not scan coordination.

### Scan Execution Service

```typescript
// approval-api/src/services/scanService.ts
async function startScan(userId: string): Promise<Scan> {
  const activeProfile = await profileService.getActive();

  const scan = await db.query(
    `
    INSERT INTO gateway.scans (started_by, profile_id, profile_config)
    VALUES ($1, $2, $3)
    RETURNING *
  `,
    [userId, activeProfile.id, activeProfile.config],
  );

  // Trigger collectors with config
  await Promise.all([
    networkScanner.startScan(scan.id, activeProfile.config.network),
    codeAnalyzer.startScan(scan.id, activeProfile.config.code),
    dbInspector.startScan(scan.id, activeProfile.config.database),
  ]);

  return scan;
}
```

### UI Messaging

When profile is changed, show message:

> "Profile saved. Changes will take effect on the next scan."

## References

- 12-Factor App: Config
- Immutable Infrastructure patterns
