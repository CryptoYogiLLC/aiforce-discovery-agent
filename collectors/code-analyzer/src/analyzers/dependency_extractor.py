"""Dependency extraction from various package managers."""

import json
import logging
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class DependencyExtractor:
    """Extracts dependencies from various package manager files."""

    def extract(self, repo_path: Path) -> list[dict[str, Any]]:
        """
        Extract all dependencies from the repository.

        Returns:
            List of dependencies with package info
        """
        dependencies: list[dict[str, Any]] = []

        # NPM/Yarn (package.json)
        package_json = repo_path / "package.json"
        if package_json.exists():
            dependencies.extend(self._parse_package_json(package_json))

        # Python requirements.txt
        for req_file in repo_path.glob("**/requirements*.txt"):
            dependencies.extend(self._parse_requirements_txt(req_file))

        # Python pyproject.toml
        pyproject = repo_path / "pyproject.toml"
        if pyproject.exists():
            dependencies.extend(self._parse_pyproject_toml(pyproject))

        # Go modules (go.mod)
        go_mod = repo_path / "go.mod"
        if go_mod.exists():
            dependencies.extend(self._parse_go_mod(go_mod))

        # Maven (pom.xml)
        pom_xml = repo_path / "pom.xml"
        if pom_xml.exists():
            dependencies.extend(self._parse_pom_xml(pom_xml))

        # Gradle (build.gradle)
        build_gradle = repo_path / "build.gradle"
        if build_gradle.exists():
            dependencies.extend(self._parse_build_gradle(build_gradle))

        # Ruby (Gemfile)
        gemfile = repo_path / "Gemfile"
        if gemfile.exists():
            dependencies.extend(self._parse_gemfile(gemfile))

        # Rust (Cargo.toml)
        cargo_toml = repo_path / "Cargo.toml"
        if cargo_toml.exists():
            dependencies.extend(self._parse_cargo_toml(cargo_toml))

        # PHP (composer.json)
        composer_json = repo_path / "composer.json"
        if composer_json.exists():
            dependencies.extend(self._parse_composer_json(composer_json))

        return dependencies

    def _parse_package_json(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse npm/yarn package.json."""
        dependencies = []
        try:
            with open(filepath) as f:
                data = json.load(f)

            for dep_type in ["dependencies", "devDependencies", "peerDependencies"]:
                deps = data.get(dep_type, {})
                is_dev = dep_type == "devDependencies"
                for name, version in deps.items():
                    dependencies.append(
                        {
                            "name": name,
                            "version": version,
                            "package_manager": "npm",
                            "language": "JavaScript",
                            "dev_dependency": is_dev,
                            "source_file": str(filepath.name),
                        }
                    )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_requirements_txt(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Python requirements.txt."""
        dependencies = []
        is_dev = "dev" in filepath.name.lower()

        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or line.startswith("-"):
                        continue

                    # Parse package name and version
                    match = re.match(
                        r"^([a-zA-Z0-9_-]+)\s*([<>=!~]+.*)?$",
                        line.split("[")[0],  # Remove extras
                    )
                    if match:
                        dependencies.append(
                            {
                                "name": match.group(1),
                                "version": match.group(2) or "*",
                                "package_manager": "pip",
                                "language": "Python",
                                "dev_dependency": is_dev,
                                "source_file": str(filepath.name),
                            }
                        )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_pyproject_toml(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Python pyproject.toml."""
        dependencies = []
        try:
            import toml

            with open(filepath) as f:
                data = toml.load(f)

            # Poetry dependencies
            poetry_deps = data.get("tool", {}).get("poetry", {}).get("dependencies", {})
            for name, version in poetry_deps.items():
                if name == "python":
                    continue
                if isinstance(version, dict):
                    version = version.get("version", "*")
                dependencies.append(
                    {
                        "name": name,
                        "version": str(version),
                        "package_manager": "poetry",
                        "language": "Python",
                        "dev_dependency": False,
                        "source_file": "pyproject.toml",
                    }
                )

            # PEP 621 dependencies
            project_deps = data.get("project", {}).get("dependencies", [])
            for dep in project_deps:
                match = re.match(r"^([a-zA-Z0-9_-]+)", dep)
                if match:
                    dependencies.append(
                        {
                            "name": match.group(1),
                            "version": dep.replace(match.group(1), "").strip() or "*",
                            "package_manager": "pip",
                            "language": "Python",
                            "dev_dependency": False,
                            "source_file": "pyproject.toml",
                        }
                    )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_go_mod(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Go go.mod."""
        dependencies = []
        try:
            with open(filepath) as f:
                in_require = False
                for line in f:
                    line = line.strip()

                    if line == "require (":
                        in_require = True
                        continue
                    if line == ")":
                        in_require = False
                        continue

                    if in_require or line.startswith("require "):
                        # Parse module and version
                        match = re.match(r"^(?:require\s+)?(\S+)\s+v?(\S+)", line)
                        if match:
                            dependencies.append(
                                {
                                    "name": match.group(1),
                                    "version": match.group(2),
                                    "package_manager": "go",
                                    "language": "Go",
                                    "dev_dependency": False,
                                    "source_file": "go.mod",
                                }
                            )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_pom_xml(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Maven pom.xml."""
        dependencies = []
        try:
            tree = ET.parse(filepath)
            root = tree.getroot()

            # Handle namespaces
            ns = {"m": "http://maven.apache.org/POM/4.0.0"}

            for dep in root.findall(".//m:dependency", ns):
                group_id = dep.find("m:groupId", ns)
                artifact_id = dep.find("m:artifactId", ns)
                version = dep.find("m:version", ns)
                scope = dep.find("m:scope", ns)

                if artifact_id is not None:
                    dependencies.append(
                        {
                            "name": f"{group_id.text if group_id is not None else ''}:{artifact_id.text}",
                            "version": version.text if version is not None else "*",
                            "package_manager": "maven",
                            "language": "Java",
                            "dev_dependency": scope is not None
                            and scope.text == "test",
                            "source_file": "pom.xml",
                        }
                    )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_build_gradle(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Gradle build.gradle."""
        dependencies = []
        try:
            with open(filepath) as f:
                content = f.read()

            # Match implementation, api, testImplementation, etc.
            pattern = r"(implementation|api|testImplementation|compileOnly)\s*['\"]([^'\"]+)['\"]"
            for match in re.finditer(pattern, content):
                dep_type, dep_string = match.groups()
                parts = dep_string.split(":")
                if len(parts) >= 2:
                    dependencies.append(
                        {
                            "name": f"{parts[0]}:{parts[1]}",
                            "version": parts[2] if len(parts) > 2 else "*",
                            "package_manager": "gradle",
                            "language": "Java",
                            "dev_dependency": dep_type == "testImplementation",
                            "source_file": "build.gradle",
                        }
                    )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_gemfile(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Ruby Gemfile."""
        dependencies = []
        try:
            with open(filepath) as f:
                in_dev_group = False
                for line in f:
                    line = line.strip()

                    if line.startswith("group :development") or line.startswith(
                        "group :test"
                    ):
                        in_dev_group = True
                        continue
                    if line == "end":
                        in_dev_group = False
                        continue

                    # Match gem declarations
                    match = re.match(
                        r"gem\s+['\"]([^'\"]+)['\"](?:,\s*['\"]([^'\"]+)['\"])?", line
                    )
                    if match:
                        dependencies.append(
                            {
                                "name": match.group(1),
                                "version": match.group(2) or "*",
                                "package_manager": "bundler",
                                "language": "Ruby",
                                "dev_dependency": in_dev_group,
                                "source_file": "Gemfile",
                            }
                        )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_cargo_toml(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse Rust Cargo.toml."""
        dependencies = []
        try:
            import toml

            with open(filepath) as f:
                data = toml.load(f)

            for dep_type in ["dependencies", "dev-dependencies"]:
                deps = data.get(dep_type, {})
                is_dev = dep_type == "dev-dependencies"
                for name, version in deps.items():
                    if isinstance(version, dict):
                        version = version.get("version", "*")
                    dependencies.append(
                        {
                            "name": name,
                            "version": str(version),
                            "package_manager": "cargo",
                            "language": "Rust",
                            "dev_dependency": is_dev,
                            "source_file": "Cargo.toml",
                        }
                    )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies

    def _parse_composer_json(self, filepath: Path) -> list[dict[str, Any]]:
        """Parse PHP composer.json."""
        dependencies = []
        try:
            with open(filepath) as f:
                data = json.load(f)

            for dep_type in ["require", "require-dev"]:
                deps = data.get(dep_type, {})
                is_dev = dep_type == "require-dev"
                for name, version in deps.items():
                    if name == "php":
                        continue
                    dependencies.append(
                        {
                            "name": name,
                            "version": version,
                            "package_manager": "composer",
                            "language": "PHP",
                            "dev_dependency": is_dev,
                            "source_file": "composer.json",
                        }
                    )
        except Exception as e:
            logger.warning(f"Failed to parse {filepath}: {e}")

        return dependencies
