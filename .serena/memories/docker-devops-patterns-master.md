# Docker & DevOps Patterns Master

**Last Updated**: 2026-01-30
**Version**: 1.0
**Status**: Active
**Source**: Lessons from prior AIForce project development

---

## Quick Reference

> **Top 5 patterns to know:**
> 1. Docker-first development only
> 2. NEVER downgrade database versions on existing volumes
> 3. Always check for docker-compose.override.yml
> 4. Update BOTH requirements.txt and requirements-docker.txt
> 5. Clean volumes when changing DB versions

---

## Critical Pattern: Docker-First Development

"Works on my machine" syndrome killed productivity in parent project.

### Wrong
```bash
# Local development causes inconsistency
python -m pytest tests/  # Different Python, different deps
npm run dev              # Different Node version
```

### Correct
```bash
# All development in containers
docker exec -it discovery-agent-backend bash
pytest tests/

# Or use docker-compose
docker-compose exec code-analyzer pytest tests/
```

---

## Critical Pattern: Never Downgrade Database Versions

Caused **3 data corruption events** in parent project.

### The Problem
```yaml
# If postgres data exists with version 17:
postgres:
  image: postgres:16  # CRASHES: "database files incompatible"
```

### Solution
```yaml
# Must match or upgrade:
postgres:
  image: postgres:17  # Matches existing data
```

### If You Need to Downgrade
```bash
# ONLY option: destroy data
docker-compose down -v  # Removes volumes
docker-compose up -d    # Fresh start
```

---

## Critical Pattern: Check for Override Files

Hidden version conflicts caused mysterious failures.

### Before Any Docker Debugging
```bash
# ALWAYS check for override files
ls -la docker-compose*.yml

# docker-compose.override.yml is auto-loaded!
# If found with wrong versions:
rm docker-compose.override.yml
docker-compose down -v
docker-compose up -d --force-recreate
```

---

## Pattern: Dual Requirements Files

```
requirements.txt           # Local development
requirements-docker.txt    # Docker/deployment (may differ)
```

**When adding dependencies, update BOTH files.**

---

## Pattern: Clean Rebuild

When things go wrong:

```bash
# Nuclear option - full cleanup
make clean
# or manually:
docker-compose down -v
docker system prune -a
docker-compose up -d --build
```

---

## Service-Specific Commands

```bash
# Rebuild single service after changes
docker-compose build network-scanner
docker-compose up -d network-scanner

# View logs for debugging
docker-compose logs -f network-scanner

# Shell into container
docker-compose exec network-scanner sh
```

---

## Anti-Patterns

| Anti-Pattern | Why Bad | Do Instead |
|--------------|---------|------------|
| Local dev without Docker | "Works on my machine" | Docker-first |
| Downgrading DB version | Data corruption | Match or upgrade only |
| Ignoring override files | Hidden conflicts | Check ls -la docker* |
| Single requirements.txt | Deploy mismatch | Dual requirements |

---

## Search Keywords

docker, docker-compose, postgres, volumes, requirements, override, container
