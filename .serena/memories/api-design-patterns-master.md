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

## Search Keywords

api, rest, fastapi, pydantic, snake_case, request body, validation, 422
