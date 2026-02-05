"""Pytest configuration for infra-probe tests."""

import sys
from pathlib import Path

import pytest

# Add src to path for imports
src_path = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(src_path))


@pytest.fixture
def sample_probe_result():
    """Create a sample probe result for testing."""
    from src.ssh_probe import ProbeResult

    return ProbeResult(
        probe_id="test-probe-123",
        target_ip="192.168.1.100",
        server_id="server-abc",
        hostname="test-server",
        operating_system={
            "name": "Ubuntu",
            "version": "22.04",
            "distribution": "ubuntu",
            "kernel": "5.15.0-generic",
            "architecture": "x86_64",
        },
        hardware={
            "cpu_cores": 4,
            "cpu_model": "Intel Xeon",
            "memory_gb": 16.0,
            "disk_total_gb": 100.0,
            "disk_used_gb": 25.0,
            "is_virtual": True,
            "virtualization_type": "kvm",
        },
        installed_software=[
            {"name": "nginx", "version": "1.24.0", "type": "package", "source": "apt"},
            {
                "name": "python3",
                "version": "3.11.0",
                "type": "package",
                "source": "apt",
            },
        ],
        running_services=[
            {"name": "nginx", "status": "running"},
            {"name": "sshd", "status": "running"},
        ],
        network_config={
            "interfaces": [
                {"name": "eth0", "ip_address": "192.168.1.100"},
            ],
            "default_gateway": "192.168.1.1",
            "dns_servers": ["8.8.8.8", "8.8.4.4"],
        },
        success=True,
    )


@pytest.fixture
def sample_credentials():
    """Create sample credentials for testing (NEVER use real credentials)."""
    from src.ssh_probe import ProbeCredentials

    return ProbeCredentials(
        username="testuser",
        password="testpassword123",
    )
