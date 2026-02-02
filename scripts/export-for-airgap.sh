#!/bin/bash
# scripts/export-for-airgap.sh
# Export all Docker images and configuration for air-gapped deployment
# Reference: GitHub Issue #60, #83

set -e

VERSION=${1:-latest}
OUTPUT_DIR="${2:-./airgap-bundle}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  Discovery Agent Air-Gapped Bundle Creator"
echo "  Version: ${VERSION}"
echo "=============================================="
echo ""

# Create output directory
mkdir -p "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/config/rabbitmq"

# Build all images
echo "[1/7] Building Docker images..."
cd "$PROJECT_ROOT"
docker compose build

# Define image lists
APP_IMAGES=(
    "discovery-network-scanner:${VERSION}"
    "discovery-code-analyzer:${VERSION}"
    "discovery-db-inspector:${VERSION}"
    "discovery-enrichment:${VERSION}"
    "discovery-pii-redactor:${VERSION}"
    "discovery-scoring:${VERSION}"
    "discovery-approval-api:${VERSION}"
    "discovery-approval-ui:${VERSION}"
    "discovery-transmitter:${VERSION}"
)

INFRA_IMAGES=(
    "rabbitmq:3-management"
    "postgres:17"
    "redis:7-alpine"
)

# Tag images with version
echo "[2/7] Tagging images with version..."
for img in "${APP_IMAGES[@]}"; do
    base_name=$(echo "$img" | cut -d: -f1)
    # Get the built image name from docker-compose
    compose_name="aiforce-discovery-agent-${base_name#discovery-}"
    if docker image inspect "${compose_name}:latest" &>/dev/null; then
        docker tag "${compose_name}:latest" "${base_name}:${VERSION}"
        echo "  Tagged: ${base_name}:${VERSION}"
    else
        echo "  Warning: Image ${compose_name}:latest not found, skipping..."
    fi
done

# Export application images
echo "[3/7] Exporting application images..."
VALID_APP_IMAGES=()
for img in "${APP_IMAGES[@]}"; do
    if docker image inspect "$img" &>/dev/null; then
        VALID_APP_IMAGES+=("$img")
    fi
done

if [ ${#VALID_APP_IMAGES[@]} -gt 0 ]; then
    docker save -o "${OUTPUT_DIR}/discovery-agent-images.tar" "${VALID_APP_IMAGES[@]}"
    echo "  Exported ${#VALID_APP_IMAGES[@]} application images"
else
    echo "  Warning: No application images to export"
fi

# Export infrastructure images (pull if not present)
echo "[4/7] Exporting infrastructure images..."
for img in "${INFRA_IMAGES[@]}"; do
    if ! docker image inspect "$img" &>/dev/null; then
        echo "  Pulling: $img"
        docker pull "$img"
    fi
done
docker save -o "${OUTPUT_DIR}/infrastructure-images.tar" "${INFRA_IMAGES[@]}"
echo "  Exported ${#INFRA_IMAGES[@]} infrastructure images"

# Copy configuration files
echo "[5/7] Copying configuration files..."
cp docker-compose.yml "${OUTPUT_DIR}/"

if [ -f docker-compose.override.example.yml ]; then
    cp docker-compose.override.example.yml "${OUTPUT_DIR}/"
fi

# Copy RabbitMQ configuration if exists
if [ -d platform/event-bus ]; then
    find platform/event-bus -name "*.conf" -o -name "*.json" 2>/dev/null | while read -r f; do
        cp "$f" "${OUTPUT_DIR}/config/rabbitmq/" 2>/dev/null || true
    done
fi

# Copy event schemas
if [ -d shared/events/schemas ]; then
    mkdir -p "${OUTPUT_DIR}/shared/events/schemas"
    cp -r shared/events/schemas/* "${OUTPUT_DIR}/shared/events/schemas/"
fi

# Create environment template
echo "[6/7] Creating configuration template..."
cat > "${OUTPUT_DIR}/.env.template" << 'ENVEOF'
# Discovery Agent Configuration Template
# Copy this file to .env and update the values

# PostgreSQL Configuration
POSTGRES_USER=discovery
POSTGRES_PASSWORD=CHANGE_ME_SECURE_PASSWORD
POSTGRES_DB=discovery

# RabbitMQ Configuration
RABBITMQ_DEFAULT_USER=discovery
RABBITMQ_DEFAULT_PASS=CHANGE_ME_SECURE_PASSWORD

# Security Configuration
JWT_SECRET=GENERATE_A_32_CHARACTER_SECRET_HERE
SESSION_SECRET=GENERATE_ANOTHER_32_CHAR_SECRET

# CORS Configuration (adjust for your environment)
CORS_ORIGIN=http://localhost:3000

# Service Ports (defaults)
NETWORK_SCANNER_PORT=8001
CODE_ANALYZER_PORT=8002
DB_INSPECTOR_PORT=8003
ENRICHMENT_PORT=8010
PII_REDACTOR_PORT=8011
SCORING_PORT=8012
APPROVAL_API_PORT=3001
APPROVAL_UI_PORT=3000
TRANSMITTER_PORT=8020

# External API (for transmitter - leave empty if not transmitting)
AIFORCE_API_URL=
AIFORCE_API_KEY=
ENVEOF

# Create import script
cat > "${OUTPUT_DIR}/import-airgap.sh" << 'IMPORTEOF'
#!/bin/bash
# Import script for air-gapped Discovery Agent deployment
set -e

echo "=============================================="
echo "  Discovery Agent Air-Gapped Import"
echo "=============================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load application images
echo "[1/3] Loading application images..."
if [ -f discovery-agent-images.tar ]; then
    docker load -i discovery-agent-images.tar
    echo "  Application images loaded"
else
    echo "  Warning: discovery-agent-images.tar not found"
fi

# Load infrastructure images
echo "[2/3] Loading infrastructure images..."
if [ -f infrastructure-images.tar ]; then
    docker load -i infrastructure-images.tar
    echo "  Infrastructure images loaded"
else
    echo "  Warning: infrastructure-images.tar not found"
fi

# Setup configuration
echo "[3/3] Setting up configuration..."
if [ ! -f .env ]; then
    cp .env.template .env
    echo "  Created .env from template"
    echo ""
    echo "  ⚠️  IMPORTANT: Edit .env file with secure passwords before starting!"
else
    echo "  .env already exists, skipping..."
fi

echo ""
echo "=============================================="
echo "  Import Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "  1. Edit .env with secure passwords"
echo "  2. Run: docker compose up -d"
echo "  3. Access UI at http://localhost:3000"
echo ""
IMPORTEOF
chmod +x "${OUTPUT_DIR}/import-airgap.sh"

# Create manifest using only valid (exported) images
echo "[7/7] Creating manifest..."

# Generate JSON array for application images
generate_json_array() {
    local -n arr=$1
    if [ ${#arr[@]} -eq 0 ]; then
        echo "[]"
    else
        printf '[\n'
        printf '      "%s"' "${arr[0]}"
        for img in "${arr[@]:1}"; do printf ',\n      "%s"' "$img"; done
        printf '\n    ]'
    fi
}

cat > "${OUTPUT_DIR}/manifest.json" << MANIFESTEOF
{
  "name": "discovery-agent",
  "version": "${VERSION}",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "export-for-airgap.sh",
  "checksums": {
    "discovery-agent-images": "$(sha256sum "${OUTPUT_DIR}/discovery-agent-images.tar" 2>/dev/null | cut -d' ' -f1 || echo 'N/A')",
    "infrastructure-images": "$(sha256sum "${OUTPUT_DIR}/infrastructure-images.tar" 2>/dev/null | cut -d' ' -f1 || echo 'N/A')"
  },
  "images": {
    "application": $(generate_json_array VALID_APP_IMAGES),
    "infrastructure": $(generate_json_array INFRA_IMAGES)
  }
}
MANIFESTEOF

# Create final archive
cd "$(dirname "${OUTPUT_DIR}")"
BUNDLE_NAME="discovery-agent-airgap-${VERSION}.tar.gz"
tar -czf "${BUNDLE_NAME}" -C "$(basename "${OUTPUT_DIR}")" .

echo ""
echo "=============================================="
echo "  Bundle Created Successfully!"
echo "=============================================="
echo ""
echo "Bundle: ${BUNDLE_NAME}"
echo "Size: $(du -h "${BUNDLE_NAME}" | cut -f1)"
echo ""
echo "Contents:"
ls -la "${OUTPUT_DIR}"
echo ""
echo "To deploy in an air-gapped environment:"
echo "  1. Transfer ${BUNDLE_NAME} to target machine"
echo "  2. Extract: tar -xzf ${BUNDLE_NAME}"
echo "  3. Run: ./import-airgap.sh"
echo "  4. Edit .env with secure passwords"
echo "  5. Start: docker compose up -d"
echo ""
