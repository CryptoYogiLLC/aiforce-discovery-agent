#!/usr/bin/env python3
"""
Randomized Test Environment Generator

Generates a unique docker-compose configuration each time it's run,
preventing developers from coding for a specific configuration.

Usage:
    python scripts/generate-test-env.py
    docker-compose -f docker-compose.generated.yml up -d
"""

import random
import yaml
import string
import json
from datetime import datetime
from pathlib import Path

# =============================================================================
# CONFIGURATION POOLS
# =============================================================================

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


def random_string(length=8):
    """Generate random alphanumeric string."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def random_ip(subnet_prefix="172.28.0", used_ips=set()):
    """Generate random IP in subnet, avoiding collisions."""
    while True:
        last_octet = random.randint(10, 250)
        ip = f"{subnet_prefix}.{last_octet}"
        if ip not in used_ips:
            used_ips.add(ip)
            return ip


def generate_service_name(base_name, index):
    """Generate unique service name."""
    dept = random.choice(DEPARTMENT_NAMES)
    return f"target-{dept}-{base_name}-{index:02d}"


def generate_password():
    """Generate random password."""
    return "".join(random.choices(string.ascii_letters + string.digits, k=16))


def generate_database_env(db_type, db_name):
    """Generate environment variables for database."""
    password = generate_password()
    user = f"{random.choice(DEPARTMENT_NAMES)}_user"

    if "postgres" in db_type:
        return {
            "POSTGRES_USER": user,
            "POSTGRES_PASSWORD": password,
            "POSTGRES_DB": f"{db_name}_db",
        }
    elif "mysql" in db_type or "mariadb" in db_type:
        return {
            "MYSQL_ROOT_PASSWORD": generate_password(),
            "MYSQL_DATABASE": f"{db_name}_db",
            "MYSQL_USER": user,
            "MYSQL_PASSWORD": password,
        }
    elif "mongo" in db_type:
        return {
            "MONGO_INITDB_ROOT_USERNAME": user,
            "MONGO_INITDB_ROOT_PASSWORD": password,
        }
    elif "elasticsearch" in db_type:
        return {
            "discovery.type": "single-node",
            "xpack.security.enabled": "false",
            "ES_JAVA_OPTS": "-Xms256m -Xmx256m",
        }
    elif "couchdb" in db_type:
        return {"COUCHDB_USER": user, "COUCHDB_PASSWORD": password}
    return {}


def generate_environment(seed: int | None = None):
    """Generate randomized test environment configuration.

    Args:
        seed: Optional seed for reproducibility. If None, uses current timestamp.
    """
    if seed is None:
        seed = int(datetime.now().timestamp())
    random.seed(seed)

    used_ips = {"172.28.0.1"}  # Gateway
    used_ports = set()
    services = {}

    # Randomly select counts
    # Reduced counts for development/testing to minimize disk usage
    num_web_servers = random.randint(1, 2)
    num_app_servers = random.randint(1, 2)
    num_databases = random.randint(1, 2)
    num_queues = random.randint(0, 1)
    num_infra = random.randint(0, 1)

    port_offset = 0

    def get_host_port(container_port):
        nonlocal port_offset
        base = int(container_port)
        while True:
            host_port = base + port_offset
            if host_port not in used_ports:
                used_ports.add(host_port)
                port_offset += 1
                return str(host_port)
            port_offset += 1

    # Generate web servers
    selected_web = random.sample(WEB_SERVERS, min(num_web_servers, len(WEB_SERVERS)))
    for i, server in enumerate(selected_web):
        service_name = generate_service_name(server["name"], i + 1)
        ip = random_ip(used_ips=used_ips)

        ports = []
        for p in server["ports"]:
            host_port = get_host_port(p)
            ports.append(f"{host_port}:{p}")

        services[service_name] = {
            "image": server["image"],
            "container_name": service_name,
            "networks": {"target-network": {"ipv4_address": ip}},
            "ports": ports,
            "labels": {
                "discovery.type": "web-server",
                "discovery.technology": server["name"],
            },
        }

    # Generate app servers
    selected_apps = random.sample(APP_SERVERS, min(num_app_servers, len(APP_SERVERS)))
    for i, server in enumerate(selected_apps):
        service_name = generate_service_name(server["name"], i + 1)
        ip = random_ip(used_ips=used_ips)

        ports = []
        for p in server["ports"]:
            host_port = get_host_port(p)
            ports.append(f"{host_port}:{p}")

        service_config = {
            "image": server["image"],
            "container_name": service_name,
            "networks": {"target-network": {"ipv4_address": ip}},
            "ports": ports,
            "labels": {
                "discovery.type": "app-server",
                "discovery.technology": server["name"],
                "discovery.language": server["lang"],
            },
            "command": "tail -f /dev/null",  # Keep container running
        }

        services[service_name] = service_config

    # Generate databases
    selected_dbs = random.sample(DATABASES, min(num_databases, len(DATABASES)))
    for i, db in enumerate(selected_dbs):
        dept = random.choice(DEPARTMENT_NAMES)
        service_name = f"target-{dept}-{db['name']}-{i + 1:02d}"
        ip = random_ip(used_ips=used_ips)

        ports = []
        for p in db["ports"]:
            host_port = get_host_port(p)
            ports.append(f"{host_port}:{p}")

        service_config = {
            "image": db["image"],
            "container_name": service_name,
            "networks": {"target-network": {"ipv4_address": ip}},
            "ports": ports,
            "labels": {
                "discovery.type": "database",
                "discovery.technology": db["name"],
                "discovery.db-type": db["type"],
            },
        }

        env = generate_database_env(db["name"], dept)
        if env:
            service_config["environment"] = env

        services[service_name] = service_config

    # Generate message queues
    if num_queues > 0:
        selected_queues = random.sample(
            MESSAGE_QUEUES, min(num_queues, len(MESSAGE_QUEUES))
        )
        for i, queue in enumerate(selected_queues):
            service_name = generate_service_name(queue["name"], i + 1)
            ip = random_ip(used_ips=used_ips)

            ports = []
            for p in queue["ports"]:
                host_port = get_host_port(p)
                ports.append(f"{host_port}:{p}")

            services[service_name] = {
                "image": queue["image"],
                "container_name": service_name,
                "networks": {"target-network": {"ipv4_address": ip}},
                "ports": ports,
                "labels": {
                    "discovery.type": "message-queue",
                    "discovery.technology": queue["name"],
                },
            }

    # Generate infrastructure services
    if num_infra > 0:
        selected_infra = random.sample(
            INFRASTRUCTURE, min(num_infra, len(INFRASTRUCTURE))
        )
        for i, infra in enumerate(selected_infra):
            service_name = generate_service_name(infra["name"], i + 1)
            ip = random_ip(used_ips=used_ips)

            ports = []
            for p in infra["ports"]:
                host_port = get_host_port(p)
                ports.append(f"{host_port}:{p}")

            service_config = {
                "image": infra["image"],
                "container_name": service_name,
                "networks": {"target-network": {"ipv4_address": ip}},
                "ports": ports,
                "labels": {
                    "discovery.type": "infrastructure",
                    "discovery.technology": infra["name"],
                },
            }

            # Special handling for certain services
            if infra["name"] == "minio":
                service_config["command"] = "server /data --console-address ':9001'"
                service_config["environment"] = {
                    "MINIO_ROOT_USER": random.choice(COMPANY_PREFIXES) + "_admin",
                    "MINIO_ROOT_PASSWORD": generate_password(),
                }

            services[service_name] = service_config

    # Build complete docker-compose structure
    compose = {
        "version": "3.8",
        "services": services,
        "networks": {
            "target-network": {
                "driver": "bridge",
                "ipam": {
                    "config": [{"subnet": "172.28.0.0/24", "gateway": "172.28.0.1"}]
                },
            }
        },
    }

    return compose, seed


def generate_manifest(compose, seed):
    """Generate a manifest file describing what was created."""
    services = compose["services"]

    manifest = {
        "generated_at": datetime.now().isoformat(),
        "seed": seed,
        "summary": {
            "total_services": len(services),
            "web_servers": sum(
                1
                for s in services.values()
                if s.get("labels", {}).get("discovery.type") == "web-server"
            ),
            "app_servers": sum(
                1
                for s in services.values()
                if s.get("labels", {}).get("discovery.type") == "app-server"
            ),
            "databases": sum(
                1
                for s in services.values()
                if s.get("labels", {}).get("discovery.type") == "database"
            ),
            "message_queues": sum(
                1
                for s in services.values()
                if s.get("labels", {}).get("discovery.type") == "message-queue"
            ),
            "infrastructure": sum(
                1
                for s in services.values()
                if s.get("labels", {}).get("discovery.type") == "infrastructure"
            ),
        },
        "services": [],
    }

    for name, config in services.items():
        labels = config.get("labels", {})
        network_config = config.get("networks", {}).get("target-network", {})

        manifest["services"].append(
            {
                "name": name,
                "ip": network_config.get("ipv4_address", "unknown"),
                "type": labels.get("discovery.type", "unknown"),
                "technology": labels.get("discovery.technology", "unknown"),
                "ports": config.get("ports", []),
            }
        )

    return manifest


def main(seed: int | None = None):
    """Generate test environment.

    Args:
        seed: Optional seed for reproducibility. If None, uses current timestamp.
    """
    script_dir = Path(__file__).parent.parent

    print("=" * 60)
    print("Randomized Test Environment Generator")
    print("=" * 60)

    # Generate environment
    compose, seed = generate_environment(seed)
    manifest = generate_manifest(compose, seed)

    # Write docker-compose file
    compose_path = script_dir / "docker-compose.generated.yml"
    with open(compose_path, "w") as f:
        f.write("# Auto-generated test environment\n")
        f.write(f"# Seed: {seed}\n")
        f.write(f"# Generated: {datetime.now().isoformat()}\n")
        f.write("# Regenerate with: python scripts/generate-test-env.py\n")
        f.write("#\n")
        f.write("# To recreate this exact environment, use:\n")
        f.write(f"#   python scripts/generate-test-env.py --seed {seed}\n")
        f.write("\n")
        yaml.dump(compose, f, default_flow_style=False, sort_keys=False)

    # Write manifest
    manifest_path = script_dir / "test-env-manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    # Print summary
    print(f"\nSeed: {seed}")
    print(f"\nGenerated {manifest['summary']['total_services']} services:")
    print(f"  - Web Servers:    {manifest['summary']['web_servers']}")
    print(f"  - App Servers:    {manifest['summary']['app_servers']}")
    print(f"  - Databases:      {manifest['summary']['databases']}")
    print(f"  - Message Queues: {manifest['summary']['message_queues']}")
    print(f"  - Infrastructure: {manifest['summary']['infrastructure']}")

    print("\nServices:")
    for svc in manifest["services"]:
        ports = ", ".join(svc["ports"]) if svc["ports"] else "none"
        print(f"  {svc['ip']:15} {svc['name']:40} ({svc['technology']}) ports: {ports}")

    print("\nFiles written:")
    print(f"  - {compose_path}")
    print(f"  - {manifest_path}")

    print("\nTo start the environment:")
    print("  docker-compose -f docker-compose.generated.yml up -d")

    print("\nTo scan the network:")
    print("  Network range: 172.28.0.0/24")
    print("=" * 60)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate randomized test environment for dry-run testing"
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Seed for reproducible environment generation",
    )
    args = parser.parse_args()

    main(seed=args.seed)
