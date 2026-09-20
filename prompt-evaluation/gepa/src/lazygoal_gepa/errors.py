"""Classified adapter failures exposed to GEPA callers."""


class LazyGoalGEPAError(RuntimeError):
    """Base class for unrecoverable LazyGoal GEPA adapter failures."""


class ConfigurationError(LazyGoalGEPAError):
    """Raised when an adapter run configuration is incomplete or unsupported."""


class DatasetValidationError(LazyGoalGEPAError):
    """Raised before evaluation when a batch or Manifest violates its contract."""


class GEPACompatibilityError(LazyGoalGEPAError):
    """Raised before evaluation when the supported GEPA contract is unavailable."""
