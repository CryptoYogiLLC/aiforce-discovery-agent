# Event Bus

**Technology:** RabbitMQ
**Owner:** Dev 4
**Status:** 🚧 In Progress

## Purpose

Central message broker for event-driven communication between services.

## Topics

| Topic | Publishers | Subscribers |
|-------|------------|-------------|
| `discovered.*` | All collectors | Enrichment, PII Redactor |
| `enriched.*` | Enrichment | PII Redactor, Scoring |
| `redacted.*` | PII Redactor | Approval Gateway |
| `approved.*` | Approval Gateway | Transmitter |

## Event Schema

All events follow [CloudEvents](https://cloudevents.io/) specification v1.0.

## Configuration

See `rabbitmq.conf` for broker configuration.

## Development

```bash
docker-compose up -d rabbitmq
# Access management UI at http://localhost:15672
```
