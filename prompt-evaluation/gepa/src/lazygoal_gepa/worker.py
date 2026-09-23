"""Background worker orchestration and official GEPA loop execution."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import uuid
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
    CandidateCodec,
    ModelIdentity,
)
from .errors import (
    LazyGoalGEPAError,
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
    RunStoreError,
)
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig, resolve_lazygoal_executable
from .ownership import RunOwnership
from .prompt_template import load_and_render_reflection_prompt_template
from .publisher import ProfilePublisher
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


def run_gepa_worker(
    run_dir: Path | str,
    workspace_root: Path | str | None = None,
) -> int:
    """Execute the full GEPA background worker loop.

    Acquires exclusive lock, loads frozen manifest, sets up Adapter and Reflection client,
    drives official ``gepa.optimize()`` and generates the terminal report.
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

        executable = resolve_lazygoal_executable(resolved_workspace)
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

        rendered_reflection_template: str | None = None
        if manifest.request.reflection_prompt_template is not None:
            rendered_reflection_template = load_and_render_reflection_prompt_template(
                manifest.request.reflection_prompt_template,
                benchmark=manifest.request.benchmark,
                workspace_root=resolved_workspace,
            )

        # Execute official gepa.optimize
        result: GEPAResult = gepa.optimize(
            seed_candidate=manifest.seed_candidate,
            trainset=trainset,
            valset=valset,
            adapter=adapter,
            reflection_lm=reflection_client,
            reflection_prompt_template=rendered_reflection_template,
            max_metric_calls=manifest.request.max_metric_calls,
            reflection_minibatch_size=manifest.request.reflection_minibatch_size,
            run_dir=str(gepa_dir),
            seed=manifest.request.seed if manifest.request.seed is not None else 0,
            display_progress_bar=False,
            callbacks=[progress_callback],
        )

        # Check if stopped cooperatively via the official GEPA marker and
        # validate the checkpoint written by the official engine.
        if store.has_stop_request(run_id):
            try:
                GEPAState.load(str(gepa_dir))
            except FileNotFoundError as exc:
                raise RunStoreError(
                    f"Checkpoint is missing for run {run_id!r}",
                    code="checkpoint_failed",
                ) from exc
            except Exception as exc:
                raise RunStoreError(
                    f"Checkpoint is corrupted for run {run_id!r}: {exc}",
                    code="checkpoint_corrupted",
                ) from exc
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

        # Normal completion publishes the best complete Profile before success.
        best_cand_id = None
        best_score = None
        if result.val_aggregate_scores:
            best_score = result.val_aggregate_scores[result.best_idx]

        if result.best_candidate is None:
            store.update_state(
                run_id,
                lifecycle_status="failed",
                publication_status="failed",
                metric_calls=result.total_metric_calls,
                candidate_count=len(result.candidates),
                best_score=best_score,
                error_code="publish_failed",
                error_message="GEPA completed without a best candidate to publish",
            )
            generate_and_save_run_report(resolved_run_dir)
            return 1

        publication = ProfilePublisher(
            target_path=manifest.target_profile.profile_path,
            frozen_digest=manifest.target_profile.frozen_digest,
            base_profile=manifest.target_profile.profile,
            artifacts_dir=resolved_run_dir / "artifacts",
        ).publish(result.best_candidate)
        best_cand_id = publication.candidate_id

        if publication.status == "conflict":
            lifecycle_status = "publish_blocked"
        elif publication.status == "failed":
            lifecycle_status = "failed"
        else:
            lifecycle_status = "succeeded"

        store.update_state(
            run_id,
            lifecycle_status=lifecycle_status,
            publication_status=publication.publication_status,
            metric_calls=result.total_metric_calls,
            candidate_count=len(result.candidates),
            best_score=best_score,
            best_candidate_id=best_cand_id,
            error_code=publication.error_code,
            error_message=publication.error_message,
        )
        generate_and_save_run_report(resolved_run_dir)
        return 0 if lifecycle_status == "succeeded" else 1

    except Exception as exc:
        checkpoint_error = isinstance(exc, RunStoreError) and exc.code in {
            "checkpoint_failed",
            "checkpoint_corrupted",
        }
        checkpoint_file = resolved_run_dir / "gepa" / "gepa_state.bin"
        if not checkpoint_error and checkpoint_file.is_file():
            try:
                GEPAState.load(str(checkpoint_file.parent))
            except Exception:
                checkpoint_error = True
        error_code = "optimization_failed"
        if isinstance(exc, RunStoreError) and exc.code in {
            "checkpoint_failed",
            "checkpoint_corrupted",
        }:
            error_code = exc.code
        elif checkpoint_error:
            error_code = "checkpoint_corrupted"
        elif isinstance(
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
