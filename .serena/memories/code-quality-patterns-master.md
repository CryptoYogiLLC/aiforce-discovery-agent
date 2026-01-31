# Code Quality Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from AIForce Assess (migrate-ui-orchestrator)

---

## Quick Reference

> **Top 5 patterns to know:**
> 1. Fix root causes, NEVER band-aid solutions
> 2. Keep files under 400 lines
> 3. Never hardcode credentials
> 4. Avoid `except: pass` - always handle specifically
> 5. Create shared libraries, don't copy code between services

---

## Critical Rule: Fix Root Causes

**NEVER** create band-aid solutions. Always dig deep.

### Wrong - Band-aid
```python
def get_name(app):
    try:
        return app.name
    except:
        return "Unknown"  # Hides why name is missing
```

### Correct - Root Cause Fix
```python
def get_name(app):
    if app.name is None:
        logger.warning(f"App {app.id} has no name - data quality issue")
        raise ValueError(f"App {app.id} missing required name field")
    return app.name
```

---

## Pattern: Keep Files Under 400 Lines

When approaching limit:
1. Extract helper functions to separate module
2. Split class into multiple focused classes
3. Move constants to dedicated config file

```
# Good structure
/services
  /scanner
    scanner.py          # Main class (~200 lines)
    port_scanner.py     # Port scanning logic
    service_detector.py # Service fingerprinting
    types.py           # Type definitions
```

---

## Pattern: Never Hardcode Credentials

```python
# Wrong
db_password = "supersecret123"
api_key = "sk-abc123..."

# Correct
db_password = os.environ["DB_PASSWORD"]
api_key = os.environ["API_KEY"]

# Even better - with defaults for dev
db_password = os.environ.get("DB_PASSWORD", "discovery")  # Dev default
```

---

## Pattern: Exception Handling

### Wrong
```python
try:
    result = risky_operation()
except:
    pass  # Swallows ALL errors silently
```

### Correct
```python
try:
    result = risky_operation()
except ConnectionError as e:
    logger.error(f"Connection failed: {e}")
    raise ServiceUnavailableError(f"Backend unreachable: {e}")
except ValidationError as e:
    logger.warning(f"Invalid input: {e}")
    return None  # Explicit handling
```

---

## Pattern: Shared Libraries Over Copy-Paste

### Wrong
```
# Same code in multiple services
collectors/network-scanner/internal/utils/config.go
collectors/code-analyzer/src/utils/config.py
gateway/transmitter/src/utils/config.py
```

### Correct
```
# Shared utilities
shared/
  config/          # Shared config loader
  events/          # Event schemas and validators
  logging/         # Common logging setup
```

---

## Pattern: Type Hints (Python)

```python
# Required for public functions
async def analyze_repository(
    repo_url: str,
    depth: int = 10,
    include_tests: bool = False
) -> AnalysisResult:
    """Analyze a git repository for dependencies and complexity."""
    ...
```

---

## Pattern: Error Wrapping (Go)

```go
// Provide context when wrapping errors
func ScanPort(host string, port int) (bool, error) {
    conn, err := net.DialTimeout("tcp", address, timeout)
    if err != nil {
        return false, fmt.Errorf("scanning %s:%d: %w", host, port, err)
    }
    defer conn.Close()
    return true, nil
}
```

---

## Anti-Patterns

| Anti-Pattern | Why Bad | Do Instead |
|--------------|---------|------------|
| `except: pass` | Swallows errors | Handle specifically |
| `# TODO: fix later` | Never gets fixed | Create GitHub issue |
| `git commit --no-verify` | Bypasses checks | Fix pre-commit errors |
| Copy code between services | Maintenance nightmare | Shared library |
| Hardcoded timeouts | Flaky in different envs | Environment variables |
| `window.location.reload()` | Loses state, poor UX | Invalidate cache |

---

## File Organization

```
/project-root
  /docs
    /adr              # Architectural Decision Records
    /guidelines       # Development guidelines
    LESSONS_LEARNED.md
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
2. **Document in appropriate memory**
3. **Add pre-commit check if automatable**
4. **Update LESSONS_LEARNED.md if broadly applicable**

Remember: The goal is to make the same mistake zero times, not twice.

---

## Search Keywords

quality, exceptions, error handling, type hints, shared library, todo, hardcode
