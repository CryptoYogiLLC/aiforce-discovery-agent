# Testing Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
>
> 1. Explicit waits, NEVER arbitrary timeouts
> 2. Test against Docker, not local dev server
> 3. Validate database state, not just API response
> 4. Run pre-commit before every commit
> 5. Use data-testid for E2E selectors

---

## Critical Pattern: Explicit Waits in E2E Tests

Flaky tests were a **constant issue** in parent project.

### Wrong

```typescript
// Arbitrary delay - FLAKY
await page.waitForTimeout(3000);
```

### Correct

```typescript
// Wait for specific condition
await page.waitForSelector('[data-testid="results-table"]');
await expect(page.locator(".status")).toHaveText("Complete");

// Wait for network to be idle
await page.waitForLoadState("networkidle");
```

---

## Critical Pattern: Test Against Docker

### Wrong

```bash
# Testing against local dev server - different behavior
npm run dev &
npm run test:e2e
```

### Correct

```bash
# Test against containerized services
docker-compose up -d
npm run test:e2e  # Hits localhost ports mapped to Docker
```

---

## Pattern: Validate Database State

Don't trust API responses alone.

```python
async def test_create_item(db_session, client):
    response = await client.post('/api/items', json={'name': 'test'})
    assert response.status_code == 201

    # Don't just check response - verify DB
    item = await db_session.execute(
        select(Item).where(Item.name == 'test')
    )
    assert item is not None
    assert item.name == 'test'
```

---

## Pattern: Pre-commit Before Every Commit

```bash
# Run manually to catch issues
pre-commit run --all-files

# Install once
pip install pre-commit
pre-commit install
```

Common fixes:

- Ruff reformatting (auto-fixed, re-stage files)
- Line length > 120 (shorten descriptions)
- Trailing whitespace (auto-fixed)

---

## Pattern: data-testid for Selectors

More stable than class names or text content.

```typescript
// Frontend component
<button data-testid="submit-discovery">Submit</button>

// E2E test
await page.click('[data-testid="submit-discovery"]');
```

---

## Test Structure by Service

### Go (Network Scanner)

```bash
cd collectors/network-scanner
go test ./...
go test -v ./internal/scanner/...  # Specific package
go test -cover ./...               # With coverage
```

### Python (Analyzers)

```bash
cd collectors/code-analyzer
pytest tests/
pytest tests/test_analyzer.py -v   # Specific file
pytest --cov=src tests/            # With coverage
```

### TypeScript (Approval UI)

```bash
cd gateway/approval-ui
npm run test
npm run test -- --watch           # Watch mode
```

---

## Anti-Patterns

| Anti-Pattern         | Why Bad            | Do Instead          |
| -------------------- | ------------------ | ------------------- |
| `waitForTimeout(ms)` | Flaky              | `waitForSelector()` |
| Testing local dev    | Different behavior | Test against Docker |
| Only check response  | Misses DB bugs     | Validate DB state   |
| Skip pre-commit      | CI failures        | Always run locally  |

---

## Pattern: Mock External Dependencies in conftest.py (Added 2026-02-02)

**Problem**: Tests fail with import errors when external packages (aio_pika, asyncpg, aiomysql, prometheus_client) aren't installed in test environment.

**Solution**: Mock modules in conftest.py BEFORE any source imports:

```python
# conftest.py - Must be at the TOP before any other imports
import sys
from unittest.mock import MagicMock, AsyncMock

# Mock aio_pika before any test imports src.main
mock_aio_pika = MagicMock()
mock_aio_pika.connect_robust = AsyncMock()
sys.modules["aio_pika"] = mock_aio_pika

# Mock prometheus_client
mock_prometheus = MagicMock()
mock_prometheus.CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"
mock_prometheus.generate_latest = MagicMock(return_value=b"# HELP...")
sys.modules["prometheus_client"] = mock_prometheus

# Mock tenacity (make retry a no-op decorator)
mock_tenacity = MagicMock()
mock_tenacity.retry = lambda **kwargs: lambda f: f
mock_tenacity.stop_after_attempt = MagicMock()
mock_tenacity.wait_exponential = MagicMock()
sys.modules["tenacity"] = mock_tenacity

# NOW import your test fixtures and source modules
```

**Why**: sys.modules mocks must be in place before Python attempts to import the source modules. conftest.py is loaded first by pytest, making it the ideal location.

**Source**: Session 2026-02-02, Commits 9c5e41a, 45b98a7

---

## Pattern: Use @pytest_asyncio.fixture for Async Fixtures (Added 2026-02-02)

**Problem**: Async fixtures return `async_generator` objects instead of actual values when using `@pytest.fixture`.

**Solution**: Use `@pytest_asyncio.fixture` for any fixture that uses `async/await`:

```python
# Wrong - returns async_generator, not the client
@pytest.fixture
async def client():
    async with AsyncClient(...) as ac:
        yield ac

# Correct - properly yields the client object
import pytest_asyncio

@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
```

**Why**: pytest's standard `@pytest.fixture` doesn't handle async context managers properly. The `pytest-asyncio` plugin provides the correct decorator.

**Source**: Session 2026-02-02, Commit 45b98a7

---

## Pattern: FastAPI Response Patterns (Added 2026-02-02)

**Problem**: Flask-style tuple returns `(content, status_code, headers)` cause errors in FastAPI.

**Solution**: Use FastAPI's response classes:

```python
# Wrong - Flask style (doesn't work in FastAPI)
@app.get("/metrics")
async def metrics():
    return generate_latest().decode("utf-8"), {"Content-Type": CONTENT_TYPE_LATEST}

# Correct - FastAPI PlainTextResponse
from fastapi.responses import PlainTextResponse

@app.get("/metrics")
async def metrics() -> PlainTextResponse:
    return PlainTextResponse(
        content=generate_latest().decode("utf-8"),
        media_type=CONTENT_TYPE_LATEST,
    )
```

**Source**: Session 2026-02-02, Commit 9c5e41a

---

## Pattern: Preserve HTTPException Status Codes (Added 2026-02-02)

**Problem**: Catching all exceptions converts 400-level errors to 500 errors.

**Solution**: Re-raise HTTPException before the generic exception handler:

```python
# Wrong - 400 errors become 500 errors
try:
    # ... validation that raises HTTPException(400)
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))

# Correct - preserve original status codes
try:
    # ... validation that raises HTTPException(400)
except HTTPException:
    raise  # Re-raise as-is (preserve 400 status)
except Exception as e:
    raise HTTPException(status_code=500, detail=str(e))
```

**Source**: Session 2026-02-02, Commit 45b98a7

---

## Search Keywords

testing, pytest, go test, playwright, e2e, flaky, timeout, pre-commit, mock, conftest, pytest_asyncio, async fixture, PlainTextResponse, HTTPException
