"""Deterministic, read-only status and completion report generator for GEPA runs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .candidate import FrozenRunManifest, load_agent_profile
from .errors import LazyGoalGEPAError, RunStoreError
from .store import RunState, RunStore, atomic_write_json


class ReportNotReadyError(LazyGoalGEPAError):
    """Raised when a run report is requested before the run reaches a terminal state."""


_TERMINAL_STATUSES = frozenset({"stopped", "succeeded", "publish_blocked", "failed"})


def _sanitize_string(val: str) -> str:
    """Strip or redact known sensitive markers if present in message strings."""
    # Redact common credential patterns if any
    for pattern in ("sk-", "Bearer ", "Authorization:"):
        if pattern in val:
            val = val.replace(pattern, "[REDACTED]")
    return val


def generate_and_save_run_report(
    run_dir: Path | str,
    *,
    completed_at: str | None = None,
) -> dict[str, Any]:
    """Generate the authoritative final report and write it atomically to artifacts/report.json.

    Must only be called once the run has transitioned to a terminal lifecycle status.
    """
    resolved_run_dir = Path(run_dir).resolve()
    store = RunStore(resolved_run_dir.parent)
    run_id = resolved_run_dir.name

    manifest = store.read_manifest(run_id)
    state = store.read_state(run_id)

    if state.lifecycle_status not in _TERMINAL_STATUSES:
        raise ReportNotReadyError(
            f"Cannot generate report for run {run_id!r} in non-terminal status "
            f"{state.lifecycle_status!r}"
        )

    artifacts_dir = resolved_run_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    report_path = artifacts_dir / "report.json"
    base_profile_path = artifacts_dir / "base-profile.json"
    best_profile_path = artifacts_dir / "best-profile.json"
    official_state_path = resolved_run_dir / "gepa" / "gepa_state.bin"
    worker_log_path = resolved_run_dir / "worker.log"

    final_completed_at = completed_at or datetime.now(timezone.utc).isoformat()

    # Calculate duration if possible
    duration_seconds: float = 0.0
    try:
        start_dt = datetime.fromisoformat(manifest.created_at)
        end_dt = datetime.fromisoformat(final_completed_at)
        duration_seconds = max(0.0, (end_dt - start_dt).total_seconds())
    except Exception:
        pass

    # Safe error object
    error_obj: dict[str, Any] | None = None
    if state.error_code is not None:
        error_obj = {
            "code": state.error_code,
            "message": _sanitize_string(state.error_message or ""),
        }

    seed_score = 0.0
    best_score = state.best_score if state.best_score is not None else 0.0
    score_gain = best_score - seed_score

    train_count = len(manifest.request.trainset)
    val_count = (
        len(manifest.request.valset)
        if manifest.request.valset is not None
        else train_count
    )

    report_data: dict[str, Any] = {
        "protocol": "gepa-run@1",
        "runId": manifest.run_id,
        "terminalStatus": state.lifecycle_status,
        "benchmark": manifest.request.benchmark,
        "dataset": {
            "benchmark": manifest.request.benchmark,
            "trainCount": train_count,
            "validationCount": val_count,
        },
        "datasetSummary": {
            "train": train_count,
            "validation": val_count,
        },
        "models": {
            "working": {
                "profileName": manifest.working_model.profile_name,
                "modelId": manifest.working_model.model_id,
            },
            "reflection": {
                "profileName": manifest.reflection_model.profile_name,
                "modelId": manifest.reflection_model.model_id,
            },
        },
        "targetProfile": {
            "profileId": manifest.target_profile.profile_id,
            "profilePath": manifest.target_profile.profile_path,
            "frozenDigest": manifest.target_profile.frozen_digest,
        },
        "budget": {
            "maxMetricCalls": state.max_metric_calls,
            "consumedMetricCalls": state.metric_calls,
        },
        "metrics": {
            "metricCalls": state.metric_calls,
            "maxMetricCalls": state.max_metric_calls,
            "candidateCount": state.candidate_count,
            "bestScore": state.best_score,
            "bestCandidateId": state.best_candidate_id,
            "initialScore": seed_score,
        },
        "candidates": {
            "totalCandidates": state.candidate_count,
            "count": state.candidate_count,
            "bestCandidateId": state.best_candidate_id,
            "seedCandidateId": manifest.seed_candidate_id,
            "bestScore": state.best_score,
        },
        "scores": {
            "seedScore": seed_score,
            "bestScore": best_score,
            "scoreGain": score_gain,
        },
        "artifacts": {
            "baseProfilePath": str(base_profile_path),
            "bestProfilePath": str(best_profile_path) if best_profile_path.is_file() else None,
            "officialStatePath": str(official_state_path) if official_state_path.is_file() else None,
            "gepaRunDir": str(resolved_run_dir / "gepa"),
            "reportPath": str(report_path),
            "workerLogPath": str(worker_log_path),
        },
        "publication": {
            "status": state.publication_status,
            "targetPath": manifest.target_profile.profile_path,
            "updatedAt": state.updated_at,
        },
        "error": error_obj,
        "timestamps": {
            "createdAt": manifest.created_at,
            "startedAt": manifest.created_at,
            "updatedAt": state.updated_at,
            "completedAt": final_completed_at,
            "durationSeconds": duration_seconds,
        },
    }

    atomic_write_json(report_path, report_data)
    return report_data


def read_run_report(run_dir: Path | str) -> dict[str, Any]:
    """Read authoritative report artifact strictly read-only."""
    resolved_run_dir = Path(run_dir).resolve()
    if not resolved_run_dir.exists():
        raise RunStoreError(f"Run directory not found: {resolved_run_dir}", code="unformed")

    report_file = resolved_run_dir / "artifacts" / "report.json"
    store = RunStore(resolved_run_dir.parent)
    run_id = resolved_run_dir.name

    if not report_file.is_file():
        state = store.read_state(run_id)
        if state.lifecycle_status not in _TERMINAL_STATUSES:
            raise ReportNotReadyError(
                f"Report has not been formed yet for run {run_id!r} "
                f"(current lifecycle status: {state.lifecycle_status!r})"
            )
        raise RunStoreError(
            f"Report artifact report.json missing for terminal run {run_id!r}",
            code="corrupted",
        )

    try:
        content = report_file.read_text(encoding="utf-8")
        data = json.loads(content)
        if not isinstance(data, dict):
            raise RunStoreError("Report must be a JSON object", code="corrupted")
        return data
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
        raise RunStoreError(
            f"Report file is corrupted for run {run_id!r}: {error}",
            code="corrupted",
        ) from error
