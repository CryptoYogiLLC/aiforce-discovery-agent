# Sample Go Microservice

A sample Go/Gin REST API for the Discovery Agent dry-run testing.

## Features

- Gin web framework
- PostgreSQL database
- JWT authentication
- Clean architecture (handler/service/repository)
- Graceful shutdown

## Expected Discoveries

When analyzed by the Code Analyzer, this repository should produce:

### Dependencies

- Gin 1.9.1 (Web Framework)
- PostgreSQL (Database)
- JWT (Authentication)
- Logrus (Logging)

### Code Metrics

- ~1000 lines of Go code
- 3 domain entities
- Clean separation of concerns
- Repository pattern implementation

## Building

```bash
# Build
go build -o server ./cmd/main.go

# Run
./server

# Run tests
go test ./...
```

## Environment Variables

| Variable    | Description        | Default         |
| ----------- | ------------------ | --------------- |
| PORT        | Server port        | 8080            |
| DB_HOST     | PostgreSQL host    | localhost       |
| DB_PORT     | PostgreSQL port    | 5432            |
| DB_USER     | Database user      | postgres        |
| DB_PASSWORD | Database password  | postgres        |
| DB_NAME     | Database name      | sample          |
| JWT_SECRET  | JWT signing secret | your-secret-key |
