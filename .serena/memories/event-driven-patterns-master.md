# Event-Driven Architecture Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Specific To**: AIForce Discovery Agent

---

## Quick Reference

> **Top 5 patterns to know:**
> 1. Use CloudEvents standard for all events
> 2. Event handlers MUST be idempotent
> 3. Configure Dead Letter Queues for failed events
> 4. Keep event payloads small, use IDs for references
> 5. Events are facts, not commands

---

## CloudEvents Standard

All services communicate via CloudEvents through RabbitMQ.

### Naming Convention (IMPORTANT)

| Component | Convention | Example |
|-----------|------------|---------|
| CloudEvents `type` | 3 segments: `domain.noun.verb` | `discovery.server.discovered` |
| RabbitMQ routing key | 2 segments: `verb.noun` | `discovered.server` |
| Schema filename | kebab-case | `discovered-server.json` |

**Why different?** The CloudEvents `type` follows the spec (descriptive, namespaced). The routing key is optimized for RabbitMQ topic matching (`discovered.*` matches all discoveries).

### Event Structure
```json
{
  "specversion": "1.0",
  "type": "discovery.server.discovered",
  "source": "/collectors/network-scanner",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "time": "2024-01-15T10:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "server_id": "abc123",
    "hostname": "web-server-01",
    "ip_addresses": ["10.0.0.50"],
    "open_ports": [80, 443, 22]
  }
}
```

### Publishing (Python)
```python
from cloudevents.http import CloudEvent
import json
import pika

event = CloudEvent({
    "type": "discovery.server.discovered",
    "source": "/collectors/network-scanner",
    "data": {
        "server_id": str(uuid.uuid4()),
        "hostname": "web-server-01",
        "ip_addresses": ["10.0.0.50"]
    }
})

channel.basic_publish(
    exchange='discovery.events',
    routing_key='discovered.server',
    body=json.dumps(event.to_dict())
)
```

---

## Critical Pattern: Idempotent Handlers

Events may be delivered multiple times. Handle duplicates gracefully.

### Correct
```python
async def handle_server_discovered(event: CloudEvent):
    server_id = event.data['server_id']

    # Check if already processed
    existing = await db.get(Server, server_id)
    if existing:
        logger.info(f"Server {server_id} already exists, updating")
        await update_server(existing, event.data)
    else:
        await create_server(event.data)
```

### Wrong
```python
async def handle_server_discovered(event: CloudEvent):
    # Creates duplicate on redelivery!
    await create_server(event.data)
```

---

## Critical Pattern: Dead Letter Queues

Failed events go to DLQ for investigation, not lost.

```python
# Configure RabbitMQ with DLQ
channel.queue_declare(
    queue='discovery.events',
    arguments={
        'x-dead-letter-exchange': 'discovery.dlx',
        'x-dead-letter-routing-key': 'failed'
    }
)

# Create DLQ
channel.exchange_declare(exchange='discovery.dlx', exchange_type='direct')
channel.queue_declare(queue='discovery.dlq')
channel.queue_bind(
    queue='discovery.dlq',
    exchange='discovery.dlx',
    routing_key='failed'
)
```

---

## Event Flow in Discovery Agent

### Full Microservices Path
```
discovered.* → Enrichment → enriched.*
enriched.*   → PII Redactor → redacted.*
redacted.*   → Scoring → scored.*
scored.*     → Approval Gateway → approved.*
approved.*   → Transmitter
```

### MVP Simplified Path (Recommended for initial deployment)
```
discovered.* → [Unified Processor] → scored.*
scored.*     → Approval Gateway → approved.*
approved.*   → Transmitter
```

The unified processor combines enrichment + PII redaction + scoring into one service. See issue #50.

### RabbitMQ Routing

| Event Type | Routing Key | Consumer |
|------------|-------------|----------|
| `discovery.server.discovered` | `discovered.server` | Enrichment |
| `discovery.database.discovered` | `discovered.database` | Enrichment |
| `discovery.application.enriched` | `enriched.application` | PII Redactor |
| `discovery.application.redacted` | `redacted.application` | Scoring |
| `discovery.batch.approved` | `approved.batch` | Transmitter |

---

## Pattern: Small Payloads

Keep event payloads focused. Reference large data by ID.

### Wrong
```json
{
  "type": "discovery.codebase.analyzed",
  "data": {
    "repository_id": "abc123",
    "full_dependency_tree": { ... },  // Large nested object
    "all_files_analyzed": [ ... ]     // Huge array
  }
}
```

### Correct
```json
{
  "type": "discovery.codebase.analyzed",
  "data": {
    "repository_id": "abc123",
    "file_count": 1250,
    "dependency_count": 84,
    "details_url": "/api/analyses/abc123"  // Reference for details
  }
}
```

---

## Pattern: Events Are Facts

Events describe what happened, not what should happen.

### Wrong (Command)
```json
{
  "type": "discovery.server.scan",  // Imperative - command
  "data": { "target": "10.0.0.50" }
}
```

### Correct (Fact)
```json
{
  "type": "discovery.server.discovered",  // Past tense - fact
  "data": { "ip": "10.0.0.50", "hostname": "web-01" }
}
```

---

## Anti-Patterns

| Anti-Pattern | Why Bad | Do Instead |
|--------------|---------|------------|
| Non-idempotent handlers | Duplicates on retry | Check before create |
| No DLQ | Lost events | Configure DLQ |
| Large payloads | Slow, memory issues | Reference by ID |
| Command-style events | Coupling | Fact-style events |

---

## Schema Validation

Schemas live in `shared/events/schemas/`.

```python
import jsonschema

with open('shared/events/schemas/discovered-server.json') as f:
    schema = json.load(f)

# Validate before publishing
jsonschema.validate(event.data, schema)
```

---

## Search Keywords

events, cloudevents, rabbitmq, queue, dlq, idempotent, event-driven
