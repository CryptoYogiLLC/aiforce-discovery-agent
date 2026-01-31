# ADR-002: Integration with AIForce Assess Application

## Status
**Accepted** - January 2026

## Context

The AIForce Discovery Agent collects data from client environments (servers, databases, applications, dependencies). This data must integrate with the AIForce Assess platform.

AIForce Assess has two operational contexts with an existing transition process:

| System | Scoping | Purpose |
|--------|---------|---------|
| **Discovery Engine** | `user_id` + `analysis_id` | Pre-sales workbook analysis |
| **Modernization Workbench** | `client_account_id` + `engagement_id` | Post-SOW tenant-scoped work |
| **Intake Process** | Existing workflow | Transitions data from Discovery → Workbench |

## Decision

**The Discovery Agent interfaces ONLY with the Discovery Engine.**

```
┌─────────────────────┐         ┌─────────────────────────────────────────┐
│  Discovery Agent    │         │           AIForce Assess                │
│  (Client Network)   │         │                                         │
│                     │         │  ┌─────────────────────────────────┐   │
│  - Servers          │────────▶│  │      Discovery Engine           │   │
│  - Databases        │         │  │      (user_id + analysis_id)    │   │
│  - Applications     │         │  └──────────────┬──────────────────┘   │
│  - Dependencies     │         │                 │                       │
│                     │         │                 │ EXISTING              │
└─────────────────────┘         │                 │ INTAKE PROCESS        │
                                │                 ▼                       │
                                │  ┌─────────────────────────────────┐   │
                                │  │    Modernization Workbench      │   │
                                │  │  (client_account_id + engage_id)│   │
                                │  └─────────────────────────────────┘   │
                                └─────────────────────────────────────────┘
```

### Rationale

1. **Existing Intake Process**: AIForce Assess already has a workflow for transitioning analysis data to engagement-scoped Workbench. No need to duplicate this.

2. **Single Integration Point**: Discovery Agent only needs to understand one API context, simplifying implementation.

3. **Pre-Sales Focus**: Discovery typically happens during pre-sales to build the business case. By the time SOW is signed, the environment is already captured.

4. **Separation of Concerns**:
   - Discovery Agent: Collect and transmit raw discovery data
   - AIForce Assess: Analyze, assess, and transition via existing workflows

## Implementation

### Token Structure (Simplified)

```json
{
  "token_id": "uuid",
  "user_id": "uuid",
  "analysis_id": "uuid",
  "permissions": ["transmit"],
  "expires_at": "2026-12-31T23:59:59Z"
}
```

### API Endpoint

```
POST /api/v1/discovery/analyses/{analysis_id}/ingest
Headers:
  Authorization: Bearer <discovery_agent_token>
Body: {
  "source": "discovery-agent",
  "version": "0.1.0",
  "discovered_items": [
    {
      "type": "server",
      "data": { ... }
    },
    {
      "type": "database",
      "data": { ... }
    }
  ]
}
```

### Data Flow

```
1. PROSPECT PHASE
   └── Sales/SE creates analysis in Discovery Engine
   └── Generates Discovery Agent token
   └── Shares token + agent with prospect

2. DISCOVERY PHASE
   └── Prospect runs Discovery Agent in their network
   └── Agent collects servers, databases, applications
   └── Agent transmits to Discovery Engine API
   └── Data stored in analysis context

3. ASSESSMENT PHASE
   └── Analysis includes discovered infrastructure
   └── AI/manual assessment of modernization complexity
   └── Business case and recommendations generated

4. SOW SIGNED → INTAKE PROCESS (Existing)
   └── Existing Intake workflow in AIForce Assess
   └── Transitions analysis to Workbench
   └── Creates client_account + engagement
   └── Discovered data available for migration planning
```

### Schema Addition (Discovery Engine)

```sql
-- Add to existing discovery_analyses or create new table
CREATE TABLE discovery_agent_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES discovery_analyses(id),
    agent_version VARCHAR(20),
    collected_at TIMESTAMP NOT NULL,

    -- Discovered infrastructure
    servers JSONB DEFAULT '[]',
    databases JSONB DEFAULT '[]',
    applications JSONB DEFAULT '[]',
    dependencies JSONB DEFAULT '[]',

    -- Metadata
    scan_duration_seconds INTEGER,
    items_discovered INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_discovery_agent_analysis ON discovery_agent_results(analysis_id);
```

## Consequences

### Positive
- Simple, single integration point
- Leverages existing Intake process
- No duplicate promotion logic
- Clear separation of concerns
- Faster implementation

### Negative
- No direct Workbench integration (by design)
- Requires existing Intake workflow to handle discovered data
- Discovery Agent tokens only work in pre-sales context

### Future Considerations

If ongoing discovery is needed post-SOW (monitoring for drift), a separate decision can be made to:
- Create a Workbench-specific agent mode
- Or use the Intake process to periodically refresh discovery data

This is out of scope for MVP.

## References
- AIForce Assess Intake Process
- [ADR-001: Development Environment Strategy](001-development-environment-strategy.md)
