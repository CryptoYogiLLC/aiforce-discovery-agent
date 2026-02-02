# ADR-004: Dry-Run Orchestration Model

## Status

Accepted

## Context

The Dry-Run feature allows clients to test the discovery system on simulated environments before running on production networks. This requires:

1. **Container orchestration**: Starting/stopping test environment containers
2. **Docker API access**: Requires Docker socket access (effectively root-equivalent)
3. **Security isolation**: Dry-run data must never mix with production data
4. **Resource management**: Automatic cleanup to prevent resource exhaustion

The main security concern is that embedding Docker control into `approval-api` creates a privilege escalation risk - any vulnerability in the API becomes a potential host compromise.

## Decision

We will implement a **dedicated dry-run orchestrator service** with strict privilege isolation.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Discovery Control Center                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐      ┌──────────────────┐                    │
│  │ Approval UI  │─────▶│   Approval API   │                    │
│  └──────────────┘      └────────┬─────────┘                    │
│                                 │                               │
│                                 │ HTTP (internal only)          │
│                                 ▼                               │
│                    ┌────────────────────────┐                   │
│                    │  Dry-Run Orchestrator  │◀── Isolated       │
│                    │      (dedicated)       │    service        │
│                    └───────────┬────────────┘                   │
│                                │                                │
│                                │ Docker Socket                  │
│                                ▼ (read/write)                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Docker Engine / Test Network                   ││
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          ││
│  │  │ nginx   │ │ postgres│ │ django  │ │ mongodb │          ││
│  │  │ (test)  │ │ (test)  │ │ (test)  │ │ (test)  │          ││
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Choices

1. **Isolated Service**: `dryrun-orchestrator` is a separate container with minimal attack surface
2. **No Direct Docker Access from API**: `approval-api` communicates with orchestrator via internal HTTP, never touches Docker socket
3. **Labeled Resources**: All dry-run containers use label `discovery.dryrun.session_id={uuid}` for cleanup targeting
4. **Dedicated Network**: Test containers run on isolated `dryrun-{session_id}` network
5. **Read-only Socket Option**: Consider Docker socket proxy (e.g., Tecnativa/docker-socket-proxy) that restricts API calls

### Dry-Run Orchestrator Responsibilities

```
1. Receive start/stop commands from approval-api
2. Generate test environment (docker-compose)
3. Start containers with proper labels
4. Monitor container health
5. Trigger collectors to scan test network
6. Cleanup resources on completion/timeout
7. Report progress via internal API
```

### Security Constraints

1. **No Image Pulling**: Orchestrator can ONLY start containers from pre-approved, locally-cached images. This prevents supply chain attacks where malicious images could be specified.

   ```python
   # ALLOWED: Start from cached image
   docker.containers.run("discovery/test-nginx:1.0", ...)

   # BLOCKED: Never pull images
   # docker.images.pull("malicious/image:latest")  # PROHIBITED
   ```

2. **Resource Limits**: All dry-run sessions have hard limits:

   ```yaml
   # Per-container limits
   mem_limit: 512m
   cpus: 0.5
   pids_limit: 100

   # Per-session limits
   max_containers: 20
   max_session_duration: 30m # Auto-cleanup after 30 minutes
   ```

3. **Allowed Images Whitelist**: Only images matching `discovery/test-*` prefix can be started

   ```python
   ALLOWED_IMAGE_PREFIX = "discovery/test-"

   def validate_image(image_name: str) -> bool:
       return image_name.startswith(ALLOWED_IMAGE_PREFIX)
   ```

4. **No User-Provided Compose Content**: The orchestrator ONLY accepts predefined template IDs (e.g., "small", "medium", "large", "custom-db-heavy"). Users cannot provide arbitrary docker-compose YAML or container definitions.

   ```python
   # ALLOWED: Select from predefined templates
   TEMPLATES = {
       "small": "templates/small.yml",      # 5 containers
       "medium": "templates/medium.yml",    # 10 containers
       "large": "templates/large.yml",      # 20 containers
   }

   def start_session(template_id: str) -> Session:
       if template_id not in TEMPLATES:
           raise ValueError(f"Unknown template: {template_id}")
       # Load from trusted local file only
       compose_file = TEMPLATES[template_id]
   ```

### Data Partitioning

All dry-run discoveries are stored with:

- `is_dryrun: true` column (not nullable, default false)
- `dryrun_session_id: UUID` reference
- Separate table: `gateway.dryrun_discoveries` (preferred)

Production queries MUST filter: `WHERE is_dryrun = false` or use separate table.

## Consequences

### Positive

- **Privilege isolation**: Approval API has no Docker access
- **Blast radius limited**: Orchestrator compromise doesn't expose API secrets
- **Auditable**: All dry-run operations flow through single service
- **Cleanly separable**: Can disable dry-run feature entirely in production

### Negative

- **Additional service**: One more container to deploy and monitor
- **Internal communication**: Adds HTTP hop for dry-run operations
- **Complexity**: Two services instead of one for orchestration logic

### Mitigations

- Orchestrator can be optional (don't deploy in production if not needed)
- Internal communication is on private Docker network (no exposure)

## Implementation Notes

### Docker Socket Proxy (Recommended)

```yaml
# docker-compose.yml
services:
  docker-proxy:
    image: tecnativa/docker-socket-proxy
    environment:
      CONTAINERS: 1 # Allow container operations
      IMAGES: 0 # Deny image operations
      NETWORKS: 1 # Allow network operations
      POST: 1 # Allow POST (start/stop)
      DELETE: 1 # Allow DELETE (remove)
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro

  dryrun-orchestrator:
    depends_on:
      - docker-proxy
    environment:
      DOCKER_HOST: tcp://docker-proxy:2375
    # NO direct socket mount
```

### Cleanup Safety

```python
def cleanup_session(session_id: str):
    # ONLY delete resources with matching label
    label_filter = f"discovery.dryrun.session_id={session_id}"

    containers = docker.containers.list(filters={"label": label_filter})
    for container in containers:
        container.stop(timeout=10)
        container.remove()

    networks = docker.networks.list(filters={"label": label_filter})
    for network in networks:
        network.remove()
```

## Scope Clarification

This ADR covers dry-run container orchestration only. **Service restart from UI** (restart production collectors) is out of scope for Phase 4 and deferred as a future enhancement due to operational risk.

## References

- Docker Socket Proxy: https://github.com/Tecnativa/docker-socket-proxy
- Principle of Least Privilege
