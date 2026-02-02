# Event Bus

**Technology:** RabbitMQ
**Status:** Active

## Purpose

Central message broker for event-driven communication between services.

## Exchanges

| Exchange            | Type   | Purpose                                      |
| ------------------- | ------ | -------------------------------------------- |
| `discovery.events`  | fanout | Collectors publish all discovery events here |
| `processing.events` | topic  | Processing pipeline with routing             |
| `gateway.events`    | direct | Approved items to transmitter                |
| `discovery.dlx`     | direct | Dead letter exchange for failed messages     |

## Queues

| Queue                         | Binding                 | Source            |
| ----------------------------- | ----------------------- | ----------------- |
| `enrichment.server.queue`     | `discovered.server`     | processing.events |
| `enrichment.repository.queue` | `discovered.repository` | processing.events |
| `enrichment.database.queue`   | `discovered.database`   | processing.events |
| `redactor.queue`              | `enriched.*`            | processing.events |
| `scoring.queue`               | `redacted.*`            | processing.events |
| `approval.queue`              | `scored.*`              | processing.events |
| `transmitter.queue`           | `approved.batch`        | gateway.events    |

## Dead Letter Queues

Each processing queue has a corresponding dead letter queue:

- `dlq.enrichment.server`
- `dlq.enrichment.repository`
- `dlq.enrichment.database`
- `dlq.redactor`
- `dlq.scoring`
- `dlq.approval`
- `dlq.transmitter`

## Event Flow

```
Collectors → discovery.events (fanout)
                    ↓
             processing.events (topic)
                    ↓
    ┌───────────────┼───────────────┐
    ↓               ↓               ↓
discovered.*   enriched.*      redacted.*
    ↓               ↓               ↓
Enrichment     Redactor        Scoring
    ↓               ↓               ↓
enriched.*     redacted.*      scored.*
                                    ↓
                              approval.queue
                                    ↓
                            gateway.events (direct)
                                    ↓
                            transmitter.queue
```

## Configuration Files

- `rabbitmq.conf` - RabbitMQ server configuration
- `definitions.json` - Exchange, queue, and binding definitions

## Development

```bash
# Start RabbitMQ
docker-compose up -d rabbitmq

# Access management UI
open http://localhost:15672
# Login: discovery / discovery (or $RABBITMQ_PASSWORD)
```

## Verifying Setup

After starting RabbitMQ, verify exchanges and queues are created:

```bash
# List exchanges
docker exec -it $(docker ps -qf "name=rabbitmq") rabbitmqctl list_exchanges

# List queues
docker exec -it $(docker ps -qf "name=rabbitmq") rabbitmqctl list_queues

# List bindings
docker exec -it $(docker ps -qf "name=rabbitmq") rabbitmqctl list_bindings
```
