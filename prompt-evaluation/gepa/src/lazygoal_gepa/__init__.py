"""Public API for the LazyGoal adapter built on the official GEPA package."""

from .compatibility import EXPECTED_GEPA_VERSION, ensure_gepa_compatibility
from .dataset import DatasetValidator
from .errors import (
    ConfigurationError,
    DatasetValidationError,
    GEPACompatibilityError,
    LazyGoalGEPAError,
)
from .models import BenchmarkId, LazyGoalEvaluationExample, LazyGoalGEPAConfig

__all__ = [
    "BenchmarkId",
    "ConfigurationError",
    "DatasetValidationError",
    "DatasetValidator",
    "EXPECTED_GEPA_VERSION",
    "GEPACompatibilityError",
    "LazyGoalEvaluationExample",
    "LazyGoalGEPAConfig",
    "LazyGoalGEPAError",
    "ensure_gepa_compatibility",
]
