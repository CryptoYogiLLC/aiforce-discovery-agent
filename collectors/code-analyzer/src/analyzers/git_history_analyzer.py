"""Git history analysis for repositories.

Analyzes commit history to extract metrics about development activity,
contributors, and codebase evolution.
"""

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import git

logger = logging.getLogger(__name__)

# Maximum commits to analyze for sampling
MAX_COMMITS_TO_ANALYZE = 5000

# Commit frequency thresholds (commits per 30 days)
FREQUENCY_THRESHOLDS = {
    "daily": 20,  # ~20+ commits/month = daily activity
    "weekly": 5,  # 5-19 commits/month = weekly activity
    "monthly": 1,  # 1-4 commits/month = monthly activity
    "sporadic": 0.1,  # < 1 commit/month but some activity
    "inactive": 0,  # No recent activity
}


class GitHistoryAnalyzer:
    """Analyzes Git commit history for repository metrics."""

    def __init__(
        self,
        max_commits: int = MAX_COMMITS_TO_ANALYZE,
        sample_if_large: bool = True,
    ):
        """
        Initialize the Git history analyzer.

        Args:
            max_commits: Maximum commits to analyze (for performance)
            sample_if_large: If True, sample commits from large repos
        """
        self._max_commits = max_commits
        self._sample_if_large = sample_if_large

    def analyze(self, repo_path: Path) -> dict[str, Any]:
        """
        Analyze Git history of a repository.

        Args:
            repo_path: Path to the Git repository

        Returns:
            Git history metrics
        """
        try:
            repo = git.Repo(repo_path)
        except git.InvalidGitRepositoryError:
            logger.warning(f"Not a valid Git repository: {repo_path}")
            return self._empty_result()
        except Exception as e:
            logger.error(f"Failed to open repository: {e}")
            return self._empty_result()

        try:
            return self._analyze_commits(repo)
        except Exception as e:
            logger.error(f"Failed to analyze Git history: {e}")
            return self._empty_result()

    def _analyze_commits(self, repo: git.Repo) -> dict[str, Any]:
        """Analyze commits from a repository."""
        commits = []
        contributors: set[str] = set()

        try:
            # Get all commits (with limit)
            commit_iter = repo.iter_commits(max_count=self._max_commits)

            for commit in commit_iter:
                commits.append(commit)
                # Use author email for unique contributor identification
                if commit.author and commit.author.email:
                    contributors.add(commit.author.email.lower())
        except Exception as e:
            logger.warning(f"Error iterating commits: {e}")
            return self._empty_result()

        if not commits:
            return self._empty_result()

        # Sort by date (oldest first for date calculations)
        commits.sort(key=lambda c: c.committed_datetime)

        first_commit = commits[0]
        last_commit = commits[-1]

        # Calculate commit frequency
        frequency = self._calculate_frequency(commits)

        # Get branch information
        branches = self._get_branch_info(repo)

        return {
            "total_commits": len(commits),
            "total_commits_all": self._get_total_commit_count(repo),
            "contributors_count": len(contributors),
            "first_commit_date": first_commit.committed_datetime.isoformat(),
            "last_commit_date": last_commit.committed_datetime.isoformat(),
            "commit_frequency": frequency,
            "is_sampled": len(commits) >= self._max_commits,
            "default_branch": branches.get("default"),
            "branch_count": branches.get("count", 0),
            "age_days": self._calculate_age_days(first_commit),
            "activity_last_90_days": self._count_recent_commits(commits, 90),
            "activity_last_30_days": self._count_recent_commits(commits, 30),
        }

    def _empty_result(self) -> dict[str, Any]:
        """Return empty result structure."""
        return {
            "total_commits": 0,
            "total_commits_all": 0,
            "contributors_count": 0,
            "first_commit_date": None,
            "last_commit_date": None,
            "commit_frequency": "unknown",
            "is_sampled": False,
            "default_branch": None,
            "branch_count": 0,
            "age_days": 0,
            "activity_last_90_days": 0,
            "activity_last_30_days": 0,
        }

    def _get_total_commit_count(self, repo: git.Repo) -> int:
        """Get total commit count (may be slow for large repos)."""
        try:
            # Use rev-list --count for efficiency
            return int(repo.git.rev_list("--count", "HEAD"))
        except Exception:
            return 0

    def _calculate_frequency(self, commits: list[git.Commit]) -> str:
        """Calculate commit frequency based on recent activity."""
        if not commits:
            return "inactive"

        # Look at last 90 days of activity
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=90)

        recent_commits = [
            c
            for c in commits
            if c.committed_datetime.replace(tzinfo=timezone.utc) > cutoff
        ]

        if not recent_commits:
            return "inactive"

        # Calculate commits per 30 days
        commits_per_month = len(recent_commits) / 3.0

        if commits_per_month >= FREQUENCY_THRESHOLDS["daily"]:
            return "daily"
        elif commits_per_month >= FREQUENCY_THRESHOLDS["weekly"]:
            return "weekly"
        elif commits_per_month >= FREQUENCY_THRESHOLDS["monthly"]:
            return "monthly"
        elif commits_per_month >= FREQUENCY_THRESHOLDS["sporadic"]:
            return "sporadic"
        else:
            return "inactive"

    def _get_branch_info(self, repo: git.Repo) -> dict[str, Any]:
        """Get branch information."""
        try:
            branches = list(repo.branches)
            default_branch = None

            # Try to determine default branch
            try:
                if repo.head.is_valid():
                    default_branch = repo.active_branch.name
            except TypeError:
                # Detached HEAD
                pass

            # Common default branch names
            if not default_branch:
                for name in ["main", "master", "develop"]:
                    if name in [b.name for b in branches]:
                        default_branch = name
                        break

            return {
                "default": default_branch,
                "count": len(branches),
            }
        except Exception as e:
            logger.warning(f"Error getting branch info: {e}")
            return {"default": None, "count": 0}

    def _calculate_age_days(self, first_commit: git.Commit) -> int:
        """Calculate repository age in days."""
        try:
            now = datetime.now(timezone.utc)
            first_date = first_commit.committed_datetime.replace(tzinfo=timezone.utc)
            return (now - first_date).days
        except Exception:
            return 0

    def _count_recent_commits(self, commits: list[git.Commit], days: int) -> int:
        """Count commits within the last N days."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        return sum(
            1
            for c in commits
            if c.committed_datetime.replace(tzinfo=timezone.utc) > cutoff
        )
