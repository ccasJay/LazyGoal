"""Public API for the LazyGoal adapter built on the official GEPA package."""

from .compatibility import EXPECTED_GEPA_VERSION, ensure_gepa_compatibility
from .adapter import (
    LazyGoalEvaluationOutput,
    LazyGoalEvaluationTrajectory,
    LazyGoalGEPAAdapter,
)
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
    ReflectiveDatasetError,
)
from .controller import (
    ConfirmationRequiredError,
    LifecycleController,
    ProfileDriftError,
    ReportNotReadyError,
    launch_detached_worker,
)
from .invocation import InvocationContext, InvocationDirectoryManager
from .models import (
    BenchmarkId,
    LazyGoalEvaluationExample,
    LazyGoalGEPAConfig,
    resolve_lazygoal_executable,
)
from .reporter import generate_and_save_run_report, read_run_report
from .worker import (
    ReflectionExecutionError,
    ReflectionLMClient,
    WorkerProgressCallback,
    run_gepa_worker,
)

__all__ = [
    "BenchmarkId",
    "CandidateCodec",
    "CandidateValidationError",
    "ConfigurationError",
    "ConfirmationRequiredError",
    "DatasetValidationError",
    "DatasetValidator",
    "EXPECTED_GEPA_VERSION",
    "GEPACompatibilityError",
    "InvocationContext",
    "InvocationDirectoryManager",
    "LazyGoalEvaluationExample",
    "LazyGoalEvaluationRecord",
    "LazyGoalEvaluationOutput",
    "LazyGoalEvaluationTrajectory",
    "LazyGoalGEPAAdapter",
    "LazyGoalGEPAConfig",
    "LazyGoalGEPAError",
    "LazyGoalPrompt",
    "LifecycleController",
    "ProfileDriftError",
    "PromptEvaluationCancelled",
    "PromptEvaluationClient",
    "PromptEvaluationInfrastructureError",
    "PromptEvaluationProtocolError",
    "ReflectiveDatasetError",
    "ReportNotReadyError",
    "ReflectionExecutionError",
    "ReflectionLMClient",
    "WorkerProgressCallback",
    "ensure_gepa_compatibility",
    "generate_and_save_run_report",
    "launch_detached_worker",
    "read_run_report",
    "resolve_lazygoal_executable",
    "run_gepa_worker",
]
