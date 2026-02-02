# Event Schemas

All services communicate via CloudEvents. This directory contains the JSON Schema definitions for validation.

## CloudEvents Format

Every event follows the [CloudEvents 1.0 specification](https://cloudevents.io/):

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

## Available Schemas

| Schema                                                           | Event Type                        | Source          |
| ---------------------------------------------------------------- | --------------------------------- | --------------- |
| [cloudevent-base.json](schemas/cloudevent-base.json)             | Base schema                       | All services    |
| [discovered-server.json](schemas/discovered-server.json)         | `discovery.server.discovered`     | Network Scanner |
| [discovered-repository.json](schemas/discovered-repository.json) | `discovery.repository.discovered` | Code Analyzer   |
| [discovered-database.json](schemas/discovered-database.json)     | `discovery.database.discovered`   | DB Inspector    |

## Event Types

### Collector Events

- `discovery.server.discovered` - Server/host discovered on network
- `discovery.service.discovered` - Service identified on a port
- `discovery.database.discovered` - Database instance found
- `discovery.repository.discovered` - Code repository analyzed
- `discovery.dependency.discovered` - Dependency relationship found

### Processing Events

- `discovery.application.enriched` - Application enriched with context
- `discovery.application.redacted` - PII removed from application data
- `discovery.application.scored` - Complexity/effort scores calculated

### Gateway Events

- `discovery.batch.approved` - Batch of items approved for transmission
- `discovery.batch.transmitted` - Batch successfully sent to AIForce Assess

## Validation

### Python

```python
import jsonschema
import json

with open('schemas/discovered-server.json') as f:
    schema = json.load(f)

event = {...}  # Your CloudEvent
jsonschema.validate(event, schema)
```

### Go

```go
import "github.com/xeipuuv/gojsonschema"

schemaLoader := gojsonschema.NewReferenceLoader("file://schemas/discovered-server.json")
documentLoader := gojsonschema.NewGoLoader(event)

result, _ := gojsonschema.Validate(schemaLoader, documentLoader)
if !result.Valid() {
    // Handle validation errors
}
```

### TypeScript

```typescript
import Ajv from "ajv";
import schema from "./schemas/discovered-server.json";

const ajv = new Ajv();
const validate = ajv.compile(schema);

if (!validate(event)) {
  console.error(validate.errors);
}
```

## RabbitMQ Routing

Events are routed via RabbitMQ topic exchange:

| Event Type                        | Routing Key             | Queue                     |
| --------------------------------- | ----------------------- | ------------------------- |
| `discovery.server.discovered`     | `discovered.server`     | `enrichment.server.queue` |
| `discovery.repository.discovered` | `discovered.repository` | `enrichment.repo.queue`   |
| `discovery.database.discovered`   | `discovered.database`   | `enrichment.db.queue`     |
| `discovery.application.enriched`  | `enriched.application`  | `redactor.queue`          |
| `discovery.application.redacted`  | `redacted.application`  | `approval.queue`          |
| `discovery.batch.approved`        | `approved.batch`        | `transmitter.queue`       |

## Adding New Event Types

1. Create schema in `schemas/` following the pattern
2. Reference `cloudevent-base.json` using `allOf`
3. Update this README with the new event type
4. Add schema validation to producer and consumer
