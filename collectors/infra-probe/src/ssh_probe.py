"""SSH-based infrastructure probe for system information collection.

SECURITY CRITICAL:
- Credentials are NEVER logged
- Credentials are NEVER published to events
- Credentials exist only in memory during probe execution
- Results go through the normal approval pipeline
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)


@dataclass
class ProbeCredentials:
    """SSH credentials for probe execution.

    SECURITY: This object is short-lived and NEVER serialized/logged.
    Credentials are cleared from memory after probe completion.
    """

    username: str
    password: str | None = None
    private_key: str | None = None
    passphrase: str | None = None

    def __repr__(self) -> str:
        """Prevent credential exposure in logs."""
        return f"ProbeCredentials(username={self.username}, password=***, key=***)"

    def __str__(self) -> str:
        """Prevent credential exposure in string conversion."""
        return self.__repr__()

    def clear(self) -> None:
        """Securely clear credentials from memory."""
        if self.password:
            self.password = "x" * len(self.password)
            self.password = None
        if self.private_key:
            self.private_key = "x" * len(self.private_key)
            self.private_key = None
        if self.passphrase:
            self.passphrase = "x" * len(self.passphrase)
            self.passphrase = None


@dataclass
class ProbeResult:
    """Result of an infrastructure probe.

    Contains ONLY system information - NEVER credentials.
    """

    probe_id: str
    target_ip: str
    server_id: str | None = None
    hostname: str | None = None
    operating_system: dict[str, Any] = field(default_factory=dict)
    hardware: dict[str, Any] = field(default_factory=dict)
    installed_software: list[dict[str, Any]] = field(default_factory=list)
    running_services: list[dict[str, Any]] = field(default_factory=list)
    network_config: dict[str, Any] = field(default_factory=dict)
    success: bool = False
    error: str | None = None


class SSHProbe:
    """SSH-based infrastructure probe.

    Collects system information via SSH commands.
    NEVER logs or stores credentials.
    """

    def __init__(
        self,
        timeout_s: int = 30,
        command_timeout_s: int = 60,
    ):
        self._timeout = timeout_s
        self._command_timeout = command_timeout_s

    async def probe(
        self,
        target_ip: str,
        credentials: ProbeCredentials,
        port: int = 22,
        server_id: str | None = None,
    ) -> ProbeResult:
        """
        Execute infrastructure probe via SSH.

        SECURITY:
        - Credentials are NEVER logged
        - Credentials are cleared after use
        - Only system info is returned

        Args:
            target_ip: IP address to probe
            credentials: SSH credentials (cleared after use)
            port: SSH port (default 22)
            server_id: Optional reference to network-scanner discovery

        Returns:
            ProbeResult with system information (no credentials)
        """
        probe_id = str(uuid4())
        result = ProbeResult(
            probe_id=probe_id,
            target_ip=target_ip,
            server_id=server_id,
        )

        # Log WITHOUT credentials
        logger.info(
            f"Starting probe {probe_id} to {target_ip}:{port} "
            f"(user: {credentials.username})"
        )

        try:
            # Import paramiko here to make it optional
            import paramiko

            # Create SSH client
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            try:
                # Connect with credentials
                connect_kwargs = {
                    "hostname": target_ip,
                    "port": port,
                    "username": credentials.username,
                    "timeout": self._timeout,
                }

                if credentials.private_key:
                    # Key-based auth
                    from io import StringIO

                    key = paramiko.RSAKey.from_private_key(
                        StringIO(credentials.private_key),
                        password=credentials.passphrase,
                    )
                    connect_kwargs["pkey"] = key
                elif credentials.password:
                    # Password auth
                    connect_kwargs["password"] = credentials.password

                client.connect(**connect_kwargs)

                # Collect system information
                result.hostname = await self._get_hostname(client)
                result.operating_system = await self._get_os_info(client)
                result.hardware = await self._get_hardware_info(client)
                result.installed_software = await self._get_installed_software(client)
                result.running_services = await self._get_running_services(client)
                result.network_config = await self._get_network_config(client)

                result.success = True
                logger.info(f"Probe {probe_id} completed successfully")

            finally:
                client.close()

        except ImportError:
            result.error = "paramiko not installed"
            logger.error(f"Probe {probe_id} failed: paramiko not installed")
        except Exception as e:
            # NEVER log the actual exception if it might contain credentials
            result.error = f"Connection failed: {type(e).__name__}"
            logger.error(f"Probe {probe_id} failed: {type(e).__name__}")
        finally:
            # CRITICAL: Clear credentials from memory
            credentials.clear()

        return result

    async def _run_command(self, client: Any, command: str) -> tuple[str, str, int]:
        """Run a command and return stdout, stderr, exit code."""
        loop = asyncio.get_event_loop()

        def _exec():
            stdin, stdout, stderr = client.exec_command(
                command, timeout=self._command_timeout
            )
            return (
                stdout.read().decode("utf-8", errors="ignore"),
                stderr.read().decode("utf-8", errors="ignore"),
                stdout.channel.recv_exit_status(),
            )

        return await loop.run_in_executor(None, _exec)

    async def _get_hostname(self, client: Any) -> str | None:
        """Get system hostname."""
        try:
            stdout, _, code = await self._run_command(client, "hostname")
            if code == 0:
                return stdout.strip()
        except Exception:
            pass
        return None

    async def _get_os_info(self, client: Any) -> dict[str, Any]:
        """Get operating system information."""
        os_info = {}

        try:
            # Try /etc/os-release first (Linux)
            stdout, _, code = await self._run_command(
                client,
                "cat /etc/os-release 2>/dev/null || cat /etc/redhat-release 2>/dev/null",
            )
            if code == 0 and stdout:
                for line in stdout.strip().split("\n"):
                    if "=" in line:
                        key, value = line.split("=", 1)
                        value = value.strip('"')
                        if key == "NAME":
                            os_info["name"] = value
                        elif key == "VERSION_ID":
                            os_info["version"] = value
                        elif key == "ID":
                            os_info["distribution"] = value

            # Get kernel info
            stdout, _, code = await self._run_command(client, "uname -r")
            if code == 0:
                os_info["kernel"] = stdout.strip()

            # Get architecture
            stdout, _, code = await self._run_command(client, "uname -m")
            if code == 0:
                arch = stdout.strip()
                os_info["architecture"] = arch

        except Exception:
            pass

        return os_info

    async def _get_hardware_info(self, client: Any) -> dict[str, Any]:
        """Get hardware information."""
        hw_info = {}

        try:
            # CPU cores
            stdout, _, code = await self._run_command(
                client, "nproc 2>/dev/null || grep -c processor /proc/cpuinfo"
            )
            if code == 0:
                try:
                    hw_info["cpu_cores"] = int(stdout.strip())
                except ValueError:
                    pass

            # CPU model
            stdout, _, code = await self._run_command(
                client, "grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2"
            )
            if code == 0 and stdout.strip():
                hw_info["cpu_model"] = stdout.strip()

            # Memory
            stdout, _, code = await self._run_command(
                client, "free -g | grep Mem | awk '{print $2}'"
            )
            if code == 0:
                try:
                    hw_info["memory_gb"] = float(stdout.strip())
                except ValueError:
                    pass

            # Disk
            stdout, _, code = await self._run_command(
                client, "df -BG / | tail -1 | awk '{print $2, $3}'"
            )
            if code == 0:
                parts = stdout.strip().split()
                if len(parts) >= 2:
                    try:
                        hw_info["disk_total_gb"] = float(parts[0].rstrip("G"))
                        hw_info["disk_used_gb"] = float(parts[1].rstrip("G"))
                    except ValueError:
                        pass

            # Virtualization
            stdout, _, code = await self._run_command(
                client,
                "systemd-detect-virt 2>/dev/null || cat /sys/class/dmi/id/product_name 2>/dev/null",
            )
            if code == 0 and stdout.strip():
                virt = stdout.strip().lower()
                if virt != "none":
                    hw_info["is_virtual"] = True
                    if "vmware" in virt:
                        hw_info["virtualization_type"] = "vmware"
                    elif "kvm" in virt:
                        hw_info["virtualization_type"] = "kvm"
                    elif "hyperv" in virt or "hyper-v" in virt:
                        hw_info["virtualization_type"] = "hyperv"
                    elif "xen" in virt:
                        hw_info["virtualization_type"] = "xen"
                    elif "docker" in virt:
                        hw_info["virtualization_type"] = "docker"
                    elif "lxc" in virt:
                        hw_info["virtualization_type"] = "lxc"
                    else:
                        hw_info["virtualization_type"] = "unknown"
                else:
                    hw_info["is_virtual"] = False
                    hw_info["virtualization_type"] = "none"

        except Exception:
            pass

        return hw_info

    async def _get_installed_software(self, client: Any) -> list[dict[str, Any]]:
        """Get list of installed software packages."""
        software = []

        try:
            # Try different package managers
            # Debian/Ubuntu
            stdout, _, code = await self._run_command(
                client,
                "dpkg-query -W -f='${Package}|${Version}\\n' 2>/dev/null | head -100",
            )
            if code == 0 and stdout.strip():
                for line in stdout.strip().split("\n")[:100]:
                    if "|" in line:
                        name, version = line.split("|", 1)
                        software.append(
                            {
                                "name": name,
                                "version": version,
                                "type": "package",
                                "source": "apt",
                            }
                        )
                return software

            # RHEL/CentOS
            stdout, _, code = await self._run_command(
                client,
                "rpm -qa --queryformat '%{NAME}|%{VERSION}\\n' 2>/dev/null | head -100",
            )
            if code == 0 and stdout.strip():
                for line in stdout.strip().split("\n")[:100]:
                    if "|" in line:
                        name, version = line.split("|", 1)
                        software.append(
                            {
                                "name": name,
                                "version": version,
                                "type": "package",
                                "source": "yum",
                            }
                        )

        except Exception:
            pass

        return software

    async def _get_running_services(self, client: Any) -> list[dict[str, Any]]:
        """Get list of running services."""
        services = []

        try:
            # Try systemctl first
            stdout, _, code = await self._run_command(
                client,
                "systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null | head -50",
            )
            if code == 0 and stdout.strip():
                for line in stdout.strip().split("\n"):
                    match = re.match(r"^(\S+)\.service", line)
                    if match:
                        services.append(
                            {
                                "name": match.group(1),
                                "status": "running",
                            }
                        )
                return services

            # Fallback to ps
            stdout, _, code = await self._run_command(
                client, "ps aux --no-headers | awk '{print $11}' | sort -u | head -30"
            )
            if code == 0:
                for line in stdout.strip().split("\n")[:30]:
                    name = line.strip().split("/")[-1]
                    if name and not name.startswith("["):
                        services.append(
                            {
                                "name": name,
                                "status": "running",
                            }
                        )

        except Exception:
            pass

        return services

    async def _get_network_config(self, client: Any) -> dict[str, Any]:
        """Get network configuration."""
        net_config: dict[str, Any] = {"interfaces": []}

        try:
            # Get interfaces
            stdout, _, code = await self._run_command(
                client, "ip -o addr show 2>/dev/null || ifconfig -a"
            )
            if code == 0:
                # Parse ip output
                for line in stdout.strip().split("\n"):
                    match = re.search(
                        r"(\d+):\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)", line
                    )
                    if match:
                        iface_name = match.group(2)
                        ip_addr = match.group(3)
                        net_config["interfaces"].append(
                            {
                                "name": iface_name,
                                "ip_address": ip_addr,
                            }
                        )

            # Get default gateway
            stdout, _, code = await self._run_command(
                client, "ip route | grep default | awk '{print $3}'"
            )
            if code == 0 and stdout.strip():
                net_config["default_gateway"] = stdout.strip()

            # Get DNS servers
            stdout, _, code = await self._run_command(
                client, "cat /etc/resolv.conf | grep nameserver | awk '{print $2}'"
            )
            if code == 0 and stdout.strip():
                net_config["dns_servers"] = stdout.strip().split("\n")

        except Exception:
            pass

        return net_config
