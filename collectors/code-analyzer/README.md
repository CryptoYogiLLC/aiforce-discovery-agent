# Code Analyzer

**Language:** Python 3.11+
**Framework:** FastAPI
**Port:** 8002
**Status:** ✅ Implemented

## Purpose

Analyze source code repositories for languages, frameworks, dependencies, and complexity metrics. Publishes CloudEvents for discovered repositories, codebases, and dependencies.

## Features

- [x] FastAPI service scaffolding
- [x] Git repository cloning (HTTPS/SSH)
- [x] Authentication via token
- [x] Shallow clone support
- [x] Language detection (20+ languages)
- [x] Framework detection (30+ frameworks)
- [x] Dependency extraction (npm, pip, Go, Maven, Gradle, Ruby, Cargo, Composer)
- [x] Complexity metrics (LOC, cyclomatic complexity)
- [x] Technical debt indicators (TODO/FIXME, large files)
- [x] CloudEvents publishing
- [x] Health/ready endpoints
- [x] Prometheus metrics

## Events Published

| CloudEvents Type                  | Routing Key             | Description                                   |
| --------------------------------- | ----------------------- | --------------------------------------------- |
| `discovery.repository.discovered` | `discovered.repository` | Repository analyzed with languages/frameworks |
| `discovery.codebase.discovered`   | `discovered.codebase`   | Codebase metrics calculated                   |
| `discovery.dependency.discovered` | `discovered.dependency` | Dependency identified                         |

## API Endpoints

| Method | Path              | Description                           |
| ------ | ----------------- | ------------------------------------- |
| GET    | `/health`         | Health check                          |
| GET    | `/ready`          | Readiness check (RabbitMQ connection) |
| GET    | `/api/v1/stats`   | Service statistics                    |
| GET    | `/metrics`        | Prometheus metrics                    |
| POST   | `/api/v1/analyze` | Analyze a repository                  |

### POST /api/v1/analyze

Request body:

```json
{
  "repo_url": "https://github.com/owner/repo",
  "branch": "main",
  "credentials": "optional-token"
}
```

Response:

```json
{
  "status": "completed",
  "message": "Analyzed 3 languages, 5 frameworks, 42 dependencies",
  "analysis_id": "uuid"
}
```

## Configuration

Environment variables (prefix: `CODEANALYZER_`):

| Variable                         | Default                                      | Description                      |
| -------------------------------- | -------------------------------------------- | -------------------------------- |
| `CODEANALYZER_SERVER_HOST`       | `0.0.0.0`                                    | Server bind host                 |
| `CODEANALYZER_SERVER_PORT`       | `8002`                                       | Server port                      |
| `CODEANALYZER_RABBITMQ_URL`      | `amqp://discovery:discovery@localhost:5672/` | RabbitMQ URL                     |
| `CODEANALYZER_RABBITMQ_EXCHANGE` | `discovery.events`                           | RabbitMQ exchange                |
| `CODEANALYZER_GIT_TOKEN`         | ``                                           | Default Git authentication token |
| `CODEANALYZER_MAX_REPO_SIZE_MB`  | `500`                                        | Maximum repository size to clone |
| `CODEANALYZER_CLONE_DEPTH`       | `shallow`                                    | Clone depth (shallow/full)       |
| `CODEANALYZER_CLONE_TIMEOUT_S`   | `300`                                        | Clone timeout in seconds         |
| `CODEANALYZER_MAX_FILE_SIZE_KB`  | `1024`                                       | Max file size to analyze         |
| `CODEANALYZER_EXCLUDED_DIRS`     | `node_modules,.git,vendor,...`               | Directories to exclude           |
| `CODEANALYZER_LOG_LEVEL`         | `INFO`                                       | Logging level                    |

## Supported Languages

The analyzer detects 20+ programming languages:

- Python, JavaScript/TypeScript, Go, Java, Kotlin, Scala
- Ruby, Rust, C/C++, C#, PHP, Swift, Objective-C
- Perl, Shell/Bash, Lua, R, Julia, Elixir, Erlang
- Clojure, Dart, Groovy, Haskell, OCaml, F#
- Zig, Nim, Crystal, V

## Supported Frameworks

The analyzer detects 30+ frameworks:

**JavaScript/TypeScript:**

- React, Next.js, Vue.js, Nuxt.js, Angular, Svelte
- Express.js, NestJS, Fastify

**Python:**

- Django, FastAPI, Flask, Tornado, Pyramid
- Celery, SQLAlchemy

**Java:**

- Spring Boot, Spring Framework, Hibernate
- Maven, Gradle

**Go:**

- Gin, Echo, Fiber, Chi, GORM

**Ruby:**

- Ruby on Rails, Sinatra

**Rust:**

- Actix Web, Rocket, Axum

**C#:**

- ASP.NET Core, Entity Framework

**PHP:**

- Laravel, Symfony

**Infrastructure:**

- Docker, Kubernetes, Terraform, Helm

## Dependency Extraction

Supports extraction from:

| File               | Package Manager | Language   |
| ------------------ | --------------- | ---------- |
| `package.json`     | npm/yarn        | JavaScript |
| `requirements.txt` | pip             | Python     |
| `pyproject.toml`   | poetry/pip      | Python     |
| `go.mod`           | Go modules      | Go         |
| `pom.xml`          | Maven           | Java       |
| `build.gradle`     | Gradle          | Java       |
| `Gemfile`          | Bundler         | Ruby       |
| `Cargo.toml`       | Cargo           | Rust       |
| `composer.json`    | Composer        | PHP        |

## Metrics Calculated

### Code Metrics

- Lines of code (LOC)
- Blank lines
- Comment lines
- File count by type
- Average file size
- Largest files (top 10)

### Complexity Metrics

- Cyclomatic complexity (Python)
- Average complexity
- Maximum complexity
- Files above threshold (>10)

### Technical Debt Indicators

- TODO comment count
- FIXME comment count
- HACK comment count
- Large files (>500 lines)
- Deeply nested code (>6 levels)

## Development

```bash
cd collectors/code-analyzer
python -m venv venv
source venv/bin/activate
pip install -r requirements-dev.txt
python -m src.main
```

## Docker

```bash
# Build
docker build -t code-analyzer .

# Run
docker run -p 8002:8002 \
  -e CODEANALYZER_RABBITMQ_URL=amqp://discovery:discovery@rabbitmq:5672/ \
  -e CODEANALYZER_GIT_TOKEN=your-token \
  code-analyzer
```

## Testing

```bash
pytest tests/
pytest tests/ --cov=src --cov-report=term-missing
```

## Project Structure

```
collectors/code-analyzer/
├── src/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Pydantic settings
│   ├── git_client.py        # Git repository operations
│   ├── publisher.py         # CloudEvents publisher
│   └── analyzers/
│       ├── __init__.py
│       ├── language_detector.py    # Language detection
│       ├── framework_detector.py   # Framework detection
│       ├── dependency_extractor.py # Dependency extraction
│       └── metrics_calculator.py   # Code metrics
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_api.py
│   ├── test_language_detector.py
│   ├── test_framework_detector.py
│   ├── test_dependency_extractor.py
│   └── test_metrics_calculator.py
├── requirements.txt
├── requirements-dev.txt
└── Dockerfile
```
