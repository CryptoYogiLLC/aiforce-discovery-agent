# ADR-006: Dry-Run Data Partitioning

## Status

Accepted

## Context

The dry-run feature generates discovery data from simulated test environments. This data must be completely separated from production discoveries to prevent:

1. **Accidental transmission**: Dry-run data sent to AIForce Assess
2. **Polluted analytics**: Test data skewing production metrics
3. **User confusion**: Mixing test and real discoveries in approval queue
4. **Compliance issues**: Test data included in audit reports

A "DRY-RUN badge" in the UI is not sufficient protection.

## Decision

We will use **separate database tables** for dry-run discoveries with hard-coded isolation at the data layer.

### Database Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL - gateway schema                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRODUCTION TABLES              DRYRUN TABLES                   │
│  ──────────────────            ──────────────────               │
│                                                                  │
│  ┌──────────────────┐          ┌──────────────────┐            │
│  │   discoveries    │          │ dryrun_discoveries│            │
│  ├──────────────────┤          ├──────────────────┤            │
│  │ id               │          │ id               │            │
│  │ event_type       │          │ session_id (FK)  │◀─┐        │
│  │ payload          │          │ event_type       │  │        │
│  │ status           │          │ payload          │  │        │
│  │ ...              │          │ status           │  │        │
│  └──────────────────┘          │ ...              │  │        │
│                                └──────────────────┘  │        │
│  ┌──────────────────┐          ┌──────────────────┐  │        │
│  │   audit_log      │          │ dryrun_sessions  │──┘        │
│  │   (production)   │          ├──────────────────┤            │
│  └──────────────────┘          │ id               │            │
│                                │ status           │            │
│  ┌──────────────────┐          │ manifest         │            │
│  │    batches       │          │ started_by       │            │
│  │  (transmitter)   │          │ ...              │            │
│  └──────────────────┘          └──────────────────┘            │
│         │                                                       │
│         │                      ┌──────────────────┐            │
│         └─────────────────────▶│ transmitted_     │            │
│           ONLY references      │ payloads         │            │
│           production          └──────────────────┘            │
│           discoveries                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Choices

1. **Separate tables**: `gateway.discoveries` vs `gateway.dryrun_discoveries`
2. **Foreign key to session**: All dry-run discoveries reference `dryrun_sessions.id`
3. **No cross-references**: Production tables never reference dry-run tables
4. **Transmitter isolation**: Transmitter queries ONLY from `gateway.discoveries` - physically cannot access dry-run data
5. **Cascade delete**: When dry-run session is cleaned up, all associated discoveries are deleted

### Schema Definition

```sql
-- Production discoveries (existing)
CREATE TABLE gateway.discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    -- ... other columns
    created_at TIMESTAMP DEFAULT NOW()
);

-- Dry-run sessions
CREATE TABLE gateway.dryrun_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'initializing',
    started_by UUID REFERENCES gateway.users(id),
    profile_id UUID REFERENCES gateway.profiles(id),
    profile_config JSONB,
    manifest JSONB,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

-- Dry-run discoveries (separate table)
CREATE TABLE gateway.dryrun_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES gateway.dryrun_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),

    -- Cannot reference production discoveries
    -- No foreign keys to gateway.discoveries
);

CREATE INDEX idx_dryrun_discoveries_session ON gateway.dryrun_discoveries(session_id);
```

### API Isolation

| Endpoint                                   | Data Source                  | Notes                          |
| ------------------------------------------ | ---------------------------- | ------------------------------ |
| `GET /api/discoveries`                     | `gateway.discoveries`        | Production only                |
| `POST /api/discoveries/:id/approve`        | `gateway.discoveries`        | Production only                |
| `GET /api/dryrun/sessions/:id/discoveries` | `gateway.dryrun_discoveries` | Dry-run only                   |
| `POST /api/dryrun/discoveries/:id/approve` | `gateway.dryrun_discoveries` | Practice only, not transmitted |

### Transmitter Safety

```python
# transmitter/service.py
async def get_approved_discoveries():
    # HARD-CODED to production table only
    query = """
        SELECT * FROM gateway.discoveries
        WHERE status = 'approved'
        AND transmitted_at IS NULL
    """
    # Cannot accidentally query dryrun_discoveries
    return await db.fetch_all(query)
```

### Event Bus Isolation

Dry-run approvals MUST NOT publish to the same routing keys that the transmitter consumes.

```
Production Flow:
  User approves → POST /api/discoveries/:id/approve
                → Publishes: approved.discovery (routing key)
                → Transmitter consumes approved.*

Dry-Run Flow:
  User approves → POST /api/dryrun/discoveries/:id/approve
                → Publishes: dryrun.approved.discovery (routing key)
                → NO consumer (or dry-run analytics only)
                → Transmitter NEVER binds to dryrun.*
```

**Transmitter Binding (Hard-coded)**:

```python
# transmitter/consumer.py
ROUTING_KEY = "approved.*"  # Only production approvals

# NEVER bind to:
# - "dryrun.*"
# - "dryrun.approved.*"
# - "#" (wildcard that would catch everything)
```

This ensures that even if code accidentally calls the wrong API endpoint, the event bus routing prevents dry-run data from reaching the transmitter.

### CI Guard Test

Add a test that fails if the transmitter binding is changed to a dangerous pattern:

```python
# tests/test_transmitter_safety.py
import pytest
from transmitter.consumer import ROUTING_KEY

def test_transmitter_never_binds_to_dryrun():
    """Guard test: transmitter must never consume dry-run events."""
    dangerous_patterns = ['#', 'dryrun.*', 'dryrun.approved.*', '*']
    assert ROUTING_KEY not in dangerous_patterns, \
        f"CRITICAL: Transmitter binding '{ROUTING_KEY}' would consume dry-run data!"
    assert not ROUTING_KEY.startswith('dryrun'), \
        f"CRITICAL: Transmitter binding '{ROUTING_KEY}' starts with 'dryrun'!"

def test_transmitter_binds_to_approved_only():
    """Transmitter should only bind to production approved events."""
    assert ROUTING_KEY == 'approved.*', \
        f"Expected 'approved.*', got '{ROUTING_KEY}'"
```

This test runs in CI and prevents accidental changes that would break isolation.

## Consequences

### Positive

- **Physical isolation**: Impossible to accidentally transmit dry-run data
- **Clean separation**: No risk of joining across tables incorrectly
- **Simple cleanup**: `DELETE FROM dryrun_sessions WHERE id = $1` cascades everything
- **Clear audit**: Production audit log never contains dry-run events

### Negative

- **Schema duplication**: Similar columns in two tables
- **Code duplication**: Some query logic duplicated for each context
- **No unified view**: Cannot easily show "all discoveries" across both

### Trade-offs Accepted

- We accept schema duplication for the security guarantee of physical separation
- A unified view is not a requirement; production and dry-run are fundamentally different contexts

## Implementation Notes

### Context-Aware Repository Pattern

```typescript
// repositories/discoveryRepository.ts
export class DiscoveryRepository {
  async findAll(): Promise<Discovery[]> {
    // ALWAYS production
    return db.query("SELECT * FROM gateway.discoveries");
  }
}

export class DryRunDiscoveryRepository {
  async findBySession(sessionId: string): Promise<DryRunDiscovery[]> {
    // ALWAYS dry-run
    return db.query(
      "SELECT * FROM gateway.dryrun_discoveries WHERE session_id = $1",
      [sessionId],
    );
  }
}
```

### UI Context Switching

```typescript
// Route: /discoveries (production)
// Route: /dryrun/:sessionId/discoveries (dry-run)

// Never mix in same view
```

## References

- Data isolation patterns
- Multi-tenant data strategies (applied to operational contexts)
