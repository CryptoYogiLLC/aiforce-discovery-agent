"""
Service image pools and naming pools for test environment generation.

All data constants that define the available service images,
department names, and company prefixes live here.
"""

WEB_SERVERS = [
    {"image": "nginx:alpine", "ports": ["80", "443"], "name": "nginx"},
    {"image": "httpd:alpine", "ports": ["80", "443"], "name": "apache"},
    {"image": "caddy:alpine", "ports": ["80", "443"], "name": "caddy"},
    {"image": "traefik:v2.10", "ports": ["80", "8080"], "name": "traefik"},
]

APP_SERVERS = [
    {"image": "python:3.11-slim", "ports": ["5000"], "name": "flask", "lang": "python"},
    {
        "image": "python:3.11-slim",
        "ports": ["8000"],
        "name": "django",
        "lang": "python",
    },
    {"image": "node:20-slim", "ports": ["3000"], "name": "express", "lang": "node"},
    {"image": "node:20-slim", "ports": ["3000"], "name": "nextjs", "lang": "node"},
    {
        "image": "eclipse-temurin:17-jdk-alpine",
        "ports": ["8080"],
        "name": "springboot",
        "lang": "java",
    },
    {
        "image": "eclipse-temurin:17-jdk-alpine",
        "ports": ["8080"],
        "name": "quarkus",
        "lang": "java",
    },
    {
        "image": "mcr.microsoft.com/dotnet/aspnet:8.0",
        "ports": ["5000"],
        "name": "dotnet",
        "lang": "dotnet",
    },
    {"image": "ruby:3.2-slim", "ports": ["3000"], "name": "rails", "lang": "ruby"},
    {"image": "golang:1.21-alpine", "ports": ["8080"], "name": "goapi", "lang": "go"},
]

DATABASES = [
    {
        "image": "postgres:16",
        "ports": ["5432"],
        "name": "postgresql",
        "type": "relational",
    },
    {
        "image": "postgres:15",
        "ports": ["5432"],
        "name": "postgresql15",
        "type": "relational",
    },
    {"image": "mysql:8", "ports": ["3306"], "name": "mysql", "type": "relational"},
    {"image": "mariadb:11", "ports": ["3306"], "name": "mariadb", "type": "relational"},
    {"image": "mongo:7", "ports": ["27017"], "name": "mongodb", "type": "document"},
    {"image": "mongo:6", "ports": ["27017"], "name": "mongodb6", "type": "document"},
    {"image": "redis:7-alpine", "ports": ["6379"], "name": "redis", "type": "cache"},
    {
        "image": "memcached:alpine",
        "ports": ["11211"],
        "name": "memcached",
        "type": "cache",
    },
    {
        "image": "elasticsearch:8.11.0",
        "ports": ["9200", "9300"],
        "name": "elasticsearch",
        "type": "search",
    },
    {
        "image": "cassandra:4",
        "ports": ["9042"],
        "name": "cassandra",
        "type": "wide-column",
    },
    {"image": "couchdb:3", "ports": ["5984"], "name": "couchdb", "type": "document"},
]

MESSAGE_QUEUES = [
    {"image": "rabbitmq:3-management", "ports": ["5672", "15672"], "name": "rabbitmq"},
    {"image": "apache/kafka:3.6.0", "ports": ["9092"], "name": "kafka"},
    {"image": "nats:alpine", "ports": ["4222", "8222"], "name": "nats"},
    {"image": "eclipse-mosquitto:2", "ports": ["1883", "9001"], "name": "mqtt"},
]

INFRASTRUCTURE = [
    {"image": "vault:1.15", "ports": ["8200"], "name": "vault"},
    {"image": "consul:1.17", "ports": ["8500", "8600"], "name": "consul"},
    {"image": "minio/minio:latest", "ports": ["9000", "9001"], "name": "minio"},
    {"image": "registry:2", "ports": ["5000"], "name": "docker-registry"},
    {"image": "grafana/grafana:latest", "ports": ["3000"], "name": "grafana"},
    {"image": "prom/prometheus:latest", "ports": ["9090"], "name": "prometheus"},
]

DEPARTMENT_NAMES = [
    "erp",
    "crm",
    "hrms",
    "finance",
    "inventory",
    "analytics",
    "billing",
    "logistics",
    "procurement",
    "manufacturing",
    "warehouse",
    "ecommerce",
    "marketing",
    "support",
    "legacy",
]

COMPANY_PREFIXES = [
    "acme",
    "globex",
    "initech",
    "umbrella",
    "waynetech",
    "starkindustries",
    "oscorp",
    "lexcorp",
    "cyberdyne",
    "tyrell",
]
