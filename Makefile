.PHONY: help dev-setup test lint build clean

help:
	@echo "AIForce Discovery Agent - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make dev-setup      Install all development dependencies"
	@echo "  make verify         Verify development environment"
	@echo ""
	@echo "Test Environment (Randomized):"
	@echo "  make generate-env   Generate new randomized target network"
	@echo "  make target-up      Start the generated target network"
	@echo "  make target-down    Stop the target network"
	@echo "  make target-list    List running target services"
	@echo "  make target-refresh Stop, regenerate, and restart"
	@echo ""
	@echo "Development:"
	@echo "  make test           Run all tests"
	@echo "  make lint           Run all linters"
	@echo "  make build          Build all services"
	@echo ""
	@echo "Docker:"
	@echo "  make up             Start all services"
	@echo "  make down           Stop all services"
	@echo "  make logs           Tail all logs"
	@echo ""
	@echo "Individual Services:"
	@echo "  make test-network-scanner"
	@echo "  make test-code-analyzer"
	@echo "  make test-db-inspector"
	@echo "  make test-approval-ui"

# =============================================================================
# SETUP
# =============================================================================
dev-setup:
	@echo "Setting up development environment..."
	cd collectors/network-scanner && go mod download || true
	cd collectors/code-analyzer && pip install -r requirements-dev.txt || true
	cd collectors/db-inspector && pip install -r requirements-dev.txt || true
	cd gateway/approval-ui && npm install || true
	cd gateway/transmitter && pip install -r requirements-dev.txt || true
	@echo "Done! Run 'make verify' to check setup."

verify:
	@echo "Verifying development environment..."
	@which go || echo "WARNING: Go not found"
	@which python3 || echo "WARNING: Python not found"
	@which node || echo "WARNING: Node.js not found"
	@which docker || echo "WARNING: Docker not found"
	@echo "Verification complete."

# =============================================================================
# TESTING
# =============================================================================
test: test-network-scanner test-code-analyzer test-db-inspector test-approval-ui
	@echo "All tests passed!"

test-network-scanner:
	cd collectors/network-scanner && go test ./...

test-code-analyzer:
	cd collectors/code-analyzer && pytest tests/

test-db-inspector:
	cd collectors/db-inspector && pytest tests/

test-approval-ui:
	cd gateway/approval-ui && npm run test

test-coverage:
	@echo "Running tests with coverage..."
	cd collectors/network-scanner && go test -cover ./...
	cd collectors/code-analyzer && pytest --cov=src tests/
	cd collectors/db-inspector && pytest --cov=src tests/

# =============================================================================
# LINTING
# =============================================================================
lint: lint-go lint-python lint-typescript
	@echo "All linting passed!"

lint-go:
	cd collectors/network-scanner && golangci-lint run

lint-python:
	cd collectors/code-analyzer && ruff check .
	cd collectors/db-inspector && ruff check .
	cd gateway/transmitter && ruff check .

lint-typescript:
	cd gateway/approval-ui && npm run lint

# =============================================================================
# BUILD
# =============================================================================
build:
	docker-compose build

build-network-scanner:
	cd collectors/network-scanner && go build -o bin/network-scanner cmd/main.go

build-approval-ui:
	cd gateway/approval-ui && npm run build

# =============================================================================
# DOCKER
# =============================================================================
up:
	docker-compose up -d

up-all:
	docker-compose --profile all up -d

down:
	docker-compose down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	docker-compose -f docker-compose.generated.yml down -v 2>/dev/null || true
	rm -rf collectors/network-scanner/bin
	rm -rf gateway/approval-ui/dist
	find . -type d -name __pycache__ -exec rm -rf {} + || true
	find . -type d -name .pytest_cache -exec rm -rf {} + || true

# =============================================================================
# TEST ENVIRONMENT (Randomized)
# =============================================================================
generate-env:
	@echo "Generating randomized test environment..."
	python3 scripts/generate-test-env.py
	@echo ""
	@echo "Start with: make target-up"

target-up:
	@if [ ! -f docker-compose.generated.yml ]; then \
		echo "No environment generated. Run 'make generate-env' first."; \
		exit 1; \
	fi
	docker-compose -f docker-compose.generated.yml up -d
	@echo ""
	@echo "Target network running on 172.28.0.0/24"
	@echo "View services: make target-list"

target-down:
	docker-compose -f docker-compose.generated.yml down

target-list:
	@docker ps --filter "network=*target*" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || \
		echo "No target environment running"

target-refresh:
	@echo "Stopping current environment..."
	docker-compose -f docker-compose.generated.yml down 2>/dev/null || true
	@echo "Generating new randomized environment..."
	python3 scripts/generate-test-env.py
	@echo "Starting new environment..."
	docker-compose -f docker-compose.generated.yml up -d
	@echo ""
	@echo "Fresh target network ready on 172.28.0.0/24"
