# Database Inspector

**Language:** Python
**Owner:** Dev 3
**Status:** 🚧 In Progress

## Purpose

Inspect database schemas, identify relationships, and detect sensitive data.

## Features

- [ ] Multi-database support (PostgreSQL, MySQL, Oracle, SQL Server, MongoDB)
- [ ] Schema extraction (tables, columns, relationships)
- [ ] Foreign key / relationship mapping
- [ ] PII detection in column names and sample data
- [ ] Data volume estimation

## Events Published

| CloudEvents Type | Routing Key | Description |
|------------------|-------------|-------------|
| `discovery.database.discovered` | `discovered.database` | Database instance found |
| `discovery.schema.discovered` | `discovered.schema` | Schema extracted |
| `discovery.table.discovered` | `discovered.table` | Table metadata captured |

## Development

```bash
cd collectors/db-inspector
python -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
python -m src.main
```

## Testing

```bash
pytest tests/
```
