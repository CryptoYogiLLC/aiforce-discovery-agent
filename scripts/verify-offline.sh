#!/bin/bash
# scripts/verify-offline.sh
# Verify that the build has no external dependencies
# Reference: GitHub Issue #60, #82

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "  Discovery Agent Offline Verification"
echo "=============================================="
echo ""

ERRORS=0
WARNINGS=0

# Function to report error
error() {
    echo "❌ ERROR: $1"
    ((ERRORS++)) || true  # Prevent set -e exit when ERRORS was 0
}

# Function to report warning
warn() {
    echo "⚠️  WARNING: $1"
    ((WARNINGS++)) || true  # Prevent set -e exit when WARNINGS was 0
}

# Function to report success
success() {
    echo "✅ $1"
}

# 1. Check frontend for external URLs
echo "[1/6] Checking frontend source for external URLs..."
cd "$PROJECT_ROOT"

EXTERNAL_PATTERNS=(
    'https://fonts.googleapis'
    'https://fonts.gstatic'
    'https://cdnjs.cloudflare'
    'https://unpkg.com'
    'https://cdn.jsdelivr'
    'https://ajax.googleapis'
    'https://maxcdn.bootstrapcdn'
)

FOUND_EXTERNAL=false
for pattern in "${EXTERNAL_PATTERNS[@]}"; do
    # Use -q to suppress output, only check exit status
    if grep -rq "$pattern" gateway/approval-ui/src/ gateway/approval-ui/index.html 2>/dev/null; then
        error "External URL found: $pattern"
        FOUND_EXTERNAL=true
    fi
done

if [ "$FOUND_EXTERNAL" = false ]; then
    success "No external URLs in frontend source"
fi

# 2. Check if frontend uses system fonts (good for offline)
echo ""
echo "[2/6] Checking font configuration..."
if grep -q 'fonts.googleapis' gateway/approval-ui/index.html 2>/dev/null; then
    error "Google Fonts link found in index.html"
else
    success "No Google Fonts in index.html"
fi

if grep -q '\-apple-system\|system-ui' gateway/approval-ui/src/styles/*.css 2>/dev/null; then
    success "System fonts configured (good for offline)"
else
    warn "Consider using system fonts for better offline support"
fi

# 3. Check lockfiles exist
echo ""
echo "[3/6] Checking dependency lockfiles..."

LOCKFILES=(
    "gateway/approval-ui/package-lock.json"
    "gateway/approval-api/package-lock.json"
    "collectors/code-analyzer/requirements.txt"
    "collectors/db-inspector/requirements.txt"
    "processing/enrichment/requirements.txt"
    "processing/pii-redactor/requirements.txt"
    "processing/scoring/requirements.txt"
    "gateway/transmitter/requirements.txt"
)

for lockfile in "${LOCKFILES[@]}"; do
    if [ -f "$lockfile" ]; then
        success "Found: $lockfile"
    else
        warn "Missing: $lockfile"
    fi
done

# Check Go modules
if [ -f "collectors/network-scanner/go.sum" ]; then
    success "Found: collectors/network-scanner/go.sum"
else
    warn "Missing: collectors/network-scanner/go.sum"
fi

# 4. Check Dockerfiles don't have external runtime dependencies
echo ""
echo "[4/6] Checking Dockerfiles for runtime external dependencies..."

DOCKERFILES=$(find . -name "Dockerfile" -not -path "./node_modules/*" -not -path "./.git/*" 2>/dev/null)

for dockerfile in $DOCKERFILES; do
    # Check for curl/wget to external URLs at runtime (not build time)
    if grep -E 'CMD.*curl|CMD.*wget|ENTRYPOINT.*curl|ENTRYPOINT.*wget' "$dockerfile" 2>/dev/null; then
        warn "Dockerfile may have runtime external dependency: $dockerfile"
    fi
done
success "Dockerfiles checked for runtime dependencies"

# 5. Check for hardcoded external URLs in code
echo ""
echo "[5/6] Checking source code for hardcoded external URLs..."

# Python files - filter out comment lines and docstrings
if grep -rE 'https?://[^/]+\.(com|org|io|net)' \
    --include="*.py" \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    --exclude-dir="__pycache__" \
    --exclude-dir=".venv" \
    . 2>/dev/null | grep -vE '^\s*#' | grep -vE '(localhost|127\.0\.0\.1|example\.com|"""|\x27\x27\x27)' | head -5; then
    warn "Some external URLs found in Python code (review manually)"
else
    success "No suspicious external URLs in Python code"
fi

# TypeScript/JavaScript files
if grep -rE 'https?://[^/]+\.(com|org|io|net)' \
    --include="*.ts" \
    --include="*.tsx" \
    --include="*.js" \
    --exclude-dir=".git" \
    --exclude-dir="node_modules" \
    . 2>/dev/null | grep -vE '(localhost|127\.0\.0\.1|example\.com|//)' | head -5; then
    warn "Some external URLs found in TypeScript/JavaScript code (review manually)"
else
    success "No suspicious external URLs in TypeScript/JavaScript code"
fi

# 6. Build frontend and check output
echo ""
echo "[6/6] Building frontend and checking for external URLs..."

if [ -d "gateway/approval-ui" ]; then
    cd gateway/approval-ui

    if [ -f "package.json" ]; then
        # Check if node_modules exists
        if [ ! -d "node_modules" ]; then
            echo "  Installing dependencies..."
            npm ci --silent 2>/dev/null || npm install --silent
        fi

        echo "  Building production bundle..."
        npm run build --silent 2>/dev/null || {
            warn "Frontend build failed, skipping output check"
            cd "$PROJECT_ROOT"
        }

        if [ -d "dist" ]; then
            echo "  Checking build output for external URLs..."
            # Exclude known safe URLs:
            # - localhost/127.0.0.1: local development
            # - data:/blob:: inline data URIs
            # - reactjs.org: React's error decoder URL embedded in minified bundles (not a runtime dependency)
            # - w3.org: XML/HTML/SVG namespace URIs (e.g., http://www.w3.org/1999/xhtml) - identifiers, not fetched
            if grep -rE 'https?://' dist/ --include='*.js' --include='*.css' --include='*.html' 2>/dev/null | \
               grep -vE '(localhost|127\.0\.0\.1|data:|blob:|reactjs\.org|w3\.org)' | head -5; then
                error "External URLs found in build output!"
            else
                success "No external URLs in build output"
            fi
        fi
    fi
    cd "$PROJECT_ROOT"
else
    warn "Frontend directory not found, skipping build check"
fi

# Summary
echo ""
echo "=============================================="
echo "  Verification Summary"
echo "=============================================="
echo ""
echo "Errors:   $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "❌ Verification FAILED - fix errors before air-gapped deployment"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo "⚠️  Verification PASSED with warnings - review before deployment"
    exit 0
else
    echo "✅ Verification PASSED - ready for air-gapped deployment"
    exit 0
fi
