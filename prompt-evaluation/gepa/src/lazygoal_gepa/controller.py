"""Lifecycle controller and detached background worker management for GEPA runs."""

from __future__ import annotations

import os
import shlex
import subprocess
import sys
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
from .ownership import OwnerInfo, RunOwnership, WorkerHealth, is_pid_alive
from .model_resolver import resolve_model_identities
from .protocol import GEPARunRequest, read_run_request, validate_gaia_minimal_request
from .reporter import ReportNotReadyError, read_run_report
from .store import RunState, RunStore


class ConfirmationRequiredError(LazyGoalGEPAError):
    """Raised when start or resume is invoked without the explicit --yes confirmation gate."""


class ProfileDriftError(LazyGoalGEPAError):
    """Raised when the target profile has drifted from its frozen digest during resume."""


_GAIA_WORKER_PROFILE_ID = "gaia-worker-profile"


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
    resolved_run_dir.mkdir(parents=True, exist_ok=True)
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
        self.workspace_root = (
            Path(workspace_root).resolve()
            if workspace_root is not None
            else Path.cwd().resolve()
        )
        self.runs_dir = (
            Path(runs_dir).resolve()
            if runs_dir is not None
            else (self.workspace_root / ".lazygoal" / "gepa" / "runs")
        )
        self.profile_path = (
            Path(profile_path).resolve()
            if profile_path is not None
            else (self.workspace_root / ".lazygoal" / "profiles" / "default.json")
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
        """Perform read-only preflight consistency checks without creating files or processes."""
        ensure_gepa_compatibility()

        req = read_run_request(request_path, check_manifests=True)
        validate_gaia_minimal_request(req)

        if not self.profile_path.is_file():
            raise ProfileValidationError(
                f"Target profile file does not exist: {self.profile_path}"
            )
        snapshot, frozen_digest = load_agent_profile(self.profile_path)
        if req.benchmark == "gaia" and snapshot.id != _GAIA_WORKER_PROFILE_ID:
            raise ProfileValidationError(
                "GAIA lifecycle requires target Profile id 'gaia-worker-profile'"
            )
        extract_seed_candidate(snapshot)

        working_model, reflection_model = self._models()

        return {
            "valid": True,
            "benchmark": req.benchmark,
            "sampleCount": {
                "train": len(req.trainset),
                "validation": len(req.valset) if req.valset is not None else len(req.trainset),
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
                "willMutateProfile": True,
                "targetProfilePath": str(self.profile_path),
                "incursLlmCosts": True,
                "incursContainerExecution": True,
            },
        }

    def start(
        self,
        request_path: Path | str,
        yes: bool = False,
    ) -> dict[str, Any]:
        """Start a new GEPA run after preflight validation, spawning a detached worker."""
        if not yes:
            raise ConfirmationRequiredError(
                "Confirmation (--yes) is required to start a GEPA run. "
                "Starting a run incurs LLM API costs and container execution, and may update "
                "the default profile upon completion. Re-run with --yes to confirm."
            )

        self.preflight(request_path)
        working_model, reflection_model = self._models()
        req = read_run_request(request_path, check_manifests=True)
        snapshot, frozen_digest = load_agent_profile(self.profile_path)
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
    ) -> dict[str, Any]:
        """Resume an existing, uncompleted GEPA run after checking drift, ownership, and checkpoint."""
        if not yes:
            raise ConfirmationRequiredError(
                "Confirmation (--yes) is required to resume a GEPA run. "
                "Resuming incurs LLM API costs and container execution. Re-run with --yes to confirm."
            )

        run_dir = self.store.get_run_dir(run_id)
        manifest = self.store.read_manifest(run_id)
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

            GEPAState.load(str(run_dir / "gepa"))
        except Exception as exc:
            raise RunStoreError(
                f"Checkpoint is corrupted for run {run_id!r}: {exc}",
                code="checkpoint_corrupted",
            ) from exc

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


def start_run(
    request_path: Path | str,
    yes: bool = False,
    runs_root: Path | str | None = None,
    workspace_root: Path | str | None = None,
    profile_path: Path | str | None = None,
    worker_cmd: list[str] | None = None,
) -> dict[str, Any]:
    """Top-level helper to start a GEPA run."""
    controller = LifecycleController(
        workspace_root=workspace_root,
        runs_dir=runs_root,
        profile_path=profile_path,
        worker_cmd=worker_cmd,
    )
    return controller.start(request_path, yes=yes)


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
) -> dict[str, Any]:
    """Top-level helper to resume an uncompleted GEPA run."""
    controller = LifecycleController(
        workspace_root=workspace_root,
        runs_dir=runs_root,
        profile_path=profile_path,
        worker_cmd=worker_cmd,
    )
    return controller.resume(run_id, yes=yes)


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
