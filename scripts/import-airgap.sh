#!/bin/bash
# scripts/import-airgap.sh
# Import Discovery Agent from air-gapped bundle
# Reference: GitHub Issue #60, #83

set -e

BUNDLE=$1

usage() {
    echo "Usage: $0 <bundle.tar.gz>"
    echo ""
    echo "Import Discovery Agent from an air-gapped bundle."
    echo ""
    echo "Example:"
    echo "  $0 discovery-agent-airgap-v1.0.0.tar.gz"
    exit 1
}

if [ -z "$BUNDLE" ]; then
    usage
fi

if [ ! -f "$BUNDLE" ]; then
    echo "Error: Bundle file not found: $BUNDLE"
    exit 1
fi

echo "=============================================="
echo "  Discovery Agent Air-Gapped Import"
echo "=============================================="
echo ""

EXTRACT_DIR="./discovery-agent"
mkdir -p "$EXTRACT_DIR"

# Extract bundle
echo "[1/5] Extracting bundle..."
tar -xzf "$BUNDLE" -C "$EXTRACT_DIR"
echo "  Extracted to: $EXTRACT_DIR"

cd "$EXTRACT_DIR"

# Verify manifest
echo "[2/5] Verifying bundle..."
if [ -f manifest.json ]; then
    VERSION=$(grep -o '"version": "[^"]*"' manifest.json | cut -d'"' -f4)
    echo "  Bundle version: $VERSION"
    echo "  Created: $(grep -o '"created_at": "[^"]*"' manifest.json | cut -d'"' -f4)"
else
    echo "  Warning: No manifest found"
fi

# Load application images
echo "[3/5] Loading application images..."
if [ -f discovery-agent-images.tar ]; then
    docker load -i discovery-agent-images.tar
    echo "  Application images loaded successfully"
else
    echo "  Warning: discovery-agent-images.tar not found"
fi

# Load infrastructure images
echo "[4/5] Loading infrastructure images..."
if [ -f infrastructure-images.tar ]; then
    docker load -i infrastructure-images.tar
    echo "  Infrastructure images loaded successfully"
else
    echo "  Warning: infrastructure-images.tar not found"
fi

# Setup configuration
echo "[5/5] Setting up configuration..."
if [ ! -f .env ]; then
    if [ -f .env.template ]; then
        cp .env.template .env
        echo "  Created .env from template"
    else
        echo "  Warning: No .env.template found"
    fi
else
    echo "  .env already exists, preserving existing configuration"
fi

# Verify images loaded
echo ""
echo "Verifying loaded images..."
echo ""
docker images | grep -E 'discovery-|rabbitmq|postgres|redis' | head -20

echo ""
echo "=============================================="
echo "  Import Complete!"
echo "=============================================="
echo ""
echo "Loaded images are ready. Next steps:"
echo ""
echo "  1. IMPORTANT: Edit .env with secure passwords:"
echo "     vi .env"
echo ""
echo "  2. Start the services:"
echo "     docker-compose up -d"
echo ""
echo "  3. Check service health:"
echo "     docker-compose ps"
echo ""
echo "  4. Access the UI at:"
echo "     http://localhost:3000"
echo ""
echo "  5. View logs:"
echo "     docker-compose logs -f"
echo ""
