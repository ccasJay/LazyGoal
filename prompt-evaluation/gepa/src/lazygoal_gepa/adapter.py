"""Official GEPA adapter backed by LazyGoal Prompt Evaluation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from gepa.core.adapter import EvaluationBatch, GEPAAdapter

from .candidate import CandidateCodec
from .client import PromptEvaluationClient
from .compatibility import ensure_gepa_compatibility
from .dataset import DatasetValidator
from .invocation import InvocationDirectoryManager
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig
from .protocol import (
    JSONValue,
    BoundedError,
    PromptEvaluationArtifactLocator,
    TaskStatus,
)


@dataclass(frozen=True)
class LazyGoalEvaluationOutput:
    """Minimal authoritative task output retained by GEPA."""

    sample_id: str
    task_id: str
    status: TaskStatus
    domain_result: JSONValue
    attempt_path: str | None


@dataclass(frozen=True)
class LazyGoalEvaluationTrajectory:
    """Lightweight result projection used only for reflective mutation."""

    sample_id: str
    task_id: str
    candidate_id: str
    status: TaskStatus
    score: float
    domain_result: JSONValue
    errors: tuple[BoundedError, ...]
    usage: JSONValue
    attempt_path: str | None
    artifact_locator: PromptEvaluationArtifactLocator | None


class LazyGoalGEPAAdapter(
    GEPAAdapter[
        LazyGoalEvaluationExample,
        LazyGoalEvaluationTrajectory,
        LazyGoalEvaluationOutput,
    ]
):
    """Run GEPA candidates through the public LazyGoal evaluation boundary."""

    def __init__(
        self,
        config: LazyGoalGEPAConfig,
        *,
        candidate_codec: CandidateCodec | None = None,
        dataset_validator: DatasetValidator | None = None,
        directory_manager: InvocationDirectoryManager | None = None,
        client: PromptEvaluationClient | None = None,
    ) -> None:
        ensure_gepa_compatibility()
        self._config = config
        self._candidate_codec = candidate_codec or CandidateCodec()
        self._dataset_validator = dataset_validator or DatasetValidator()
        self._directory_manager = directory_manager or InvocationDirectoryManager(
            config.output_directory
        )
        self._client = client or PromptEvaluationClient(
            config,
            self._directory_manager,
        )

    def evaluate(
        self,
        batch: list[LazyGoalEvaluationExample],
        candidate: dict[str, str],
        capture_traces: bool = False,
    ) -> EvaluationBatch[LazyGoalEvaluationTrajectory, LazyGoalEvaluationOutput]:
        prompt = self._candidate_codec.decode(candidate)
        examples = self._dataset_validator.validate_batch(self._config, batch)
        invocation = self._directory_manager.create_invocation(prompt.candidate_id)

        outputs: list[LazyGoalEvaluationOutput] = []
        scores: list[float] = []
        trajectories: list[LazyGoalEvaluationTrajectory] | None = (
            [] if capture_traces else None
        )
        for example in examples:
            record = self._client.evaluate_one(example, prompt, invocation)
            score = 1.0 if record.task.status == "passed" else 0.0
            outputs.append(
                LazyGoalEvaluationOutput(
                    sample_id=example.sample_id,
                    task_id=example.task_id,
                    status=record.task.status,
                    domain_result=record.task.domain_result,
                    attempt_path=record.task.attempt_path,
                )
            )
            scores.append(score)
            if trajectories is not None:
                trajectories.append(
                    LazyGoalEvaluationTrajectory(
                        sample_id=example.sample_id,
                        task_id=example.task_id,
                        candidate_id=prompt.candidate_id,
                        status=record.task.status,
                        score=score,
                        domain_result=record.task.domain_result,
                        errors=record.task.errors,
                        usage=None,
                        attempt_path=record.task.attempt_path,
                        artifact_locator=record.task.artifact_locator,
                    )
                )

        return EvaluationBatch(
            outputs=outputs,
            scores=scores,
            trajectories=trajectories,
            num_metric_calls=len(examples),
        )

    def make_reflective_dataset(
        self,
        candidate: dict[str, str],
        eval_batch: EvaluationBatch[
            LazyGoalEvaluationTrajectory,
            LazyGoalEvaluationOutput,
        ],
        components_to_update: list[str],
    ) -> Mapping[str, Sequence[Mapping[str, Any]]]:
        raise NotImplementedError(
            "Reflective dataset construction is implemented by the next task"
        )
