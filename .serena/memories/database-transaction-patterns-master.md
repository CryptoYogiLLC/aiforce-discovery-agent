# Database & Transaction Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
>
> 1. NEVER nest database transactions
> 2. Idempotent migrations - check before create
> 3. Multi-tenant scoping on EVERY query
> 4. Use flush() to get IDs for FK relationships
> 5. Let caller manage commit/rollback

---

## Critical Pattern: Never Nest Transactions

Fixed **10+ times** in parent project. Causes "transaction already begun" errors.

### Wrong

```python
async def execute_operation(self, db_session: AsyncSession):
    async with db_session.begin():  # ERROR if caller already started tx
        result = await db_session.execute(stmt)
    return result
```

### Correct

```python
async def execute_operation(self, db_session: AsyncSession):
    result = await db_session.execute(stmt)
    await db_session.flush()  # Make IDs available for FKs
    # Let caller manage commit/rollback
    return result
```

### Caller Pattern

```python
async def orchestrator():
    async with db_session.begin():
        await service_a.execute_operation(db_session)
        await service_b.execute_operation(db_session)
        # Single commit at the end
```

---

## Critical Pattern: Idempotent Migrations

```python
# Correct - Check before creating
def upgrade():
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)

    if 'my_table' not in inspector.get_table_names(schema='migration'):
        op.create_table('my_table', ...)

    columns = [c['name'] for c in inspector.get_columns('my_table', schema='migration')]
    if 'new_column' not in columns:
        op.add_column('my_table', Column('new_column', String))

# Wrong - Fails on re-run
def upgrade():
    op.create_table('my_table', ...)  # Crashes if exists
```

---

## Critical Pattern: Multi-Tenant Scoping

Security violation fixed multiple times. ALL queries must include tenant filters.

### Wrong - Data Leakage

```python
async def get_items(self):
    stmt = select(Item)  # Returns ALL tenants' data!
    return await self.db.execute(stmt)
```

### Correct

```python
async def get_items(self, client_account_id: UUID, engagement_id: UUID):
    stmt = select(Item).where(
        Item.client_account_id == client_account_id,
        Item.engagement_id == engagement_id
    )
    return await self.db.execute(stmt)
```

---

## Pattern: Use flush() for FK Relationships

```python
async def create_parent_and_child(self, db_session: AsyncSession):
    parent = Parent(name="test")
    db_session.add(parent)
    await db_session.flush()  # Parent now has ID

    child = Child(parent_id=parent.id)  # Can use parent.id
    db_session.add(child)
    # Commit happens in caller
```

---

## Anti-Patterns

| Anti-Pattern                       | Why Bad                       | Do Instead               |
| ---------------------------------- | ----------------------------- | ------------------------ |
| `async with db.begin()` in helpers | Nested tx error               | Let caller manage        |
| `op.create_table()` without check  | Migration fails on re-run     | Check with inspector     |
| Query without tenant filter        | Data leakage                  | Always include tenant ID |
| Commit in helper function          | Can't roll back orchestration | Commit in caller only    |

---

## Search Keywords

database, transaction, postgresql, sqlite, alembic, migration, multi-tenant, flush
