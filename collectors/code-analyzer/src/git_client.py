"""Git client for repository cloning and access."""

import asyncio
import logging
import os
import shutil
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import git

logger = logging.getLogger(__name__)


class GitError(Exception):
    """Git operation error."""

    pass


class GitClient:
    """Client for Git repository operations."""

    def __init__(
        self,
        token: str | None = None,
        max_size_mb: int = 500,
        shallow: bool = True,
        timeout_s: int = 300,
    ):
        self.token = token
        self.max_size_mb = max_size_mb
        self.shallow = shallow
        self.timeout_s = timeout_s
        self._temp_dirs: list[str] = []

    def _inject_credentials(self, url: str) -> str:
        """Inject authentication token into URL if provided."""
        if not self.token:
            return url

        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            # Inject token as username for HTTPS URLs
            netloc = f"{self.token}@{parsed.hostname}"
            if parsed.port:
                netloc += f":{parsed.port}"
            return f"{parsed.scheme}://{netloc}{parsed.path}"

        return url

    async def clone(self, repo_url: str, branch: str = "main") -> Path:
        """
        Clone a repository asynchronously.

        Args:
            repo_url: URL of the repository
            branch: Branch to clone

        Returns:
            Path to the cloned repository

        Raises:
            GitError: If cloning fails
        """
        temp_dir = tempfile.mkdtemp(prefix="codeanalyzer_")
        self._temp_dirs.append(temp_dir)
        repo_path = Path(temp_dir) / "repo"

        auth_url = self._inject_credentials(repo_url)

        logger.info(f"Cloning {repo_url} (branch: {branch}, shallow: {self.shallow})")

        try:
            # Run git clone in thread pool
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                self._clone_sync,
                auth_url,
                str(repo_path),
                branch,
            )

            # Check repository size
            size_mb = self._get_dir_size_mb(repo_path)
            if size_mb > self.max_size_mb:
                raise GitError(
                    f"Repository size ({size_mb:.1f} MB) exceeds limit ({self.max_size_mb} MB)"
                )

            logger.info(f"Cloned repository ({size_mb:.1f} MB)")
            return repo_path

        except git.GitCommandError as e:
            logger.error(f"Git clone failed: {e}")
            raise GitError(f"Failed to clone repository: {e}")
        except Exception as e:
            logger.error(f"Clone error: {e}")
            raise GitError(str(e))

    def _clone_sync(self, url: str, path: str, branch: str) -> None:
        """Synchronous clone operation."""
        clone_args = {
            "url": url,
            "to_path": path,
            "branch": branch,
        }

        if self.shallow:
            clone_args["depth"] = 1

        git.Repo.clone_from(**clone_args)

    def _get_dir_size_mb(self, path: Path) -> float:
        """Calculate directory size in MB."""
        total = 0
        for dirpath, _, filenames in os.walk(path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                try:
                    total += os.path.getsize(filepath)
                except OSError:
                    pass
        return total / (1024 * 1024)

    async def cleanup(self, repo_path: Path) -> None:
        """Clean up cloned repository."""
        temp_dir = repo_path.parent
        if str(temp_dir) in self._temp_dirs:
            try:
                shutil.rmtree(temp_dir)
                self._temp_dirs.remove(str(temp_dir))
                logger.debug(f"Cleaned up {temp_dir}")
            except Exception as e:
                logger.warning(f"Failed to cleanup {temp_dir}: {e}")

    async def cleanup_all(self) -> None:
        """Clean up all temporary directories."""
        for temp_dir in list(self._temp_dirs):
            try:
                shutil.rmtree(temp_dir)
                self._temp_dirs.remove(temp_dir)
            except Exception as e:
                logger.warning(f"Failed to cleanup {temp_dir}: {e}")

    def get_repo_info(self, repo_path: Path) -> dict:
        """Get basic repository information."""
        try:
            repo = git.Repo(repo_path)
            return {
                "remote_url": repo.remotes.origin.url if repo.remotes else None,
                "branch": repo.active_branch.name if repo.head.is_valid() else None,
                "commit": repo.head.commit.hexsha if repo.head.is_valid() else None,
                "commit_message": repo.head.commit.message.strip()
                if repo.head.is_valid()
                else None,
                "commit_date": repo.head.commit.committed_datetime.isoformat()
                if repo.head.is_valid()
                else None,
            }
        except Exception as e:
            logger.warning(f"Failed to get repo info: {e}")
            return {}
