# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to cryptoyogi.llc@gmail.com.

Include:

- Type of issue
- Full paths of affected source files
- Location of affected code (tag/branch/commit or direct URL)
- Step-by-step reproduction instructions
- Proof-of-concept or exploit code (if possible)
- Impact assessment

We will respond within 48 hours and work with you to understand and address the issue.

## Security Model

This agent runs inside client environments with access to sensitive infrastructure. Security is paramount.

### Design Principles

1. **Outbound-only communication**: No inbound ports required
2. **Least privilege**: Each collector requests only needed permissions
3. **Data sovereignty**: Client controls all data before transmission
4. **Audit trail**: All actions logged with tamper-evident records
5. **Encryption**: TLS 1.3 for transit, AES-256 for local storage

### Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |
