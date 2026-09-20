"""Preflight checks for the exact official GEPA contract used by the adapter."""

from __future__ import annotations

from dataclasses import fields, is_dataclass
from importlib import import_module
from importlib.metadata import PackageNotFoundError, version
from inspect import signature
from types import ModuleType
from typing import Any

from .errors import GEPACompatibilityError

EXPECTED_GEPA_VERSION = "0.1.4"

_EXPECTED_ADAPTER_METHODS = {
    "evaluate": ("self", "batch", "candidate", "capture_traces"),
    "make_reflective_dataset": (
        "self",
        "candidate",
        "eval_batch",
        "components_to_update",
    ),
}
_EXPECTED_BATCH_FIELDS = (
    "outputs",
    "scores",
    "trajectories",
    "objective_scores",
    "num_metric_calls",
)


def ensure_gepa_compatibility() -> None:
    """Validate the pinned GEPA version and public adapter surface.

    The check has no LazyGoal side effects and must run before an evaluation
    subprocess is started. A failure identifies the missing or incompatible
    public contract instead of attempting a compatibility fallback.
    """

    try:
        installed_version = version("gepa")
    except PackageNotFoundError as error:
        raise GEPACompatibilityError(
            f"Official GEPA {EXPECTED_GEPA_VERSION} is required but is not installed"
        ) from error

    if installed_version != EXPECTED_GEPA_VERSION:
        raise GEPACompatibilityError(
            "Unsupported GEPA version: "
            f"expected {EXPECTED_GEPA_VERSION}, found {installed_version}"
        )

    try:
        root_module = import_module("gepa")
        adapter_module = import_module("gepa.core.adapter")
    except (ImportError, ModuleNotFoundError) as error:
        raise GEPACompatibilityError(
            "GEPA public adapter modules could not be imported"
        ) from error

    _require_callable(root_module, "optimize")
    adapter_type = _require_symbol(adapter_module, "GEPAAdapter")
    batch_type = _require_symbol(adapter_module, "EvaluationBatch")

    for method_name, expected_parameters in _EXPECTED_ADAPTER_METHODS.items():
        method = getattr(adapter_type, method_name, None)
        if method is None or not callable(method):
            raise GEPACompatibilityError(
                f"GEPAAdapter.{method_name} is unavailable"
            )
        actual_parameters = tuple(signature(method).parameters)
        if actual_parameters != expected_parameters:
            raise GEPACompatibilityError(
                f"GEPAAdapter.{method_name} has incompatible parameters: "
                f"expected {expected_parameters}, found {actual_parameters}"
            )

    if not is_dataclass(batch_type):
        raise GEPACompatibilityError("EvaluationBatch is not a dataclass")
    actual_fields = tuple(field.name for field in fields(batch_type))
    if actual_fields != _EXPECTED_BATCH_FIELDS:
        raise GEPACompatibilityError(
            "EvaluationBatch has incompatible fields: "
            f"expected {_EXPECTED_BATCH_FIELDS}, found {actual_fields}"
        )


def _require_callable(module: ModuleType, name: str) -> Any:
    value = _require_symbol(module, name)
    if not callable(value):
        raise GEPACompatibilityError(f"GEPA public symbol {name} is not callable")
    return value


def _require_symbol(module: ModuleType, name: str) -> Any:
    try:
        return getattr(module, name)
    except AttributeError as error:
        raise GEPACompatibilityError(
            f"GEPA public symbol {name} is unavailable"
        ) from error

