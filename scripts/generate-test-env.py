#!/usr/bin/env python3
"""
Randomized Test Environment Generator

Generates a unique docker-compose configuration each time it's run,
preventing developers from coding for a specific configuration.

Usage:
    python scripts/generate-test-env.py
    docker-compose -f docker-compose.generated.yml up -d
"""

import json
from datetime import datetime
from pathlib import Path

import yaml

from testenv.generator import generate_environment
from testenv.manifest import generate_manifest


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
