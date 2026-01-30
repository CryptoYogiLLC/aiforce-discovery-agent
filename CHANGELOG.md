# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure with microservices architecture
- Network Scanner service (Go/Gin) - TCP/UDP port scanning
- Code Analyzer service (Python/FastAPI) - Repository analysis
- Database Inspector service (Python/FastAPI) - Schema extraction
- Event Bus with RabbitMQ and CloudEvents format
- Enrichment pipeline for data correlation
- PII Redactor for data sanitization
- Approval Gateway with React UI
- Transmitter service for secure data transmission
- Docker Compose deployment
- Helm chart for Kubernetes deployment
- CI/CD with GitHub Actions
- Comprehensive documentation

### Security
- Outbound-only communication model
- Human-in-the-loop approval workflow
- PII redaction before transmission
- No credentials stored or transmitted

## [0.1.0] - TBD

### Added
- MVP release with core discovery capabilities

[Unreleased]: https://github.com/CryptoYogiLLC/aiforce-discovery-agent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CryptoYogiLLC/aiforce-discovery-agent/releases/tag/v0.1.0
