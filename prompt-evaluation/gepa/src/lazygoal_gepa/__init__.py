"""Public API for the LazyGoal adapter built on the official GEPA package."""

from .compatibility import EXPECTED_GEPA_VERSION, ensure_gepa_compatibility
from .errors import GEPACompatibilityError, LazyGoalGEPAError

__all__ = [
    "EXPECTED_GEPA_VERSION",
    "GEPACompatibilityError",
    "LazyGoalGEPAError",
    "ensure_gepa_compatibility",
]

