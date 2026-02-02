# ADR-003: Session Security Model

## Status

Accepted

## Context

The Discovery Control Center requires authentication and session management for multi-role access (Admin, Operator, Viewer). We need to decide how to securely manage user sessions, particularly considering:

1. **XSS vulnerability**: Storing JWT tokens in localStorage makes them accessible to any JavaScript, including injected malicious scripts
2. **Air-gapped deployments**: Traditional password reset via email won't work
3. **Session revocation**: When roles change or users are deactivated, sessions must be invalidated immediately
4. **CSRF protection**: If using cookies, we need CSRF mitigation

## Decision

We will use **httpOnly secure cookies** for session tokens with server-side session storage in PostgreSQL.

### Session Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Approval   │────▶│  PostgreSQL │
│  (no token  │     │    API      │     │  sessions   │
│  in JS)     │◀────│             │◀────│   table     │
└─────────────┘     └─────────────┘     └─────────────┘
     Cookie:              │
  session_id=xxx          │ Validates session
  httpOnly, Secure        │ on every request
  SameSite=Strict         ▼
```

### Key Design Choices

1. **httpOnly Cookies**: Session token stored in httpOnly cookie, inaccessible to JavaScript
2. **Server-side sessions**: Session data stored in PostgreSQL `gateway.sessions` table
3. **Short-lived sessions**: 2-hour default TTL with sliding expiration on activity
4. **Immediate revocation**: Logout/role change deletes session from database
5. **CSRF protection**: SameSite=Strict cookie + CSRF token for state-changing requests
6. **Air-gap password reset**: Admin-driven reset with one-time codes, no email required
7. **Single-origin deployment**: UI and API served from same origin via reverse proxy

### Deployment Requirement: Single Origin

**Critical**: `SameSite=Strict` cookies require UI and API to share the same origin.

```
┌─────────────────────────────────────────────────────────────┐
│                    Reverse Proxy (nginx)                     │
│                    https://control.example.com               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    /              → approval-ui (React static files)         │
│    /api/*         → approval-api (Express backend)           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

This is already the architecture in `docker-compose.yml` where nginx proxies both services. If deployed separately (e.g., UI on CDN, API on different domain), cookies would not be sent cross-origin and authentication would fail.

### Password Reset for Air-Gapped Environments

```
1. Admin initiates reset for user
2. System generates one-time recovery code (displayed to admin)
3. Admin communicates code to user out-of-band
4. User enters code + new password
5. Code expires after single use or 24 hours
```

## Consequences

### Positive

- **XSS-resistant**: Tokens not accessible to JavaScript
- **Immediate revocation**: Role changes take effect instantly
- **Audit trail**: All sessions tracked in database
- **Air-gap compatible**: No email dependency for password reset

### Negative

- **Stateful**: Requires database lookup on every authenticated request
- **Horizontal scaling**: Session affinity or shared session store needed
- **Cookie size**: Limited to ~4KB (sufficient for session ID)

### Mitigations

- Redis cache for session lookups if performance becomes an issue
- Session replication handled by PostgreSQL (already in architecture)

## Implementation Notes

### Cookie Configuration

```typescript
res.cookie("session_id", sessionId, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: 2 * 60 * 60 * 1000, // 2 hours
  path: "/",
});
```

### CSRF Token

```typescript
// Generate CSRF token and store in session
const csrfToken = crypto.randomBytes(32).toString("hex");
// Send to client via response header or body (not cookie)
res.setHeader("X-CSRF-Token", csrfToken);

// Validate on state-changing requests
if (req.headers["x-csrf-token"] !== session.csrfToken) {
  return res.status(403).json({ error: "Invalid CSRF token" });
}
```

## References

- OWASP Session Management Cheat Sheet
- OWASP Cross-Site Request Forgery Prevention Cheat Sheet
