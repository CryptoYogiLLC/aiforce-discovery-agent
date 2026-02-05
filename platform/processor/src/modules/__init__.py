"""Processing modules for the unified processor."""

from .candidate_identification import CandidateIdentificationModule
from .enrichment import EnrichmentModule
from .pii_redactor import PIIRedactorModule
from .scoring import ScoringModule
from .connection_extractor import ConnectionExtractor
from .correlation import CorrelationModule

__all__ = [
    "CandidateIdentificationModule",
    "EnrichmentModule",
    "PIIRedactorModule",
    "ScoringModule",
    "ConnectionExtractor",
    "CorrelationModule",
]
