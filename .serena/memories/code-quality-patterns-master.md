# Code Quality Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
>
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

| Anti-Pattern               | Why Bad                 | Do Instead            |
| -------------------------- | ----------------------- | --------------------- |
| `except: pass`             | Swallows errors         | Handle specifically   |
| `# TODO: fix later`        | Never gets fixed        | Create GitHub issue   |
| `git commit --no-verify`   | Bypasses checks         | Fix pre-commit errors |
| Copy code between services | Maintenance nightmare   | Shared library        |
| Hardcoded timeouts         | Flaky in different envs | Environment variables |
| `window.location.reload()` | Loses state, poor UX    | Invalidate cache      |

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

## Pattern: Regex Pattern Ordering in Detection Logic (Added 2026-02-02)

**Problem**: When multiple regex patterns can match the same data, order matters. SSN format `123-45-6789` matches both SSN and phone patterns. IP addresses like `192.168.1.1` can match phone patterns.

**Solution**: Order patterns from most specific to least specific, and track matched values:

```python
# Pattern dictionary with intentional ordering
DATA_PATTERNS: dict[str, re.Pattern] = {
    "email": re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"),
    "ssn": re.compile(r"^\d{3}-\d{2}-\d{4}$"),  # BEFORE phone
    "ip_address": re.compile(r"^(?:(?:25[0-5]|...)\.){3}...$"),  # BEFORE phone
    "phone": re.compile(r"^(?:\+\d{1,4}[-\s]?)?(?:\(\d{1,4}\)...)$"),  # After SSN/IP
    "credit_card": re.compile(r"^(?:4[0-9]{12}(?:[0-9]{3})?|...)$"),
}

# Track matched values to prevent double-counting
matched_values: set = set()
for pii_type, pattern in DATA_PATTERNS.items():
    unmatched = [v for v in values if v not in matched_values]
    for v in unmatched:
        if pattern.match(v.strip()):
            matched_values.add(v)
```

**Why**: Python dicts maintain insertion order (3.7+), so you can rely on iteration order matching definition order.

**Source**: Session 2026-02-02, Commit 45b98a7

---

## Pattern: Use Word Boundaries in Column Name Detection (Added 2026-02-02)

**Problem**: Column "description" incorrectly flagged as IP-related because it contains "ip".

**Solution**: Use word boundaries or exact match patterns:

```python
# Wrong - matches "description" because it contains "ip"
"ip_address": [r"ip", r"ip_address", r"ipaddr"]

# Correct - use word boundaries or exact match
"ip_address": [
    r"^ip$",          # Exact match only
    r"ip_address",    # Full pattern
    r"ipaddr",
    r"client_ip",
    r"remote_addr",
    r"_ip$",          # Ends with _ip (like client_ip, user_ip)
]
```

**Why**: Partial substring matches cause false positives. Column name detection should match intentional naming patterns, not accidental substrings.

**Source**: Session 2026-02-02, Commit 45b98a7

---

## Search Keywords

quality, exceptions, error handling, type hints, shared library, todo, hardcode, regex, pattern ordering, word boundary, pii detection
