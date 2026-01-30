# Code Analyzer

**Language:** Python
**Owner:** Dev 2
**Status:** 🚧 In Progress

## Purpose

Analyze source code repositories for dependencies, complexity, and technical debt.

## Features

- [ ] Git repository cloning and scanning
- [ ] Language detection
- [ ] Framework identification (Spring, Django, Express, etc.)
- [ ] Dependency extraction (pom.xml, package.json, requirements.txt)
- [ ] Complexity metrics (cyclomatic complexity, LOC)
- [ ] Technical debt signals

## Events Published

| Event Type | Description |
|------------|-------------|
| `discovered.repository` | Repository analyzed |
| `discovered.codebase` | Codebase metrics calculated |
| `discovered.dependency` | Dependency identified |

## Development

```bash
cd collectors/code-analyzer
python -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
python -m src.main
```

## Testing

```bash
pytest tests/
```
