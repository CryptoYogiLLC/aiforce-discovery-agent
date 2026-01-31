---
name: check-serena-learnings
description: Query Serena memories for relevant learnings before ANY significant work including bug investigation, feature implementation, API changes, or architecture decisions. Use when starting work to leverage existing knowledge and avoid repeating past mistakes.
allowed-tools: mcp__serena__list_memories, mcp__serena__read_memory, mcp__serena__search_for_pattern
---

# Check Serena Learnings Before Work

## When to Use This Skill

- Before investigating ANY bug or issue
- Before implementing new collectors or processors
- Before modifying event schemas or RabbitMQ configuration
- Before API endpoint changes (remember: POST body, not query params!)
- Before database migrations or transaction handling
- Before Docker/deployment changes
- Before architecture decisions
- When encountering errors you've never seen before
- When stuck on a problem for more than 10 minutes

## Step-by-Step Process

### Step 1: List Available Memories
```
mcp__serena__list_memories()
```

### Step 2: Identify Relevant Memories by Keywords

**For Bug Investigation:**
- Search memories containing: bug, fix, error, issue

**For API Work:**
- Read: `api-design-patterns-master.md`
- Key lesson: POST/PUT/DELETE use request body, NEVER query params

**For Database/Transaction Work:**
- Read: `database-transaction-patterns-master.md`
- Key lesson: NEVER nest transactions

**For Event-Driven Work:**
- Read: `event-driven-patterns-master.md`
- Key lesson: Handlers MUST be idempotent

**For Docker/DevOps:**
- Read: `docker-devops-patterns-master.md`
- Key lesson: Never downgrade DB versions

**For Testing:**
- Read: `testing-patterns-master.md`
- Key lesson: Explicit waits, never arbitrary timeouts

### Step 3: Read Relevant Memories
```
mcp__serena__read_memory(name="api-design-patterns-master")
```

### Step 4: Apply Learnings

Before proceeding with your task, explicitly state:
1. Which memories you checked
2. Which patterns apply to your current work
3. Which anti-patterns you will avoid

## Quick Reference: Top 10 Rules

| # | Rule | Memory |
|---|------|--------|
| 1 | POST body, not query params | api-design-patterns-master |
| 2 | Never nest transactions | database-transaction-patterns-master |
| 3 | snake_case everywhere | api-design-patterns-master |
| 4 | Docker-first development | docker-devops-patterns-master |
| 5 | Never downgrade DB versions | docker-devops-patterns-master |
| 6 | Check for override files | docker-devops-patterns-master |
| 7 | Explicit waits in tests | testing-patterns-master |
| 8 | Pre-commit before commit | testing-patterns-master |
| 9 | Fix root causes, not symptoms | code-quality-patterns-master |
| 10 | Idempotent event handlers | event-driven-patterns-master |
