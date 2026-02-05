"""
Core environment generation logic.

Contains the main generate_environment() function that builds
the randomized docker-compose configuration.
"""

import random
from datetime import datetime

from testenv.pools import (
    APP_SERVERS,
    COMPANY_PREFIXES,
    DATABASES,
    DEPARTMENT_NAMES,
    INFRASTRUCTURE,
    MESSAGE_QUEUES,
    WEB_SERVERS,
)
from testenv.utils import (
    generate_database_env,
    generate_password,
    generate_service_name,
    random_ip,
)


def generate_environment(seed: int | None = None):
    """Generate randomized test environment configuration.

    Args:
        seed: Optional seed for reproducibility. If None, uses current timestamp.

    Returns:
        Tuple of (compose_dict, seed) where compose_dict is the full
        docker-compose structure and seed is the seed that was used.
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
