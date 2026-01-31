# Testing Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
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
await expect(page.locator('.status')).toHaveText('Complete');

// Wait for network to be idle
await page.waitForLoadState('networkidle');
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

| Anti-Pattern | Why Bad | Do Instead |
|--------------|---------|------------|
| `waitForTimeout(ms)` | Flaky | `waitForSelector()` |
| Testing local dev | Different behavior | Test against Docker |
| Only check response | Misses DB bugs | Validate DB state |
| Skip pre-commit | CI failures | Always run locally |

---

## Search Keywords

testing, pytest, go test, playwright, e2e, flaky, timeout, pre-commit
