"""Lifecycle controller and detached background worker management for GEPA runs."""

from __future__ import annotations

import json
import hashlib
import os
import shlex
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from .candidate import (
    AgentProfileSnapshot,
    CandidateCodec,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    _fingerprint,
    _validate_tua_dataset_inspection,
    extract_seed_candidate,
    load_agent_profile,
)
from .compatibility import EXPECTED_GEPA_VERSION, ensure_gepa_compatibility
from .errors import (
    ConfigurationError,
    DatasetValidationError,
    GEPARunProtocolError,
    LazyGoalGEPAError,
    ProfileValidationError,
    RunOwnershipError,
    RunStoreError,
    WorkerAlreadyRunningError,
)
from .home import resolve_lazygoal_home, resolve_workspace_home
from .ownership import OwnerInfo, RunOwnership, WorkerHealth, is_pid_alive
from .model_resolver import resolve_model_identities
from .models import resolve_lazygoal_executable
from .prompt_template import (
    load_and_render_reflection_prompt_template,
    resolve_reflection_prompt_template_path,
)
from .protocol import (
    GEPARunRequest,
    gepa_metric_call_threshold,
    gepa_reflection_minibatch_size,
    read_run_request,
)
from .reporter import ReportNotReadyError, read_run_report
from .store import RunState, RunStore


class ConfirmationRequiredError(LazyGoalGEPAError):
    """Raised when start or resume is invoked without the explicit --yes confirmation gate."""


class ProfileDriftError(LazyGoalGEPAError):
    """Raised when the target profile has drifted from its frozen digest during resume."""


_TUA_INSPECTION_MAX_OUTPUT_CHARS = 4 * 1024 * 1024
_TUA_INSPECTION_MAX_DIAGNOSTIC_CHARS = 4 * 1024


def _stable_digest(value: Any) -> str:
    canonical = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _request_artifact_digests(
    request: GEPARunRequest,
    workspace_root: Path,
) -> list[dict[str, str]]:
    paths = {Path(example.manifest_path).resolve() for example in request.trainset}
    if request.valset is not None:
        paths.update(Path(example.manifest_path).resolve() for example in request.valset)
    if request.final_comparison is not None:
        for environment in (
            request.final_comparison.gaia,
            request.final_comparison.alfworld,
        ):
            if environment is not None and environment.manifest_path is not None:
                paths.add(Path(environment.manifest_path).resolve())
    if request.reflection_prompt_template is not None:
        paths.add(
            resolve_reflection_prompt_template_path(
                request.reflection_prompt_template,
                workspace_root=workspace_root,
            )
        )

    digests: list[dict[str, str]] = []
    for path in sorted(paths, key=str):
        try:
            content = path.read_bytes()
        except OSError as error:
            raise DatasetValidationError(
                f"Could not read a frozen GEPA input file: {path}"
            ) from error
        digests.append(
            {
                "path": str(path),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
    return digests


def _preflight_input_digest(
    request: GEPARunRequest,
    *,
    profile_digest: str,
    working_model: ModelIdentity,
    reflection_model: ModelIdentity,
    tua_dataset_inspection: dict[str, Any] | None,
    artifact_digests: list[dict[str, str]],
) -> str:
    return _stable_digest(
        {
            "request": request.to_dict(),
            "artifactDigests": artifact_digests,
            "profileDigest": profile_digest,
            "models": {
                "working": working_model.to_dict(),
                "reflection": reflection_model.to_dict(),
            },
            "tuaDatasetInspection": tua_dataset_inspection,
        }
    )


def _with_confirmation_digest(preflight: dict[str, Any]) -> dict[str, Any]:
    result = dict(preflight)
    result["confirmationDigest"] = _stable_digest(result)
    return result


def launch_detached_worker(
    run_dir: Path | str,
    worker_cmd: list[str] | None = None,
    extra_env: Mapping[str, str] | None = None,
    workspace_root: Path | str | None = None,
) -> int:
    """Launch an independent background worker detached from the caller session.

    The child process is detached via `start_new_session=True` (setsid), has stdin
    bound to DEVNULL, and its stdout and stderr redirected to `<run_dir>/worker.log`.
    """
    resolved_run_dir = Path(run_dir).resolve()
    resolved_workspace_root = (
        Path(workspace_root).resolve() if workspace_root is not None else None
    )
    resolved_run_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(resolved_run_dir, 0o700)
    except OSError:
        pass
    log_file_path = resolved_run_dir / "worker.log"

    if worker_cmd is not None:
        cmd = list(worker_cmd)
    elif "LAZYGOAL_GEPA_WORKER_CMD" in os.environ:
        raw_cmd = os.environ["LAZYGOAL_GEPA_WORKER_CMD"]
        formatted_cmd = raw_cmd.format(
            run_dir=str(resolved_run_dir),
            run_id=resolved_run_dir.name,
            workspace_root=(
                str(resolved_workspace_root)
                if resolved_workspace_root is not None
                else ""
            ),
        )
        cmd = shlex.split(formatted_cmd)
    else:
        cmd = [
            sys.executable,
            "-m",
            "lazygoal_gepa.cli",
            "worker",
            "--run-dir",
            str(resolved_run_dir),
        ]
        if resolved_workspace_root is not None:
            cmd.extend(["--workspace-root", str(resolved_workspace_root)])

    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)

    worker_cwd = resolved_workspace_root or resolved_run_dir
    log_file = open(log_file_path, "a", encoding="utf-8")
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=str(worker_cwd),
            env=env,
            start_new_session=True,
            close_fds=True,
        )
        # Mark returncode as set so Popen.__del__ will not emit ResourceWarning for detached process
        proc.returncode = 0
        return proc.pid
    finally:
        log_file.close()


class LifecycleController:
    """Coordinates GEPA run lifecycle operations across persistent storage and detached workers."""

    def __init__(
        self,
        workspace_root: Path | str | None = None,
        runs_dir: Path | str | None = None,
        profile_path: Path | str | None = None,
        working_model: ModelIdentity | None = None,
        reflection_model: ModelIdentity | None = None,
        worker_cmd: list[str] | None = None,
    ) -> None:
        if workspace_root is not None:
            self.workspace_root = Path(workspace_root).resolve()
        else:
            repo_root = Path(__file__).resolve().parents[4]
            if (repo_root / "packages").is_dir() and (repo_root / "benchmarks").is_dir():
                self.workspace_root = repo_root
            else:
                self.workspace_root = Path.cwd().resolve()
        self.runs_dir = (
            Path(runs_dir).resolve()
            if runs_dir is not None
            else (resolve_workspace_home(self.workspace_root) / "gepa" / "runs")
        )
        self.profile_path = (
            Path(profile_path).resolve()
            if profile_path is not None
            else (resolve_lazygoal_home() / "agent-profiles" / "default.json")
        )
        if (working_model is None) != (reflection_model is None):
            raise ConfigurationError(
                "Working and reflection model identities must be provided together"
            )
        self._resolved_models = (
            (working_model, reflection_model)
            if working_model is not None and reflection_model is not None
            else None
        )
        self.worker_cmd = worker_cmd
        self.store = RunStore(self.runs_dir)

    def _models(self) -> tuple[ModelIdentity, ModelIdentity]:
        if self._resolved_models is None:
            self._resolved_models = resolve_model_identities(self.workspace_root)
        return self._resolved_models

    @property
    def working_model(self) -> ModelIdentity:
        return self._models()[0]

    @property
    def reflection_model(self) -> ModelIdentity:
        return self._models()[1]

    def preflight(self, request_path: Path | str) -> dict[str, Any]:
        """检查 Run 输入；TUA 请求会经只读 Inspector 校验本地数据与镜像身份。"""
        ensure_gepa_compatibility()

        req = read_run_request(request_path, check_manifests=True)
        tua_dataset_inspection = self._inspect_tua_dataset(req)

        if req.reflection_prompt_template is not None:
            load_and_render_reflection_prompt_template(
                req.reflection_prompt_template,
                benchmark=req.benchmark,
                workspace_root=self.workspace_root,
            )

        if not self.profile_path.is_file():
            raise ProfileValidationError(
                f"Target profile file does not exist: {self.profile_path}"
            )
        snapshot, frozen_digest = load_agent_profile(self.profile_path)
        extract_seed_candidate(snapshot)

        working_model, reflection_model = self._models()
        artifact_digests = _request_artifact_digests(req, self.workspace_root)

        train_count = (
            len(req.tua_dataset.train_task_ids)
            if req.tua_dataset is not None
            else len(req.trainset)
        )
        validation_count = (
            len(req.tua_dataset.validation_task_ids)
            if req.tua_dataset is not None
            else len(req.valset) if req.valset is not None else len(req.trainset)
        )
        gepa_stop_threshold, iteration_evaluation_reserve = gepa_metric_call_threshold(
            req,
            train_count=train_count,
            validation_count=validation_count,
        )

        result: dict[str, Any] = {
            "valid": True,
            "benchmark": req.benchmark,
            "reflectionPromptTemplate": req.reflection_prompt_template,
            "sampleCount": {
                "train": train_count,
                "validation": validation_count,
            },
            "maxMetricCalls": req.max_metric_calls,
            "targetProfile": {
                "profileId": snapshot.id,
                "profilePath": str(self.profile_path),
                "frozenDigest": frozen_digest,
                "systemPromptCharacters": len(snapshot.system_prompt),
                "instructionCount": len(snapshot.instructions),
            },
            "models": {
                "working": working_model.to_dict(),
                "reflection": reflection_model.to_dict(),
            },
            "estimatedSideEffects": {
                "willMutateProfile": req.publication_policy != "candidate-only",
                "targetProfilePath": str(self.profile_path),
                "incursLlmCosts": True,
                "incursContainerExecution": True,
            },
        }
        if req.tua_dataset is not None:
            assert tua_dataset_inspection is not None
            assert req.final_comparison is not None
            result["tuaDatasetInspection"] = tua_dataset_inspection
            result["finalComparison"] = req.final_comparison.to_dict()
            result["executionLimits"] = {
                "maxMetricCalls": req.max_metric_calls,
                "reflectionMinibatchSize": gepa_reflection_minibatch_size(
                    req,
                    train_count=train_count,
                ),
                "gepaStopThreshold": gepa_stop_threshold,
                "iterationEvaluationReserve": iteration_evaluation_reserve,
                "taskTimeouts": [
                    {
                        "taskId": task_id,
                        "agentTimeoutSec": task["agentTimeoutSec"],
                        "verifierTimeoutSec": task["verifierTimeoutSec"],
                    }
                    for task_id, task in sorted(
                        tua_dataset_inspection["tasks"].items()
                    )
                ],
            }
            result["inputDigest"] = _preflight_input_digest(
                req,
                profile_digest=frozen_digest,
                working_model=working_model,
                reflection_model=reflection_model,
                tua_dataset_inspection=tua_dataset_inspection,
                artifact_digests=artifact_digests,
            )
            result["costEstimate"] = {
                "status": "unknown",
                "reason": "Provider and container pricing cannot be reliably inferred from the run request.",
            }
            result["estimatedSideEffects"]["publicationPolicy"] = req.publication_policy
        return _with_confirmation_digest(result)

    def preflight_resume(self, run_id: str) -> dict[str, Any]:
        """Return a fresh TUA resume summary and reject drift from the frozen run inputs."""
        manifest = self.store.read_manifest(run_id)
        if manifest.request.tua_dataset is None:
            raise GEPARunProtocolError(
                "Resume preflight digest is only required for TUA GEPA runs"
            )
        if manifest.preflight_input_digest is None:
            raise GEPARunProtocolError(
                "TUA run manifest is missing its frozen preflight input digest"
            )

        state = self.store.read_state(run_id)
        if state.max_metric_calls != manifest.request.max_metric_calls:
            raise RunStoreError(
                "TUA GEPA run state budget does not match its frozen manifest",
                code="corrupted",
            )
        if state.metric_calls > manifest.request.max_metric_calls:
            raise GEPARunProtocolError(
                "TUA GEPA run has already exceeded its frozen metric-call budget"
            )
        working_model, reflection_model = self._models()
        if (
            working_model != manifest.working_model
            or reflection_model != manifest.reflection_model
        ):
            raise ConfigurationError(
                "Working or reflection model identity has drifted from frozen run manifest"
            )

        target_profile_path = Path(manifest.target_profile.profile_path).resolve()
        if not target_profile_path.is_file():
            raise ProfileDriftError(
                f"Target profile file does not exist: {target_profile_path}"
            )
        _, current_profile_digest = load_agent_profile(target_profile_path)
        if current_profile_digest != manifest.target_profile.frozen_digest:
            raise ProfileDriftError(
                f"Target profile {target_profile_path} has drifted since run creation"
            )

        inspection = self._inspect_tua_dataset(manifest.request)
        if inspection != manifest.tua_dataset_inspection:
            raise DatasetValidationError(
                "TUA dataset or task resource identity has drifted from the frozen run"
            )
        artifact_digests = _request_artifact_digests(
            manifest.request,
            self.workspace_root,
        )
        current_input_digest = _preflight_input_digest(
            manifest.request,
            profile_digest=current_profile_digest,
            working_model=working_model,
            reflection_model=reflection_model,
            tua_dataset_inspection=inspection,
            artifact_digests=artifact_digests,
        )
        if current_input_digest != manifest.preflight_input_digest:
            raise DatasetValidationError(
                "TUA GEPA preflight inputs have drifted from the frozen run"
            )
        assert manifest.request.tua_dataset is not None
        gepa_stop_threshold, iteration_evaluation_reserve = gepa_metric_call_threshold(
            manifest.request,
            train_count=len(manifest.request.tua_dataset.train_task_ids),
            validation_count=len(manifest.request.tua_dataset.validation_task_ids),
        )

        result: dict[str, Any] = {
            "valid": True,
            "operation": "resume",
            "runId": run_id,
            "lifecycleStatus": state.lifecycle_status,
            "stopRequested": state.stop_requested or self.store.has_stop_request(run_id),
            "benchmark": manifest.request.benchmark,
            "metricCalls": state.metric_calls,
            "maxMetricCalls": state.max_metric_calls,
            "candidateCount": state.candidate_count,
            "bestScore": state.best_score,
            "bestCandidateId": state.best_candidate_id,
            "seedCandidateId": manifest.seed_candidate_id,
            "targetProfile": {
                "profileId": manifest.target_profile.profile_id,
                "profilePath": manifest.target_profile.profile_path,
                "frozenDigest": current_profile_digest,
            },
            "models": {
                "working": working_model.to_dict(),
                "reflection": reflection_model.to_dict(),
            },
            "tuaDatasetInspection": inspection,
            "finalComparison": manifest.request.final_comparison.to_dict(),
            "executionLimits": {
                "maxMetricCalls": manifest.request.max_metric_calls,
                "reflectionMinibatchSize": gepa_reflection_minibatch_size(
                    manifest.request,
                    train_count=len(manifest.request.tua_dataset.train_task_ids),
                ),
                "gepaStopThreshold": gepa_stop_threshold,
                "iterationEvaluationReserve": iteration_evaluation_reserve,
                "taskTimeouts": [
                    {
                        "taskId": task_id,
                        "agentTimeoutSec": task["agentTimeoutSec"],
                        "verifierTimeoutSec": task["verifierTimeoutSec"],
                    }
                    for task_id, task in sorted(inspection["tasks"].items())
                ],
            },
            "inputDigest": current_input_digest,
            "estimatedSideEffects": {
                "willMutateProfile": False,
                "targetProfilePath": manifest.target_profile.profile_path,
                "incursLlmCosts": True,
                "incursContainerExecution": True,
                "publicationPolicy": "candidate-only",
            },
        }
        return _with_confirmation_digest(result)

    def _inspect_tua_dataset(self, req: GEPARunRequest) -> dict[str, Any] | None:
        if req.tua_dataset is None:
            return None

        request_payload = {"tuaDataset": req.tua_dataset.to_dict()}
        task_count = (
            len(req.tua_dataset.train_task_ids)
            + len(req.tua_dataset.validation_task_ids)
            + len(req.tua_dataset.holdout_task_ids)
        )
        timeout_seconds = max(60, task_count * 30 + 30)
        try:
            executable = resolve_lazygoal_executable(self.workspace_root)
            with tempfile.TemporaryDirectory(prefix="lazygoal-gepa-tua-preflight-") as temporary:
                request_file = Path(temporary) / "inspect-request.json"
                request_file.write_text(
                    json.dumps(request_payload, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8",
                )
                completed = subprocess.run(
                    [
                        str(executable),
                        "gepa",
                        "inspect-tua",
                        "--request",
                        str(request_file),
                    ],
                    cwd=str(self.workspace_root),
                    env=os.environ.copy(),
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=timeout_seconds,
                )
        except (OSError, subprocess.SubprocessError) as error:
            raise DatasetValidationError(
                f"Could not inspect TUA GEPA dataset: {error}"
            ) from error

        if completed.returncode != 0:
            diagnostic = completed.stderr.strip()[:_TUA_INSPECTION_MAX_DIAGNOSTIC_CHARS]
            raise DatasetValidationError(
                "TUA GEPA dataset inspection failed"
                + (f": {diagnostic}" if diagnostic else f" (exit {completed.returncode})")
            )
        output = completed.stdout.strip()
        if not output or len(output) > _TUA_INSPECTION_MAX_OUTPUT_CHARS or "\n" in output:
            raise DatasetValidationError(
                "TUA GEPA dataset inspector returned invalid bounded output"
            )
        try:
            inspection = json.loads(output)
            return _validate_tua_dataset_inspection(inspection, req)
        except ProfileValidationError as error:
            raise DatasetValidationError(
                f"TUA GEPA dataset inspector returned invalid data: {error}"
            ) from error
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise DatasetValidationError(
                f"TUA GEPA dataset inspector returned invalid data: {error}"
            ) from error

    def start(
        self,
        request_path: Path | str,
        yes: bool = False,
        confirmation_digest: str | None = None,
    ) -> dict[str, Any]:
        """Start a new GEPA run after preflight validation, spawning a detached worker."""
        if not yes:
            raise ConfirmationRequiredError(
                "Confirmation (--yes) is required to start a GEPA run. "
                "Starting a run incurs LLM API costs and container execution, and may update "
                "the default profile upon completion. Re-run with --yes to confirm."
            )

        preflight = self.preflight(request_path)
        working_model, reflection_model = self._models()
        req = read_run_request(request_path, check_manifests=True)
        snapshot, frozen_digest = load_agent_profile(self.profile_path)
        current_tua_inspection = None
        if req.tua_dataset is not None:
            if confirmation_digest != preflight["confirmationDigest"]:
                raise ConfirmationRequiredError(
                    "TUA GEPA start requires the confirmationDigest from the current preflight; "
                    "repeat preflight and review its summary if any input changed"
                )
            current_tua_inspection = self._inspect_tua_dataset(req)
            if current_tua_inspection != preflight["tuaDatasetInspection"]:
                raise ConfirmationRequiredError(
                    "TUA dataset identity changed while start was being prepared; repeat preflight"
                )
            artifact_digests = _request_artifact_digests(req, self.workspace_root)
            current_input_digest = _preflight_input_digest(
                req,
                profile_digest=frozen_digest,
                working_model=working_model,
                reflection_model=reflection_model,
                tua_dataset_inspection=current_tua_inspection,
                artifact_digests=artifact_digests,
            )
            if (
                frozen_digest != preflight["targetProfile"]["frozenDigest"]
                or current_input_digest != preflight["inputDigest"]
            ):
                raise ConfirmationRequiredError(
                    "TUA GEPA inputs changed while start was being prepared; repeat preflight"
                )
        seed_candidate = extract_seed_candidate(snapshot)
        seed_candidate_id = _fingerprint(snapshot.system_prompt, snapshot.instructions)

        now_dt = datetime.now(timezone.utc)
        timestamp_str = now_dt.strftime("%Y%m%d_%H%M%S")
        run_id = f"run_{timestamp_str}_{uuid.uuid4().hex[:8]}"

        manifest = FrozenRunManifest(
            protocol="gepa-run@1",
            run_id=run_id,
            created_at=now_dt.isoformat(),
            gepa_version=EXPECTED_GEPA_VERSION,
            request=req,
            target_profile=TargetProfileSnapshot(
                profile_id=snapshot.id,
                profile_path=str(self.profile_path),
                frozen_digest=frozen_digest,
                profile=snapshot,
            ),
            seed_candidate=seed_candidate,
            seed_candidate_id=seed_candidate_id,
            working_model=working_model,
            reflection_model=reflection_model,
            tua_dataset_inspection=current_tua_inspection or preflight.get("tuaDatasetInspection"),
            preflight_input_digest=preflight.get("inputDigest"),
        )

        run_dir = self.store.initialize_run(manifest)
        worker_pid = launch_detached_worker(
            run_dir,
            worker_cmd=self.worker_cmd,
            workspace_root=self.workspace_root,
        )

        return {
            "runId": run_id,
            "lifecycleStatus": "starting",
            "runDir": str(run_dir),
            "workerPid": worker_pid,
        }

    def status(self, run_id: str) -> dict[str, Any]:
        """Query authoritative run status in a strictly read-only manner."""
        run_dir = self.store.get_run_dir(run_id)
        manifest = self.store.read_manifest(run_id)
        state = self.store.read_state(run_id)

        ownership = RunOwnership(run_dir)
        worker_health, owner_info = ownership.check_health()
        stop_requested = state.stop_requested or self.store.has_stop_request(run_id)

        effective_lifecycle_status = state.lifecycle_status
        if state.lifecycle_status == "running" and stop_requested:
            effective_lifecycle_status = "stop_requested"

        return {
            "runId": state.run_id,
            "lifecycleStatus": effective_lifecycle_status,
            "workerHealth": worker_health,
            "workerPid": owner_info.pid if owner_info else None,
            "stopRequested": stop_requested,
            "benchmark": manifest.request.benchmark,
            "metricCalls": state.metric_calls,
            "maxMetricCalls": state.max_metric_calls,
            "candidateCount": state.candidate_count,
            "bestScore": state.best_score,
            "bestCandidateId": state.best_candidate_id,
            "publicationStatus": state.publication_status,
            "errorCode": state.error_code,
            "errorMessage": state.error_message,
            "createdAt": state.created_at,
            "updatedAt": state.updated_at,
            "heartbeatAt": owner_info.heartbeat_at if owner_info else None,
        }

    def stop(self, run_id: str) -> dict[str, Any]:
        """Request cooperative run stop by placing the official gepa.stop marker.

        No POSIX termination signals (SIGTERM/SIGKILL) are ever sent to worker processes.
        """
        run_dir = self.store.get_run_dir(run_id)
        if not run_dir.exists():
            raise RunStoreError(f"Run {run_id!r} not found", code="unformed")

        # Read state to ensure run is formed and check idempotence
        state = self.store.read_state(run_id)

        terminal_statuses = {"stopped", "succeeded", "publish_blocked", "failed"}
        if state.lifecycle_status in terminal_statuses:
            return {
                "runId": run_id,
                "lifecycleStatus": state.lifecycle_status,
                "stopRequested": state.stop_requested,
            }

        self.store.request_stop(run_id)
        return {
            "runId": run_id,
            "lifecycleStatus": "stop_requested",
            "stopRequested": True,
        }

    def resume(
        self,
        run_id: str,
        yes: bool = False,
        confirmation_digest: str | None = None,
    ) -> dict[str, Any]:
        """Resume an existing, uncompleted GEPA run after checking drift, ownership, and checkpoint."""
        if not yes:
            raise ConfirmationRequiredError(
                "Confirmation (--yes) is required to resume a GEPA run. "
                "Resuming incurs LLM API costs and container execution. Re-run with --yes to confirm."
            )

        run_dir = self.store.get_run_dir(run_id)
        manifest = self.store.read_manifest(run_id)
        if manifest.request.tua_dataset is not None:
            current_preflight = self.preflight_resume(run_id)
            if confirmation_digest != current_preflight["confirmationDigest"]:
                raise ConfirmationRequiredError(
                    "TUA GEPA resume requires the confirmationDigest from the current resume preflight; "
                    "repeat preflight and review its summary if run state or inputs changed"
                )
        state = self.store.read_state(run_id)

        # Preflight Check 1: Status validity
        if state.lifecycle_status == "succeeded":
            raise GEPARunProtocolError(f"Cannot resume run {run_id!r}: run already succeeded")
        if state.lifecycle_status == "publish_blocked":
            raise GEPARunProtocolError(
                f"Cannot resume run {run_id!r}: run is publish_blocked and cannot be resumed directly"
            )

        # Preflight Check 2: Active worker ownership
        health, owner = RunOwnership(run_dir).check_health()
        if health in ("active", "stale", "lost"):
            active_pid = owner.pid if owner else None
            raise WorkerAlreadyRunningError(
                f"Worker is already active for run {run_id!r} (PID {active_pid})",
                pid=active_pid,
            )

        # Preflight Check 3: Model identity and Target Profile digest drift
        working_model, reflection_model = self._models()
        if working_model != manifest.working_model or reflection_model != manifest.reflection_model:
            raise ConfigurationError(
                "Working or reflection model identity has drifted from frozen run manifest"
            )

        target_profile_path = Path(manifest.target_profile.profile_path).resolve()
        if not target_profile_path.is_file():
            raise ProfileDriftError(
                f"Target profile file does not exist: {target_profile_path}"
            )
        _, current_digest = load_agent_profile(target_profile_path)
        if current_digest != manifest.target_profile.frozen_digest:
            raise ProfileDriftError(
                f"Target profile {target_profile_path} has drifted since run creation: "
                f"expected digest {manifest.target_profile.frozen_digest}, got {current_digest}"
            )

        # Preflight Check 4: a resumable run must have a valid checkpoint.
        checkpoint_file = run_dir / "gepa" / "gepa_state.bin"
        if not checkpoint_file.is_file():
            raise RunStoreError(
                f"Checkpoint is missing for run {run_id!r}: {checkpoint_file}",
                code="checkpoint_failed",
            )
        try:
            from gepa.core.state import GEPAState

            checkpoint = GEPAState.load(str(run_dir / "gepa"))
        except Exception as exc:
            raise RunStoreError(
                f"Checkpoint is corrupted for run {run_id!r}: {exc}",
                code="checkpoint_corrupted",
            ) from exc
        if manifest.request.tua_dataset is not None:
            checkpoint_candidates = getattr(checkpoint, "program_candidates", [])
            if (
                not checkpoint_candidates
                or checkpoint_candidates[0] != manifest.seed_candidate
                or getattr(checkpoint, "total_num_evals", 0)
                > manifest.request.max_metric_calls
            ):
                raise RunStoreError(
                    f"TUA GEPA checkpoint identity or budget is invalid for run {run_id!r}",
                    code="checkpoint_corrupted",
                )

            final_preflight = self.preflight_resume(run_id)
            if final_preflight["confirmationDigest"] != confirmation_digest:
                raise ConfirmationRequiredError(
                    "TUA GEPA inputs or run state changed before resume could start; "
                    "repeat preflight and review its summary"
                )

        self.store.clear_stop_request(run_id)
        self.store.update_state(
            run_id,
            lifecycle_status="starting",
            stop_requested=False,
        )

        worker_pid = launch_detached_worker(
            run_dir,
            worker_cmd=self.worker_cmd,
            workspace_root=self.workspace_root,
        )

        return {
            "runId": run_id,
            "lifecycleStatus": "starting",
            "runDir": str(run_dir),
            "workerPid": worker_pid,
        }

    def report(self, run_id: str) -> dict[str, Any]:
        """Read authoritative final report artifact strictly read-only."""
        run_dir = self.store.get_run_dir(run_id)
        return read_run_report(run_dir)

    def wait(
        self,
        run_id: str,
        timeout_seconds: float | None = None,
        interval_seconds: float = 2.0,
    ) -> dict[str, Any]:
        """Wait until a GEPA run reaches a terminal lifecycle status.

        Polls status at interval_seconds until reaching a terminal status
        ("succeeded", "failed", "stopped", "publish_blocked") or timeout.
        If the worker health becomes "lost" and the process is no longer active,
        aborts with a RunStoreError instead of hanging indefinitely.
        """
        start_time = time.monotonic()
        terminal_statuses = {"stopped", "succeeded", "publish_blocked", "failed"}

        while True:
            current_status = self.status(run_id)
            status_name = current_status["lifecycleStatus"]

            if status_name in terminal_statuses:
                if status_name == "succeeded":
                    try:
                        report_data = self.report(run_id)
                        current_status["report"] = report_data
                    except Exception:
                        pass
                return current_status

            if current_status["workerHealth"] == "lost":
                raise RunStoreError(
                    f"Worker process for run {run_id!r} is lost and no longer active",
                    code="worker_lost",
                )

            if timeout_seconds is not None:
                elapsed = time.monotonic() - start_time
                if elapsed >= timeout_seconds:
                    raise TimeoutError(
                        f"Timed out waiting for run {run_id!r} after {timeout_seconds}s (status: {status_name})"
                    )

            time.sleep(max(0.1, interval_seconds))


def start_run(
    request_path: Path | str,
    yes: bool = False,
    runs_root: Path | str | None = None,
    workspace_root: Path | str | None = None,
    profile_path: Path | str | None = None,
    worker_cmd: list[str] | None = None,
    confirmation_digest: str | None = None,
) -> dict[str, Any]:
    """Top-level helper to start a GEPA run."""
    controller = LifecycleController(
        workspace_root=workspace_root,
        runs_dir=runs_root,
        profile_path=profile_path,
        worker_cmd=worker_cmd,
    )
    return controller.start(
        request_path,
        yes=yes,
        confirmation_digest=confirmation_digest,
    )


def get_run_status(
    run_id: str,
    runs_root: Path | str | None = None,
) -> dict[str, Any]:
    """Top-level helper to inspect GEPA run status read-only."""
    controller = LifecycleController(runs_dir=runs_root)
    return controller.status(run_id)


def stop_run(
    run_id: str,
    runs_root: Path | str | None = None,
) -> dict[str, Any]:
    """Top-level helper to cooperatively stop a GEPA run."""
    controller = LifecycleController(runs_dir=runs_root)
    return controller.stop(run_id)


def resume_run(
    run_id: str,
    yes: bool = False,
    runs_root: Path | str | None = None,
    workspace_root: Path | str | None = None,
    profile_path: Path | str | None = None,
    worker_cmd: list[str] | None = None,
    confirmation_digest: str | None = None,
) -> dict[str, Any]:
    """Top-level helper to resume an uncompleted GEPA run."""
    controller = LifecycleController(
        workspace_root=workspace_root,
        runs_dir=runs_root,
        profile_path=profile_path,
        worker_cmd=worker_cmd,
    )
    return controller.resume(
        run_id,
        yes=yes,
        confirmation_digest=confirmation_digest,
    )


def get_run_report(
    run_id: str,
    runs_root: Path | str | None = None,
) -> dict[str, Any]:
    """Top-level helper to read an authoritative GEPA run report."""
    controller = LifecycleController(runs_dir=runs_root)
    return controller.report(run_id)


def preflight_run(
    request_path: Path | str,
    workspace_root: Path | str | None = None,
    runs_root: Path | str | None = None,
    profile_path: Path | str | None = None,
) -> dict[str, Any]:
    """Top-level helper to execute read-only preflight checks."""
    controller = LifecycleController(
        workspace_root=workspace_root,
        runs_dir=runs_root,
        profile_path=profile_path,
    )
    return controller.preflight(request_path)


def wait_run(
    run_id: str,
    timeout_seconds: float | None = None,
    interval_seconds: float = 2.0,
    runs_root: Path | str | None = None,
) -> dict[str, Any]:
    """Top-level helper to wait until a GEPA run reaches a terminal status."""
    controller = LifecycleController(runs_dir=runs_root)
    return controller.wait(
        run_id,
        timeout_seconds=timeout_seconds,
        interval_seconds=interval_seconds,
    )
