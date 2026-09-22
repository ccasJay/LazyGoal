"""Configuration and sample identities accepted by the GEPA adapter."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import TypeAlias

from .errors import ConfigurationError, DatasetValidationError

BenchmarkId: TypeAlias = str


@dataclass(frozen=True)
class LazyGoalGEPAConfig:
    """Immutable run configuration without provider credentials."""

    benchmark_id: BenchmarkId
    base_profile_id: str
    model_config_id: str
    model_id: str
    output_directory: Path
    lazygoal_executable: Path

    def __post_init__(self) -> None:
        if not isinstance(self.benchmark_id, str) or not self.benchmark_id.strip():
            raise ConfigurationError("benchmark_id must be a non-empty string")
        for field_name in ("base_profile_id", "model_config_id", "model_id"):
            value = getattr(self, field_name)
            if not isinstance(value, str) or not value.strip():
                raise ConfigurationError(f"{field_name} must be a non-empty string")
        _require_path(self.output_directory, "output_directory", ConfigurationError)
        _require_path(self.lazygoal_executable, "lazygoal_executable", ConfigurationError)


@dataclass(frozen=True)
class LazyGoalEvaluationExample:
    """One GEPA sample bound to one benchmark task Manifest."""

    sample_id: str
    benchmark_id: BenchmarkId
    task_id: str
    manifest_path: Path

    def __post_init__(self) -> None:
        for field_name in ("sample_id", "task_id"):
            value = getattr(self, field_name)
            if not isinstance(value, str) or not value.strip():
                raise DatasetValidationError(
                    f"{field_name} must be a non-empty string"
                )
        if not isinstance(self.benchmark_id, str) or not self.benchmark_id.strip():
            raise DatasetValidationError("benchmark_id must be a non-empty string")
        _require_path(self.manifest_path, "manifest_path", DatasetValidationError)


def _require_path(
    value: object,
    field_name: str,
    error_type: type[ConfigurationError] | type[DatasetValidationError],
) -> None:
    if not isinstance(value, Path) or not str(value):
        raise error_type(f"{field_name} must be a non-empty pathlib.Path")


def resolve_lazygoal_executable(workspace_root: Path | str) -> Path:
    """Resolve the canonical LazyGoal executable without credential exposure."""
    override = os.environ.get("LAZYGOAL_EXECUTABLE")
    if override:
        return Path(override).resolve()
    workspace = Path(workspace_root).resolve()
    candidates = (
        workspace / "bin" / "lazygoal.cjs",
        Path(__file__).resolve().parents[4] / "bin" / "lazygoal.cjs",
    )
    for executable in candidates:
        if executable.is_file():
            return executable.resolve()
    raise ConfigurationError(
        "LazyGoal executable does not exist; set LAZYGOAL_EXECUTABLE or run from a source checkout"
    )
