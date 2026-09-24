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
from gepa.core.adapter import EvaluationBatch
from gepa.core.callbacks import (
    BudgetUpdatedEvent,
    GEPACallback,
    IterationEndEvent,
    StateSavedEvent,
)
from gepa.core.result import GEPAResult
from gepa.core.state import GEPAState

from .adapter import LazyGoalEvaluationOutput, LazyGoalGEPAAdapter
from .candidate_audit import TuaCandidateLeakAuditor
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
from .final_comparison import BASE_PROFILE_IDS, FinalComparisonExecutor
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig, resolve_lazygoal_executable
from .ownership import RunOwnership
from .prompt_template import load_and_render_reflection_prompt_template
from .publisher import ProfilePublisher
from .protocol import (
    GEPAExampleRequest,
    GEPARunRequest,
    gepa_metric_call_threshold,
    gepa_reflection_minibatch_size,
)
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
        candidate_writer: ProfilePublisher | None = None,
    ) -> None:
        self.run_id = run_id
        self.store = store
        self.ownership = ownership
        self.candidate_writer = candidate_writer
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
        best_candidate: dict[str, str] | None = None

        if scores and len(scores) > 0:
            max_score = max(scores)
            best_score = float(max_score)
            best_index = scores.index(max_score)
            if best_index < len(candidates):
                best_cand = candidates[best_index]
                try:
                    prompt = self._codec.decode(best_cand)
                    best_candidate_id = prompt.candidate_id
                    best_candidate = best_cand
                except Exception:
                    best_candidate_id = f"cand_{best_index}"

        if self.candidate_writer is not None and best_candidate is not None:
            best_candidate_id = self.candidate_writer.save_candidate_artifact(best_candidate)

        self.store.update_state(
            self.run_id,
            metric_calls=metric_calls,
            candidate_count=candidate_count,
            best_score=best_score,
            best_candidate_id=best_candidate_id,
        )


class _ResumeSeedEvaluationAdapter:
    """Reuse a frozen GEPA checkpoint instead of re-running its discarded seed evaluation."""

    def __init__(
        self,
        adapter: LazyGoalGEPAAdapter,
        *,
        seed_candidate: dict[str, str],
        validation_examples: list[LazyGoalEvaluationExample],
    ) -> None:
        self._adapter = adapter
        self._seed_candidate = seed_candidate
        self._validation_identity = tuple(
            (
                example.sample_id,
                example.task_id,
                str(example.manifest_path.resolve()),
            )
            for example in validation_examples
        )
        self._pending_seed_evaluation = True

    def __getattr__(self, name: str) -> Any:
        return getattr(self._adapter, name)

    def evaluate(
        self,
        batch: list[LazyGoalEvaluationExample],
        candidate: dict[str, str],
        capture_traces: bool = False,
    ) -> EvaluationBatch[Any, LazyGoalEvaluationOutput]:
        if not self._pending_seed_evaluation:
            return self._adapter.evaluate(batch, candidate, capture_traces)
        if (
            capture_traces
            or candidate != self._seed_candidate
            or tuple(
                (
                    example.sample_id,
                    example.task_id,
                    str(example.manifest_path.resolve()),
                )
                for example in batch
            )
            != self._validation_identity
        ):
            raise RunStoreError(
                "GEPA resume attempted an unexpected initial seed evaluation"
            )
        self._pending_seed_evaluation = False
        return EvaluationBatch(
            outputs=[
                LazyGoalEvaluationOutput(
                    sample_id=example.sample_id,
                    task_id=example.task_id,
                    status="failed",
                    domain_result=None,
                    attempt_path=None,
                )
                for example in batch
            ],
            scores=[0.0 for _ in batch],
            num_metric_calls=0,
        )


def _persist_best_candidate_from_checkpoint(
    gepa_dir: Path,
    candidate_writer: ProfilePublisher,
    expected_seed_candidate: dict[str, str],
) -> dict[str, Any]:
    state = GEPAState.load(str(gepa_dir))
    candidates = getattr(state, "program_candidates", [])
    if not candidates or candidates[0] != expected_seed_candidate:
        raise RunStoreError(
            "TUA GEPA checkpoint seed does not match the frozen run manifest",
            code="checkpoint_corrupted",
        )
    scores = getattr(state, "program_full_scores_val_set", None)
    recovered: dict[str, Any] = {
        "metric_calls": getattr(state, "total_num_evals", 0),
        "candidate_count": len(candidates),
    }
    if not candidates or not scores:
        return recovered

    best_index = max(range(len(scores)), key=scores.__getitem__)
    if best_index >= len(candidates):
        return recovered
    best_candidate = candidates[best_index]
    recovered.update(
        best_score=float(scores[best_index]),
        best_candidate_id=candidate_writer.save_candidate_artifact(best_candidate),
    )
    return recovered


def _materialize_tua_examples(
    request: GEPARunRequest,
    run_dir: Path,
) -> tuple[tuple[GEPAExampleRequest, ...], tuple[GEPAExampleRequest, ...] | None]:
    if request.tua_dataset is None or request.trainset:
        return request.trainset, request.valset

    manifest_dir = run_dir / "tua-manifests"
    train_examples: list[GEPAExampleRequest] = []
    validation_examples: list[GEPAExampleRequest] = []
    for partition, task_ids, destination in (
        ("train", request.tua_dataset.train_task_ids, train_examples),
        ("validation", request.tua_dataset.validation_task_ids, validation_examples),
    ):
        for index, task_id in enumerate(task_ids):
            manifest_path = manifest_dir / f"{partition}-{index:04d}.json"
            atomic_write_json(
                manifest_path,
                {
                    "benchmark": "tua-bench",
                    "repoRoot": request.tua_dataset.repo_root,
                    "tasks": [{"taskId": task_id}],
                },
            )
            destination.append(
                GEPAExampleRequest(
                    sample_id=f"{partition}-{index:04d}",
                    task_id=task_id,
                    manifest_path=str(manifest_path.resolve()),
                )
            )
    return tuple(train_examples), tuple(validation_examples)


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
            base_profile_id=BASE_PROFILE_IDS.get(
                manifest.request.benchmark,
                manifest.target_profile.profile_id,
            ),
            model_config_id=manifest.working_model.profile_name,
            model_id=manifest.working_model.model_id,
            output_directory=adapter_output_dir,
            lazygoal_executable=executable,
        )
        candidate_only = manifest.request.publication_policy == "candidate-only"
        profile_publisher = ProfilePublisher(
            target_path=manifest.target_profile.profile_path,
            frozen_digest=manifest.target_profile.frozen_digest,
            base_profile=manifest.target_profile.profile,
            artifacts_dir=resolved_run_dir / "artifacts",
        )
        if candidate_only:
            seed_candidate_id = profile_publisher.save_candidate_artifact(
                manifest.seed_candidate
            )
            store.update_state(
                run_id,
                candidate_count=1,
                best_candidate_id=seed_candidate_id,
            )
        candidate_auditor = None
        if manifest.request.tua_dataset is not None:
            candidate_auditor = TuaCandidateLeakAuditor(
                repo_root=Path(manifest.request.tua_dataset.repo_root),
                task_ids=(
                    *manifest.request.tua_dataset.train_task_ids,
                    *manifest.request.tua_dataset.validation_task_ids,
                ),
                executable=executable,
                workspace_root=resolved_workspace,
                audit_directory=resolved_run_dir / "candidate-audits",
            )
        adapter = LazyGoalGEPAAdapter(config, candidate_auditor=candidate_auditor)

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
            candidate_writer=profile_publisher if candidate_only else None,
        )

        request_trainset, request_valset = _materialize_tua_examples(
            manifest.request,
            resolved_run_dir,
        )
        trainset = [
            LazyGoalEvaluationExample(
                sample_id=item.sample_id,
                benchmark_id=manifest.request.benchmark,
                task_id=item.task_id,
                manifest_path=Path(item.manifest_path),
            )
            for item in request_trainset
        ]
        valset = (
            [
                LazyGoalEvaluationExample(
                    sample_id=item.sample_id,
                    benchmark_id=manifest.request.benchmark,
                    task_id=item.task_id,
                    manifest_path=Path(item.manifest_path),
                )
                for item in request_valset
            ]
            if request_valset is not None
            else None
        )

        gepa_dir = resolved_run_dir / "gepa"
        gepa_dir.mkdir(parents=True, exist_ok=True)

        checkpoint_path = gepa_dir / "gepa_state.bin"
        if candidate_only and checkpoint_path.is_file():
            checkpoint = GEPAState.load(str(gepa_dir))
            checkpoint_candidates = getattr(checkpoint, "program_candidates", [])
            if not checkpoint_candidates or checkpoint_candidates[0] != manifest.seed_candidate:
                raise RunStoreError(
                    "TUA GEPA checkpoint seed does not match the frozen run manifest",
                    code="checkpoint_corrupted",
                )
            if getattr(checkpoint, "total_num_evals", 0) > manifest.request.max_metric_calls:
                raise RunStoreError(
                    "TUA GEPA checkpoint metric calls exceed the frozen run budget",
                    code="checkpoint_corrupted",
                )
            if valset is None:
                raise RunStoreError(
                    "TUA GEPA resume requires a materialized validation set",
                    code="checkpoint_corrupted",
                )
            adapter = _ResumeSeedEvaluationAdapter(
                adapter,
                seed_candidate=manifest.seed_candidate,
                validation_examples=valset,
            )

        rendered_reflection_template: str | None = None
        if manifest.request.reflection_prompt_template is not None:
            rendered_reflection_template = load_and_render_reflection_prompt_template(
                manifest.request.reflection_prompt_template,
                benchmark=manifest.request.benchmark,
                workspace_root=resolved_workspace,
            )

        # GEPA checks max_metric_calls only between iterations. For TUA, reserve
        # the parent and child reflection batches plus a full validation batch
        # so an in-flight iteration cannot cross the declared run budget.
        gepa_stop_threshold, _ = gepa_metric_call_threshold(
            manifest.request,
            train_count=len(trainset),
            validation_count=(
                len(valset)
                if valset is not None
                else len(trainset)
            ),
        )
        reflection_minibatch_size = gepa_reflection_minibatch_size(
            manifest.request,
            train_count=len(trainset),
        )

        # Execute official gepa.optimize
        result: GEPAResult = gepa.optimize(
            seed_candidate=manifest.seed_candidate,
            trainset=trainset,
            valset=valset,
            adapter=adapter,
            reflection_lm=reflection_client,
            reflection_prompt_template=rendered_reflection_template,
            max_metric_calls=gepa_stop_threshold,
            reflection_minibatch_size=reflection_minibatch_size,
            module_selector="all" if manifest.request.tua_dataset is not None else "round_robin",
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
            best_cand_id = manifest.seed_candidate_id if candidate_only else None
            best_score = None
            if result.best_candidate is not None:
                try:
                    best_cand_id = CandidateCodec().decode(result.best_candidate).candidate_id
                except Exception:
                    pass
            if result.val_aggregate_scores:
                best_score = result.val_aggregate_scores[result.best_idx]
            if candidate_only and result.best_candidate is not None:
                best_cand_id = profile_publisher.save_candidate_artifact(
                    result.best_candidate
                )

            store.update_state(
                run_id,
                lifecycle_status="stopped",
                stop_requested=True,
                metric_calls=result.total_metric_calls,
                candidate_count=len(result.candidates),
                best_score=best_score,
                best_candidate_id=best_cand_id,
                publication_status=("candidate_only" if candidate_only else "pending"),
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
                publication_status=("candidate_only" if candidate_only else "failed"),
                metric_calls=result.total_metric_calls,
                candidate_count=len(result.candidates),
                best_score=best_score,
                error_code="publish_failed",
                error_message="GEPA completed without a best candidate to publish",
            )
            generate_and_save_run_report(resolved_run_dir)
            return 1

        if candidate_only:
            best_cand_id = profile_publisher.save_candidate_artifact(result.best_candidate)
            comparison = FinalComparisonExecutor(
                manifest,
                resolved_run_dir,
                executable=executable,
                workspace_root=resolved_workspace,
                stop_requested=lambda: store.has_stop_request(run_id),
            ).execute(result.best_candidate)
            if comparison["status"] == "stopped":
                store.update_state(
                    run_id,
                    lifecycle_status="stopped",
                    stop_requested=True,
                    metric_calls=result.total_metric_calls,
                    candidate_count=len(result.candidates),
                    best_score=best_score,
                    best_candidate_id=best_cand_id,
                    publication_status="candidate_only",
                )
                generate_and_save_run_report(resolved_run_dir)
                return 0
            if comparison["status"] == "incomplete":
                store.update_state(
                    run_id,
                    lifecycle_status="failed",
                    metric_calls=result.total_metric_calls,
                    candidate_count=len(result.candidates),
                    best_score=best_score,
                    best_candidate_id=best_cand_id,
                    publication_status="candidate_only",
                    error_code="final_comparison_incomplete",
                    error_message=(
                        "Final comparison did not produce a complete paired result; "
                        "the candidate and completed attempts were preserved."
                    ),
                )
                generate_and_save_run_report(resolved_run_dir)
                return 1
            store.update_state(
                run_id,
                lifecycle_status="succeeded",
                publication_status="candidate_only",
                metric_calls=result.total_metric_calls,
                candidate_count=len(result.candidates),
                best_score=best_score,
                best_candidate_id=best_cand_id,
            )
            generate_and_save_run_report(resolved_run_dir)
            return 0

        publication = profile_publisher.publish(result.best_candidate)
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
        recovered_state: dict[str, Any] = {}
        if (
            "manifest" in locals()
            and manifest.request.publication_policy == "candidate-only"
            and "profile_publisher" in locals()
        ):
            try:
                recovered_state = _persist_best_candidate_from_checkpoint(
                    resolved_run_dir / "gepa",
                    profile_publisher,
                    manifest.seed_candidate,
                )
            except Exception:
                recovered_state = {}
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
                **recovered_state,
            )
            generate_and_save_run_report(resolved_run_dir)
        except Exception:
            pass
        return 1
    finally:
        ownership.release()
