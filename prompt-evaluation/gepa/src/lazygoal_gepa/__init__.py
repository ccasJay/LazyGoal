"""Public API for the LazyGoal adapter built on the official GEPA package."""

from .compatibility import EXPECTED_GEPA_VERSION, ensure_gepa_compatibility
from .candidate import CandidateCodec, LazyGoalPrompt
from .client import LazyGoalEvaluationRecord, PromptEvaluationClient
from .dataset import DatasetValidator
from .errors import (
    CandidateValidationError,
    ConfigurationError,
    DatasetValidationError,
    GEPACompatibilityError,
    LazyGoalGEPAError,
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
)
from .invocation import InvocationContext, InvocationDirectoryManager
from .models import BenchmarkId, LazyGoalEvaluationExample, LazyGoalGEPAConfig

__all__ = [
    "BenchmarkId",
    "CandidateCodec",
    "CandidateValidationError",
    "ConfigurationError",
    "DatasetValidationError",
    "DatasetValidator",
    "EXPECTED_GEPA_VERSION",
    "GEPACompatibilityError",
    "InvocationContext",
    "InvocationDirectoryManager",
    "LazyGoalEvaluationExample",
    "LazyGoalEvaluationRecord",
    "LazyGoalGEPAConfig",
    "LazyGoalGEPAError",
    "LazyGoalPrompt",
    "PromptEvaluationCancelled",
    "PromptEvaluationClient",
    "PromptEvaluationInfrastructureError",
    "PromptEvaluationProtocolError",
    "ensure_gepa_compatibility",
]
