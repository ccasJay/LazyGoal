"""Atomic persistent store for GEPA run lifecycle directories and state."""

from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypeAlias

from .candidate import (
    FrozenRunManifest,
    parse_frozen_run_manifest,
    read_frozen_run_manifest,
)
from .errors import RunStoreError

LifecycleStatus: TypeAlias = Literal[
    "starting",
    "running",
    "stop_requested",
    "stopped",
    "succeeded",
    "publish_blocked",
    "failed",
]

PublicationStatus: TypeAlias = Literal[
    "pending",
    "published",
    "unchanged",
    "candidate_only",
    "blocked",
    "failed",
]

VALID_LIFECYCLE_STATUSES: frozenset[str] = frozenset(
    (
        "starting",
        "running",
        "stop_requested",
        "stopped",
        "succeeded",
        "publish_blocked",
        "failed",
    )
)

TERMINAL_LIFECYCLE_STATUSES: frozenset[str] = frozenset(
    (
        "stopped",
        "succeeded",
        "publish_blocked",
        "failed",
    )
)

VALID_PUBLICATION_STATUSES: frozenset[str] = frozenset(
    ("pending", "published", "unchanged", "candidate_only", "blocked", "failed")
)

_RUN_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+\Z")


@dataclass(frozen=True)
class RunState:
    """Atomic mutable projection of the GEPA run lifecycle state."""

    run_id: str
    lifecycle_status: LifecycleStatus
    stop_requested: bool
    metric_calls: int
    max_metric_calls: int
    candidate_count: int
    best_score: float | None
    best_candidate_id: str | None
    publication_status: PublicationStatus
    error_code: str | None
    error_message: str | None
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "lifecycleStatus": self.lifecycle_status,
            "stopRequested": self.stop_requested,
            "metricCalls": self.metric_calls,
            "maxMetricCalls": self.max_metric_calls,
            "candidateCount": self.candidate_count,
            "bestScore": self.best_score,
            "bestCandidateId": self.best_candidate_id,
            "publicationStatus": self.publication_status,
            "errorCode": self.error_code,
            "errorMessage": self.error_message,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


def parse_run_state(data: Any) -> RunState:
    """Parse and validate run state dictionary."""

    if not isinstance(data, dict) or not all(isinstance(k, str) for k in data):
        raise RunStoreError("Run state must be an object", code="corrupted")

    required_keys = {
        "runId",
        "lifecycleStatus",
        "stopRequested",
        "metricCalls",
        "maxMetricCalls",
        "candidateCount",
        "bestScore",
        "bestCandidateId",
        "publicationStatus",
        "errorCode",
        "errorMessage",
        "createdAt",
        "updatedAt",
    }
    actual_keys = set(data)
    missing = required_keys - actual_keys
    if missing:
        raise RunStoreError(
            f"Run state missing required fields: {', '.join(sorted(missing))}",
            code="corrupted",
        )

    lifecycle_status = data["lifecycleStatus"]
    if lifecycle_status not in VALID_LIFECYCLE_STATUSES:
        raise RunStoreError(
            f"Invalid lifecycle status: {lifecycle_status!r}",
            code="corrupted",
        )

    publication_status = data["publicationStatus"]
    if publication_status not in VALID_PUBLICATION_STATUSES:
        raise RunStoreError(
            f"Invalid publication status: {publication_status!r}",
            code="corrupted",
        )

    stop_requested = data["stopRequested"]
    if not isinstance(stop_requested, bool):
        raise RunStoreError("stopRequested must be a boolean", code="corrupted")

    metric_calls = data["metricCalls"]
    if not isinstance(metric_calls, int) or isinstance(metric_calls, bool):
        raise RunStoreError("metricCalls must be an integer", code="corrupted")

    max_metric_calls = data["maxMetricCalls"]
    if not isinstance(max_metric_calls, int) or isinstance(max_metric_calls, bool):
        raise RunStoreError("maxMetricCalls must be an integer", code="corrupted")

    candidate_count = data["candidateCount"]
    if not isinstance(candidate_count, int) or isinstance(candidate_count, bool):
        raise RunStoreError("candidateCount must be an integer", code="corrupted")

    best_score = data["bestScore"]
    if best_score is not None and not isinstance(best_score, (int, float)):
        raise RunStoreError("bestScore must be a number or null", code="corrupted")

    best_candidate_id = data["bestCandidateId"]
    if best_candidate_id is not None and not isinstance(best_candidate_id, str):
        raise RunStoreError("bestCandidateId must be a string or null", code="corrupted")

    return RunState(
        run_id=data["runId"],
        lifecycle_status=lifecycle_status,
        stop_requested=stop_requested,
        metric_calls=metric_calls,
        max_metric_calls=max_metric_calls,
        candidate_count=candidate_count,
        best_score=float(best_score) if best_score is not None else None,
        best_candidate_id=best_candidate_id,
        publication_status=publication_status,
        error_code=data["errorCode"],
        error_message=data["errorMessage"],
        created_at=data["createdAt"],
        updated_at=data["updatedAt"],
    )


def atomic_write_json(target_path: Path, data: Any) -> None:
    """Atomically write data to target_path using same-directory temp file and replace."""

    target = Path(target_path).resolve()
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(target.parent, 0o700)
    except OSError:
        pass
    temp_path = target.parent / f".{target.name}.tmp.{os.getpid()}.{uuid.uuid4().hex}"
    content = json.dumps(data, indent=2, ensure_ascii=False)

    try:
        with open(temp_path, "w", encoding="utf-8") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temp_path, target)
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


class RunStore:
    """Persistent storage manager for a GEPA run directory hierarchy."""

    def __init__(self, runs_dir: Path | str) -> None:
        self.runs_dir = Path(runs_dir).resolve()

    def get_run_dir(self, run_id: str) -> Path:
        """Validate run_id and return absolute path to run directory."""

        if not isinstance(run_id, str) or not _RUN_ID_PATTERN.match(run_id):
            raise RunStoreError(f"Invalid run ID format: {run_id!r}")
        return self.runs_dir / run_id

    def initialize_run(self, manifest: FrozenRunManifest) -> Path:
        """Initialize the full directory hierarchy and write initial authoritative files."""

        run_dir = self.get_run_dir(manifest.run_id)
        if run_dir.exists() and (run_dir / "run.json").exists():
            raise RunStoreError(f"Run directory already initialized: {run_dir}")

        gepa_dir = run_dir / "gepa"
        adapter_dir = run_dir / "adapter"
        reflection_dir = run_dir / "reflection"
        artifacts_dir = run_dir / "artifacts"

        for directory in (run_dir, gepa_dir, adapter_dir, reflection_dir, artifacts_dir):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                os.chmod(directory, 0o700)
            except OSError:
                pass

        # 1. Immutable manifest
        atomic_write_json(run_dir / "run.json", manifest.to_dict())

        # 2. Canonical request
        atomic_write_json(run_dir / "request.json", manifest.request.to_dict())

        # 3. Base profile artifact
        atomic_write_json(
            artifacts_dir / "base-profile.json",
            manifest.target_profile.profile.to_dict(),
        )

        # 4. Initial state
        initial_state = RunState(
            run_id=manifest.run_id,
            lifecycle_status="starting",
            stop_requested=False,
            metric_calls=0,
            max_metric_calls=manifest.request.max_metric_calls,
            candidate_count=1,
            best_score=None,
            best_candidate_id=None,
            publication_status=(
                "candidate_only"
                if manifest.request.publication_policy == "candidate-only"
                else "pending"
            ),
            error_code=None,
            error_message=None,
            created_at=manifest.created_at,
            updated_at=manifest.created_at,
        )
        atomic_write_json(run_dir / "state.json", initial_state.to_dict())

        return run_dir

    def read_manifest(self, run_id: str) -> FrozenRunManifest:
        """Read and validate the frozen manifest of a run."""

        run_dir = self.get_run_dir(run_id)
        manifest_path = run_dir / "run.json"
        if not manifest_path.is_file():
            raise RunStoreError(f"run.json not found for run {run_id!r}", code="unformed")
        try:
            return read_frozen_run_manifest(manifest_path)
        except RunStoreError:
            raise
        except Exception as error:
            raise RunStoreError(f"run.json is corrupted: {error}", code="corrupted") from error

    def read_state(self, run_id: str) -> RunState:
        """Read and parse the authoritative state.json for a run."""

        run_dir = self.get_run_dir(run_id)
        state_path = run_dir / "state.json"
        if not state_path.is_file():
            raise RunStoreError(f"state.json not found for run {run_id!r}", code="unformed")

        try:
            content = state_path.read_text(encoding="utf-8")
            data = json.loads(content)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RunStoreError(
                f"state.json is corrupted for run {run_id!r}: {error}",
                code="corrupted",
            ) from error

        return parse_run_state(data)

    def update_state(self, run_id: str, **updates: Any) -> RunState:
        """Atomically update specific fields of state.json and refresh updatedAt."""

        current = self.read_state(run_id)
        run_dir = self.get_run_dir(run_id)

        target_lifecycle_status = updates.get("lifecycle_status", current.lifecycle_status)
        if current.lifecycle_status in TERMINAL_LIFECYCLE_STATUSES:
            is_valid_resume = (
                current.lifecycle_status == "stopped" and target_lifecycle_status == "starting"
            )
            if not is_valid_resume and target_lifecycle_status not in TERMINAL_LIFECYCLE_STATUSES:
                target_lifecycle_status = current.lifecycle_status

        new_values = {
            "run_id": current.run_id,
            "lifecycle_status": target_lifecycle_status,
            "stop_requested": updates.get("stop_requested", current.stop_requested),
            "metric_calls": updates.get("metric_calls", current.metric_calls),
            "max_metric_calls": updates.get("max_metric_calls", current.max_metric_calls),
            "candidate_count": updates.get("candidate_count", current.candidate_count),
            "best_score": updates.get("best_score", current.best_score),
            "best_candidate_id": updates.get("best_candidate_id", current.best_candidate_id),
            "publication_status": updates.get("publication_status", current.publication_status),
            "error_code": updates.get("error_code", current.error_code),
            "error_message": updates.get("error_message", current.error_message),
            "created_at": current.created_at,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        updated_state = RunState(**new_values)
        atomic_write_json(run_dir / "state.json", updated_state.to_dict())
        return updated_state

    def get_stop_file_path(self, run_id: str) -> Path:
        """Return the official cooperative stop file path."""

        return self.get_run_dir(run_id) / "gepa" / "gepa.stop"

    def has_stop_request(self, run_id: str) -> bool:
        """Check whether gepa.stop exists."""

        return self.get_stop_file_path(run_id).is_file()

    def request_stop(self, run_id: str) -> None:
        """Create gepa.stop and set stop_requested=True in state.json."""

        stop_path = self.get_stop_file_path(run_id)
        stop_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            os.chmod(stop_path.parent, 0o700)
        except OSError:
            pass
        stop_path.touch(exist_ok=True)
        try:
            current = self.read_state(run_id)
            if current.lifecycle_status in TERMINAL_LIFECYCLE_STATUSES:
                return
            self.update_state(run_id, stop_requested=True, lifecycle_status="stop_requested")
        except RunStoreError:
            pass

    def clear_stop_request(self, run_id: str) -> None:
        """Remove gepa.stop if present."""

        stop_path = self.get_stop_file_path(run_id)
        if stop_path.exists():
            try:
                stop_path.unlink()
            except OSError:
                pass
