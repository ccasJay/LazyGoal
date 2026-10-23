"""Standalone Harness2 framework and prompt optimizer for LazyGoal."""

from .exporter import ExportedArtifacts, apply_run_exports, export_best_candidate
from .library import ImprovementEntry, ImprovementLibrary
from .loop import Harness2Controller, ProposeProbeComposeEngine
from .models import (
    CandidateEvaluationSummary,
    Harness2Candidate,
    Harness2RunRequest,
    Harness2StatusReport,
    TaskTrajectoryComparison,
)
from .trajectory_reader import (
    build_contrastive_trajectory_view,
    load_evaluation_trajectories,
    redact_secrets,
)
from .workspace import (
    MUTABLE_TEMPLATE_SOURCE_PATHS,
    HarnessWorkspace,
    compute_candidate_id,
)

__all__ = [
    "CandidateEvaluationSummary",
    "ExportedArtifacts",
    "Harness2Candidate",
    "Harness2Controller",
    "Harness2RunRequest",
    "Harness2StatusReport",
    "HarnessWorkspace",
    "ImprovementEntry",
    "ImprovementLibrary",
    "MUTABLE_TEMPLATE_SOURCE_PATHS",
    "ProposeProbeComposeEngine",
    "TaskTrajectoryComparison",
    "apply_run_exports",
    "build_contrastive_trajectory_view",
    "compute_candidate_id",
    "export_best_candidate",
    "load_evaluation_trajectories",
    "redact_secrets",
]
