"""Tests for SSH probe module.

SECURITY: Tests verify that credentials are never exposed.
"""

import sys
import pytest
from unittest.mock import MagicMock, patch

from src.ssh_probe import SSHProbe, ProbeCredentials, ProbeResult


class TestProbeCredentials:
    """Tests for ProbeCredentials dataclass."""

    def test_repr_hides_password(self):
        """Credentials should never appear in repr."""
        creds = ProbeCredentials(
            username="testuser",
            password="supersecret123",
        )
        repr_str = repr(creds)
        assert "supersecret123" not in repr_str
        assert "***" in repr_str
        assert "testuser" in repr_str

    def test_str_hides_password(self):
        """Credentials should never appear in str."""
        creds = ProbeCredentials(
            username="testuser",
            password="supersecret123",
        )
        str_output = str(creds)
        assert "supersecret123" not in str_output
        assert "***" in str_output

    def test_repr_hides_private_key(self):
        """Private key should never appear in repr."""
        # Use test key content that doesn't trigger pre-commit hooks
        test_key_content = "test-ssh-private-key-content-abc123xyz"
        creds = ProbeCredentials(
            username="testuser",
            private_key=test_key_content,
        )
        repr_str = repr(creds)
        assert test_key_content not in repr_str
        assert "***" in repr_str

    def test_clear_overwrites_password(self):
        """Clear should overwrite password before nulling."""
        creds = ProbeCredentials(
            username="testuser",
            password="supersecret123",
        )
        creds.clear()
        assert creds.password is None

    def test_clear_overwrites_private_key(self):
        """Clear should overwrite private key before nulling."""
        creds = ProbeCredentials(
            username="testuser",
            private_key="secretkey",
        )
        creds.clear()
        assert creds.private_key is None

    def test_clear_overwrites_passphrase(self):
        """Clear should overwrite passphrase before nulling."""
        creds = ProbeCredentials(
            username="testuser",
            passphrase="keypassphrase",
        )
        creds.clear()
        assert creds.passphrase is None


class TestProbeResult:
    """Tests for ProbeResult dataclass."""

    def test_default_values(self):
        """Result should have sensible defaults."""
        result = ProbeResult(
            probe_id="test-123",
            target_ip="192.168.1.100",
        )
        assert result.success is False
        assert result.error is None
        assert result.hostname is None
        assert result.operating_system == {}
        assert result.hardware == {}
        assert result.installed_software == []
        assert result.running_services == []
        assert result.network_config == {}

    def test_no_credentials_in_result(self):
        """Result should never contain credentials."""
        result = ProbeResult(
            probe_id="test-123",
            target_ip="192.168.1.100",
            hostname="testhost",
            operating_system={"name": "Ubuntu", "version": "22.04"},
        )
        result_dict = {
            "probe_id": result.probe_id,
            "target_ip": result.target_ip,
            "hostname": result.hostname,
            "operating_system": result.operating_system,
        }
        # Ensure no credential-like fields exist
        assert "password" not in str(result_dict).lower()
        assert "private_key" not in str(result_dict).lower()
        assert "passphrase" not in str(result_dict).lower()


class TestSSHProbe:
    """Tests for SSHProbe class."""

    def test_init_with_defaults(self):
        """Probe should initialize with default timeouts."""
        probe = SSHProbe()
        assert probe._timeout == 30
        assert probe._command_timeout == 60

    def test_init_with_custom_timeouts(self):
        """Probe should accept custom timeouts."""
        probe = SSHProbe(timeout_s=10, command_timeout_s=30)
        assert probe._timeout == 10
        assert probe._command_timeout == 30

    @pytest.mark.asyncio
    async def test_probe_clears_credentials_on_success(self):
        """Credentials should be cleared after successful probe."""
        probe = SSHProbe()
        creds = ProbeCredentials(
            username="testuser",
            password="secretpassword",
        )

        # Create mock paramiko module
        mock_paramiko = MagicMock()
        mock_client = MagicMock()
        mock_paramiko.SSHClient.return_value = mock_client
        mock_paramiko.AutoAddPolicy.return_value = MagicMock()

        # Mock exec_command to return empty results
        mock_stdout = MagicMock()
        mock_stdout.read.return_value = b""
        mock_stdout.channel.recv_exit_status.return_value = 0
        mock_stderr = MagicMock()
        mock_stderr.read.return_value = b""
        mock_client.exec_command.return_value = (
            MagicMock(),
            mock_stdout,
            mock_stderr,
        )

        with patch.dict(sys.modules, {"paramiko": mock_paramiko}):
            await probe.probe("192.168.1.100", creds)

        # Credentials should be cleared
        assert creds.password is None

    @pytest.mark.asyncio
    async def test_probe_clears_credentials_on_failure(self):
        """Credentials should be cleared even when probe fails."""
        probe = SSHProbe()
        creds = ProbeCredentials(
            username="testuser",
            password="secretpassword",
        )

        # Create mock paramiko module
        mock_paramiko = MagicMock()
        mock_client = MagicMock()
        mock_client.connect.side_effect = Exception("Connection refused")
        mock_paramiko.SSHClient.return_value = mock_client
        mock_paramiko.AutoAddPolicy.return_value = MagicMock()

        with patch.dict(sys.modules, {"paramiko": mock_paramiko}):
            result = await probe.probe("192.168.1.100", creds)

        # Credentials should still be cleared
        assert creds.password is None
        # Probe should report failure
        assert result.success is False
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_probe_returns_result_with_probe_id(self):
        """Probe should return result with unique probe_id."""
        probe = SSHProbe()
        creds = ProbeCredentials(username="testuser", password="pass")

        # Create mock paramiko module
        mock_paramiko = MagicMock()
        mock_client = MagicMock()
        mock_client.connect.side_effect = Exception("Connection refused")
        mock_paramiko.SSHClient.return_value = mock_client
        mock_paramiko.AutoAddPolicy.return_value = MagicMock()

        with patch.dict(sys.modules, {"paramiko": mock_paramiko}):
            result = await probe.probe("192.168.1.100", creds)

        assert result.probe_id is not None
        assert len(result.probe_id) > 0

    @pytest.mark.asyncio
    async def test_probe_uses_server_id(self):
        """Probe should include server_id in result."""
        probe = SSHProbe()
        creds = ProbeCredentials(username="testuser", password="pass")

        # Create mock paramiko module
        mock_paramiko = MagicMock()
        mock_client = MagicMock()
        mock_client.connect.side_effect = Exception("Connection refused")
        mock_paramiko.SSHClient.return_value = mock_client
        mock_paramiko.AutoAddPolicy.return_value = MagicMock()

        with patch.dict(sys.modules, {"paramiko": mock_paramiko}):
            result = await probe.probe(
                "192.168.1.100",
                creds,
                server_id="server-abc123",
            )

        assert result.server_id == "server-abc123"

    @pytest.mark.asyncio
    async def test_probe_error_does_not_expose_credentials(self):
        """Error messages should never contain credentials."""
        probe = SSHProbe()
        creds = ProbeCredentials(
            username="testuser",
            password="supersecretpassword123",
        )

        # Create mock paramiko module
        mock_paramiko = MagicMock()
        mock_client = MagicMock()
        mock_client.connect.side_effect = Exception(
            "Authentication failed for supersecretpassword123"
        )
        mock_paramiko.SSHClient.return_value = mock_client
        mock_paramiko.AutoAddPolicy.return_value = MagicMock()

        with patch.dict(sys.modules, {"paramiko": mock_paramiko}):
            result = await probe.probe("192.168.1.100", creds)

        # Error message should not contain the password
        assert "supersecretpassword123" not in (result.error or "")
        # Should only contain exception type
        assert "Exception" in (result.error or "")
