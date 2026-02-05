"""
Manifest generation for test environments.

Creates a JSON-serializable manifest describing all services
in a generated environment.
"""

from datetime import datetime


def generate_manifest(compose, seed):
    """Generate a manifest file describing what was created.

    Args:
        compose: The docker-compose dict returned by generate_environment().
        seed: The seed that was used for generation.

    Returns:
        A dict representing the manifest, suitable for JSON serialization.
    """
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
