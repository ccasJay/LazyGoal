"""Classified adapter failures exposed to GEPA callers."""


class LazyGoalGEPAError(RuntimeError):
    """Base class for unrecoverable LazyGoal GEPA adapter failures."""


class GEPACompatibilityError(LazyGoalGEPAError):
    """Raised before evaluation when the supported GEPA contract is unavailable."""

