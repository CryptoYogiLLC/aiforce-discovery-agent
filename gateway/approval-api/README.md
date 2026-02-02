# Approval API

**Language:** TypeScript
**Framework:** Express.js
**Port:** 3001
**Status:** ✅ Implemented

## Purpose

REST API backend for the Discovery Approval Gateway. Stores discovery events from the processing pipeline, provides CRUD operations, and tracks approval/rejection workflow with audit logging.

## Features

- [x] PostgreSQL schema with discoveries and audit_log tables
- [x] RabbitMQ consumer for scored.\* events
- [x] REST API for discovery management
- [x] Pagination, filtering, and sorting
- [x] Single and batch approval/rejection
- [x] Audit logging for all actions
- [x] Idempotent event handling
- [x] Automatic reconnection on failures

## API Endpoints

| Method | Path                             | Description                                       |
| ------ | -------------------------------- | ------------------------------------------------- |
| GET    | `/health`                        | Health check                                      |
| GET    | `/ready`                         | Readiness check (includes DB and RabbitMQ status) |
| GET    | `/api/discoveries`               | List discoveries (paginated)                      |
| GET    | `/api/discoveries/:id`           | Get single discovery                              |
| POST   | `/api/discoveries/:id/approve`   | Approve discovery                                 |
| POST   | `/api/discoveries/:id/reject`    | Reject discovery (requires reason)                |
| POST   | `/api/discoveries/batch/approve` | Bulk approve multiple discoveries                 |
| GET    | `/api/audit`                     | List audit log entries                            |
| GET    | `/api/audit/discovery/:id`       | Get audit log for specific discovery              |

### Query Parameters for `/api/discoveries`

| Parameter       | Type    | Default    | Description                                  |
| --------------- | ------- | ---------- | -------------------------------------------- |
| `page`          | integer | 1          | Page number                                  |
| `pageSize`      | integer | 20         | Items per page (max 100)                     |
| `status`        | string  |            | Filter by status (pending/approved/rejected) |
| `sourceService` | string  |            | Filter by source service                     |
| `sortBy`        | string  | created_at | Sort column                                  |
| `sortOrder`     | string  | desc       | Sort direction (asc/desc)                    |

## Configuration

Environment variables:

| Variable             | Default                                      | Description               |
| -------------------- | -------------------------------------------- | ------------------------- |
| `PORT`               | `3001`                                       | Server port               |
| `HOST`               | `0.0.0.0`                                    | Server bind host          |
| `POSTGRES_HOST`      | `localhost`                                  | PostgreSQL host           |
| `POSTGRES_PORT`      | `5432`                                       | PostgreSQL port           |
| `POSTGRES_USER`      | `discovery`                                  | PostgreSQL user           |
| `POSTGRES_PASSWORD`  | `discovery`                                  | PostgreSQL password       |
| `POSTGRES_DB`        | `discovery`                                  | PostgreSQL database       |
| `POSTGRES_SSL`       | `false`                                      | Enable SSL for PostgreSQL |
| `POSTGRES_POOL_SIZE` | `10`                                         | Connection pool size      |
| `RABBITMQ_URL`       | `amqp://discovery:discovery@localhost:5672/` | RabbitMQ URL              |
| `RABBITMQ_EXCHANGE`  | `discovery.events`                           | RabbitMQ exchange         |
| `RABBITMQ_QUEUE`     | `gateway.discoveries`                        | RabbitMQ queue name       |
| `LOG_LEVEL`          | `info`                                       | Logging level             |
| `CORS_ORIGIN`        | `http://localhost:3000`                      | Allowed CORS origin       |

## Database Schema

```sql
CREATE SCHEMA gateway;

CREATE TABLE gateway.discoveries (
    id UUID PRIMARY KEY,
    event_type VARCHAR(100) NOT NULL,
    source_service VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE gateway.audit_log (
    id UUID PRIMARY KEY,
    discovery_id UUID REFERENCES gateway.discoveries(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    actor VARCHAR(100),
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Development

```bash
cd gateway/approval-api
npm install
npm run dev
```

## Docker

```bash
# Build
docker build -t approval-api .

# Run
docker run -p 3001:3001 \
  -e POSTGRES_HOST=postgres \
  -e RABBITMQ_URL=amqp://discovery:discovery@rabbitmq:5672/ \
  approval-api
```

## Project Structure

```
gateway/approval-api/
├── src/
│   ├── index.ts           # Express app entry point
│   ├── config.ts          # Configuration
│   ├── routes/
│   │   ├── discoveries.ts # Discovery endpoints
│   │   └── audit.ts       # Audit log endpoints
│   └── services/
│       ├── logger.ts      # Winston logger
│       ├── database.ts    # PostgreSQL client
│       ├── consumer.ts    # RabbitMQ consumer
│       └── discovery.ts   # Discovery business logic
├── package.json
├── tsconfig.json
└── Dockerfile
```
