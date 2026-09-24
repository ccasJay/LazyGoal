"""Deterministic, read-only status and completion report generator for GEPA runs."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .candidate import FrozenRunManifest
from .errors import LazyGoalGEPAError, RunStoreError
from .ownership import RunOwnership
from .store import RunState, RunStore, atomic_write_json


class ReportNotReadyError(LazyGoalGEPAError):
    """Raised when a run report is requested before the run reaches a terminal state."""


_TERMINAL_STATUSES = frozenset({"stopped", "succeeded", "publish_blocked", "failed"})
_PUBLICATION_STATUSES = frozenset(
    {"pending", "published", "unchanged", "candidate_only", "blocked", "failed"}
)
_REDACTED = "[REDACTED]"
_MAX_DIAGNOSTIC_CHARS = 4_096
_CANDIDATE_ID = re.compile(r"[0-9a-f]{64}\Z")
_AUDIT_COMPONENT = re.compile(r"(?:system_prompt|instruction_[0-9]{3})\Z")
_AUDIT_MATCH_KINDS = frozenset(
    {"task_id", "private_filename", "expected_answer", "verifier_content"}
)

# These patterns intentionally consume the complete credential value.  Replacing only
# the marker (for example, ``sk-``) leaves the token suffix in the persisted report.
_AUTHORIZATION_RE = re.compile(
    r"(?i)\bauthorization\s*:\s*(?:bearer\s+)?[^\s,;]+"
)
_BEARER_RE = re.compile(r"(?i)\bbearer\s+[^\s,;]+")
_PROVIDER_TOKEN_RE = re.compile(r"(?i)\b(?:sk|rk|pk)-[A-Za-z0-9][A-Za-z0-9._-]*")
_CREDENTIAL_ASSIGNMENT_RE = re.compile(
    r"(?i)\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret(?:[_-]?key)?|password|token)"
    r"\s*[:=]\s*[^\s,;]+"
)


def _sanitize_string(val: str) -> str:
    """Remove complete credential values from a diagnostic string."""

    sanitized = _AUTHORIZATION_RE.sub(f"Authorization: {_REDACTED}", val)
    sanitized = _BEARER_RE.sub(f"Bearer {_REDACTED}", sanitized)
    sanitized = _PROVIDER_TOKEN_RE.sub(_REDACTED, sanitized)
    sanitized = _CREDENTIAL_ASSIGNMENT_RE.sub(_REDACTED, sanitized)
    if len(sanitized) <= _MAX_DIAGNOSTIC_CHARS:
        return sanitized
    return f"{sanitized[:_MAX_DIAGNOSTIC_CHARS - 1]}…"


def _contains_unsanitized_secret(val: str) -> bool:
    """Return whether a string still contains a recognizable credential value."""

    if _PROVIDER_TOKEN_RE.search(val):
        return True
    for pattern in (_AUTHORIZATION_RE, _BEARER_RE, _CREDENTIAL_ASSIGNMENT_RE):
        for match in pattern.finditer(val):
            if _REDACTED not in match.group(0):
                return True
    return False


def _assert_no_sensitive_material(value: Any) -> None:
    """Reject unsanitized credentials anywhere in a persisted report value."""

    if isinstance(value, str):
        if _contains_unsanitized_secret(value):
            raise _schema_error("report contains sensitive material")
        return
    if isinstance(value, dict):
        for nested in value.values():
            _assert_no_sensitive_material(nested)
        return
    if isinstance(value, list):
        for nested in value:
            _assert_no_sensitive_material(nested)


def _schema_error(detail: str) -> RunStoreError:
    """Build a non-sensitive report schema error."""

    return RunStoreError(f"Report schema is invalid: {detail}", code="corrupted")


def _request_dataset_counts(manifest: FrozenRunManifest) -> tuple[int, int]:
    if manifest.request.tua_dataset is not None:
        return (
            len(manifest.request.tua_dataset.train_task_ids),
            len(manifest.request.tua_dataset.validation_task_ids),
        )
    train_count = len(manifest.request.trainset)
    validation_count = (
        len(manifest.request.valset)
        if manifest.request.valset is not None
        else train_count
    )
    return train_count, validation_count


def _mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise _schema_error(f"{key!r} must be an object")
    return value


def _exact_keys(data: dict[str, Any], expected: set[str], path: str) -> None:
    actual = set(data)
    if actual != expected:
        missing = sorted(expected - actual)
        unknown = sorted(actual - expected)
        details: list[str] = []
        if missing:
            details.append(f"missing {', '.join(missing)}")
        if unknown:
            details.append(f"unknown {', '.join(unknown)}")
        raise _schema_error(f"{path} fields are invalid: {'; '.join(details)}")


def _string(data: dict[str, Any], path: str, *, allow_none: bool = False) -> str | None:
    value: Any = data
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            raise _schema_error(f"missing field {path!r}")
        value = value[part]
    if value is None and allow_none:
        return None
    if not isinstance(value, str) or not value.strip():
        raise _schema_error(f"{path!r} must be a non-empty string")
    return value


def _integer(data: dict[str, Any], path: str, *, allow_none: bool = False) -> int | None:
    value: Any = data
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            raise _schema_error(f"missing field {path!r}")
        value = value[part]
    if value is None and allow_none:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise _schema_error(f"{path!r} must be an integer")
    return value


def _number(data: dict[str, Any], path: str, *, allow_none: bool = False) -> float | None:
    value: Any = data
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            raise _schema_error(f"missing field {path!r}")
        value = value[part]
    if value is None and allow_none:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _schema_error(f"{path!r} must be a number")
    if not math.isfinite(float(value)):
        raise _schema_error(f"{path!r} must be finite")
    return float(value)


def _validate_report_schema(
    data: dict[str, Any],
    *,
    run_id: str,
    manifest: FrozenRunManifest,
    state: RunState,
) -> None:
    """Validate the current report contract and its state/manifest projection."""

    _exact_keys(
        data,
        {
            "protocol",
            "runId",
            "terminalStatus",
            "benchmark",
            "dataset",
            "datasetSummary",
            "models",
            "targetProfile",
            "budget",
            "metrics",
            "candidates",
            "scores",
            "candidateAudit",
            "artifacts",
            "publication",
            "complete",
            "error",
            "timestamps",
        },
        "report",
    )

    if data.get("protocol") != "gepa-run@1":
        raise _schema_error("unsupported protocol")
    if data.get("runId") != run_id or data.get("runId") != state.run_id:
        raise _schema_error("runId does not match the run directory")
    if data.get("terminalStatus") != state.lifecycle_status:
        raise _schema_error("terminalStatus does not match state.json")
    if state.lifecycle_status not in _TERMINAL_STATUSES:
        raise _schema_error("terminalStatus is not terminal")

    benchmark = _string(data, "benchmark")
    if benchmark != manifest.request.benchmark:
        raise _schema_error("benchmark does not match run.json")

    dataset = _mapping(data, "dataset")
    _exact_keys(dataset, {"benchmark", "trainCount", "validationCount"}, "dataset")
    if _string(dataset, "benchmark") != manifest.request.benchmark:
        raise _schema_error("dataset benchmark does not match run.json")
    expected_train, expected_validation = _request_dataset_counts(manifest)
    if _integer(dataset, "trainCount") != expected_train:
        raise _schema_error("dataset trainCount does not match run.json")
    if _integer(dataset, "validationCount") != expected_validation:
        raise _schema_error("dataset validationCount does not match run.json")

    summary = _mapping(data, "datasetSummary")
    _exact_keys(summary, {"train", "validation"}, "datasetSummary")
    if _integer(summary, "train") != expected_train or _integer(summary, "validation") != expected_validation:
        raise _schema_error("datasetSummary does not match run.json")

    models = _mapping(data, "models")
    _exact_keys(models, {"working", "reflection"}, "models")
    for role in ("working", "reflection"):
        model = _mapping(models, role)
        _exact_keys(model, {"profileName", "modelId", "provider"}, f"models.{role}")
        _string(model, "profileName")
        _string(model, "modelId")
        _string(model, "provider", allow_none=True)
    if models["working"]["profileName"] != manifest.working_model.profile_name:
        raise _schema_error("working model identity does not match run.json")
    if models["working"]["modelId"] != manifest.working_model.model_id:
        raise _schema_error("working model identity does not match run.json")
    if models["working"]["provider"] != manifest.working_model.provider:
        raise _schema_error("working model identity does not match run.json")
    if models["reflection"]["profileName"] != manifest.reflection_model.profile_name:
        raise _schema_error("reflection model identity does not match run.json")
    if models["reflection"]["modelId"] != manifest.reflection_model.model_id:
        raise _schema_error("reflection model identity does not match run.json")
    if models["reflection"]["provider"] != manifest.reflection_model.provider:
        raise _schema_error("reflection model identity does not match run.json")

    target = _mapping(data, "targetProfile")
    _exact_keys(target, {"profileId", "profilePath", "frozenDigest"}, "targetProfile")
    if _string(target, "profileId") != manifest.target_profile.profile_id:
        raise _schema_error("target profile identity does not match run.json")
    if _string(target, "profilePath") != manifest.target_profile.profile_path:
        raise _schema_error("target profile path does not match run.json")
    if _string(target, "frozenDigest") != manifest.target_profile.frozen_digest:
        raise _schema_error("target profile digest does not match run.json")

    budget = _mapping(data, "budget")
    _exact_keys(budget, {"maxMetricCalls", "consumedMetricCalls"}, "budget")
    if _integer(budget, "maxMetricCalls") != state.max_metric_calls:
        raise _schema_error("budget maxMetricCalls does not match state.json")
    if _integer(budget, "consumedMetricCalls") != state.metric_calls:
        raise _schema_error("budget consumedMetricCalls does not match state.json")

    metrics = _mapping(data, "metrics")
    _exact_keys(
        metrics,
        {"metricCalls", "maxMetricCalls", "candidateCount", "bestScore", "bestCandidateId"},
        "metrics",
    )
    if _integer(metrics, "metricCalls") != state.metric_calls:
        raise _schema_error("metrics metricCalls does not match state.json")
    if _integer(metrics, "maxMetricCalls") != state.max_metric_calls:
        raise _schema_error("metrics maxMetricCalls does not match state.json")
    if _integer(metrics, "candidateCount") != state.candidate_count:
        raise _schema_error("metrics candidateCount does not match state.json")
    if _number(metrics, "bestScore", allow_none=True) != state.best_score:
        raise _schema_error("metrics bestScore does not match state.json")
    if metrics.get("bestCandidateId") != state.best_candidate_id:
        raise _schema_error("metrics bestCandidateId does not match state.json")

    candidates = _mapping(data, "candidates")
    _exact_keys(
        candidates,
        {"totalCandidates", "count", "bestCandidateId", "seedCandidateId", "bestScore"},
        "candidates",
    )
    for key in ("totalCandidates", "count"):
        if _integer(candidates, key) != state.candidate_count:
            raise _schema_error(f"candidates {key} does not match state.json")
    if candidates.get("bestCandidateId") != state.best_candidate_id:
        raise _schema_error("candidates bestCandidateId does not match state.json")
    if candidates.get("seedCandidateId") != manifest.seed_candidate_id:
        raise _schema_error("candidates seedCandidateId does not match run.json")
    if _number(candidates, "bestScore", allow_none=True) != state.best_score:
        raise _schema_error("candidates bestScore does not match state.json")

    # No seed score is available in the authoritative state.  The report therefore
    # exposes only the actual best score and never fabricates a baseline or gain.
    scores = _mapping(data, "scores")
    _exact_keys(scores, {"bestScore"}, "scores")
    if _number(scores, "bestScore", allow_none=True) != state.best_score:
        raise _schema_error("scores bestScore does not match state.json")
    if "seedScore" in scores or "scoreGain" in scores or "initialScore" in scores:
        raise _schema_error("scores contains unsupported derived fields")

    candidate_audit = _mapping(data, "candidateAudit")
    _exact_keys(
        candidate_audit,
        {"status", "candidateId", "positiveConclusionBlocked", "findings"},
        "candidateAudit",
    )
    audit_status = _string(candidate_audit, "status")
    if audit_status not in {"not_applicable", "clear", "blocked", "missing"}:
        raise _schema_error("candidateAudit status is invalid")
    candidate_id = _string(candidate_audit, "candidateId", allow_none=True)
    if candidate_id is not None and not _CANDIDATE_ID.fullmatch(candidate_id):
        raise _schema_error("candidateAudit candidateId is invalid")
    if manifest.request.tua_dataset is not None and candidate_id != state.best_candidate_id:
        raise _schema_error("candidateAudit candidateId does not match state.json")
    blocked = candidate_audit.get("positiveConclusionBlocked")
    if not isinstance(blocked, bool):
        raise _schema_error("candidateAudit positiveConclusionBlocked must be boolean")
    findings = candidate_audit.get("findings")
    if not isinstance(findings, list):
        raise _schema_error("candidateAudit findings must be an array")
    allowed_task_ids = set()
    if manifest.request.tua_dataset is not None:
        allowed_task_ids.update(manifest.request.tua_dataset.train_task_ids)
        allowed_task_ids.update(manifest.request.tua_dataset.validation_task_ids)
    for finding in findings:
        if not isinstance(finding, dict):
            raise _schema_error("candidateAudit finding must be an object")
        _exact_keys(finding, {"taskId", "component", "matchKind"}, "candidateAudit finding")
        task_id = _string(finding, "taskId")
        component = _string(finding, "component")
        match_kind = _string(finding, "matchKind")
        if (
            task_id not in allowed_task_ids
            or not _AUDIT_COMPONENT.fullmatch(component)
            or match_kind not in _AUDIT_MATCH_KINDS
        ):
            raise _schema_error("candidateAudit finding is invalid")
    if manifest.request.tua_dataset is None:
        if audit_status != "not_applicable" or blocked or findings:
            raise _schema_error("candidateAudit must be not_applicable outside TUA runs")
    elif audit_status == "blocked":
        if not blocked or not findings:
            raise _schema_error("blocked candidateAudit must contain findings")
    elif audit_status == "clear":
        if blocked or findings or candidate_id is None:
            raise _schema_error("clear candidateAudit must identify an unblocked candidate")
    elif audit_status == "missing":
        if not blocked or findings:
            raise _schema_error("missing candidateAudit must block positive conclusions")

    artifacts = _mapping(data, "artifacts")
    _exact_keys(
        artifacts,
        {
            "baseProfilePath",
            "bestProfilePath",
            "officialStatePath",
            "gepaRunDir",
            "reportPath",
            "workerLogPath",
            "candidateAuditsPath",
        },
        "artifacts",
    )
    for key in ("baseProfilePath", "gepaRunDir", "reportPath", "workerLogPath"):
        _string(artifacts, key)
    for key in ("bestProfilePath", "officialStatePath", "candidateAuditsPath"):
        _string(artifacts, key, allow_none=True)

    publication = _mapping(data, "publication")
    _exact_keys(publication, {"status", "targetPath", "updatedAt"}, "publication")
    publication_status = _string(publication, "status")
    if publication_status not in _PUBLICATION_STATUSES or publication_status != state.publication_status:
        raise _schema_error("publication status does not match state.json")
    if _string(publication, "targetPath") != manifest.target_profile.profile_path:
        raise _schema_error("publication targetPath does not match run.json")
    _string(publication, "updatedAt")

    error = data.get("error")
    if error is not None:
        if not isinstance(error, dict):
            raise _schema_error("error must be an object or null")
        _exact_keys(error, {"code", "message"}, "error")
        _string(error, "code")
        message = error.get("message")
        if not isinstance(message, str):
            raise _schema_error("error.message must be a string")
        if _contains_unsanitized_secret(message):
            raise _schema_error("error message contains sensitive material")

    timestamps = _mapping(data, "timestamps")
    _exact_keys(
        timestamps,
        {"createdAt", "startedAt", "updatedAt", "completedAt", "durationSeconds"},
        "timestamps",
    )
    for key in ("createdAt", "startedAt", "updatedAt", "completedAt"):
        _string(timestamps, key)
    duration = _number(timestamps, "durationSeconds")
    if duration is None or duration < 0:
        raise _schema_error("timestamps durationSeconds must be non-negative")

    complete = state.lifecycle_status == "succeeded" and state.publication_status in {
        "published",
        "unchanged",
        "candidate_only",
    }
    if data.get("complete") is not complete:
        raise _schema_error("complete does not match optimization and publication state")
    _assert_no_sensitive_material(data)


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
            "code": _sanitize_string(state.error_code),
            "message": _sanitize_string(state.error_message or ""),
        }

    candidate_audit = _load_candidate_audit_summary(resolved_run_dir, manifest, state)

    train_count, val_count = _request_dataset_counts(manifest)

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
                "provider": manifest.working_model.provider,
            },
            "reflection": {
                "profileName": manifest.reflection_model.profile_name,
                "modelId": manifest.reflection_model.model_id,
                "provider": manifest.reflection_model.provider,
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
        },
        "candidates": {
            "totalCandidates": state.candidate_count,
            "count": state.candidate_count,
            "bestCandidateId": state.best_candidate_id,
            "seedCandidateId": manifest.seed_candidate_id,
            "bestScore": state.best_score,
        },
        "scores": {
            "bestScore": state.best_score,
        },
        "candidateAudit": candidate_audit,
        "artifacts": {
            "baseProfilePath": str(base_profile_path),
            "bestProfilePath": str(best_profile_path) if best_profile_path.is_file() else None,
            "officialStatePath": str(official_state_path) if official_state_path.is_file() else None,
            "gepaRunDir": str(resolved_run_dir / "gepa"),
            "reportPath": str(report_path),
            "workerLogPath": str(worker_log_path),
            "candidateAuditsPath": (
                str(resolved_run_dir / "candidate-audits")
                if manifest.request.tua_dataset is not None
                else None
            ),
        },
        "publication": {
            "status": state.publication_status,
            "targetPath": manifest.target_profile.profile_path,
            "updatedAt": state.updated_at,
        },
        # TUA candidate-only runs complete when the artifact is retained without publication.
        "complete": state.lifecycle_status == "succeeded"
        and state.publication_status in {"published", "unchanged", "candidate_only"},
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


def _load_candidate_audit_summary(
    run_dir: Path,
    manifest: FrozenRunManifest,
    state: RunState,
) -> dict[str, Any]:
    if manifest.request.tua_dataset is None:
        return {
            "status": "not_applicable",
            "candidateId": None,
            "positiveConclusionBlocked": False,
            "findings": [],
        }

    candidate_id = state.best_candidate_id
    missing = {
        "status": "missing",
        "candidateId": candidate_id,
        "positiveConclusionBlocked": True,
        "findings": [],
    }
    if candidate_id is None or not _CANDIDATE_ID.fullmatch(candidate_id):
        return missing

    audit_path = run_dir / "candidate-audits" / f"{candidate_id}.json"
    try:
        value: Any = json.loads(audit_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return missing
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _schema_error("candidate audit artifact could not be read") from error

    if not isinstance(value, dict) or set(value) != {
        "candidateId",
        "auditedTaskIds",
        "findings",
        "positiveConclusionBlocked",
    }:
        raise _schema_error("candidate audit artifact fields are invalid")
    task_ids = [
        *manifest.request.tua_dataset.train_task_ids,
        *manifest.request.tua_dataset.validation_task_ids,
    ]
    if value["candidateId"] != candidate_id or value["auditedTaskIds"] != task_ids:
        raise _schema_error("candidate audit artifact identity does not match the run")
    findings = value["findings"]
    if not isinstance(findings, list):
        raise _schema_error("candidate audit artifact findings are invalid")
    for finding in findings:
        if not isinstance(finding, dict) or set(finding) != {"taskId", "component", "matchKind"}:
            raise _schema_error("candidate audit artifact finding fields are invalid")
        task_id = finding["taskId"]
        component = finding["component"]
        match_kind = finding["matchKind"]
        if (
            task_id not in task_ids
            or not isinstance(component, str)
            or not _AUDIT_COMPONENT.fullmatch(component)
            or not isinstance(match_kind, str)
            or match_kind not in _AUDIT_MATCH_KINDS
        ):
            raise _schema_error("candidate audit artifact finding is invalid")
    blocked = bool(findings)
    if value["positiveConclusionBlocked"] is not blocked:
        raise _schema_error("candidate audit artifact conclusion flag is inconsistent")
    return {
        "status": "blocked" if blocked else "clear",
        "candidateId": candidate_id,
        "positiveConclusionBlocked": blocked,
        "findings": findings,
    }


def read_run_report(run_dir: Path | str) -> dict[str, Any]:
    """Read authoritative report artifact strictly read-only."""
    resolved_run_dir = Path(run_dir).resolve()
    if not resolved_run_dir.exists():
        raise RunStoreError(f"Run directory not found: {resolved_run_dir}", code="unformed")

    store = RunStore(resolved_run_dir.parent)
    run_id = resolved_run_dir.name
    state = store.read_state(run_id)

    if state.lifecycle_status not in _TERMINAL_STATUSES:
        health, owner = RunOwnership(resolved_run_dir).check_health()
        if health in {"lost", "stale", "corrupt"}:
            owner_hint = f" (worker PID {owner.pid})" if owner is not None else ""
            raise ReportNotReadyError(
                f"Report is not ready for run {run_id!r}: worker is {health}{owner_hint}; "
                "inspect status and recover only after verifying the run"
            )
        raise ReportNotReadyError(
            f"Report has not been formed yet for run {run_id!r} "
            f"(current lifecycle status: {state.lifecycle_status!r})"
        )

    manifest = store.read_manifest(run_id)
    report_file = resolved_run_dir / "artifacts" / "report.json"

    if not report_file.is_file():
        raise RunStoreError(
            f"Report artifact report.json missing for terminal run {run_id!r}",
            code="corrupted",
        )

    try:
        content = report_file.read_text(encoding="utf-8")
        data = json.loads(content)
        if not isinstance(data, dict) or not all(isinstance(key, str) for key in data):
            raise _schema_error("top-level value must be an object")
        _validate_report_schema(data, run_id=run_id, manifest=manifest, state=state)
        return data
    except RunStoreError:
        raise
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
        raise RunStoreError(
            f"Report file is corrupted for run {run_id!r}: {error.__class__.__name__}",
            code="corrupted",
        ) from error
