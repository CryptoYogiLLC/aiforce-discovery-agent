# ADR-002: Integration with AIForce Assess Application

## Status
**Proposed** - January 2026

## Context

The AIForce Discovery Agent collects data from client environments (servers, databases, applications, dependencies). This data must integrate with the AIForce Assess platform, which has two distinct operational contexts:

### AIForce Assess Scoping Models

| System | Scoping | Purpose | Lifecycle |
|--------|---------|---------|-----------|
| **Discovery Engine** | `user_id` + `analysis_id` | Pre-sales workbook analysis | Before SOW |
| **Modernization Workbench** | `client_account_id` + `engagement_id` | Post-SOW tenant-scoped work | After SOW |

### The Question

When the Discovery Agent transmits data to AIForce Assess:
1. Which context receives the data?
2. How are identifiers mapped?
3. Can data flow between contexts?

## Decision Options

### Option A: Discovery Engine Only (Pre-Sales)

```
┌─────────────────────┐         ┌─────────────────────────────────┐
│  Discovery Agent    │         │      AIForce Assess             │
│  (Client Network)   │         │                                 │
│                     │         │  ┌─────────────────────────┐   │
│  - Servers          │────────▶│  │   Discovery Engine      │   │
│  - Databases        │         │  │   (user_id + analysis_id)│   │
│  - Applications     │         │  └─────────────────────────┘   │
│                     │         │              │                  │
└─────────────────────┘         │              ▼                  │
                                │  ┌─────────────────────────┐   │
                                │  │   Assessment Report     │   │
                                │  │   (PDF/Excel export)    │   │
                                │  └─────────────────────────┘   │
                                └─────────────────────────────────┘
```

**Pros**:
- Simple integration
- No tenant provisioning required
- Quick time-to-value for prospects

**Cons**:
- Data doesn't persist into engagement
- Must re-run discovery after SOW
- No ongoing monitoring

### Option B: Modernization Workbench Only (Post-SOW)

```
┌─────────────────────┐         ┌─────────────────────────────────┐
│  Discovery Agent    │         │      AIForce Assess             │
│  (Client Network)   │         │                                 │
│                     │         │  ┌─────────────────────────┐   │
│  - Servers          │────────▶│  │ Modernization Workbench │   │
│  - Databases        │         │  │ (client_id + engagement) │   │
│  - Applications     │         │  └─────────────────────────┘   │
│                     │         │              │                  │
└─────────────────────┘         │              ▼                  │
                                │  ┌─────────────────────────┐   │
                                │  │   Migration Planning    │   │
                                │  │   Ongoing Monitoring    │   │
                                │  └─────────────────────────┘   │
                                └─────────────────────────────────┘
```

**Pros**:
- Persistent, tenant-scoped data
- Supports ongoing engagement
- Enables change tracking over time

**Cons**:
- Requires client/engagement setup first
- Higher barrier for prospects
- Not useful for pre-sales

### Option C: Dual-Mode with Promotion (Recommended)

```
┌─────────────────────┐         ┌─────────────────────────────────────────┐
│  Discovery Agent    │         │           AIForce Assess                │
│  (Client Network)   │         │                                         │
│                     │         │  ┌─────────────────────────────────┐   │
│  Token determines   │────────▶│  │     API Gateway / Router        │   │
│  destination        │         │  │     (reads token metadata)       │   │
│                     │         │  └──────────────┬──────────────────┘   │
└─────────────────────┘         │                 │                       │
                                │     ┌───────────┴───────────┐           │
                                │     ▼                       ▼           │
                                │  ┌──────────────┐   ┌───────────────┐  │
                                │  │  Discovery   │   │ Modernization │  │
                                │  │   Engine     │   │   Workbench   │  │
                                │  │ (analysis_id)│   │(client+engage)│  │
                                │  └──────┬───────┘   └───────────────┘  │
                                │         │                    ▲          │
                                │         │    PROMOTE         │          │
                                │         └────────────────────┘          │
                                │         (after SOW signed)              │
                                └─────────────────────────────────────────┘
```

**Pros**:
- Supports entire sales lifecycle
- Data continuity from prospect to client
- Flexible deployment model
- No re-discovery needed after SOW

**Cons**:
- More complex token/routing logic
- Promotion workflow needed
- Two integration paths to maintain

## Decision

We recommend **Option C: Dual-Mode with Promotion** for the following reasons:

1. **Sales Lifecycle Alignment**: Discovery Agent supports the entire journey from prospect to active engagement

2. **Data Continuity**: Applications discovered during pre-sales become the foundation for migration planning

3. **Token-Based Routing**: The `DISCOVERY_AGENT_TOKEN` already contains metadata that can determine destination

4. **Promotion Workflow**: Explicit action to promote analysis data into an engagement ensures proper client/engagement setup

## Implementation

### Token Structure

```json
{
  "token_id": "uuid",
  "mode": "discovery_engine | workbench",
  "context": {
    // For discovery_engine mode:
    "user_id": "uuid",
    "analysis_id": "uuid"

    // For workbench mode:
    "client_account_id": "uuid",
    "engagement_id": "uuid"
  },
  "permissions": ["transmit", "read_config"],
  "expires_at": "2026-12-31T23:59:59Z"
}
```

### API Endpoints

```
# Discovery Engine mode
POST /api/v1/discovery/ingest
Headers:
  Authorization: Bearer <token_with_analysis_context>
Body: { discovered_items: [...] }

# Workbench mode
POST /api/v1/workbench/{client_id}/{engagement_id}/discovery/ingest
Headers:
  Authorization: Bearer <token_with_engagement_context>
Body: { discovered_items: [...] }

# Promotion (after SOW)
POST /api/v1/discovery/analyses/{analysis_id}/promote
Body: {
  target_client_account_id: "uuid",
  target_engagement_id: "uuid"
}
```

### Data Flow

```
1. PRE-SALES DISCOVERY
   └── Prospect downloads Discovery Agent
   └── Generates token via AIForce Assess (Discovery Engine)
   └── Token contains: user_id + analysis_id
   └── Agent transmits to: /api/v1/discovery/ingest
   └── Data stored in: discovery_analyses table

2. SOW SIGNED → PROMOTION
   └── Sales creates client_account + engagement
   └── Calls: POST /promote with analysis_id → engagement_id
   └── Data copied to: engagement-scoped tables
   └── Original analysis archived

3. POST-SOW DISCOVERY (optional ongoing)
   └── Client generates new token via Workbench
   └── Token contains: client_account_id + engagement_id
   └── Agent transmits to: /api/v1/workbench/.../ingest
   └── Data stored directly in engagement context
```

### Database Schema Additions (AIForce Assess)

```sql
-- Discovery Engine context
CREATE TABLE discovery_analyses (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    analysis_id UUID NOT NULL,
    discovered_at TIMESTAMP,
    data JSONB,
    promoted_to_engagement_id UUID,  -- NULL until promoted
    promoted_at TIMESTAMP
);

-- Promotion tracking
CREATE TABLE discovery_promotions (
    id UUID PRIMARY KEY,
    source_analysis_id UUID NOT NULL,
    target_client_account_id UUID NOT NULL,
    target_engagement_id UUID NOT NULL,
    promoted_by_user_id UUID NOT NULL,
    promoted_at TIMESTAMP DEFAULT NOW()
);
```

## Consequences

### Positive
- Single Discovery Agent binary supports both use cases
- Seamless transition from prospect to client
- No data loss or re-discovery needed
- Clear audit trail of data provenance

### Negative
- AIForce Assess requires new API endpoints
- Token generation UI needed in both contexts
- Promotion workflow must handle schema differences
- More complex testing scenarios

### Migration Path
1. **Phase 1**: Implement Discovery Engine integration only
2. **Phase 2**: Add Workbench integration
3. **Phase 3**: Build promotion workflow
4. **Phase 4**: Add ongoing discovery for active engagements

## Open Questions

1. **Data Retention**: How long is pre-sales discovery data retained if never promoted?
2. **Partial Promotion**: Can specific items be promoted vs. all-or-nothing?
3. **Re-Discovery Delta**: Should ongoing discovery show changes since initial?
4. **Multi-Engagement**: Can one analysis promote to multiple engagements?

## References
- [AIForce Assess CLAUDE.md - Scoping Models](../../CLAUDE.md)
- [ADR-001: Development Environment Strategy](001-development-environment-strategy.md)
- [docs/ARCHITECTURE.md](../ARCHITECTURE.md)
