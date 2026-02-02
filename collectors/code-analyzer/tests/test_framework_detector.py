"""Tests for framework detection."""

from src.analyzers.framework_detector import FrameworkDetector


class TestFrameworkDetector:
    """Tests for FrameworkDetector."""

    def test_detect_react(self, temp_repo):
        """Should detect React framework."""
        detector = FrameworkDetector()
        result = detector.detect(temp_repo)

        frameworks = [f["name"] for f in result]
        assert "React" in frameworks

    def test_detect_fastapi_from_requirements(self, temp_repo):
        """Should detect FastAPI from requirements.txt."""
        detector = FrameworkDetector()
        result = detector.detect(temp_repo)

        frameworks = [f["name"] for f in result]
        assert "FastAPI" in frameworks

    def test_detect_gin(self, temp_go_repo):
        """Should detect Gin framework in Go project."""
        detector = FrameworkDetector()
        result = detector.detect(temp_go_repo)

        frameworks = [f["name"] for f in result]
        assert "Gin" in frameworks

    def test_confidence_scores(self, temp_repo):
        """Should return confidence scores."""
        detector = FrameworkDetector()
        result = detector.detect(temp_repo)

        for framework in result:
            assert "confidence" in framework
            assert 0 <= framework["confidence"] <= 1

    def test_sorted_by_confidence(self, temp_repo):
        """Should return frameworks sorted by confidence."""
        detector = FrameworkDetector()
        result = detector.detect(temp_repo)

        if len(result) >= 2:
            confidences = [f["confidence"] for f in result]
            assert confidences == sorted(confidences, reverse=True)

    def test_language_included(self, temp_repo):
        """Should include language for each framework."""
        detector = FrameworkDetector()
        result = detector.detect(temp_repo)

        for framework in result:
            assert "language" in framework
            assert framework["language"] != ""
