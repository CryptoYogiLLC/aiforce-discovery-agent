"""Pytest configuration and fixtures for Code Analyzer tests."""

import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def temp_repo():
    """Create a temporary repository structure for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir)

        # Create a basic Python project structure
        (repo_path / "src").mkdir()
        (repo_path / "tests").mkdir()

        # Python files
        (repo_path / "src" / "__init__.py").write_text("")
        (repo_path / "src" / "main.py").write_text(
            '''"""Main module."""

def greet(name):
    """Greet someone.

    TODO: Add validation
    """
    if not name:
        return "Hello, World!"
    return f"Hello, {name}!"


def calculate(a, b, operation):
    """Calculate result based on operation.

    FIXME: Handle division by zero
    """
    if operation == "add":
        return a + b
    elif operation == "subtract":
        return a - b
    elif operation == "multiply":
        return a * b
    elif operation == "divide":
        return a / b
    else:
        raise ValueError(f"Unknown operation: {operation}")
'''
        )

        (repo_path / "tests" / "test_main.py").write_text(
            '''"""Tests for main module."""

import pytest
from src.main import greet, calculate


def test_greet_with_name():
    assert greet("Alice") == "Hello, Alice!"


def test_greet_without_name():
    assert greet("") == "Hello, World!"
'''
        )

        # requirements.txt
        (repo_path / "requirements.txt").write_text(
            """fastapi>=0.100.0
uvicorn>=0.23.0
pydantic>=2.0.0
"""
        )

        (repo_path / "requirements-dev.txt").write_text(
            """-r requirements.txt
pytest>=7.0.0
pytest-cov>=4.0.0
"""
        )

        # package.json (for multi-language repo)
        (repo_path / "frontend").mkdir()
        (repo_path / "frontend" / "package.json").write_text(
            """{
  "name": "test-frontend",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
"""
        )

        # JavaScript file
        (repo_path / "frontend" / "index.js").write_text(
            """// Entry point
import React from 'react';

const App = () => {
    return <div>Hello World</div>;
};

export default App;
"""
        )

        yield repo_path


@pytest.fixture
def temp_go_repo():
    """Create a temporary Go repository structure for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        repo_path = Path(tmpdir)

        # go.mod
        (repo_path / "go.mod").write_text(
            """module github.com/example/test

go 1.21

require (
    github.com/gin-gonic/gin v1.9.1
    github.com/go-playground/validator/v10 v10.14.0
)
"""
        )

        # Go file
        (repo_path / "main.go").write_text(
            """package main

import (
    "net/http"
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()
    r.GET("/ping", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{
            "message": "pong",
        })
    })
    r.Run()
}
"""
        )

        yield repo_path
