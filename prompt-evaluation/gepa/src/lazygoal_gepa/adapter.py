"""Official GEPA adapter backed by LazyGoal Prompt Evaluation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from gepa.core.adapter import EvaluationBatch, GEPAAdapter

from .candidate import CandidateCodec
from .client import PromptEvaluationClient
from .compatibility import ensure_gepa_compatibility
from .dataset import DatasetValidator
from .errors import (
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
    ReflectiveDatasetError,
)
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
            if record.task.status == "infrastructure_error":
                raise PromptEvaluationInfrastructureError(
                    f"Prompt Evaluation infrastructure failure for sample {example.sample_id!r}"
                )
            if record.task.status == "cancelled":
                raise PromptEvaluationCancelled(
                    f"Prompt Evaluation cancelled for sample {example.sample_id!r}"
                )
            if record.task.status not in ("passed", "failed"):
                raise PromptEvaluationProtocolError(
                    f"Prompt Evaluation returned an unsupported domain status for sample {example.sample_id!r}"
                )
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
        prompt = self._candidate_codec.decode(candidate)
        if len(components_to_update) != len(set(components_to_update)):
            raise ReflectiveDatasetError(
                "components_to_update must not contain duplicates"
            )
        unknown_components = [
            component
            for component in components_to_update
            if component not in candidate
        ]
        if unknown_components:
            raise ReflectiveDatasetError(
                "Unknown candidate components requested for reflection: "
                + ", ".join(repr(component) for component in unknown_components)
            )
        trajectories = eval_batch.trajectories
        if trajectories is None:
            raise ReflectiveDatasetError(
                "Reflective dataset requires evaluate(..., capture_traces=True)"
            )
        expected_length = len(eval_batch.outputs)
        if len(eval_batch.scores) != expected_length or len(trajectories) != expected_length:
            raise ReflectiveDatasetError(
                "Evaluation outputs, scores, and trajectories must have equal lengths"
            )

        records: dict[str, list[Mapping[str, Any]]] = {
            component: [] for component in components_to_update
        }
        for index, (output, score, trajectory) in enumerate(
            zip(
                eval_batch.outputs,
                eval_batch.scores,
                trajectories,
                strict=True,
            )
        ):
            if (
                output.sample_id != trajectory.sample_id
                or output.task_id != trajectory.task_id
                or output.status != trajectory.status
                or score != trajectory.score
            ):
                raise ReflectiveDatasetError(
                    f"Evaluation evidence is misaligned at index {index}"
                )
            if trajectory.candidate_id != prompt.candidate_id:
                raise ReflectiveDatasetError(
                    f"Trajectory candidate does not match at index {index}"
                )
            for component in components_to_update:
                records[component].append(
                    _reflective_record(
                        component,
                        candidate[component],
                        output,
                        trajectory,
                    )
                )
        return records


_MAX_JSON_DEPTH = 6
_MAX_COLLECTION_ITEMS = 50
_MAX_STRING_CHARACTERS = 2_000


def _reflective_record(
    component: str,
    component_text: str,
    output: LazyGoalEvaluationOutput,
    trajectory: LazyGoalEvaluationTrajectory,
) -> Mapping[str, Any]:
    errors = [
        {
            "stage": error.stage,
            "message": error.message,
            **({} if error.code is None else {"code": error.code}),
        }
        for error in trajectory.errors
    ]
    artifact_locator = trajectory.artifact_locator
    artifacts: dict[str, Any] = {
        "attemptPath": trajectory.attempt_path,
        "artifactLocator": None
        if artifact_locator is None
        else {
            "goalSnapshot": artifact_locator.goal_snapshot,
            "trajectory": artifact_locator.trajectory,
            **(
                {}
                if artifact_locator.diagnostic_trace is None
                else {"diagnosticTrace": artifact_locator.diagnostic_trace}
            ),
        },
    }
    feedback = {
        "status": trajectory.status,
        "errors": errors,
        "usage": trajectory.usage,
    }
    return {
        "Inputs": _bounded_json(
            {
                "sampleId": output.sample_id,
                "taskId": output.task_id,
                "component": component,
                "currentText": component_text,
            }
        ),
        "Generated Outputs": _bounded_json(
            {
                "status": output.status,
                "domainResult": output.domain_result,
            }
        ),
        "Feedback": _bounded_json(feedback),
        "Score": trajectory.score,
        "Artifacts": _bounded_json(artifacts),
    }


def _bounded_json(value: JSONValue | Any, depth: int = 0) -> JSONValue:
    if depth >= _MAX_JSON_DEPTH and isinstance(value, (dict, list, tuple)):
        return {
            "__lazygoal_truncated__": {
                "reason": "maximum_depth",
                "limit": _MAX_JSON_DEPTH,
            }
        }
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if len(value) <= _MAX_STRING_CHARACTERS:
            return value
        omitted = len(value) - _MAX_STRING_CHARACTERS
        return (
            value[:_MAX_STRING_CHARACTERS]
            + f"...[lazygoal truncated {omitted} characters]"
        )
    if isinstance(value, dict):
        items = list(value.items())
        bounded = {
            str(key): _bounded_json(item, depth + 1)
            for key, item in items[:_MAX_COLLECTION_ITEMS]
        }
        if len(items) > _MAX_COLLECTION_ITEMS:
            marker = "__lazygoal_truncated__"
            while marker in bounded:
                marker += "_"
            bounded[marker] = {
                "reason": "maximum_items",
                "omitted": len(items) - _MAX_COLLECTION_ITEMS,
            }
        return bounded
    if isinstance(value, (list, tuple)):
        bounded_items = [
            _bounded_json(item, depth + 1)
            for item in value[:_MAX_COLLECTION_ITEMS]
        ]
        if len(value) > _MAX_COLLECTION_ITEMS:
            bounded_items.append(
                {
                    "__lazygoal_truncated__": {
                        "reason": "maximum_items",
                        "omitted": len(value) - _MAX_COLLECTION_ITEMS,
                    }
                }
            )
        return bounded_items
    return _bounded_json(str(value), depth)
