# Network Scanner

**Language:** Go 1.22+
**Framework:** Gin
**Port:** 8001
**Status:** ✅ Implemented

## Purpose

Discover servers, services, and network topology within configured subnets. Performs TCP port scanning, service fingerprinting from banners, and publishes discovery events to RabbitMQ.

## Features

- [x] TCP port scanning with configurable ranges
- [x] Service fingerprinting (SSH, HTTP, MySQL, PostgreSQL, Redis, MongoDB, etc.)
- [x] OS detection from banner analysis
- [x] Rate limiting to avoid network impact
- [x] Concurrent scanning with configurable worker pools
- [x] REST API for scan control
- [x] CloudEvents publishing to RabbitMQ
- [ ] UDP port scanning (planned)
- [ ] Network topology mapping (planned)

## Events Published

| CloudEvents Type | Routing Key | Description |
|------------------|-------------|-------------|
| `discovery.server.discovered` | `discovered.server` | New server discovered |
| `discovery.service.discovered` | `discovered.service` | Service identified on a port |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness check |
| GET | `/metrics` | Prometheus metrics (placeholder) |
| POST | `/api/v1/scan/start` | Start scanning configured subnets |
| POST | `/api/v1/scan/stop` | Stop active scan |
| GET | `/api/v1/scan/status` | Get scanner status |
| POST | `/api/v1/scan/target` | Scan specific IP address |

## Configuration

Configuration via `config.yaml` or environment variables (prefix: `SCANNER_`):

```yaml
server:
  port: 8001
  read_timeout: 10
  write_timeout: 30

scanner:
  subnets:
    - 10.0.0.0/24
    - 192.168.1.0/24
  exclude_subnets:
    - 10.0.0.1/32
  port_ranges:
    - 1-1024
  common_ports:
    - 22
    - 80
    - 443
    - 3306
    - 5432
    - 6379
    - 8080
    - 27017
  rate_limit: 100      # scans per second
  timeout: 2000        # connection timeout (ms)
  concurrency: 100     # max concurrent scans
  enable_udp: false

rabbitmq:
  url: amqp://discovery:discovery@localhost:5672/
  exchange: discovery.events

logging:
  level: info
  format: json
```

Environment variables override config file:
- `SCANNER_SERVER_PORT` → `server.port`
- `SCANNER_SCANNER_RATE_LIMIT` → `scanner.rate_limit`
- `RABBITMQ_URL` → `rabbitmq.url`

## Development

```bash
cd collectors/network-scanner
go mod download
go run cmd/main.go
```

## Docker

```bash
# Build
docker build -t network-scanner .

# Run
docker run -p 8001:8001 \
  -e RABBITMQ_URL=amqp://discovery:discovery@rabbitmq:5672/ \
  network-scanner
```

## Testing

```bash
go test ./...
```

## Project Structure

```
collectors/network-scanner/
├── cmd/
│   └── main.go              # Entry point
├── internal/
│   ├── api/
│   │   └── api.go           # HTTP handlers
│   ├── config/
│   │   └── config.go        # Configuration loading
│   ├── publisher/
│   │   └── publisher.go     # RabbitMQ CloudEvents publisher
│   └── scanner/
│       ├── scanner.go       # Core scanning logic
│       └── fingerprint.go   # Service fingerprinting
├── config.yaml              # Default configuration
├── Dockerfile
├── go.mod
└── README.md
```
