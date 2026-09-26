"""Deterministic, read-only status and completion report generator for GEPA runs."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .candidate import CandidateCodec, FrozenRunManifest, load_agent_profile
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
_FINAL_REASON_CODES = frozenset({
    "environment_not_configured",
    "no_tasks_configured",
    "manifest_unavailable",
    "manifest_invalid",
    "duplicate_manifest_task",
    "task_missing_from_manifest",
    "task_missing_from_frozen_inspection",
    "frozen_input_identity_missing",
    "tua_dataset_inspection_failed",
    "tua_dataset_identity_drift",
    "frozen_input_verification_failed",
    "frozen_input_drift",
    "trial_incomplete",
    "trial_infrastructure_error",
    "trial_cancelled",
})
_FINAL_ERROR_CODES = frozenset({
    "evaluation_cancelled",
    "evaluation_protocol_error",
    "evaluation_infrastructure_error",
})

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


def _read_review_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise _schema_error("TUA review artifact could not be read") from error


def _safe_run_path(run_dir: Path, value: Any) -> Path | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        resolved = Path(value).resolve()
        resolved.relative_to(run_dir.resolve())
    except (OSError, RuntimeError, ValueError):
        return None
    return resolved if resolved.is_file() else None


def _attempt_usage(
    run_dir: Path,
    result_path: Any,
    *,
    benchmark_id: str,
    task_id: str,
    candidate_id: str,
    model_config_id: str,
    model_id: str,
) -> tuple[dict[str, int] | None, str | None]:
    result_file = _safe_run_path(run_dir, result_path)
    if result_file is None:
        return None, None
    try:
        result = json.loads(result_file.read_text(encoding="utf-8"))
        tasks = result.get("tasks") if isinstance(result, dict) else None
        if (
            not isinstance(result, dict)
            or result.get("benchmarkId") != benchmark_id
            or result.get("candidateId") != candidate_id
            or result.get("modelConfigId") != model_config_id
            or result.get("modelId") != model_id
            or not isinstance(tasks, list)
            or len(tasks) != 1
            or not isinstance(tasks[0], dict)
            or tasks[0].get("taskId") != task_id
        ):
            return None, None
        attempt_file = _safe_run_path(run_dir, tasks[0].get("attemptPath"))
        if attempt_file is None:
            return None, None
        attempt = json.loads(attempt_file.read_text(encoding="utf-8"))
        usage = attempt.get("usage") if isinstance(attempt, dict) else None
        prompt_metadata = attempt.get("promptEvaluation") if isinstance(attempt, dict) else None
        if (
            not isinstance(attempt, dict)
            or attempt.get("benchmarkId") != benchmark_id
            or attempt.get("taskId") != task_id
            or not isinstance(prompt_metadata, dict)
            or prompt_metadata.get("candidateId") != candidate_id
            or prompt_metadata.get("modelConfigId") != model_config_id
            or prompt_metadata.get("modelId") != model_id
        ):
            return None, None
    except (OSError, UnicodeError, json.JSONDecodeError):
        return None, None
    if usage is None:
        return None, str(attempt_file)
    if not isinstance(usage, dict) or set(usage) != {"inputTokens", "outputTokens", "missingCalls"}:
        return None, str(attempt_file)
    if any(
        type(usage.get(key)) is not int or usage[key] < 0
        for key in ("inputTokens", "outputTokens", "missingCalls")
    ):
        return None, str(attempt_file)
    return dict(usage), str(attempt_file)


def _summary_stats(pairs: list[tuple[float, float]], planned_trials: int) -> dict[str, Any]:
    seed_values = [pair[0] for pair in pairs]
    candidate_values = [pair[1] for pair in pairs]

    def stats(values: list[float]) -> dict[str, Any]:
        if not values:
            return {"mean": None, "populationStdDev": None}
        mean = sum(values) / len(values)
        deviation = math.sqrt(sum((value - mean) ** 2 for value in values) / len(values))
        return {"mean": mean, "populationStdDev": deviation}

    seed = stats(seed_values)
    candidate = stats(candidate_values)
    return {
        "plannedPairedTrials": planned_trials,
        "effectivePairedTrials": len(pairs),
        "seed": seed,
        "candidate": candidate,
        "meanDelta": (
            candidate["mean"] - seed["mean"]
            if seed["mean"] is not None and candidate["mean"] is not None
            else None
        ),
    }


def _load_tua_review(
    run_dir: Path,
    manifest: FrozenRunManifest,
    state: RunState,
) -> dict[str, Any] | None:
    request = manifest.request
    dataset = request.tua_dataset
    if dataset is None:
        return None
    inspection = manifest.tua_dataset_inspection
    final_plan = request.final_comparison
    if inspection is None or final_plan is None:
        raise _schema_error("TUA report is missing frozen dataset or comparison plan")

    partitions = inspection["partitions"]
    audit = _load_candidate_audit_summary(run_dir, manifest, state)
    dataset_review = {
        "repoRoot": dataset.repo_root,
        "sourceRevision": inspection["sourceRevision"],
        "datasetDigest": inspection["datasetDigest"],
        "workingTreeDirty": inspection["workingTreeDirty"],
        "preflightInputDigest": manifest.preflight_input_digest,
        "partitions": {
            name: {
                "taskIds": list(partitions[name]["taskIds"]),
                "taskFamilies": list(partitions[name]["taskFamilies"]),
                "networkTaskIds": list(partitions[name]["networkTasks"]),
            }
            for name in ("train", "validation", "holdout")
        },
    }

    prompt_review: dict[str, Any]
    best_profile_path = run_dir / "artifacts" / "best-profile.json"
    if state.best_candidate_id is None or not best_profile_path.is_file():
        prompt_review = {
            "status": "missing",
            "seedCandidateId": manifest.seed_candidate_id,
            "candidateId": state.best_candidate_id,
            "changedComponents": [],
            "components": [],
        }
    else:
        try:
            best_profile, _ = load_agent_profile(best_profile_path)
        except Exception as error:
            raise _schema_error("best candidate profile artifact is invalid") from error
        baseline = manifest.target_profile.profile
        if (
            best_profile.id != baseline.id
            or best_profile.schema_version != baseline.schema_version
            or best_profile.name != baseline.name
            or best_profile.description != baseline.description
            or best_profile.tool_ids != baseline.tool_ids
        ):
            raise _schema_error("best candidate changed fields outside the two Prompt components")
        candidate_components = {"system_prompt": best_profile.system_prompt}
        candidate_components.update({
            f"instruction_{index:03d}": text
            for index, text in enumerate(best_profile.instructions)
        })
        candidate = CandidateCodec().decode(candidate_components)
        if candidate.candidate_id != state.best_candidate_id:
            raise _schema_error("best candidate identity does not match state.json")
        seed = CandidateCodec().decode(manifest.seed_candidate)
        seed_components = {"system_prompt": seed.system_prompt}
        seed_components.update({
            f"instruction_{index:03d}": text
            for index, text in enumerate(seed.instructions)
        })
        components = []
        matched_components = {
            item["component"] for item in audit["findings"]
        }
        for name in ["system_prompt", *sorted(
            (set(seed_components) | set(candidate_components)) - {"system_prompt"}
        )]:
            seed_text = seed_components.get(name)
            candidate_text = candidate_components.get(name)
            private_match = audit["status"] == "missing" or name in matched_components
            safe_seed = (
                None
                if seed_text is None
                else "[REDACTED: candidate audit unavailable]"
                if audit["status"] == "missing"
                else "[REDACTED: candidate matched private benchmark content]"
                if private_match
                else _redact_report_text(seed_text)
            )
            safe_candidate = (
                None
                if candidate_text is None
                else "[REDACTED: candidate audit unavailable]"
                if audit["status"] == "missing"
                else "[REDACTED: candidate matched private benchmark content]"
                if private_match
                else _redact_report_text(candidate_text)
            )
            redaction_reason = (
                "candidate_audit_missing"
                if audit["status"] == "missing"
                else "candidate_audit_match"
                if private_match
                else "credential_pattern"
                if safe_seed != seed_text or safe_candidate != candidate_text
                else None
            )
            components.append({
                "name": name,
                "seedText": safe_seed,
                "candidateText": safe_candidate,
                "changed": seed_text != candidate_text,
                "redacted": safe_seed != seed_text or safe_candidate != candidate_text,
                "redactionReason": redaction_reason,
            })
        prompt_review = {
            "status": "redacted" if any(item["redacted"] for item in components) else "available",
            "seedCandidateId": seed.candidate_id,
            "candidateId": candidate.candidate_id,
            "changedComponents": [item["name"] for item in components if item["changed"]],
            "components": components,
        }

    comparison_root = run_dir / "final-comparison"
    result_path = comparison_root / "result.json"
    plan_path = comparison_root / "plan.json"
    comparison: dict[str, Any]
    usage_records: list[dict[str, int]] = []
    usage_attempts_missing = 0
    families: dict[str, list[tuple[float, float]]] = {}
    if not result_path.is_file() or not plan_path.is_file():
        comparison = {
            "status": "missing",
            "reasonCodes": ["final_comparison_missing"],
            "groups": [],
        }
    else:
        result = _read_review_json(result_path)
        plan = _read_review_json(plan_path)
        expected_candidate_id = state.best_candidate_id
        if (
            not isinstance(result, dict)
            or result.get("protocol") != "gepa-final-comparison@1"
            or result.get("runId") != manifest.run_id
            or result.get("candidateId") != expected_candidate_id
            or result.get("seedCandidateId") != manifest.seed_candidate_id
            or result.get("frozenInputDigest") != manifest.preflight_input_digest
            or not isinstance(plan, dict)
            or plan.get("protocol") != "gepa-final-comparison@1"
            or plan.get("runId") != manifest.run_id
            or plan.get("candidateId") != expected_candidate_id
            or plan.get("seedCandidateId") != manifest.seed_candidate_id
            or plan.get("frozenInputDigest") != manifest.preflight_input_digest
            or result.get("model") != manifest.working_model.to_dict()
            or plan.get("workingModel") != manifest.working_model.to_dict()
            or result.get("status") not in {
                "running", "completed", "incomplete", "stopped", "insufficient_evidence"
            }
            or not isinstance(result.get("reasonCodes"), list)
            or not all(isinstance(item, str) for item in result["reasonCodes"])
        ):
            raise _schema_error("final comparison identity does not match run.json or state.json")
        groups = result.get("groups")
        planned_groups = plan.get("groups")
        expected_group_ids = ["tua-bench", "gaia", "alfworld"]
        if (
            not isinstance(groups, list)
            or not isinstance(planned_groups, list)
            or [group.get("benchmarkId") for group in groups if isinstance(group, dict)] != expected_group_ids
            or [group.get("benchmarkId") for group in planned_groups if isinstance(group, dict)] != expected_group_ids
        ):
            raise _schema_error("final comparison groups are invalid")
        if not all(reason in _FINAL_REASON_CODES for reason in result["reasonCodes"]):
            raise _schema_error("final comparison run reason code is invalid")

        projected_groups: list[dict[str, Any]] = []
        for group, planned in zip(groups, planned_groups, strict=True):
            benchmark_id = group["benchmarkId"]
            environment_plan = None if benchmark_id == "tua-bench" else getattr(final_plan, benchmark_id)
            expected_ids = (
                list(dataset.holdout_task_ids)
                if benchmark_id == "tua-bench"
                else [] if environment_plan is None else list(environment_plan.task_ids)
            )
            trials = (
                final_plan.tua_holdout_trials
                if benchmark_id == "tua-bench"
                else 1 if environment_plan is None else environment_plan.trials
            )
            if (
                group.get("plannedTaskIds") != expected_ids
                or planned.get("plannedTaskIds") != expected_ids
                or group.get("baseProfileId") != planned.get("baseProfileId")
                or group.get("baseProfileId") != {
                    "tua-bench": "tua-bench-worker-profile",
                    "gaia": "gaia-worker-profile",
                    "alfworld": "alfworld-profile",
                }[benchmark_id]
                or group.get("trialsPerCandidate") != trials
                or planned.get("trialsPerCandidate") != trials
            ):
                raise _schema_error("final comparison plan does not match the frozen request")
            tasks = group.get("tasks")
            planned_tasks = planned.get("tasks")
            if (
                not isinstance(tasks, list)
                or not isinstance(planned_tasks, list)
                or len(tasks) != len(expected_ids)
                or len(planned_tasks) != len(expected_ids)
                or [task.get("taskId") for task in tasks if isinstance(task, dict)] != expected_ids
                or [task.get("taskId") for task in planned_tasks if isinstance(task, dict)] != expected_ids
            ):
                raise _schema_error("final comparison task records are invalid")
            projected_tasks: list[dict[str, Any]] = []
            group_pairs: list[tuple[float, float]] = []
            group_counts = {"passed": 0, "failed": 0, "infrastructure_error": 0, "cancelled": 0}
            for task, planned_task in zip(tasks, planned_tasks, strict=True):
                task_id = task.get("taskId")
                if task_id != planned_task.get("taskId") or task_id not in expected_ids:
                    raise _schema_error("final comparison task identity is invalid")
                task_reason = task.get("reasonCode")
                planned_reason = planned_task.get("unavailableReason")
                if (
                    task_reason != planned_reason
                    or (task_reason is not None and task_reason not in _FINAL_REASON_CODES)
                ):
                    raise _schema_error("final comparison task reason code is invalid")
                manifest_digest = planned_task.get("manifestDigest")
                if manifest_digest is not None and (
                    not isinstance(manifest_digest, str)
                    or not re.fullmatch(r"[0-9a-f]{64}", manifest_digest)
                ):
                    raise _schema_error("final comparison Manifest digest is invalid")
                task_status = task.get("status")
                if task_status not in {"completed", "incomplete"}:
                    raise _schema_error("final comparison task status is invalid")
                trial_values = task.get("trials")
                if not isinstance(trial_values, list) or len(trial_values) != trials:
                    raise _schema_error("final comparison trial count is invalid")
                task_pairs: list[tuple[float, float]] = []
                projected_trials = []
                for expected_trial, trial in enumerate(trial_values, start=1):
                    if not isinstance(trial, dict) or trial.get("trial") != expected_trial:
                        raise _schema_error("final comparison trial identity is invalid")
                    variants: dict[str, dict[str, Any] | None] = {}
                    for variant in ("seed", "candidate"):
                        outcome = trial.get(variant)
                        if outcome is not None:
                            if not isinstance(outcome, dict) or outcome.get("status") not in {
                                "passed", "failed", "infrastructure_error", "cancelled"
                            }:
                                raise _schema_error("final comparison outcome is invalid")
                            if outcome.get("errorCode") is not None and outcome["errorCode"] not in _FINAL_ERROR_CODES:
                                raise _schema_error("final comparison error code is invalid")
                            if type(outcome.get("attemptNumber")) is not int or outcome["attemptNumber"] < 1:
                                raise _schema_error("final comparison attempt number is invalid")
                            if (
                                type(outcome.get("durationMs")) is not int
                                or outcome["durationMs"] < 0
                            ):
                                raise _schema_error("final comparison duration is invalid")
                            metric = outcome.get("metricScore")
                            if outcome["status"] in {"passed", "failed"}:
                                if isinstance(metric, bool) or not isinstance(metric, (int, float)) or not math.isfinite(float(metric)):
                                    raise _schema_error("final comparison domain score is invalid")
                                group_counts[outcome["status"]] += 1
                            elif metric is not None:
                                raise _schema_error("unscored final comparison outcome has a score")
                            usage, benchmark_attempt_path = _attempt_usage(
                                run_dir,
                                outcome.get("attemptPath"),
                                benchmark_id=benchmark_id,
                                task_id=task_id,
                                candidate_id=(
                                    manifest.seed_candidate_id
                                    if variant == "seed"
                                    else expected_candidate_id or ""
                                ),
                                model_config_id=manifest.working_model.profile_name,
                                model_id=manifest.working_model.model_id,
                            )
                            if usage is None:
                                usage_attempts_missing += 1
                            else:
                                usage_records.append(usage)
                            variants[variant] = {
                                "status": outcome["status"],
                                "metricScore": metric,
                                "officialReward": metric if benchmark_id == "tua-bench" else None,
                                "attemptNumber": outcome.get("attemptNumber"),
                                "durationMs": outcome.get("durationMs"),
                                "errorCode": outcome.get("errorCode"),
                                "resultPath": (
                                    str(_safe_run_path(run_dir, outcome.get("attemptPath")))
                                    if _safe_run_path(run_dir, outcome.get("attemptPath")) is not None
                                    else None
                                ),
                                "benchmarkAttemptPath": benchmark_attempt_path,
                                "usage": usage,
                            }
                            if outcome["status"] in {"infrastructure_error", "cancelled"}:
                                group_counts[outcome["status"]] += 1
                        else:
                            variants[variant] = None
                            usage_attempts_missing += 1
                    paired = (
                        variants["seed"] is not None
                        and variants["candidate"] is not None
                        and variants["seed"]["status"] in {"passed", "failed"}
                        and variants["candidate"]["status"] in {"passed", "failed"}
                    )
                    if trial.get("paired") is not paired:
                        raise _schema_error("final comparison paired flag is inconsistent")
                    if paired:
                        pair = (
                            float(variants["seed"]["metricScore"]),
                            float(variants["candidate"]["metricScore"]),
                        )
                        task_pairs.append(pair)
                        group_pairs.append(pair)
                        expected_delta = pair[1] - pair[0]
                        if trial.get("scoreDelta") != expected_delta:
                            raise _schema_error("final comparison score delta is inconsistent")
                    elif trial.get("scoreDelta") is not None:
                        raise _schema_error("unpaired final comparison trial has a score delta")
                    projected_trials.append({
                        "trial": expected_trial,
                        "paired": paired,
                        "seed": variants["seed"],
                        "candidate": variants["candidate"],
                    })
                family = None
                if benchmark_id == "tua-bench":
                    family = inspection["tasks"][task_id]["taskFamily"]
                    families.setdefault(family, []).extend(task_pairs)
                projected_tasks.append({
                    "taskId": task_id,
                    "taskFamily": family,
                    "manifestDigest": manifest_digest,
                    "status": task.get("status"),
                    "reasonCode": task.get("reasonCode"),
                    "statistics": _summary_stats(task_pairs, trials),
                    "trials": projected_trials,
                })
            projected_groups.append({
                "benchmarkId": benchmark_id,
                "status": group.get("status"),
                "baseProfileId": group.get("baseProfileId"),
                "plannedTaskIds": expected_ids,
                "trialsPerCandidate": trials,
                "reasonCodes": group.get("reasonCodes"),
                "failureCounts": group_counts,
                "statistics": _summary_stats(group_pairs, len(expected_ids) * trials),
                "tasks": projected_tasks,
            })

            group_reasons = group.get("reasonCodes")
            if (
                not isinstance(group_reasons, list)
                or not all(reason in _FINAL_REASON_CODES for reason in group_reasons)
                or group.get("status") not in {"completed", "incomplete", "unavailable"}
            ):
                raise _schema_error("final comparison group status or reason codes are invalid")

        comparison = {
            "status": result.get("status"),
            "reasonCodes": result.get("reasonCodes"),
            "planPath": str(plan_path),
            "resultPath": str(result_path),
            "groups": projected_groups,
            "taskFamilies": [
                {
                    "taskFamily": family,
                    "statistics": _summary_stats(
                        families[family],
                        sum(
                            final_plan.tua_holdout_trials
                            for task_id in dataset.holdout_task_ids
                            if inspection["tasks"][task_id]["taskFamily"] == family
                        ),
                    ),
                }
                for family in sorted(families)
            ],
        }

    all_known_benchmarks = ["alfworld", "gaia", "swebench", "tua-bench"]
    configured_benchmarks = [
        benchmark_id
        for benchmark_id, request_group in (
            ("tua-bench", True),
            ("gaia", final_plan.gaia is not None and bool(final_plan.gaia.task_ids)),
            ("alfworld", final_plan.alfworld is not None and bool(final_plan.alfworld.task_ids)),
        )
        if request_group
    ]
    groups_by_id = {group["benchmarkId"]: group for group in comparison["groups"]}
    covered_benchmarks = [
        benchmark_id
        for benchmark_id in configured_benchmarks
        if groups_by_id.get(benchmark_id, {}).get("status") == "completed"
    ]
    comparison_complete = comparison["status"] == "completed"
    audit_clear = audit["status"] == "clear" and not audit["positiveConclusionBlocked"]
    tua_stats = groups_by_id.get("tua-bench", {}).get("statistics", {})
    tua_improved = (
        tua_stats.get("candidate", {}).get("mean") is not None
        and tua_stats.get("seed", {}).get("mean") is not None
        and tua_stats["candidate"]["mean"] > tua_stats["seed"]["mean"]
    )
    cross_nonregression: dict[str, bool | None] = {}
    for benchmark_id in ("gaia", "alfworld"):
        stats = groups_by_id.get(benchmark_id, {}).get("statistics", {})
        seed_mean = stats.get("seed", {}).get("mean")
        candidate_mean = stats.get("candidate", {}).get("mean")
        cross_nonregression[benchmark_id] = (
            None if seed_mean is None or candidate_mean is None else candidate_mean >= seed_mean
        )
    comparison_complete = (
        comparison_complete
        and len(groups_by_id) == 3
        and all(
            group.get("status") == "completed"
            and group["statistics"]["effectivePairedTrials"]
            == group["statistics"]["plannedPairedTrials"]
            for group in groups_by_id.values()
        )
    )
    audit_missing = audit["status"] == "missing"
    if not comparison_complete or audit_missing:
        promotion_status = "evidence_insufficient"
    elif not audit_clear or prompt_review["status"] == "redacted" or not tua_improved or any(
        outcome is False for outcome in cross_nonregression.values()
    ):
        promotion_status = "not_recommended"
    else:
        promotion_status = "human_review_required"
    reasons = []
    if not comparison_complete:
        reasons.append("comparison_incomplete")
    if audit_missing:
        reasons.append("candidate_audit_missing")
    elif audit["positiveConclusionBlocked"]:
        reasons.append("candidate_audit_blocked")
    if prompt_review["status"] == "redacted":
        reasons.append("candidate_prompt_text_redacted_for_safety")
    if comparison_complete and not tua_improved:
        reasons.append("tua_holdout_candidate_not_better")
    for benchmark_id, outcome in cross_nonregression.items():
        if outcome is False:
            reasons.append(f"{benchmark_id}_candidate_regressed")
    usage_and_cost = {
        "gepaMetricCalls": state.metric_calls,
        "gepaWorkingModelTokenUsage": None,
        "reflectionModelTokenUsage": None,
        "benchmarkAttemptsWithUsage": len(usage_records),
        "benchmarkAttemptsWithoutUsage": usage_attempts_missing,
        "benchmarkTokenUsage": {
            "inputTokens": sum(item["inputTokens"] for item in usage_records) if usage_records else None,
            "outputTokens": sum(item["outputTokens"] for item in usage_records) if usage_records else None,
            "missingCalls": sum(item["missingCalls"] for item in usage_records) if usage_records else None,
        },
        "estimatedCost": {
            "status": "unknown",
            "amount": None,
            "currency": None,
            "reason": "Provider and container pricing are not recorded in the frozen run or Attempts.",
        },
    }
    return {
        "dataset": dataset_review,
        "prompt": prompt_review,
        "evaluationPlan": {
            "maxMetricCalls": state.max_metric_calls,
            "consumedMetricCalls": state.metric_calls,
            "tuaHoldoutTrials": final_plan.tua_holdout_trials,
            "gaia": None if final_plan.gaia is None else {
                "taskIds": list(final_plan.gaia.task_ids),
                "trialsPerCandidate": final_plan.gaia.trials,
            },
            "alfworld": None if final_plan.alfworld is None else {
                "taskIds": list(final_plan.alfworld.task_ids),
                "trialsPerCandidate": final_plan.alfworld.trials,
            },
        },
        "finalComparison": comparison,
        "coverage": {
            "configuredBenchmarks": configured_benchmarks,
            "coveredBenchmarks": covered_benchmarks,
            "uncoveredBenchmarks": [
                benchmark for benchmark in all_known_benchmarks if benchmark not in covered_benchmarks
            ],
            "coveredTuaTaskFamilies": sorted(families),
            "uncoveredTuaTaskFamilies": sorted(
                set(partitions["train"]["taskFamilies"])
                - set(partitions["holdout"]["taskFamilies"])
            ),
        },
        "candidateAudit": audit,
        "promotion": {
            "status": promotion_status,
            "automaticPublication": False,
            "checks": {
                "comparisonComplete": comparison_complete,
                "candidateAuditClear": audit_clear,
                "tuaHoldoutCandidateImproved": tua_improved,
                "gaiaNoRegression": cross_nonregression["gaia"],
                "alfworldNoRegression": cross_nonregression["alfworld"],
            },
            "reasonCodes": reasons,
        },
        "usageAndCost": usage_and_cost,
    }


def _redact_report_text(value: str) -> str:
    return (
        _CREDENTIAL_ASSIGNMENT_RE.sub(_REDACTED, _PROVIDER_TOKEN_RE.sub(
            _REDACTED,
            _BEARER_RE.sub(f"Bearer {_REDACTED}", _AUTHORIZATION_RE.sub(f"Authorization: {_REDACTED}", value)),
        ))
    )


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
    run_dir: Path,
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
            "tuaReview",
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

    expected_tua_review = _load_tua_review(run_dir, manifest, state)
    if data.get("tuaReview") != expected_tua_review:
        raise _schema_error("TUA review does not match frozen inputs and comparison artifacts")

    artifacts = _mapping(data, "artifacts")
    _exact_keys(
        artifacts,
        {
            "baseProfilePath",
            "bestProfilePath",
            "officialStatePath",
            "gepaRunDir",
            "tuaAdapterRunDir",
            "finalComparisonDir",
            "reportPath",
            "workerLogPath",
            "candidateAuditsPath",
        },
        "artifacts",
    )
    for key in ("baseProfilePath", "gepaRunDir", "reportPath", "workerLogPath"):
        _string(artifacts, key)
    for key in (
        "bestProfilePath",
        "officialStatePath",
        "tuaAdapterRunDir",
        "finalComparisonDir",
        "candidateAuditsPath",
    ):
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
    tua_review = _load_tua_review(resolved_run_dir, manifest, state)

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
        "tuaReview": tua_review,
        "artifacts": {
            "baseProfilePath": str(base_profile_path),
            "bestProfilePath": str(best_profile_path) if best_profile_path.is_file() else None,
            "officialStatePath": str(official_state_path) if official_state_path.is_file() else None,
            "gepaRunDir": str(resolved_run_dir / "gepa"),
            "tuaAdapterRunDir": (
                str(resolved_run_dir / "adapter")
                if manifest.request.tua_dataset is not None
                else None
            ),
            "finalComparisonDir": (
                str(resolved_run_dir / "final-comparison")
                if manifest.request.tua_dataset is not None
                else None
            ),
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

    _validate_report_schema(
        report_data,
        run_dir=resolved_run_dir,
        run_id=run_id,
        manifest=manifest,
        state=state,
    )
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
        _validate_report_schema(
            data,
            run_dir=resolved_run_dir,
            run_id=run_id,
            manifest=manifest,
            state=state,
        )
        return data
    except RunStoreError:
        raise
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as error:
        raise RunStoreError(
            f"Report file is corrupted for run {run_id!r}: {error.__class__.__name__}",
            code="corrupted",
        ) from error
