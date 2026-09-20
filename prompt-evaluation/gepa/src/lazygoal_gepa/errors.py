"""Classified adapter failures exposed to GEPA callers."""


class LazyGoalGEPAError(RuntimeError):
    """Base class for unrecoverable LazyGoal GEPA adapter failures."""


class ConfigurationError(LazyGoalGEPAError):
    """Raised when an adapter run configuration is incomplete or unsupported."""


class DatasetValidationError(LazyGoalGEPAError):
    """Raised before evaluation when a batch or Manifest violates its contract."""


class CandidateValidationError(LazyGoalGEPAError):
    """Raised before request creation when GEPA candidate components are invalid."""


class GEPACompatibilityError(LazyGoalGEPAError):
    """Raised before evaluation when the supported GEPA contract is unavailable."""


class PromptEvaluationProtocolError(LazyGoalGEPAError):
    """Raised when CLI events or the authoritative result violate the wire contract."""


class PromptEvaluationInfrastructureError(LazyGoalGEPAError):
    """Raised when LazyGoal cannot complete an evaluation for systemic reasons."""


class PromptEvaluationCancelled(LazyGoalGEPAError):
    """Raised when the current LazyGoal evaluation is cancelled."""


class ReflectiveDatasetError(LazyGoalGEPAError):
    """Raised when evaluation evidence cannot form a reflective dataset."""
