"""
Sample repository listing handler.

Lists available sample repositories with language/framework detection.
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import logger, settings

router = APIRouter()


@router.get("/api/repos")
async def list_sample_repos():
    """List available sample repositories for dry-run testing."""
    repos_path = Path(settings.sample_repos_path)

    if not repos_path.exists():
        return {"repos": [], "error": "Sample repos path not found"}

    # Handle potential filesystem errors (permissions, etc.)
    try:
        repo_entries = list(repos_path.iterdir())
    except OSError as e:
        logger.error("Failed to list sample repos", error=str(e))
        raise HTTPException(
            status_code=500, detail="Cannot access sample repos directory"
        )

    repos = []
    for repo_dir in repo_entries:
        if repo_dir.is_dir() and not repo_dir.name.startswith("."):
            # Detect language/framework
            language = "unknown"
            framework = "unknown"

            if (repo_dir / "requirements.txt").exists():
                language = "python"
                if (repo_dir / "manage.py").exists():
                    framework = "django"
                elif (repo_dir / "app.py").exists():
                    framework = "flask"
            elif (repo_dir / "package.json").exists():
                language = "javascript"
                if (repo_dir / "vite.config.ts").exists():
                    framework = "react-vite"
                elif (repo_dir / "next.config.js").exists():
                    framework = "nextjs"
                else:
                    framework = "express"
            elif (repo_dir / "pom.xml").exists():
                language = "java"
                framework = "spring-boot"
            elif (repo_dir / "go.mod").exists():
                language = "go"
                framework = "gin"

            repos.append(
                {
                    "name": repo_dir.name,
                    "path": str(repo_dir),
                    "language": language,
                    "framework": framework,
                }
            )

    return {"repos": repos, "count": len(repos)}
