"""Recoverable paired seed/candidate evaluation after TUA GEPA optimization."""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from .candidate import CandidateCodec, FrozenRunManifest, LazyGoalPrompt
from .client import PromptEvaluationClient
from .errors import (
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
    RunStoreError,
)
from .invocation import InvocationDirectoryManager
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig
from .protocol import (
    ComparisonEnvironmentRequest,
    PromptEvaluationTaskRecord,
)
from .store import atomic_write_json

_PROTOCOL = "gepa-final-comparison@1"
BASE_PROFILE_IDS = {
    "tua-bench": "tua-bench-worker-profile",
    "gaia": "gaia-worker-profile",
    "alfworld": "alfworld-profile",
}
_DOMAIN_STATUSES = frozenset(("passed", "failed"))
_ALL_STATUSES = frozenset((*_DOMAIN_STATUSES, "infrastructure_error", "cancelled"))


@dataclass(frozen=True)
class _ComparisonTask:
    task_id: str
    manifest_path: Path | None
    manifest_digest: str | None
    unavailable_reason: str | None = None


@dataclass(frozen=True)
class _ComparisonGroup:
    benchmark_id: str
    trials: int
    tasks: tuple[_ComparisonTask, ...]
    planned_task_ids: tuple[str, ...]
    unavailable_reason: str | None = None


FrozenInputVerifier = Callable[[], tuple[bool, str | None]]
StopRequested = Callable[[], bool]


class FinalComparisonExecutor:
    """Run and resume frozen seed/candidate comparisons using native benchmark adapters."""

    def __init__(
        self,
        manifest: FrozenRunManifest,
        run_directory: Path | str,
        *,
        executable: Path | str,
        workspace_root: Path | str,
        verify_frozen_inputs: FrozenInputVerifier | None = None,
        stop_requested: StopRequested | None = None,
    ) -> None:
        if manifest.request.tua_dataset is None or manifest.request.final_comparison is None:
            raise RunStoreError(
                "TUA final comparison requires a frozen dataset and trial plan",
                code="corrupted",
            )
        self.manifest = manifest
        self.run_directory = Path(run_directory).resolve()
        self.root = self.run_directory / "final-comparison"
        self.executable = Path(executable).resolve()
        self.workspace_root = Path(workspace_root).resolve()
        self._verify_frozen_inputs = verify_frozen_inputs or (
            lambda: _verify_run_inputs(
                manifest,
                self.run_directory,
                executable=self.executable,
                workspace_root=self.workspace_root,
            )
        )
        self._stop_requested = stop_requested or (lambda: False)
        self._codec = CandidateCodec()

    def execute(self, best_candidate: dict[str, str]) -> dict[str, Any]:
        seed = self._codec.decode(self.manifest.seed_candidate)
        candidate = self._codec.decode(best_candidate)
        groups = self._build_groups()
        self.root.mkdir(parents=True, exist_ok=True)

        plan = {
            "protocol": _PROTOCOL,
            "runId": self.manifest.run_id,
            "seedCandidateId": seed.candidate_id,
            "candidateId": candidate.candidate_id,
            "workingModel": self.manifest.working_model.to_dict(),
            "tuaHoldoutTrials": self.manifest.request.final_comparison.tua_holdout_trials,
            "groups": [
                {
                    "benchmarkId": group.benchmark_id,
                    "plannedTaskIds": list(group.planned_task_ids),
                    "trialsPerCandidate": group.trials,
                    "baseProfileId": BASE_PROFILE_IDS[group.benchmark_id],
                    "tasks": [
                        {
                            "taskId": task.task_id,
                            "manifestDigest": task.manifest_digest,
                            "unavailableReason": task.unavailable_reason,
                        }
                        for task in group.tasks
                    ],
                }
                for group in groups
            ],
            "frozenInputDigest": self.manifest.preflight_input_digest,
        }
        plan_path = self.root / "plan.json"
        if plan_path.is_file():
            existing_plan = _read_json(plan_path)
            if existing_plan != plan:
                raise RunStoreError(
                    "Final comparison plan does not match the frozen run",
                    code="checkpoint_corrupted",
                )
        else:
            atomic_write_json(plan_path, plan)

        inputs_valid, input_error = self._verify_frozen_inputs()
        if not inputs_valid:
            summary = self._build_summary(
                groups,
                seed,
                candidate,
                status="incomplete",
                reason_codes=[input_error or "frozen_input_verification_failed"],
            )
            atomic_write_json(self.root / "result.json", summary)
            return summary

        was_stopped = False
        for group in groups:
            for task in group.tasks:
                if task.manifest_path is None:
                    continue
                for trial in range(1, group.trials + 1):
                    for variant, prompt in (("seed", seed), ("candidate", candidate)):
                        if self._latest_domain_attempt(
                            group, task, trial, variant, prompt
                        ) is not None:
                            continue
                        if self._stop_requested():
                            was_stopped = True
                            break
                        outcome, attempt_number = self._evaluate_slot(
                            group,
                            task,
                            trial,
                            variant,
                            prompt,
                        )
                        self._write_attempt(
                            group,
                            task,
                            trial,
                            variant,
                            prompt,
                            outcome,
                            attempt_number,
                        )
                        summary = self._build_summary(
                            groups,
                            seed,
                            candidate,
                            status="running",
                            reason_codes=[],
                        )
                        atomic_write_json(self.root / "result.json", summary)
                        if outcome["status"] == "cancelled" or self._stop_requested():
                            was_stopped = True
                            break
                    if was_stopped:
                        break
                if was_stopped:
                    break
            if was_stopped:
                break

        reason_codes = self._reason_codes(groups, seed, candidate)
        if was_stopped:
            status: Literal["stopped", "completed", "incomplete", "insufficient_evidence"] = "stopped"
        elif self._is_complete(groups, seed, candidate):
            status = "completed"
        elif reason_codes and set(reason_codes).issubset(
            {"environment_not_configured", "no_tasks_configured"}
        ):
            status = "insufficient_evidence"
        else:
            status = "incomplete"
        summary = self._build_summary(
            groups,
            seed,
            candidate,
            status=status,
            reason_codes=reason_codes,
        )
        atomic_write_json(self.root / "result.json", summary)
        return summary

    def _build_groups(self) -> tuple[_ComparisonGroup, ...]:
        request = self.manifest.request
        final = request.final_comparison
        tua = request.tua_dataset
        assert final is not None and tua is not None

        holdout_tasks = tuple(
            self._materialize_tua_task(task_id)
            for task_id in tua.holdout_task_ids
        )
        groups = [
            _ComparisonGroup(
                benchmark_id="tua-bench",
                trials=final.tua_holdout_trials,
                tasks=holdout_tasks,
                planned_task_ids=tua.holdout_task_ids,
            ),
        ]
        for benchmark_id, configuration in (
            ("gaia", final.gaia),
            ("alfworld", final.alfworld),
        ):
            groups.append(self._build_environment_group(benchmark_id, configuration))
        return tuple(groups)

    def _materialize_tua_task(self, task_id: str) -> _ComparisonTask:
        dataset = self.manifest.request.tua_dataset
        assert dataset is not None
        inspection = self.manifest.tua_dataset_inspection
        if not isinstance(inspection, dict) or task_id not in inspection.get("tasks", {}):
            return _ComparisonTask(task_id, None, None, "task_missing_from_frozen_inspection")
        manifest_path = self.root / "manifests" / f"tua-bench-{_safe_id(task_id)}.json"
        payload = {
            "benchmark": "tua-bench",
            "repoRoot": dataset.repo_root,
            "tasks": [{"taskId": task_id}],
        }
        return self._write_manifest(task_id, manifest_path, payload)

    def _build_environment_group(
        self,
        benchmark_id: Literal["gaia", "alfworld"],
        configuration: ComparisonEnvironmentRequest | None,
    ) -> _ComparisonGroup:
        if configuration is None or configuration.manifest_path is None or not configuration.task_ids:
            trials = 1 if configuration is None else configuration.trials
            task_ids = () if configuration is None else configuration.task_ids
            unavailable_reason = (
                "environment_not_configured"
                if configuration is None
                else "no_tasks_configured"
                if not task_ids
                else "manifest_unavailable"
            )
            return _ComparisonGroup(
                benchmark_id=benchmark_id,
                trials=trials,
                tasks=tuple(
                    _ComparisonTask(task_id, None, None, unavailable_reason)
                    for task_id in task_ids
                ),
                planned_task_ids=task_ids,
                unavailable_reason=unavailable_reason,
            )

        source_path = Path(configuration.manifest_path)
        try:
            source_bytes = source_path.read_bytes()
            source = json.loads(source_bytes)
        except (OSError, UnicodeError, json.JSONDecodeError):
            return _ComparisonGroup(
                benchmark_id=benchmark_id,
                trials=configuration.trials,
                tasks=tuple(
                    _ComparisonTask(task_id, None, None, "manifest_unavailable")
                    for task_id in configuration.task_ids
                ),
                planned_task_ids=configuration.task_ids,
                unavailable_reason="manifest_unavailable",
            )

        if (
            not isinstance(source, dict)
            or source.get("benchmark") not in (None, benchmark_id)
            or not isinstance(source.get("tasks"), list)
        ):
            return _ComparisonGroup(
                benchmark_id=benchmark_id,
                trials=configuration.trials,
                tasks=tuple(
                    _ComparisonTask(task_id, None, None, "manifest_invalid")
                    for task_id in configuration.task_ids
                ),
                planned_task_ids=configuration.task_ids,
                unavailable_reason="manifest_invalid",
            )

        source_tasks: dict[str, dict[str, Any]] = {}
        duplicate_ids: set[str] = set()
        for task in source["tasks"]:
            if not isinstance(task, dict) or not isinstance(task.get("taskId"), str):
                continue
            task_id = task["taskId"]
            if task_id in source_tasks:
                duplicate_ids.add(task_id)
            source_tasks[task_id] = task

        output: list[_ComparisonTask] = []
        for task_id in configuration.task_ids:
            if task_id in duplicate_ids:
                output.append(_ComparisonTask(task_id, None, None, "duplicate_manifest_task"))
                continue
            task = source_tasks.get(task_id)
            if task is None:
                output.append(_ComparisonTask(task_id, None, None, "task_missing_from_manifest"))
                continue
            single_task_manifest = dict(source)
            single_task_manifest["tasks"] = [task]
            path = (
                self.root
                / "manifests"
                / f"{benchmark_id}-{_safe_id(task_id)}.json"
            )
            output.append(self._write_manifest(task_id, path, single_task_manifest))

        return _ComparisonGroup(
            benchmark_id=benchmark_id,
            trials=configuration.trials,
            tasks=tuple(output),
            planned_task_ids=configuration.task_ids,
        )

    def _write_manifest(
        self,
        task_id: str,
        path: Path,
        payload: dict[str, Any],
    ) -> _ComparisonTask:
        encoded = json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        digest = hashlib.sha256(encoded).hexdigest()
        if path.is_file():
            if _read_json(path) != payload:
                raise RunStoreError(
                    "Final comparison task Manifest changed after it was frozen",
                    code="checkpoint_corrupted",
                )
        else:
            atomic_write_json(path, payload)
        return _ComparisonTask(task_id, path.resolve(), digest)

    def _evaluate_slot(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        prompt: LazyGoalPrompt,
    ) -> tuple[dict[str, Any], int]:
        attempts = self._attempts_for(group, task, trial, variant, prompt)
        attempt_number = len(attempts) + 1
        config = LazyGoalGEPAConfig(
            benchmark_id=group.benchmark_id,
            base_profile_id=BASE_PROFILE_IDS[group.benchmark_id],
            model_config_id=self.manifest.working_model.profile_name,
            model_id=self.manifest.working_model.model_id,
            output_directory=self.root / "evaluations",
            lazygoal_executable=self.executable,
        )
        manager = InvocationDirectoryManager(config.output_directory)
        client = PromptEvaluationClient(config, manager)
        example = LazyGoalEvaluationExample(
            sample_id=f"{group.benchmark_id}-{_safe_id(task.task_id)}-{trial:04d}-{variant}",
            benchmark_id=group.benchmark_id,
            task_id=task.task_id,
            manifest_path=task.manifest_path,
        )
        started = time.monotonic()
        try:
            record = client.evaluate_one(
                example,
                prompt,
                manager.create_invocation(prompt.candidate_id),
            )
            outcome = _domain_outcome(
                group.benchmark_id,
                record.task,
                record.result_path,
                time.monotonic() - started,
            )
        except PromptEvaluationCancelled:
            outcome = _failed_outcome("cancelled", "evaluation_cancelled", time.monotonic() - started)
        except PromptEvaluationProtocolError:
            outcome = _failed_outcome("infrastructure_error", "evaluation_protocol_error", time.monotonic() - started)
        except PromptEvaluationInfrastructureError:
            outcome = _failed_outcome("infrastructure_error", "evaluation_infrastructure_error", time.monotonic() - started)
        except Exception:
            outcome = _failed_outcome("infrastructure_error", "evaluation_infrastructure_error", time.monotonic() - started)
        return outcome, attempt_number

    def _write_attempt(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        prompt: LazyGoalPrompt,
        outcome: dict[str, Any],
        attempt_number: int,
    ) -> None:
        identity = self._identity(group, task, trial, variant, prompt)
        payload = {
            "protocol": _PROTOCOL,
            "identity": identity,
            "attempt": attempt_number,
            **outcome,
        }
        path = self._attempt_path(group, task, trial, variant, attempt_number)
        if path.exists():
            existing = _read_json(path)
            if existing != payload:
                raise RunStoreError(
                    "Final comparison attempt already exists with different content",
                    code="checkpoint_corrupted",
                )
            return
        atomic_write_json(path, payload)

    def _latest_domain_attempt(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        prompt: LazyGoalPrompt,
    ) -> dict[str, Any] | None:
        attempts = self._attempts_for(group, task, trial, variant, prompt)
        for attempt in reversed(attempts):
            if attempt["status"] in _DOMAIN_STATUSES:
                return attempt
        return None

    def _attempts_for(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        prompt: LazyGoalPrompt,
    ) -> list[dict[str, Any]]:
        directory = self._slot_directory(group, task, trial, variant)
        if not directory.is_dir():
            return []
        attempts: list[dict[str, Any]] = []
        for path in sorted(directory.glob("attempt-*.json")):
            value = _read_json(path)
            if (
                not isinstance(value, dict)
                or value.get("protocol") != _PROTOCOL
                or value.get("identity") != self._identity(group, task, trial, variant, prompt)
                or type(value.get("attempt")) is not int
                or value["attempt"] != len(attempts) + 1
                or value.get("status") not in _ALL_STATUSES
                or (
                    value["status"] in _DOMAIN_STATUSES
                    and (
                        isinstance(value.get("metricScore"), bool)
                        or not isinstance(value.get("metricScore"), (int, float))
                        or not math.isfinite(float(value["metricScore"]))
                    )
                )
                or (
                    value["status"] not in _DOMAIN_STATUSES
                    and value.get("metricScore") is not None
                )
            ):
                raise RunStoreError(
                    "Final comparison attempt is corrupt or has drifted identity",
                    code="checkpoint_corrupted",
                )
            attempts.append(value)
        return attempts

    def _identity(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        prompt: LazyGoalPrompt,
    ) -> dict[str, Any]:
        return {
            "runId": self.manifest.run_id,
            "benchmarkId": group.benchmark_id,
            "taskId": task.task_id,
            "manifestDigest": task.manifest_digest,
            "trial": trial,
            "variant": variant,
            "candidateId": prompt.candidate_id,
            "baseProfileId": BASE_PROFILE_IDS[group.benchmark_id],
            "modelConfigId": self.manifest.working_model.profile_name,
            "modelId": self.manifest.working_model.model_id,
        }

    def _attempt_path(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        attempt_number: int,
    ) -> Path:
        return (
            self._slot_directory(group, task, trial, variant)
            / f"attempt-{attempt_number:04d}.json"
        )

    def _slot_directory(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
    ) -> Path:
        return (
            self.root
            / "attempts"
            / group.benchmark_id
            / _safe_id(task.task_id)
            / f"trial-{trial:04d}"
            / variant
        )

    def _reason_codes(
        self,
        groups: tuple[_ComparisonGroup, ...],
        seed: LazyGoalPrompt,
        candidate: LazyGoalPrompt,
    ) -> list[str]:
        reasons: set[str] = set()
        for group in groups:
            if group.unavailable_reason is not None:
                reasons.add(group.unavailable_reason)
            for task in group.tasks:
                if task.unavailable_reason is not None:
                    reasons.add(task.unavailable_reason)
                    continue
                for trial in range(1, group.trials + 1):
                    for variant, prompt in (("seed", seed), ("candidate", candidate)):
                        latest = self._latest_any_attempt(group, task, trial, variant, prompt)
                        if latest is None:
                            reasons.add("trial_incomplete")
                        elif latest["status"] == "infrastructure_error":
                            reasons.add("trial_infrastructure_error")
                        elif latest["status"] == "cancelled":
                            reasons.add("trial_cancelled")
        return sorted(reasons)

    def _latest_any_attempt(
        self,
        group: _ComparisonGroup,
        task: _ComparisonTask,
        trial: int,
        variant: Literal["seed", "candidate"],
        prompt: LazyGoalPrompt,
    ) -> dict[str, Any] | None:
        attempts = self._attempts_for(group, task, trial, variant, prompt)
        return attempts[-1] if attempts else None

    def _is_complete(
        self,
        groups: tuple[_ComparisonGroup, ...],
        seed: LazyGoalPrompt,
        candidate: LazyGoalPrompt,
    ) -> bool:
        for group in groups:
            if not group.planned_task_ids or group.unavailable_reason is not None:
                return False
            if any(task.unavailable_reason is not None for task in group.tasks):
                return False
            if len(group.tasks) != len(group.planned_task_ids):
                return False
            for task in group.tasks:
                for trial in range(1, group.trials + 1):
                    for variant, prompt in (("seed", seed), ("candidate", candidate)):
                        if self._latest_domain_attempt(group, task, trial, variant, prompt) is None:
                            return False
        return True

    def _build_summary(
        self,
        groups: tuple[_ComparisonGroup, ...],
        seed: LazyGoalPrompt,
        candidate: LazyGoalPrompt,
        *,
        status: str,
        reason_codes: list[str],
    ) -> dict[str, Any]:
        group_summaries: list[dict[str, Any]] = []
        for group in groups:
            task_summaries: list[dict[str, Any]] = []
            group_complete = (
                bool(group.planned_task_ids)
                and group.unavailable_reason is None
                and len(group.tasks) == len(group.planned_task_ids)
            )
            group_reasons: set[str] = set()
            if group.unavailable_reason is not None:
                group_reasons.add(group.unavailable_reason)
            if not group.planned_task_ids:
                group_reasons.add("no_tasks_configured")
            for task in group.tasks:
                trial_summaries: list[dict[str, Any]] = []
                task_complete = task.unavailable_reason is None
                if task.unavailable_reason is not None:
                    group_reasons.add(task.unavailable_reason)
                for trial in range(1, group.trials + 1):
                    outcomes: dict[str, Any] = {}
                    for variant, prompt in (("seed", seed), ("candidate", candidate)):
                        latest = self._latest_any_attempt(group, task, trial, variant, prompt)
                        outcome = _public_outcome(latest)
                        outcomes[variant] = outcome
                        if outcome is None or outcome["status"] not in _DOMAIN_STATUSES:
                            task_complete = False
                            group_complete = False
                            if outcome is None:
                                group_reasons.add("trial_incomplete")
                            else:
                                group_reasons.add(
                                    "trial_cancelled"
                                    if outcome["status"] == "cancelled"
                                    else "trial_infrastructure_error"
                                )
                    paired = (
                        outcomes["seed"] is not None
                        and outcomes["candidate"] is not None
                        and outcomes["seed"]["status"] in _DOMAIN_STATUSES
                        and outcomes["candidate"]["status"] in _DOMAIN_STATUSES
                    )
                    trial_summaries.append(
                        {
                            "trial": trial,
                            "seed": outcomes["seed"],
                            "candidate": outcomes["candidate"],
                            "paired": paired,
                            "scoreDelta": (
                                outcomes["candidate"]["metricScore"]
                                - outcomes["seed"]["metricScore"]
                                if paired
                                else None
                            ),
                        }
                    )
                group_complete = group_complete and task_complete
                task_summaries.append(
                    {
                        "taskId": task.task_id,
                        "status": "completed" if task_complete else "incomplete",
                        "reasonCode": task.unavailable_reason,
                        "trials": trial_summaries,
                    }
                )
            group_status = (
                "unavailable"
                if group.unavailable_reason is not None or not group.planned_task_ids
                else "completed" if group_complete else "incomplete"
            )
            group_summaries.append(
                {
                    "benchmarkId": group.benchmark_id,
                    "status": group_status,
                    "plannedTaskIds": list(group.planned_task_ids),
                    "trialsPerCandidate": group.trials,
                    "baseProfileId": BASE_PROFILE_IDS[group.benchmark_id],
                    "reasonCodes": sorted(group_reasons),
                    "tasks": task_summaries,
                }
            )
        return {
            "protocol": _PROTOCOL,
            "runId": self.manifest.run_id,
            "status": status,
            "candidateId": candidate.candidate_id,
            "seedCandidateId": seed.candidate_id,
            "model": self.manifest.working_model.to_dict(),
            "frozenInputDigest": self.manifest.preflight_input_digest,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "reasonCodes": reason_codes,
            "groups": group_summaries,
        }


def _domain_outcome(
    benchmark_id: str,
    task: PromptEvaluationTaskRecord,
    result_path: Path,
    elapsed_seconds: float,
) -> dict[str, Any]:
    if task.status not in _DOMAIN_STATUSES:
        raise PromptEvaluationProtocolError(
            "Final comparison expected a benchmark domain result"
        )
    if benchmark_id == "tua-bench":
        if task.metric_score is None:
            raise PromptEvaluationProtocolError(
                "TUA final comparison is missing the official reward"
            )
        score = task.metric_score
    else:
        score = task.metric_score if task.metric_score is not None else (
            1.0 if task.status == "passed" else 0.0
        )
    if not math.isfinite(float(score)):
        raise PromptEvaluationProtocolError("Final comparison score must be finite")
    return {
        "status": task.status,
        "metricScore": float(score),
        "attemptPath": str(result_path),
        "durationMs": round(max(0.0, elapsed_seconds) * 1_000),
        "errorCode": None,
    }


def _failed_outcome(
    status: Literal["infrastructure_error", "cancelled"],
    error_code: str,
    elapsed_seconds: float,
) -> dict[str, Any]:
    return {
        "status": status,
        "metricScore": None,
        "attemptPath": None,
        "durationMs": round(max(0.0, elapsed_seconds) * 1_000),
        "errorCode": error_code,
    }


def _public_outcome(attempt: dict[str, Any] | None) -> dict[str, Any] | None:
    if attempt is None:
        return None
    return {
        "status": attempt["status"],
        "metricScore": attempt["metricScore"],
        "attemptPath": attempt.get("attemptPath"),
        "durationMs": attempt["durationMs"],
        "attemptNumber": attempt["attempt"],
        "errorCode": attempt.get("errorCode"),
    }


def _safe_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RunStoreError(
            f"Final comparison artifact could not be read: {path}",
            code="checkpoint_corrupted",
        ) from error


def _verify_run_inputs(
    manifest: FrozenRunManifest,
    run_directory: Path,
    *,
    executable: Path,
    workspace_root: Path,
) -> tuple[bool, str | None]:
    if manifest.preflight_input_digest is None or manifest.tua_dataset_inspection is None:
        return False, "frozen_input_identity_missing"
    request = manifest.request
    dataset = request.tua_dataset
    assert dataset is not None
    inspection_request_path = run_directory / "final-comparison" / "inspect-tua-request.json"
    atomic_write_json(
        inspection_request_path,
        {"tuaDataset": dataset.to_dict()},
    )
    try:
        inspector = subprocess.run(
            [
                str(executable),
                "gepa",
                "inspect-tua",
                "--request",
                str(inspection_request_path.resolve()),
            ],
            cwd=str(workspace_root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            check=False,
        )
        if inspector.returncode != 0:
            import sys
            sys.stderr.write(f"Final comparison inspect-tua failed with code {inspector.returncode}: {inspector.stderr}\n")
            return False, "tua_dataset_inspection_failed"
        current_inspection = json.loads(inspector.stdout)
    except (OSError, subprocess.TimeoutExpired, UnicodeError, json.JSONDecodeError) as error:
        import sys
        sys.stderr.write(f"Final comparison inspect-tua exception: {error}\n")
        return False, "tua_dataset_inspection_failed"

    if current_inspection != manifest.tua_dataset_inspection:
        return False, "tua_dataset_identity_drift"
    try:
        from .controller import _preflight_input_digest, _request_artifact_digests

        artifact_digests = _request_artifact_digests(request, workspace_root)
        digest = _preflight_input_digest(
            request,
            profile_digest=manifest.target_profile.frozen_digest,
            working_model=manifest.working_model,
            reflection_model=manifest.reflection_model,
            tua_dataset_inspection=current_inspection,
            artifact_digests=artifact_digests,
        )
    except Exception:
        return False, "frozen_input_verification_failed"
    if digest != manifest.preflight_input_digest:
        return False, "frozen_input_drift"
    return True, None
