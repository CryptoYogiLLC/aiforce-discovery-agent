# Event Schemas

All services communicate via CloudEvents. This directory contains the schema definitions.

## CloudEvents Format

```json
{
  "specversion": "1.0",
  "type": "discovery.server.discovered",
  "source": "/collectors/network-scanner",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "time": "2024-01-15T10:00:00Z",
  "datacontenttype": "application/json",
  "data": { ... }
}
```

## Event Types

### Collector Events
- `discovered.server` - Server/host discovered
- `discovered.service` - Service on a port identified
- `discovered.database` - Database instance found
- `discovered.repository` - Code repository analyzed
- `discovered.dependency` - Dependency relationship found

### Processing Events
- `enriched.application` - Application enriched with context
- `redacted.application` - PII removed from application data
- `scored.application` - Complexity/effort scores calculated

### Gateway Events
- `approved.batch` - Batch of items approved for transmission
- `transmitted.batch` - Batch successfully sent
