# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records for the AIForce Discovery Agent project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences.

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [001](001-development-environment-strategy.md) | Development Environment Strategy | Accepted | Jan 2026 |
| [002](002-integration-with-aiforce-assess.md) | Integration with AIForce Assess | Proposed | Jan 2026 |

## Creating a New ADR

1. Copy the template below
2. Name the file `NNN-title-with-dashes.md` (e.g., `002-event-schema-format.md`)
3. Fill in all sections
4. Submit via PR for team review

## Template

```markdown
# ADR-NNN: Title

## Status
**Proposed** | **Accepted** | **Deprecated** | **Superseded by ADR-XXX**

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?

### Positive
- ...

### Negative
- ...

## References
- Links to related documents, issues, or external resources
```

## Statuses

- **Proposed**: Under discussion, not yet accepted
- **Accepted**: Approved and implemented
- **Deprecated**: No longer relevant but kept for historical reference
- **Superseded**: Replaced by a newer ADR (link to replacement)
