# API Design Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
>
> 1. POST/PUT/DELETE use request body, NEVER query params
> 2. snake_case everywhere (frontend AND backend)
> 3. Return empty arrays [], never null for collections
> 4. Always validate external input with Pydantic
> 5. Use parameterized queries, never string interpolation

---

## Critical Pattern: Request Body for POST/PUT/DELETE

This bug was fixed **4 times in 6 months** in the parent project.

### Wrong (Causes 422 Errors)

```typescript
// Frontend - WRONG
const response = await fetch(`/api/endpoint?field=value`, {
  method: "POST",
});
```

```python
# Backend expects body, not query params
@router.post("/endpoint")
async def create_item(request: CreateItemRequest):  # Pydantic model
    ...
```

### Correct

```typescript
// Frontend - CORRECT
const response = await fetch("/api/endpoint", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ field: "value" }),
});
```

**Why**: FastAPI Pydantic models expect request bodies. Query params are for GET only.

---

## Critical Pattern: snake_case Everywhere

Mismatch between `confidence` (backend) and `confidence_score` (frontend) caused "NaN%" displays.

### Correct

```python
# Backend
class ApplicationData(BaseModel):
    app_name: str  # snake_case
    created_at: datetime
    confidence_score: float  # Match frontend exactly
```

```typescript
// Frontend - MATCH EXACTLY
interface ApplicationData {
  app_name: string; // NOT appName
  created_at: string; // NOT createdAt
  confidence_score: number;
}
```

### Never Do

```typescript
// WRONG - camelCase
interface ApplicationData {
  appName: string;
  createdAt: string;
}
```

---

## Pattern: Return Empty Arrays, Not Null

```python
# Correct
class Response(BaseModel):
    items: List[Item] = []  # Empty list default

# Wrong - causes frontend crashes
class Response(BaseModel):
    items: Optional[List[Item]] = None
```

---

## Pattern: Input Validation

```python
from pydantic import BaseModel, Field, validator

class CreateItemRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(..., ge=0, le=10000)

    @validator('name')
    def sanitize_name(cls, v):
        return v.strip()
```

---

## Anti-Patterns

| Anti-Pattern                | Why Bad          | Do Instead            |
| --------------------------- | ---------------- | --------------------- |
| Query params for POST       | 422 errors       | Request body          |
| camelCase in API            | Schema mismatch  | snake_case            |
| Optional collections        | Frontend crashes | Empty array default   |
| String interpolation in SQL | Injection        | Parameterized queries |

---

## Pattern: Internal API Key Authentication (Added 2026-02-03)

**Problem**: Service-to-service communication needs authentication without user context.
**Context**: Collectors posting discoveries/progress to approval-api internal endpoints.

**Solution**: Use shared `INTERNAL_API_KEY` via environment variable:

```typescript
// Middleware (gateway/approval-api/src/middleware/auth.ts)
export function internalApiKeyAuth(req, res, next) {
  const apiKey = req.headers["x-internal-api-key"];
  const expectedKey = process.env.INTERNAL_API_KEY || "";

  if (!expectedKey) {
    // Dev mode: allow if not configured
    logger.warn("INTERNAL_API_KEY not configured - allowing internal request");
    next();
    return;
  }

  // Use timing-safe comparison
  if (!crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(expectedKey))) {
    res.status(403).json({ error: "Invalid internal API key" });
    return;
  }
  next();
}
```

**Usage in routes:**

```typescript
// Internal endpoints use internalApiKeyAuth, not authenticate
router.post("/internal/discoveries", internalApiKeyAuth, handler);
router.post("/api/scans/:id/progress", internalApiKeyAuth, handler);
```

**Why**:

- Collectors have no user session/cookies
- Shared secret is simpler than per-service certificates
- Dev mode allows requests without config for local testing
- Timing-safe comparison prevents timing attacks

**Source**: Session 2026-02-03 / Commit 76536cd

---

## Pattern: SSE for Real-Time Progress (Added 2026-02-03)

**Problem**: Real-time progress updates for long-running operations.
**Context**: Scan progress in approval-api.

**Solution**: Use Server-Sent Events (SSE), not WebSockets:

```typescript
// SSE endpoint
router.get("/scans/:id/events", authenticate, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  const unsubscribe = subscribeToScanEvents(scanId, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  });

  req.on("close", () => unsubscribe());
});
```

**Why SSE over WebSockets**:

- Server → client only (sufficient for progress)
- Works with existing cookie auth
- Simpler reconnection (browser handles it)
- No bidirectional complexity

**Nginx config for SSE:**

```nginx
proxy_buffering off;
proxy_cache off;
```

**Source**: Session 2026-02-03 / ADR-007, Issue #112

---

## Search Keywords

api, rest, fastapi, pydantic, snake_case, request body, validation, 422, internal, api key, service-to-service, sse, server-sent-events
