"""Analyzers for code analysis."""

from .language_detector import LanguageDetector
from .framework_detector import FrameworkDetector
from .dependency_extractor import DependencyExtractor
from .metrics_calculator import MetricsCalculator
from .application_classifier import ApplicationClassifier
from .architecture_detector import ArchitectureDetector
from .vulnerability_scanner import VulnerabilityScanner
from .eol_checker import EOLChecker
from .git_history_analyzer import GitHistoryAnalyzer

__all__ = [
    "LanguageDetector",
    "FrameworkDetector",
    "DependencyExtractor",
    "MetricsCalculator",
    "ApplicationClassifier",
    "ArchitectureDetector",
    "VulnerabilityScanner",
    "EOLChecker",
    "GitHistoryAnalyzer",
]
