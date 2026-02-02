# Lessons Learned from AIForce Assess Development

This document captures critical learnings from developing the AIForce Assess platform. These lessons should guide the Discovery Agent development to avoid repeating mistakes and replicate successes.

---

## Executive Summary: Top 10 Rules

| #   | Rule                                                  | Consequence of Breaking             |
| --- | ----------------------------------------------------- | ----------------------------------- |
| 1   | POST/PUT/DELETE use request body, never query params  | 422 errors, recurring bugs          |
| 2   | Never nest database transactions                      | "Transaction already begun" errors  |
| 3   | snake_case everywhere (frontend AND backend)          | Schema mismatch bugs, NaN% displays |
| 4   | Docker-first development only                         | "Works on my machine" syndrome      |
| 5   | Multi-tenant scoping on ALL queries                   | Data leakage, security violations   |
| 6   | Never downgrade database versions on existing volumes | Data corruption, startup failures   |
| 7   | Check for docker-compose.override.yml                 | Hidden version conflicts            |
| 8   | Use explicit waits in E2E tests                       | Flaky tests, false failures         |
| 9   | Run pre-commit before every commit                    | CI failures, wasted time            |
| 10  | Fix root causes, never band-aid                       | Technical debt accumulation         |

---

## Category 1: API Design Patterns

### ✅ DO: Request Body for POST/PUT/DELETE

```typescript
// ✅ CORRECT
const response = await fetch("/api/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ field: "value" }),
});

// ❌ WRONG - Causes 422 errors with FastAPI/Pydantic
const response = await fetch(`/api/endpoint?field=value`, {
  method: "POST",
});
```

**Why**: FastAPI Pydantic models expect request bodies. This bug was fixed 4 times in 6 months because developers kept reverting to query params.

### ✅ DO: Consistent Field Naming (snake_case)

```python
# Backend model
class ApplicationData(BaseModel):
    app_name: str  # snake_case
    created_at: datetime

# Frontend interface - MATCH EXACTLY
interface ApplicationData {
    app_name: string;  // snake_case, NOT appName
    created_at: string;
}
```

**Why**: Mismatch between `confidence` (backend) and frontend expecting `confidence_score` caused "NaN%" displays and disabled buttons.

### ✅ DO: Return Empty Arrays, Not Null

```python
# ✅ CORRECT
class Response(BaseModel):
    items: List[Item] = []  # Empty list default

# ❌ WRONG
class Response(BaseModel):
    items: Optional[List[Item]] = None  # Causes frontend crashes
```

---

## Category 2: Database & Transactions

### ✅ DO: Never Nest Transactions

```python
# ✅ CORRECT - Use session directly when transaction already active
async def execute_operation(self, db_session: AsyncSession):
    result = await db_session.execute(stmt)
    await db_session.flush()  # Make IDs available for FKs
    # Let caller manage commit/rollback
    return result

# ❌ WRONG - Causes "transaction already begun" error
async def execute_operation(self, db_session: AsyncSession):
    async with db_session.begin():  # ERROR if caller already started tx
        result = await db_session.execute(stmt)
    return result
```

### ✅ DO: Idempotent Migrations

```python
# ✅ CORRECT - Check before creating
def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)

    if 'my_table' not in inspector.get_table_names(schema='migration'):
        op.create_table('my_table', ...)

    columns = [c['name'] for c in inspector.get_columns('my_table', schema='migration')]
    if 'new_column' not in columns:
        op.add_column('my_table', Column('new_column', String))

# ❌ WRONG - Fails on re-run
def upgrade():
    op.create_table('my_table', ...)  # Crashes if exists
```

### ✅ DO: Multi-Tenant Scoping on Every Query

```python
# ✅ CORRECT - Always include tenant filters
async def get_items(self, client_account_id: UUID, engagement_id: UUID):
    stmt = select(Item).where(
        Item.client_account_id == client_account_id,
        Item.engagement_id == engagement_id
    )
    return await self.db.execute(stmt)

# ❌ WRONG - Security violation, data leakage
async def get_items(self):
    stmt = select(Item)  # Returns ALL tenants' data!
    return await self.db.execute(stmt)
```

---

## Category 3: Docker & DevOps

### ✅ DO: Docker-First Development

```bash
# ✅ CORRECT - All development in containers
docker exec -it discovery-agent-backend bash
pytest tests/

# ❌ WRONG - Local development causes "works on my machine"
python -m pytest tests/  # Different Python, different deps
npm run dev              # Different Node version
```

### ✅ DO: Check for Override Files

```bash
# Before debugging version issues, ALWAYS check:
ls -la docker-compose*.yml

# docker-compose.override.yml is auto-loaded and can override versions!
# If found with wrong versions:
rm docker-compose.override.yml
docker-compose down -v
docker-compose up -d --force-recreate
```

### ✅ DO: Never Downgrade Database Versions

```yaml
# If postgres data exists with version 17, NEVER use:
postgres:
  image: postgres:16  # ❌ CRASHES: "database files incompatible"

# Must match or upgrade:
postgres:
  image: postgres:17  # ✅ Matches existing data
```

### ✅ DO: Dual Requirements Files

```
requirements.txt           # Local development
requirements-docker.txt    # Docker/Railway deployment (may differ)
```

**When adding dependencies, update BOTH files.**

---

## Category 4: Testing

### ✅ DO: Explicit Waits in E2E Tests

```typescript
// ✅ CORRECT - Wait for specific condition
await page.waitForSelector('[data-testid="results-table"]');
await expect(page.locator(".status")).toHaveText("Complete");

// ❌ WRONG - Flaky, timing-dependent
await page.waitForTimeout(3000); // Arbitrary delay
```

### ✅ DO: Test Against Docker

```bash
# ✅ CORRECT - Test against containerized services
npm run test:e2e  # Hits localhost:8081 (Docker)

# ❌ WRONG - Testing against local dev server
npm run dev &
npm run test:e2e  # Different behavior than production
```

### ✅ DO: Validate Database State in Tests

```python
# After API call, verify database state
async def test_create_item(db_session):
    response = await client.post('/api/items', json={'name': 'test'})

    # Don't just check response - verify DB
    item = await db_session.execute(
        select(Item).where(Item.name == 'test')
    )
    assert item is not None
```

---

## Category 5: Code Quality

### ✅ DO: Run Pre-commit Before Every Commit

```bash
# Run manually to catch issues before commit
pre-commit run --all-files

# Common fixes needed:
# - Black reformatting (auto-fixed, re-stage files)
# - Line length > 120 (shorten descriptions)
# - f-strings without placeholders (use regular strings)
```

### ✅ DO: Fix Root Causes, Not Symptoms

```python
# ❌ WRONG - Band-aid that masks the real problem
def get_name(app):
    try:
        return app.name
    except:
        return "Unknown"  # Hides why name is missing

# ✅ CORRECT - Understand and fix the source
def get_name(app):
    if app.name is None:
        logger.warning(f"App {app.id} has no name - data quality issue")
        raise ValueError(f"App {app.id} missing required name field")
    return app.name
```

### ✅ DO: Keep Files Under 400 Lines

```
# Project enforces max 400 lines per Python file
# When approaching limit:
1. Extract helper functions to separate module
2. Split class into multiple focused classes
3. Move constants to dedicated config file
```

---

## Category 6: Security

### ✅ DO: Never Hardcode Credentials

```python
# ❌ WRONG
db_password = "supersecret123"
api_key = "sk-abc123..."

# ✅ CORRECT
db_password = os.environ["DB_PASSWORD"]
api_key = os.environ["API_KEY"]
```

### ✅ DO: Use Parameterized Queries

```python
# ❌ WRONG - SQL injection vulnerability
query = f"SELECT * FROM users WHERE id = '{user_id}'"

# ✅ CORRECT - Parameterized
stmt = select(User).where(User.id == user_id)
# Or with raw SQL:
query = text("SELECT * FROM users WHERE id = :id").bindparams(id=user_id)
```

### ✅ DO: Validate All External Input

```python
from pydantic import BaseModel, Field, validator

class CreateItemRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(..., ge=0, le=10000)

    @validator('name')
    def sanitize_name(cls, v):
        return v.strip()  # Remove leading/trailing whitespace
```

---

## Category 7: Event-Driven Architecture (New for Discovery Agent)

### ✅ DO: Use CloudEvents Standard

```json
{
  "specversion": "1.0",
  "type": "discovery.server.discovered",
  "source": "/collectors/network-scanner",
  "id": "unique-uuid",
  "time": "2024-01-15T10:00:00Z",
  "data": { ... }
}
```

### ✅ DO: Idempotent Event Handlers

```python
# ✅ CORRECT - Handle duplicate events gracefully
async def handle_server_discovered(event: CloudEvent):
    server_id = event.data['server_id']

    # Check if already processed
    existing = await db.get(Server, server_id)
    if existing:
        logger.info(f"Server {server_id} already exists, updating")
        await update_server(existing, event.data)
    else:
        await create_server(event.data)
```

### ✅ DO: Dead Letter Queues for Failed Events

```python
# Configure RabbitMQ with DLQ
channel.queue_declare(
    queue='discovery.events',
    arguments={
        'x-dead-letter-exchange': 'discovery.dlx',
        'x-dead-letter-routing-key': 'failed'
    }
)
```

---

## Category 8: Documentation

### ✅ DO: Document Architectural Decisions

```markdown
# ADR-001: Use RabbitMQ for Event Bus

## Status: Accepted

## Context

We need reliable event delivery between microservices.

## Decision

Use RabbitMQ over Kafka because:

- Simpler operations for small team
- Lower resource requirements
- Sufficient throughput for our scale

## Consequences

- Positive: Easier to operate
- Negative: May need to migrate if scale increases 10x
```

### ✅ DO: Keep README Updated

```markdown
# Every service README should include:

1. Purpose (1-2 sentences)
2. Quick start commands
3. Environment variables required
4. API endpoints (if applicable)
5. Event types published/consumed
```

---

## Category 9: Incident Prevention

### ✅ DO: Multi-Layer Safety for Destructive Operations

Based on October 2025 data loss incident:

```python
# Required for any DELETE/cleanup script:

# 1. Environment check
if os.environ.get('ENVIRONMENT') in ['production', 'staging']:
    print("❌ Cannot run in production/staging")
    sys.exit(1)

# 2. Explicit confirmation
confirm = input("Type 'DELETE MY DATA' to proceed: ")
if confirm != 'DELETE MY DATA':
    sys.exit(0)

# 3. Dry-run default
if not args.execute:
    print("DRY RUN - showing what would be deleted:")
    # Show counts only
    return

# 4. Automatic backup
subprocess.run(['pg_dump', '-f', f'backup_{timestamp}.sql', db_url])

# 5. Detailed logging
print(f"✅ Deleted {count} records")
print(f"📁 Backup saved to backup_{timestamp}.sql")
```

---

## Anti-Patterns to Avoid

| Anti-Pattern                  | Why It's Bad                    | What To Do Instead           |
| ----------------------------- | ------------------------------- | ---------------------------- |
| `window.location.reload()`    | Loses React state, poor UX      | Invalidate React Query cache |
| `except: pass`                | Swallows errors silently        | Log and handle specifically  |
| `# TODO: fix later`           | Never gets fixed                | Create GitHub issue          |
| `git commit --no-verify`      | Bypasses quality checks         | Fix the pre-commit errors    |
| Copying code between services | Maintenance nightmare           | Create shared library        |
| Hardcoded timeouts            | Flaky in different environments | Use environment variables    |

---

## Quick Reference: File Organization

```
/docs
  /adr              # Architectural Decision Records
  /guidelines       # Development guidelines
  /runbooks         # Operational procedures
  LESSONS_LEARNED.md  # This file

/src or /app
  /api              # API routes
  /services         # Business logic
  /models           # Data models
  /utils            # Shared utilities

/tests
  /unit             # Unit tests
  /integration      # Integration tests
  /e2e              # End-to-end tests
```

---

## Continuous Improvement

When you encounter a new issue:

1. **Fix the immediate problem**
2. **Document in appropriate memory/guide**
3. **Add pre-commit check if automatable**
4. **Update this document if broadly applicable**

Remember: The goal is to make the same mistake zero times, not twice.
