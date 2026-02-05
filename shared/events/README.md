# Event Schemas

All services communicate via CloudEvents 1.0. This directory contains the JSON Schema definitions for validation.

## CloudEvents Format

Every event follows the [CloudEvents 1.0 specification](https://cloudevents.io/):

```json
{
  "specversion": "1.0",
  "type": "discovery.server.discovered",
  "source": "/collectors/network-scanner",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "time": "2024-01-15T10:00:00Z",
  "subject": "scan-abc123",
  "datacontenttype": "application/json",
  "data": { ... }
}
```

### ADR-007 Compliance

- **subject**: Contains scan_id for orchestration tracking
- **source**: Follows `/collectors/<name>` or `/services/<name>` pattern
- **type**: Follows `discovery.<entity>.<verb>` pattern

## Event Catalog

### Collector Events

| Schema                                                                   | Event Type                            | Source          | Description                       |
| ------------------------------------------------------------------------ | ------------------------------------- | --------------- | --------------------------------- |
| [discovered-server.json](schemas/discovered-server.json)                 | `discovery.server.discovered`         | network-scanner | Server/host discovered on network |
| [discovered-service.json](schemas/discovered-service.json)               | `discovery.service.discovered`        | network-scanner | Service identified on a port      |
| [discovered-repository.json](schemas/discovered-repository.json)         | `discovery.repository.discovered`     | code-analyzer   | Code repository analyzed          |
| [discovered-codebase.json](schemas/discovered-codebase.json)             | `discovery.codebase.discovered`       | code-analyzer   | Codebase metrics calculated       |
| [discovered-dependency.json](schemas/discovered-dependency.json)         | `discovery.dependency.discovered`     | code-analyzer   | Dependency discovered             |
| [discovered-database.json](schemas/discovered-database.json)             | `discovery.database.discovered`       | db-inspector    | Database instance found           |
| [discovered-infrastructure.json](schemas/discovered-infrastructure.json) | `discovery.infrastructure.discovered` | infra-probe     | Infrastructure details via SSH    |

### Base Schema

| Schema                                               | Description                              |
| ---------------------------------------------------- | ---------------------------------------- |
| [cloudevent-base.json](schemas/cloudevent-base.json) | Base CloudEvent schema all events extend |

## Schema Details

### discovered-server.json

Emitted when network scanner discovers a host.

**Required fields:**

- `server_id` (uuid) - Unique identifier
- `ip_addresses` (array) - List of IP addresses

**Optional fields:**

- `hostname` - Resolved hostname
- `mac_address` - MAC address if on same subnet
- `open_ports` - List of open port numbers
- `os` - Operating system info (name, version, family)
- `metadata` - Cloud provider, hosting model (Phase 1)

### discovered-service.json

Emitted when network scanner identifies a service on a port.

**Required fields:**

- `service_id` (uuid) - Unique identifier
- `ip` - IP address
- `port` - Port number
- `protocol` - tcp or udp

**Optional fields:**

- `server_id` - Reference to parent server
- `service` - Service name (http, ssh, mysql, etc.)
- `version` - Service version
- `banner` - Captured banner
- `metadata` - Database candidate flags (ADR-007)

### discovered-repository.json

Emitted when code analyzer finishes repository analysis.

**Required fields:**

- `analysis_id` (uuid) - Analysis identifier
- `repository_url` - Repository URL
- `discovered_at` - Timestamp

**Optional fields:**

- `branch` - Analyzed branch
- `languages` - Language breakdown
- `frameworks` - Detected frameworks
- `application_type` - Classified app type (Phase 1)
- `architecture_pattern` - Architecture pattern (Phase 1)

### discovered-codebase.json

Emitted with codebase metrics from repository analysis.

**Required fields:**

- `analysis_id` (uuid) - Links to repository analysis
- `repository_url` - Repository URL
- `metrics` - Codebase metrics object
- `discovered_at` - Timestamp

**Metrics object:**

- `total_files`, `total_lines`, `code_lines`
- `comment_lines`, `blank_lines`
- `avg_cyclomatic_complexity`, `max_cyclomatic_complexity`
- `test_file_count`, `test_coverage_percent`
- `documentation_ratio`

**Optional fields:**

- `git_history` - Git history metrics (Phase 1)

### discovered-dependency.json

Emitted for each dependency discovered in a repository.

**Required fields:**

- `analysis_id` (uuid) - Links to repository analysis
- `repository_url` - Repository URL
- `dependency` - Dependency details
- `discovered_at` - Timestamp

**Dependency object:**

- `name` (required) - Package name
- `version` - Declared version
- `ecosystem` (required) - npm, pypi, maven, etc.
- `scope` - runtime, dev, optional, etc.
- `vulnerabilities` - Known vulnerabilities (Phase 1)
- `eol_status` - End-of-life status (Phase 1)

### discovered-database.json

Emitted when db-inspector analyzes a database.

**Required fields:**

- `db_type` - Database type (postgresql, mysql, etc.)
- `host` - Database host
- `scan_timestamp` - Timestamp

**Optional fields:**

- `port` - Port number
- `version` - Database version
- `databases` - List of databases
- `schemas` - Schema information
- `replication` - Replication status
- `extensions` - Installed extensions

### discovered-infrastructure.json

Emitted when infra-probe collects system details via SSH.

**Required fields:**

- `probe_id` (uuid) - Probe execution identifier
- `target_ip` - IP address probed
- `discovered_at` - Timestamp

**Optional fields:**

- `server_id` - Reference to network-scanner discovery
- `hostname` - System hostname
- `operating_system` - OS details (name, version, kernel, arch)
- `hardware` - Hardware specs (CPU, memory, disk, virtualization)
- `installed_software` - Installed packages
- `running_services` - Running services
- `network_config` - Network configuration

## Processing Events

These events are produced by the processor service as data flows through the pipeline:

| Event Type               | Routing Key    | Description                 |
| ------------------------ | -------------- | --------------------------- |
| `discovery.*.enriched`   | `enriched.*`   | After enrichment stage      |
| `discovery.*.redacted`   | `redacted.*`   | After PII redaction         |
| `discovery.*.scored`     | `scored.*`     | After scoring               |
| `discovery.*.correlated` | `correlated.*` | After correlation (Phase 2) |

### Enriched Event Additions

Events gain these fields after enrichment:

```json
{
  "data": {
    "enrichment": {
      "environment": "production|staging|development",
      "entity_label": "Application|Database|Server",
      "entity_category": "compute|storage|network"
    }
  }
}
```

### Scored Event Additions

Events gain these fields after scoring:

```json
{
  "data": {
    "scoring": {
      "complexity_score": 0.0-1.0,
      "effort_score": 0.0-1.0,
      "risk_score": 0.0-1.0,
      "cloud_readiness": 0.0-1.0,
      "migration_readiness": 0.0-1.0
    }
  }
}
```

## Gateway Events

| Event Type                    | Routing Key         | Description                     |
| ----------------------------- | ------------------- | ------------------------------- |
| `discovery.batch.approved`    | `approved.batch`    | Batch approved for transmission |
| `discovery.batch.transmitted` | `transmitted.batch` | Batch sent to AIForce Assess    |

## RabbitMQ Routing

| Event Type                            | Routing Key                 | Queue                             |
| ------------------------------------- | --------------------------- | --------------------------------- |
| `discovery.server.discovered`         | `discovered.server`         | `enrichment.server.queue`         |
| `discovery.service.discovered`        | `discovered.service`        | `enrichment.service.queue`        |
| `discovery.repository.discovered`     | `discovered.repository`     | `enrichment.repository.queue`     |
| `discovery.codebase.discovered`       | `discovered.codebase`       | `enrichment.codebase.queue`       |
| `discovery.dependency.discovered`     | `discovered.dependency`     | `enrichment.dependency.queue`     |
| `discovery.database.discovered`       | `discovered.database`       | `enrichment.database.queue`       |
| `discovery.infrastructure.discovered` | `discovered.infrastructure` | `enrichment.infrastructure.queue` |
| `discovery.*.enriched`                | `enriched.*`                | `redactor.queue`                  |
| `discovery.*.redacted`                | `redacted.*`                | `scoring.queue`                   |
| `discovery.*.scored`                  | `scored.*`                  | `correlation.queue`               |
| `discovery.*.correlated`              | `correlated.*`              | `approval.queue`                  |
| `discovery.batch.approved`            | `approved.batch`            | `transmitter.queue`               |

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

## Adding New Event Types

1. Create schema in `schemas/` following the naming pattern `discovered-<entity>.json`
2. Reference `cloudevent-base.json` using `allOf`
3. Set `type` const to `discovery.<entity>.discovered`
4. Set `source` const to `/collectors/<collector-name>`
5. Define `data` object with required and optional properties
6. Update this README with the new event type
7. Add RabbitMQ queue binding in `platform/event-bus/definitions.json`
8. Add schema validation to producer and consumer

## Schema Evolution

When modifying schemas:

1. **Adding optional fields** - Backward compatible, safe
2. **Adding required fields** - Breaking change, version the schema
3. **Removing fields** - Breaking change, deprecate first
4. **Changing field types** - Breaking change, create new field

Always run `pre-commit run --all-files` to validate JSON syntax.
