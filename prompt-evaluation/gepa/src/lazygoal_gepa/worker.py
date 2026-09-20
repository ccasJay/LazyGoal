"""Background worker orchestration and official GEPA loop execution."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import gepa
from gepa.core.callbacks import (
    BudgetUpdatedEvent,
    GEPACallback,
    IterationEndEvent,
    StateSavedEvent,
)
from gepa.core.result import GEPAResult
from gepa.core.state import GEPAState

from .adapter import LazyGoalGEPAAdapter
from .candidate import (
    AgentProfileSnapshot,
    CandidateCodec,
    FrozenRunManifest,
    ModelIdentity,
    _fingerprint,
)
from .errors import (
    LazyGoalGEPAError,
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
)
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig
from .ownership import RunOwnership
from .reporter import generate_and_save_run_report
from .store import RunStore, atomic_write_json


class ReflectionExecutionError(LazyGoalGEPAError):
    """Raised when the reflection LM bridge process fails or returns an error."""


class ReflectionLMClient:
    """Callable language model client bridging official GEPA reflections to TypeScript CLI."""

    def __init__(
        self,
        reflection_model: ModelIdentity,
        reflection_dir: Path | str,
        executable: Path | str,
        workspace_root: Path | str | None = None,
    ) -> None:
        self.reflection_model = reflection_model
        self.reflection_dir = Path(reflection_dir).resolve()
        self.reflection_dir.mkdir(parents=True, exist_ok=True)
        self.executable = Path(executable).resolve()
        self.workspace_root = (
            Path(workspace_root).resolve() if workspace_root is not None else Path.cwd()
        )
        self._counter = 0

    def __call__(self, prompt: str | list[dict[str, Any]]) -> str:
        self._counter += 1
        call_id = f"{self._counter}_{uuid.uuid4().hex[:6]}"
        request_file = self.reflection_dir / f"request_{call_id}.json"

        req_payload = {
            "model": {
                "configId": self.reflection_model.profile_name,
                "modelId": self.reflection_model.model_id,
            },
            "prompt": prompt,
        }
        atomic_write_json(request_file, req_payload)

        # Allow test injection/override for fast offline testing
        if "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT" in os.environ:
            return os.environ["LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT"]

        cmd = [
            str(self.executable),
            "gepa",
            "reflect",
            "--request",
            str(request_file),
        ]
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=str(self.workspace_root),
                timeout=120,
            )
        except Exception as exc:
            raise ReflectionExecutionError(
                f"Failed to invoke reflection bridge command {cmd}: {exc}"
            ) from exc

        if proc.returncode != 0:
            err_msg = proc.stderr.strip() or f"process exited with code {proc.returncode}"
            raise ReflectionExecutionError(f"Reflection bridge error: {err_msg}")

        try:
            res = json.loads(proc.stdout.strip())
            if not isinstance(res, dict) or "text" not in res:
                raise ValueError("Response missing 'text' field")
            return str(res["text"])
        except Exception as exc:
            raise ReflectionExecutionError(
                f"Invalid JSON output from reflection bridge: {proc.stdout.strip()}"
            ) from exc


class WorkerProgressCallback(GEPACallback):
    """Callback hook updating heartbeat and projecting progress into authoritative store."""

    def __init__(
        self,
        run_id: str,
        store: RunStore,
        ownership: RunOwnership,
    ) -> None:
        self.run_id = run_id
        self.store = store
        self.ownership = ownership
        self._codec = CandidateCodec()

    def on_iteration_end(self, event: IterationEndEvent) -> None:
        self.ownership.update_heartbeat()
        state = event["state"]
        self._sync_state(state)

    def on_budget_updated(self, event: BudgetUpdatedEvent) -> None:
        self.ownership.update_heartbeat()
        metric_calls_used = event["metric_calls_used"]
        self.store.update_state(self.run_id, metric_calls=metric_calls_used)

    def on_state_saved(self, event: StateSavedEvent) -> None:
        self.ownership.update_heartbeat()

    def _sync_state(self, state: GEPAState) -> None:
        metric_calls = getattr(state, "total_num_evals", 0)
        candidates = getattr(state, "program_candidates", [])
        candidate_count = len(candidates)

        scores = getattr(state, "program_full_scores_val_set", None)
        best_score = None
        best_candidate_id = None

        if scores and len(scores) > 0:
            max_score = max(scores)
            best_score = float(max_score)
            best_index = scores.index(max_score)
            if best_index < len(candidates):
                best_cand = candidates[best_index]
                try:
                    prompt = self._codec.decode(best_cand)
                    best_candidate_id = prompt.candidate_id
                except Exception:
                    best_candidate_id = f"cand_{best_index}"

        self.store.update_state(
            self.run_id,
            metric_calls=metric_calls,
            candidate_count=candidate_count,
            best_score=best_score,
            best_candidate_id=best_candidate_id,
        )


def _resolve_executable(workspace_root: Path) -> Path:
    if "LAZYGOAL_EXECUTABLE" in os.environ:
        return Path(os.environ["LAZYGOAL_EXECUTABLE"]).resolve()
    candidate = workspace_root / "bin" / "lazygoal.cjs"
    if candidate.is_file():
        return candidate.resolve()
    return Path(sys.executable).resolve()


def _save_best_profile(
    run_dir: Path,
    manifest: FrozenRunManifest,
    best_candidate: dict[str, str],
) -> Path:
    """Save the best candidate assembled into an AgentProfileSnapshot."""
    codec = CandidateCodec()
    prompt = codec.decode(best_candidate)
    orig_profile = manifest.target_profile.profile

    best_snapshot = AgentProfileSnapshot(
        schema_version=orig_profile.schema_version,
        id=orig_profile.id,
        name=orig_profile.name,
        description=orig_profile.description,
        system_prompt=prompt.system_prompt,
        instructions=prompt.instructions,
        tool_ids=orig_profile.tool_ids,
    )
    best_profile_path = run_dir / "artifacts" / "best-profile.json"
    atomic_write_json(best_profile_path, best_snapshot.to_dict())
    return best_profile_path


def run_gepa_worker(
    run_dir: Path | str,
    workspace_root: Path | str | None = None,
    max_duration: float | None = None,
) -> int:
    """Execute the full GEPA background worker loop.

    Acquires exclusive lock, loads frozen manifest, sets up Adapter and Reflection client,
    drives official gepa.optimize(), handles cooperative stop via gepa.stop, and generates
    terminal report.
    """
    resolved_run_dir = Path(run_dir).resolve()
    store = RunStore(resolved_run_dir.parent)
    ownership = RunOwnership(resolved_run_dir)
    run_id = resolved_run_dir.name

    resolved_workspace = (
        Path(workspace_root).resolve()
        if workspace_root is not None
        else Path.cwd().resolve()
    )

    try:
        ownership.acquire()
    except Exception as exc:
        sys.stderr.write(f"Worker could not acquire ownership: {exc}\n")
        try:
            store.update_state(
                run_id,
                lifecycle_status="failed",
                error_code="worker_acquire_failed",
                error_message=str(exc),
            )
            generate_and_save_run_report(resolved_run_dir)
        except Exception:
            pass
        return 1

    try:
        manifest = store.read_manifest(run_id)
        store.update_state(run_id, lifecycle_status="running")

        executable = _resolve_executable(resolved_workspace)
        adapter_output_dir = resolved_run_dir / "adapter"
        adapter_output_dir.mkdir(parents=True, exist_ok=True)

        config = LazyGoalGEPAConfig(
            benchmark_id=manifest.request.benchmark,
            base_profile_id=manifest.target_profile.profile_id,
            model_config_id=manifest.working_model.profile_name,
            model_id=manifest.working_model.model_id,
            output_directory=adapter_output_dir,
            lazygoal_executable=executable,
        )
        adapter = LazyGoalGEPAAdapter(config)

        reflection_client = ReflectionLMClient(
            reflection_model=manifest.reflection_model,
            reflection_dir=resolved_run_dir / "reflection",
            executable=executable,
            workspace_root=resolved_workspace,
        )

        progress_callback = WorkerProgressCallback(
            run_id=run_id,
            store=store,
            ownership=ownership,
        )

        trainset = [
            LazyGoalEvaluationExample(
                sample_id=item.sample_id,
                benchmark_id=manifest.request.benchmark,
                task_id=item.task_id,
                manifest_path=Path(item.manifest_path),
            )
            for item in manifest.request.trainset
        ]
        valset = (
            [
                LazyGoalEvaluationExample(
                    sample_id=item.sample_id,
                    benchmark_id=manifest.request.benchmark,
                    task_id=item.task_id,
                    manifest_path=Path(item.manifest_path),
                )
                for item in manifest.request.valset
            ]
            if manifest.request.valset is not None
            else None
        )

        gepa_dir = resolved_run_dir / "gepa"
        gepa_dir.mkdir(parents=True, exist_ok=True)

        if store.has_stop_request(run_id):
            checkpoint_file = gepa_dir / "gepa_state.bin"
            if not checkpoint_file.is_file():
                try:
                    from gepa.core.state import GEPAState

                    initial_state = GEPAState(
                        program_candidates=[manifest.seed_candidate],
                        current_program_index=0,
                    )
                    initial_state.save(str(gepa_dir))
                except Exception:
                    pass
            store.update_state(
                run_id,
                lifecycle_status="stopped",
                stop_requested=True,
            )
            generate_and_save_run_report(resolved_run_dir)
            return 0

        # Execute official gepa.optimize
        result: GEPAResult = gepa.optimize(
            seed_candidate=manifest.seed_candidate,
            trainset=trainset,
            valset=valset,
            adapter=adapter,
            reflection_lm=reflection_client,
            max_metric_calls=manifest.request.max_metric_calls,
            reflection_minibatch_size=manifest.request.reflection_minibatch_size,
            run_dir=str(gepa_dir),
            seed=manifest.request.seed if manifest.request.seed is not None else 0,
            display_progress_bar=False,
            callbacks=[progress_callback],
        )

        # Check if stopped cooperatively via gepa.stop
        if store.has_stop_request(run_id):
            best_cand_id = None
            best_score = None
            if result.best_candidate is not None:
                try:
                    best_cand_id = CandidateCodec().decode(result.best_candidate).candidate_id
                except Exception:
                    pass
            if result.val_aggregate_scores:
                best_score = result.val_aggregate_scores[result.best_idx]

            store.update_state(
                run_id,
                lifecycle_status="stopped",
                stop_requested=True,
                metric_calls=result.total_metric_calls,
                candidate_count=len(result.candidates),
                best_score=best_score,
                best_candidate_id=best_cand_id,
            )
            generate_and_save_run_report(resolved_run_dir)
            return 0

        # Normal completion -> succeeded
        best_cand_id = None
        best_score = None
        if result.best_candidate is not None:
            try:
                _save_best_profile(resolved_run_dir, manifest, result.best_candidate)
                best_cand_id = CandidateCodec().decode(result.best_candidate).candidate_id
            except Exception:
                pass

        if result.val_aggregate_scores:
            best_score = result.val_aggregate_scores[result.best_idx]

        store.update_state(
            run_id,
            lifecycle_status="succeeded",
            metric_calls=result.total_metric_calls,
            candidate_count=len(result.candidates),
            best_score=best_score,
            best_candidate_id=best_cand_id,
        )
        generate_and_save_run_report(resolved_run_dir)
        return 0

    except Exception as exc:
        if store.has_stop_request(run_id):
            try:
                store.update_state(
                    run_id,
                    lifecycle_status="stopped",
                    stop_requested=True,
                )
                generate_and_save_run_report(resolved_run_dir)
            except Exception:
                pass
            return 0

        error_code = "optimization_failed"
        if isinstance(
            exc,
            (
                PromptEvaluationInfrastructureError,
                PromptEvaluationProtocolError,
                PromptEvaluationCancelled,
            ),
        ):
            error_code = "evaluation_failed"
        elif isinstance(exc, ReflectionExecutionError):
            error_code = "reflection_failed"

        try:
            store.update_state(
                run_id,
                lifecycle_status="failed",
                error_code=error_code,
                error_message=str(exc),
            )
            generate_and_save_run_report(resolved_run_dir)
        except Exception:
            pass
        return 1
    finally:
        ownership.release()
