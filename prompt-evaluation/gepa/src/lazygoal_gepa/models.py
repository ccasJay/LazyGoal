"""Configuration and sample identities accepted by the GEPA adapter."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, TypeAlias

from .errors import ConfigurationError, DatasetValidationError

BenchmarkId: TypeAlias = Literal["alfworld", "gaia"]

SUPPORTED_BENCHMARKS = frozenset(("alfworld", "gaia"))


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
        if self.benchmark_id not in SUPPORTED_BENCHMARKS:
            raise ConfigurationError(
                f"Unsupported benchmark ID: {self.benchmark_id!r}"
            )
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
        if self.benchmark_id not in SUPPORTED_BENCHMARKS:
            raise DatasetValidationError(
                f"Unsupported sample benchmark ID: {self.benchmark_id!r}"
            )
        _require_path(self.manifest_path, "manifest_path", DatasetValidationError)


def _require_path(
    value: object,
    field_name: str,
    error_type: type[ConfigurationError] | type[DatasetValidationError],
) -> None:
    if not isinstance(value, Path) or not str(value):
        raise error_type(f"{field_name} must be a non-empty pathlib.Path")

