# Sample Code Repositories

This directory contains sample code repositories for testing the Code Analyzer during dry-run sessions. Each repository represents a realistic application with known characteristics for validation.

## Usage

These repositories are automatically mounted into the code-analyzer during dry-run mode:

```bash
# Start dry-run mode with sample repos
docker-compose -f docker-compose.yml -f docker-compose.dryrun.yml --profile code up -d
```

## Repository Overview

| Repository     | Language      | Framework       | LOC  | Dependencies |
| -------------- | ------------- | --------------- | ---- | ------------ |
| python-django  | Python 3.11+  | Django 4.2      | ~400 | 15           |
| nodejs-express | Node.js 20+   | Express.js      | ~350 | 12           |
| java-spring    | Java 17+      | Spring Boot 3.2 | ~450 | 8            |
| go-service     | Go 1.21+      | Gin             | ~500 | 6            |
| react-frontend | TypeScript 5+ | React 18 + Vite | ~800 | 10           |

## Expected Discoveries by Repository

### 1. python-django (E-commerce API)

**Technology Stack:**

- Language: Python 3.11
- Framework: Django 4.2, Django REST Framework
- Database: PostgreSQL (via psycopg2)
- Task Queue: Celery with Redis

**Expected Discoveries:**

- Dependencies: Django, DRF, Celery, Redis, PostgreSQL drivers
- Security: CVE-2023-32681 (requests 2.25.0 vulnerability)
- Code Metrics: 4 models, 3 ViewSets, 6 serializers
- Infrastructure: Dockerfile present, nginx.conf for production

**Known Vulnerabilities:**

```
requests==2.25.0  # CVE-2023-32681 - Unintended leak of Proxy-Authorization header
```

---

### 2. nodejs-express (REST API)

**Technology Stack:**

- Language: Node.js 20
- Framework: Express.js
- Database: MongoDB (via Mongoose)
- Auth: JWT tokens

**Expected Discoveries:**

- Dependencies: Express, Mongoose, JWT, bcrypt
- Security: Prototype pollution in lodash 4.17.20
- Code Metrics: 4 route files, 3 models, 3 middleware
- Infrastructure: Dockerfile, health check endpoint

**Known Vulnerabilities:**

```
lodash@4.17.20  # Prototype pollution vulnerability
```

---

### 3. java-spring (Spring Boot API)

**Technology Stack:**

- Language: Java 17
- Framework: Spring Boot 3.2.1
- Database: PostgreSQL (JPA/Hibernate)
- Build: Maven

**Expected Discoveries:**

- Dependencies: Spring Boot, Spring Data JPA, Lombok, Jackson
- Security: CVE-2021-44228 (Log4Shell - log4j-core 2.14.1)
- Code Metrics: 4 entities, 3 repositories, 3 services, 2 controllers
- Infrastructure: Multi-stage Dockerfile

**Known Vulnerabilities:**

```
log4j-core 2.14.1  # CVE-2021-44228 - Log4Shell (CRITICAL)
```

---

### 4. go-service (Go Microservice)

**Technology Stack:**

- Language: Go 1.21
- Framework: Gin Web Framework
- Database: PostgreSQL (pgx driver)
- Architecture: Clean Architecture (handler/service/repository)

**Expected Discoveries:**

- Dependencies: Gin, pgx, go-playground/validator
- Code Metrics: 3 handlers, 3 services, 4 repositories
- Code Patterns: Dependency injection, interface-based design
- Infrastructure: Multi-stage Dockerfile, minimal Alpine image

**Architecture:**

```
internal/
  handler/    # HTTP handlers (controllers)
  service/    # Business logic
  repository/ # Data access layer
```

---

### 5. react-frontend (E-commerce UI)

**Technology Stack:**

- Language: TypeScript 5
- Framework: React 18
- Build Tool: Vite
- State: Zustand, TanStack Query

**Expected Discoveries:**

- Dependencies: React, React Router, TanStack Query, Zustand
- Code Metrics: 8 components, 2 hooks, 1 API service
- TypeScript: Strict mode, type definitions
- Infrastructure: Multi-stage Dockerfile, nginx for static serving

**Architecture:**

```
src/
  components/  # Page components
  hooks/       # State management (Zustand stores)
  services/    # API client
  types/       # TypeScript definitions
```

## Verification Checklist

Use this checklist to verify the Code Analyzer correctly identifies each repository:

### Python Django

- [ ] Detects Python language
- [ ] Identifies Django framework
- [ ] Finds requirements.txt dependencies
- [ ] Flags requests 2.25.0 vulnerability
- [ ] Counts models and views

### Node.js Express

- [ ] Detects JavaScript/Node.js
- [ ] Identifies Express framework
- [ ] Parses package.json dependencies
- [ ] Flags lodash vulnerability
- [ ] Detects Mongoose ODM

### Java Spring

- [ ] Detects Java language
- [ ] Identifies Spring Boot framework
- [ ] Parses pom.xml dependencies
- [ ] Flags Log4Shell vulnerability (CRITICAL)
- [ ] Detects JPA entities

### Go Service

- [ ] Detects Go language
- [ ] Identifies Gin framework
- [ ] Parses go.mod dependencies
- [ ] Detects clean architecture pattern

### React Frontend

- [ ] Detects TypeScript
- [ ] Identifies React framework
- [ ] Detects Vite build tool
- [ ] Parses package.json dependencies
- [ ] Identifies state management (Zustand)

## Updating Sample Repos

When adding new sample repositories:

1. Create a new directory under `sample-repos/`
2. Include realistic code structure for the tech stack
3. Add a Dockerfile for containerization
4. Include at least one known vulnerability for security scanner testing
5. Add a README with expected discoveries
6. Update this index file

## Related Issues

- Issue #73: Sample Repositories for Code Analyzer Testing
- Issue #72: Dry-Run Mode UI Components
- ADR-004: Dry-Run Orchestration Model
