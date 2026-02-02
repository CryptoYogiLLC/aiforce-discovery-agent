# Air-Gapped Installation Guide

Reference: GitHub Issue #60

This guide covers deploying the Discovery Agent in air-gapped (offline) environments with no external network dependencies.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Creating the Air-Gap Bundle](#creating-the-air-gap-bundle)
- [Transferring to Air-Gapped Environment](#transferring-to-air-gapped-environment)
- [Installation in Air-Gapped Environment](#installation-in-air-gapped-environment)
- [Verification](#verification)
- [Updating in Air-Gapped Environment](#updating-in-air-gapped-environment)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### On Internet-Connected Machine (Build Machine)

- Docker Engine 24+
- Docker Compose v2
- 10GB free disk space for build
- Git (to clone repository)

### On Air-Gapped Machine (Target Machine)

- Docker Engine 24+
- Docker Compose v2
- 8GB RAM minimum (16GB recommended)
- 20GB free disk space
- USB drive or other transfer mechanism

## Creating the Air-Gap Bundle

On an internet-connected machine:

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/aiforce-discovery-agent.git
cd aiforce-discovery-agent
```

### 2. Verify No External Dependencies

```bash
./scripts/verify-offline.sh
```

This script checks for:

- External URLs in source code
- Google Fonts or CDN references
- Missing dependency lockfiles
- Hardcoded external endpoints

### 3. Create the Bundle

```bash
./scripts/export-for-airgap.sh v1.0.0
```

This will:

- Build all Docker images
- Export application images to tar files
- Export infrastructure images (PostgreSQL, RabbitMQ, Redis)
- Package configuration files
- Create a signed manifest

The output will be:

```
discovery-agent-airgap-v1.0.0.tar.gz
```

### 4. Verify Bundle Integrity

```bash
# Check the manifest
tar -xzf discovery-agent-airgap-v1.0.0.tar.gz -O manifest.json | jq .

# Verify checksums
sha256sum discovery-agent-airgap-v1.0.0.tar.gz > discovery-agent-v1.0.0.sha256
```

## Transferring to Air-Gapped Environment

### Option 1: USB Drive

```bash
# Copy bundle to USB drive
cp discovery-agent-airgap-v1.0.0.tar.gz /media/usb/
cp discovery-agent-v1.0.0.sha256 /media/usb/
```

### Option 2: Optical Media

For high-security environments, burn to DVD/Blu-ray:

```bash
# Split if needed (for DVD)
split -b 4G discovery-agent-airgap-v1.0.0.tar.gz bundle-part-

# Burn each part to separate media
```

### Option 3: Data Diode / One-Way Transfer

For environments with data diodes:

```bash
# Verify bundle size
ls -lh discovery-agent-airgap-v1.0.0.tar.gz

# Transfer according to your data diode procedures
```

## Installation in Air-Gapped Environment

### 1. Verify Transfer Integrity

```bash
# Compare checksums
sha256sum -c discovery-agent-v1.0.0.sha256
```

### 2. Import the Bundle

```bash
./scripts/import-airgap.sh discovery-agent-airgap-v1.0.0.tar.gz
```

This will:

- Extract the bundle
- Load all Docker images
- Create configuration template

### 3. Configure the Environment

```bash
cd discovery-agent
cp .env.template .env
```

Edit `.env` with secure values:

```bash
# Generate secure passwords (use offline method)
# Example: openssl rand -hex 32 (if openssl is available offline)

vi .env
```

**Critical settings to change:**

| Variable                | Description               | Generation Method      |
| ----------------------- | ------------------------- | ---------------------- |
| `POSTGRES_PASSWORD`     | Database password         | `openssl rand -hex 16` |
| `RABBITMQ_DEFAULT_PASS` | Message queue password    | `openssl rand -hex 16` |
| `JWT_SECRET`            | API authentication secret | `openssl rand -hex 32` |
| `SESSION_SECRET`        | Session cookie secret     | `openssl rand -hex 32` |

### 4. Start Services

```bash
docker-compose up -d
```

### 5. Verify Services Started

```bash
# Check all services are running
docker-compose ps

# Check logs for errors
docker-compose logs --tail=50

# Check health endpoints
curl http://localhost:3001/health
```

## Verification

### Check No External Connections

Monitor network traffic to ensure no external requests:

```bash
# Install tcpdump if available
sudo tcpdump -i any 'not (host 127.0.0.1 or net 10.0.0.0/8 or net 172.16.0.0/12 or net 192.168.0.0/16)' -c 10
```

### Verify All Features Work

1. **Access UI**: http://localhost:3000
2. **Login**: Use default admin credentials (change immediately)
3. **Run Discovery**: Test a network scan
4. **View Results**: Verify data appears in dashboard
5. **Approve/Reject**: Test workflow functions

### Run Smoke Tests

```bash
# Health check
curl -f http://localhost:3001/health

# Ready check
curl -f http://localhost:3001/ready

# API version
curl -f http://localhost:3001/api/version
```

## Updating in Air-Gapped Environment

### 1. Prepare Update Bundle

On internet-connected machine:

```bash
git pull
./scripts/export-for-airgap.sh v1.1.0
```

### 2. Transfer Bundle

Use same transfer method as initial installation.

### 3. Stop Running Services

On air-gapped machine:

```bash
cd discovery-agent
docker-compose down
```

### 4. Backup Data (Recommended)

```bash
# Backup database
docker run --rm -v discovery-agent_postgres_data:/data -v $(pwd):/backup alpine \
  tar cvf /backup/postgres-backup-$(date +%Y%m%d).tar /data

# Backup configuration
cp .env .env.backup-$(date +%Y%m%d)
```

### 5. Import New Bundle

```bash
./scripts/import-airgap.sh discovery-agent-airgap-v1.1.0.tar.gz
```

### 6. Restore Configuration

```bash
# Keep your existing .env (import script won't overwrite)
# Or restore if needed:
cp .env.backup-* .env
```

### 7. Start Updated Services

```bash
docker-compose up -d
```

### 8. Run Database Migrations

```bash
# Migrations run automatically on startup
# Check logs for migration status
docker-compose logs approval-api | grep -i migration
```

## Troubleshooting

### Images Not Loading

```bash
# Check Docker daemon is running
sudo systemctl status docker

# Check available disk space
df -h

# Try loading images manually
docker load -i discovery-agent-images.tar
```

### Services Not Starting

```bash
# Check logs
docker-compose logs -f

# Check for port conflicts
netstat -tlnp | grep -E '(3000|3001|5432|5672|6379)'

# Check Docker resources
docker system df
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres pg_isready
```

### RabbitMQ Not Ready

```bash
# Check RabbitMQ status
docker-compose exec rabbitmq rabbitmqctl status

# Check cluster status
docker-compose exec rabbitmq rabbitmqctl cluster_status
```

### UI Not Loading

```bash
# Check nginx is running
docker-compose ps approval-ui

# Check nginx logs
docker-compose logs approval-ui

# Test direct access
curl http://localhost:3000/
```

## Security Considerations

### Password Generation

In truly air-gapped environments, generate passwords offline:

```bash
# Using /dev/urandom
head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32

# Using Python (if available)
python3 -c "import secrets; print(secrets.token_hex(32))"
```

### Network Isolation

Ensure the Docker networks remain isolated:

```bash
# Check Docker networks
docker network ls

# Verify no external connectivity
docker run --rm alpine ping -c 1 8.8.8.8 && echo "WARNING: External connectivity detected"
```

### Audit Logging

Review audit logs regularly:

```bash
# Check API audit logs
curl http://localhost:3001/api/audit-trail/logs

# Export for compliance
curl http://localhost:3001/api/audit-trail/export -H "Authorization: Bearer $TOKEN" > audit-export.json
```

## Bundle Contents

The air-gap bundle contains:

| File                         | Description                         |
| ---------------------------- | ----------------------------------- |
| `discovery-agent-images.tar` | All application Docker images       |
| `infrastructure-images.tar`  | PostgreSQL, RabbitMQ, Redis images  |
| `docker-compose.yml`         | Service orchestration configuration |
| `.env.template`              | Environment variable template       |
| `manifest.json`              | Bundle metadata and checksums       |
| `import-airgap.sh`           | Import automation script            |
| `config/`                    | Configuration files for services    |

## Support

For issues with air-gapped deployment:

1. Check this troubleshooting guide
2. Review Docker and service logs
3. Verify all prerequisites are met
4. Ensure bundle integrity with checksums
