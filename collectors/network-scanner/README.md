# Network Scanner

**Language:** Go
**Owner:** Dev 1
**Status:** 🚧 In Progress

## Purpose

Discover servers, services, and network topology within configured subnets.

## Features

- [ ] TCP port scanning with configurable ranges
- [ ] UDP port scanning for common services
- [ ] Service fingerprinting (identify what's running)
- [ ] Network topology mapping
- [ ] Rate limiting to avoid network impact

## Events Published

| Event Type | Description |
|------------|-------------|
| `discovered.server` | New server discovered |
| `discovered.service` | Service identified on a port |
| `discovered.network_flow` | Network connection detected |

## Configuration

```yaml
network_scanner:
  subnets:
    - 10.0.0.0/24
  port_ranges:
    - 1-1024
    - 3306
    - 5432
  rate_limit: 100  # packets per second
```

## Development

```bash
cd collectors/network-scanner
go mod download
go run cmd/main.go
```

## Testing

```bash
go test ./...
```
