# Build stage
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates tzdata

# Copy go mod files
COPY go.mod go.sum* ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s -X main.Version=$(git describe --tags --always --dirty 2>/dev/null || echo dev)" \
    -o /network-scanner \
    ./cmd/main.go

# Runtime stage
FROM alpine:3.19

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata curl

# Copy binary from builder
COPY --from=builder /network-scanner /app/network-scanner

# Copy configuration if exists (optional, can be mounted)
# hadolint ignore=DL3021
COPY config.yaml* /app/

# Create non-root user
RUN adduser -D -u 1000 scanner && \
    chown -R scanner:scanner /app

# Note: Running as root may be required for raw socket operations
# depending on scanning requirements. For container environments,
# we run as root but with limited capabilities.
# USER scanner

# Environment variables
ENV GIN_MODE=release \
    SCANNER_SERVER_PORT=8001 \
    SCANNER_LOGGING_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

EXPOSE 8001

# Run the binary
ENTRYPOINT ["/app/network-scanner"]
