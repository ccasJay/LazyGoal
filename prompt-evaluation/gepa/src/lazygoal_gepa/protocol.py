"""Strict readers for the current Prompt Evaluation wire protocol."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, TypeAlias, cast

from .errors import (
    DatasetValidationError,
    GEPARunProtocolError,
    PromptEvaluationProtocolError,
)
from .dataset import validate_manifest_file
from .models import BenchmarkId, LazyGoalEvaluationExample

PROMPT_EVALUATION_PROTOCOL = "prompt-evaluation@1"

JSONValue: TypeAlias = (
    None | bool | int | float | str | list["JSONValue"] | dict[str, "JSONValue"]
)
TaskStatus: TypeAlias = Literal[
    "passed", "failed", "infrastructure_error", "cancelled"
]
EvaluationStatus: TypeAlias = Literal[
    "completed", "infrastructure_error", "cancelled"
]

_SHA256 = re.compile(r"[a-f0-9]{64}\Z")
_PROGRESS_STAGES = frozenset(
    ("accepted", "task_started", "task_progress", "task_completed", "cancelled")
)
_TERMINAL_STAGES = frozenset(
    ("completed", "infrastructure_error", "cancelled")
)


@dataclass(frozen=True)
class PromptEvaluationEvent:
    evaluation_id: str
    event_type: Literal["progress", "terminal"]
    task_id: str | None
    stage: str
    timestamp: str
    result_path: str | None


@dataclass(frozen=True)
class BoundedError:
    stage: str
    message: str
    code: str | None


@dataclass(frozen=True)
class PromptEvaluationArtifactLocator:
    goal_snapshot: str
    trajectory: str
    diagnostic_trace: str | None


@dataclass(frozen=True)
class PromptEvaluationTaskRecord:
    task_id: str
    status: TaskStatus
    domain_result: JSONValue
    attempt_path: str | None
    artifact_locator: PromptEvaluationArtifactLocator | None
    errors: tuple[BoundedError, ...]


@dataclass(frozen=True)
class PromptEvaluationResultRecord:
    evaluation_id: str
    status: EvaluationStatus
    benchmark_id: str
    manifest_path: str
    candidate_id: str
    base_profile_id: str
    prompt_sha256: str
    model_config_id: str
    model_id: str
    generated_at: str
    tasks: tuple[PromptEvaluationTaskRecord, ...]


def parse_event_stream(data: bytes) -> tuple[PromptEvaluationEvent, ...]:
    """Parse every non-empty stdout line as one current-version event."""

    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation stdout is not valid UTF-8"
        ) from error

    events: list[PromptEvaluationEvent] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value: Any = json.loads(line, parse_constant=_reject_json_constant)
        except (json.JSONDecodeError, ValueError) as error:
            raise PromptEvaluationProtocolError(
                f"Prompt Evaluation stdout line {line_number} is not valid JSON"
            ) from error
        events.append(_parse_event(value, line_number))

    terminal_indices = [
        index for index, event in enumerate(events) if event.event_type == "terminal"
    ]
    if len(terminal_indices) > 1:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation stdout contains multiple terminal events"
        )
    if terminal_indices and terminal_indices[0] != len(events) - 1:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation terminal event must be the final stdout event"
        )
    if events:
        evaluation_ids = {event.evaluation_id for event in events}
        if len(evaluation_ids) != 1:
            raise PromptEvaluationProtocolError(
                "Prompt Evaluation stdout mixes evaluation identities"
            )
    return tuple(events)


def read_result(path: Path) -> PromptEvaluationResultRecord:
    """Read and validate one authoritative current-version result file."""

    try:
        value: Any = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_json_constant,
        )
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation result could not be read as JSON: {path}"
        ) from error
    return _parse_result(value)


def _parse_event(value: Any, line_number: int) -> PromptEvaluationEvent:
    record = _require_record(value, f"stdout line {line_number}")
    _require_exact_keys(
        record,
        required={
            "protocol",
            "evaluationId",
            "type",
            "authoritative",
            "taskId",
            "stage",
            "timestamp",
        },
        optional={"resultPath", "error"},
        context=f"stdout line {line_number}",
    )
    if record["protocol"] != PROMPT_EVALUATION_PROTOCOL:
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation stdout line {line_number} has an unsupported protocol"
        )
    evaluation_id = _require_non_empty_string(record["evaluationId"], "evaluationId")
    event_type = record["type"]
    if event_type not in ("progress", "terminal"):
        raise PromptEvaluationProtocolError("Prompt Evaluation event type is invalid")
    if record["authoritative"] is not False:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation stdout event must be non-authoritative"
        )
    task_id_value = record["taskId"]
    if task_id_value is not None and not _is_non_empty_string(task_id_value):
        raise PromptEvaluationProtocolError("Prompt Evaluation event taskId is invalid")
    stage = _require_non_empty_string(record["stage"], "stage")
    if event_type == "progress" and stage not in _PROGRESS_STAGES:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation progress event stage is invalid"
        )
    if event_type == "terminal" and stage not in _TERMINAL_STAGES:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation terminal event stage is invalid"
        )
    if event_type == "terminal" and task_id_value is not None:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation terminal event taskId must be null"
        )
    timestamp = _require_timestamp(record["timestamp"], "timestamp")
    result_path_value = record.get("resultPath")
    if result_path_value is not None and not _is_non_empty_string(result_path_value):
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation event resultPath is invalid"
        )
    if event_type != "terminal" and result_path_value is not None:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation progress event cannot contain resultPath"
        )
    if "error" in record:
        error_record = _require_record(record["error"], "event error")
        _require_exact_keys(
            error_record,
            required={"code", "message"},
            optional=set(),
            context="event error",
        )
        _require_non_empty_string(error_record["code"], "event error code")
        _require_non_empty_string(error_record["message"], "event error message")
    return PromptEvaluationEvent(
        evaluation_id=evaluation_id,
        event_type=cast(Literal["progress", "terminal"], event_type),
        task_id=cast(str | None, task_id_value),
        stage=stage,
        timestamp=timestamp,
        result_path=cast(str | None, result_path_value),
    )


def _parse_result(value: Any) -> PromptEvaluationResultRecord:
    record = _require_record(value, "result")
    _require_exact_keys(
        record,
        required={
            "protocol",
            "evaluationId",
            "status",
            "benchmarkId",
            "manifestPath",
            "candidateId",
            "baseProfileId",
            "promptSha256",
            "promptSummary",
            "modelConfigId",
            "modelId",
            "generatedAt",
            "tasks",
        },
        optional=set(),
        context="result",
    )
    if record["protocol"] != PROMPT_EVALUATION_PROTOCOL:
        raise PromptEvaluationProtocolError("Prompt Evaluation result protocol is invalid")
    status = record["status"]
    if status not in _TERMINAL_STAGES:
        raise PromptEvaluationProtocolError("Prompt Evaluation result status is invalid")
    benchmark_id = record["benchmarkId"]
    if not isinstance(benchmark_id, str) or not benchmark_id.strip():
        raise PromptEvaluationProtocolError("Prompt Evaluation result benchmark is invalid")
    prompt_sha256 = _require_non_empty_string(record["promptSha256"], "promptSha256")
    if _SHA256.fullmatch(prompt_sha256) is None:
        raise PromptEvaluationProtocolError("Prompt Evaluation promptSha256 is invalid")
    _parse_prompt_summary(record["promptSummary"])
    tasks_value = record["tasks"]
    if not isinstance(tasks_value, list):
        raise PromptEvaluationProtocolError("Prompt Evaluation result tasks must be an array")
    tasks = tuple(_parse_task(task) for task in tasks_value)
    return PromptEvaluationResultRecord(
        evaluation_id=_require_non_empty_string(record["evaluationId"], "evaluationId"),
        status=cast(EvaluationStatus, status),
        benchmark_id=benchmark_id,
        manifest_path=_require_non_empty_string(record["manifestPath"], "manifestPath"),
        candidate_id=_require_non_empty_string(record["candidateId"], "candidateId"),
        base_profile_id=_require_non_empty_string(record["baseProfileId"], "baseProfileId"),
        prompt_sha256=prompt_sha256,
        model_config_id=_require_non_empty_string(record["modelConfigId"], "modelConfigId"),
        model_id=_require_non_empty_string(record["modelId"], "modelId"),
        generated_at=_require_timestamp(record["generatedAt"], "generatedAt"),
        tasks=tasks,
    )


def _parse_prompt_summary(value: Any) -> None:
    record = _require_record(value, "promptSummary")
    _require_exact_keys(
        record,
        required={
            "systemPromptCharacters",
            "instructionCount",
            "instructionCharacters",
        },
        optional=set(),
        context="promptSummary",
    )
    for name, field_value in record.items():
        if type(field_value) is not int or field_value < 0:
            raise PromptEvaluationProtocolError(
                f"Prompt Evaluation {name} must be a non-negative integer"
            )


def _parse_task(value: Any) -> PromptEvaluationTaskRecord:
    record = _require_record(value, "task result")
    _require_exact_keys(
        record,
        required={
            "taskId",
            "status",
            "domainResult",
            "attemptPath",
            "artifactLocator",
            "errors",
        },
        optional=set(),
        context="task result",
    )
    status = record["status"]
    if status not in ("passed", "failed", "infrastructure_error", "cancelled"):
        raise PromptEvaluationProtocolError("Prompt Evaluation task status is invalid")
    domain_result = cast(JSONValue, record["domainResult"])
    if status in ("infrastructure_error", "cancelled") and domain_result is not None:
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation non-domain task status must have null domainResult"
        )
    attempt_path = record["attemptPath"]
    if attempt_path is not None and not _is_non_empty_string(attempt_path):
        raise PromptEvaluationProtocolError("Prompt Evaluation attemptPath is invalid")
    errors_value = record["errors"]
    if not isinstance(errors_value, list):
        raise PromptEvaluationProtocolError("Prompt Evaluation task errors must be an array")
    return PromptEvaluationTaskRecord(
        task_id=_require_non_empty_string(record["taskId"], "taskId"),
        status=cast(TaskStatus, status),
        domain_result=domain_result,
        attempt_path=cast(str | None, attempt_path),
        artifact_locator=_parse_artifact_locator(record["artifactLocator"]),
        errors=tuple(_parse_bounded_error(error) for error in errors_value),
    )


def _parse_artifact_locator(value: Any) -> PromptEvaluationArtifactLocator | None:
    if value is None:
        return None
    record = _require_record(value, "artifactLocator")
    _require_exact_keys(
        record,
        required={"goalSnapshot", "trajectory"},
        optional={"diagnosticTrace"},
        context="artifactLocator",
    )
    goal_snapshot = record["goalSnapshot"]
    trajectory = record["trajectory"]
    diagnostic_trace = record.get("diagnosticTrace")
    if not isinstance(goal_snapshot, str) or not isinstance(trajectory, str):
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation artifact paths must be strings"
        )
    if diagnostic_trace is not None and not isinstance(diagnostic_trace, str):
        raise PromptEvaluationProtocolError(
            "Prompt Evaluation diagnosticTrace must be a string"
        )
    return PromptEvaluationArtifactLocator(
        goal_snapshot,
        trajectory,
        cast(str | None, diagnostic_trace),
    )


def _parse_bounded_error(value: Any) -> BoundedError:
    record = _require_record(value, "task error")
    _require_exact_keys(
        record,
        required={"stage", "message"},
        optional={"code"},
        context="task error",
    )
    code = record.get("code")
    if code is not None and not _is_non_empty_string(code):
        raise PromptEvaluationProtocolError("Prompt Evaluation task error code is invalid")
    return BoundedError(
        stage=_require_non_empty_string(record["stage"], "task error stage"),
        message=_require_non_empty_string(record["message"], "task error message"),
        code=cast(str | None, code),
    )


def _require_record(value: Any, context: str) -> dict[str, Any]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation {context} must be an object"
        )
    return cast(dict[str, Any], value)


def _require_exact_keys(
    record: dict[str, Any],
    *,
    required: set[str],
    optional: set[str],
    context: str,
) -> None:
    actual = set(record)
    missing = sorted(required - actual)
    unknown = sorted(actual - required - optional)
    if missing:
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation {context} is missing fields: {', '.join(missing)}"
        )
    if unknown:
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation {context} has unknown fields: {', '.join(unknown)}"
        )


def _require_non_empty_string(value: Any, field: str) -> str:
    if not _is_non_empty_string(value):
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation {field} must be a non-empty string"
        )
    return cast(str, value)


def _is_non_empty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _require_timestamp(value: Any, field: str) -> str:
    timestamp = _require_non_empty_string(value, field)
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as error:
        raise PromptEvaluationProtocolError(
            f"Prompt Evaluation {field} must be an ISO timestamp"
        ) from error
    return timestamp


def _reject_json_constant(value: str) -> None:
    raise ValueError(f"Non-standard JSON constant: {value}")


GEPA_RUN_PROTOCOL = "gepa-run@1"


@dataclass(frozen=True)
class GEPAExampleRequest:
    """One benchmark sample in a gepa-run@1 request."""

    sample_id: str
    task_id: str
    manifest_path: str

    def to_dict(self) -> dict[str, str]:
        return {
            "sampleId": self.sample_id,
            "taskId": self.task_id,
            "manifestPath": self.manifest_path,
        }


@dataclass(frozen=True)
class GEPARunRequest:
    """Authoritative gepa-run@1 request definition."""

    protocol: Literal["gepa-run@1"]
    benchmark: BenchmarkId
    trainset: tuple[GEPAExampleRequest, ...]
    max_metric_calls: int
    valset: tuple[GEPAExampleRequest, ...] | None = None
    reflection_minibatch_size: int | None = None
    seed: int | None = None
    reflection_prompt_template: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "protocol": self.protocol,
            "benchmark": self.benchmark,
            "trainset": [example.to_dict() for example in self.trainset],
            "maxMetricCalls": self.max_metric_calls,
        }
        if self.valset is not None:
            data["valset"] = [example.to_dict() for example in self.valset]
        else:
            data["valset"] = None
        if self.reflection_minibatch_size is not None:
            data["reflectionMinibatchSize"] = self.reflection_minibatch_size
        else:
            data["reflectionMinibatchSize"] = None
        if self.seed is not None:
            data["seed"] = self.seed
        else:
            data["seed"] = None
        if self.reflection_prompt_template is not None:
            data["reflectionPromptTemplate"] = self.reflection_prompt_template
        else:
            data["reflectionPromptTemplate"] = None
        return data


def validate_gaia_minimal_request(request: GEPARunRequest) -> None:
    """Validate the bounded GAIA Level 1/2 GEPA lifecycle configuration.

    The public request protocol remains reusable for offline benchmark adapters, but a
    real GAIA lifecycle is intentionally limited to one train task, one distinct
    validation task, seed ``0``, reflection minibatch ``1``, and at most four metric
    calls. The dataset validator applies the Level 1/2 and attachment contract.
    This check is read-only and must run before the worker is launched.
    """

    if request.benchmark != "gaia":
        return
    if len(request.trainset) != 1:
        raise DatasetValidationError(
            "GAIA GEPA requires exactly one train sample"
        )
    if request.valset is None or len(request.valset) != 1:
        raise DatasetValidationError(
            "GAIA GEPA requires exactly one validation sample"
        )
    if request.max_metric_calls > 4:
        raise GEPARunProtocolError(
            "GAIA GEPA maxMetricCalls must be at most 4"
        )
    if request.reflection_minibatch_size not in (None, 1):
        raise GEPARunProtocolError(
            "GAIA GEPA reflectionMinibatchSize must be 1"
        )
    if request.seed not in (None, 0):
        raise GEPARunProtocolError("GAIA GEPA seed must be 0")


def parse_run_request(
    data: Any,
    *,
    base_dir: Path | None = None,
    check_manifests: bool = False,
) -> GEPARunRequest:
    """Validate a gepa-run@1 request mapping and resolve relative paths."""

    if not isinstance(data, dict) or not all(isinstance(k, str) for k in data):
        raise GEPARunProtocolError("GEPA run request must be an object")

    required_keys = {"protocol", "benchmark", "trainset", "maxMetricCalls"}
    optional_keys = {
        "valset",
        "reflectionMinibatchSize",
        "seed",
        "reflectionPromptTemplate",
    }
    actual_keys = set(data)
    missing = sorted(required_keys - actual_keys)
    unknown = sorted(actual_keys - required_keys - optional_keys)
    if missing:
        raise GEPARunProtocolError(
            f"GEPA run request is missing fields: {', '.join(missing)}"
        )
    if unknown:
        raise GEPARunProtocolError(
            f"GEPA run request has unknown fields: {', '.join(unknown)}"
        )

    protocol = data["protocol"]
    if protocol != GEPA_RUN_PROTOCOL:
        raise GEPARunProtocolError(f"Unsupported protocol: {protocol!r}")

    benchmark = data["benchmark"]
    if not isinstance(benchmark, str) or not benchmark.strip():
        raise GEPARunProtocolError(f"benchmark must be a non-empty string, got {benchmark!r}")

    max_metric_calls = data["maxMetricCalls"]
    if (
        not isinstance(max_metric_calls, int)
        or isinstance(max_metric_calls, bool)
        or max_metric_calls <= 0
    ):
        raise GEPARunProtocolError(
            f"maxMetricCalls must be a positive integer, got {max_metric_calls!r}"
        )

    reflection_minibatch_size = data.get("reflectionMinibatchSize")
    if reflection_minibatch_size is not None:
        if (
            not isinstance(reflection_minibatch_size, int)
            or isinstance(reflection_minibatch_size, bool)
            or reflection_minibatch_size <= 0
        ):
            raise GEPARunProtocolError(
                "reflectionMinibatchSize must be a positive integer, got "
                f"{reflection_minibatch_size!r}"
            )

    seed = data.get("seed")
    if seed is not None:
        if not isinstance(seed, int) or isinstance(seed, bool):
            raise GEPARunProtocolError(f"seed must be an integer, got {seed!r}")

    reflection_prompt_template_raw = data.get("reflectionPromptTemplate")
    if reflection_prompt_template_raw is not None:
        if (
            not isinstance(reflection_prompt_template_raw, str)
            or not reflection_prompt_template_raw.strip()
        ):
            raise GEPARunProtocolError(
                "reflectionPromptTemplate must be a non-empty string when present"
            )
        reflection_prompt_template = reflection_prompt_template_raw.strip()
    else:
        reflection_prompt_template = None

    trainset_raw = data["trainset"]
    if not isinstance(trainset_raw, list) or len(trainset_raw) == 0:
        raise DatasetValidationError("trainset must be a non-empty list")

    trainset = _parse_example_list(trainset_raw, "trainset", base_dir)

    valset_raw = data.get("valset")
    valset: tuple[GEPAExampleRequest, ...] | None = None
    if valset_raw is not None:
        if not isinstance(valset_raw, list):
            raise GEPARunProtocolError("valset must be a list or null")
        if len(valset_raw) == 0:
            raise DatasetValidationError("valset cannot be an empty list when provided")
        valset = _parse_example_list(valset_raw, "valset", base_dir)

        train_task_ids = {example.task_id for example in trainset}
        train_sample_ids = {example.sample_id for example in trainset}
        overlapping_tasks = sorted(
            train_task_ids.intersection(example.task_id for example in valset)
        )
        overlapping_samples = sorted(
            train_sample_ids.intersection(example.sample_id for example in valset)
        )
        if overlapping_tasks:
            raise DatasetValidationError(
                "Trainset and valset must not reuse task IDs: "
                + ", ".join(overlapping_tasks)
            )
        if overlapping_samples:
            raise DatasetValidationError(
                "Trainset and valset must not reuse sample IDs: "
                + ", ".join(overlapping_samples)
            )

    request = GEPARunRequest(
        protocol="gepa-run@1",
        benchmark=benchmark,
        trainset=trainset,
        max_metric_calls=max_metric_calls,
        valset=valset,
        reflection_minibatch_size=reflection_minibatch_size,
        seed=seed,
        reflection_prompt_template=reflection_prompt_template,
    )

    if check_manifests:
        validate_run_request_datasets(request)

    return request


def _parse_example_list(
    items: list[Any],
    context: str,
    base_dir: Path | None,
) -> tuple[GEPAExampleRequest, ...]:
    sample_ids: set[str] = set()
    task_ids: set[str] = set()
    parsed: list[GEPAExampleRequest] = []

    for index, item in enumerate(items):
        if not isinstance(item, dict) or not all(isinstance(k, str) for k in item):
            raise GEPARunProtocolError(f"{context} item {index} must be an object")

        required = {"sampleId", "taskId", "manifestPath"}
        actual = set(item)
        missing = sorted(required - actual)
        unknown = sorted(actual - required)
        if missing:
            raise GEPARunProtocolError(
                f"{context} item {index} is missing fields: {', '.join(missing)}"
            )
        if unknown:
            raise GEPARunProtocolError(
                f"{context} item {index} has unknown fields: {', '.join(unknown)}"
            )

        sample_id = item["sampleId"]
        task_id = item["taskId"]
        manifest_path_raw = item["manifestPath"]

        if not isinstance(sample_id, str) or not sample_id.strip():
            raise DatasetValidationError(
                f"{context} item {index} sampleId must be a non-empty string"
            )
        if not isinstance(task_id, str) or not task_id.strip():
            raise DatasetValidationError(
                f"{context} item {index} taskId must be a non-empty string"
            )
        if not isinstance(manifest_path_raw, str) or not manifest_path_raw.strip():
            raise DatasetValidationError(
                f"{context} item {index} manifestPath must be a non-empty string"
            )

        if sample_id in sample_ids:
            raise DatasetValidationError(
                f"Duplicate sample ID in {context}: {sample_id!r}"
            )
        if task_id in task_ids:
            raise DatasetValidationError(
                f"Duplicate task ID in {context}: {task_id!r}"
            )

        sample_ids.add(sample_id)
        task_ids.add(task_id)

        raw_path = Path(manifest_path_raw)
        if raw_path.is_absolute():
            resolved_manifest = raw_path.resolve()
        elif base_dir is not None:
            resolved_manifest = (base_dir / raw_path).resolve()
        else:
            resolved_manifest = raw_path.resolve()

        parsed.append(
            GEPAExampleRequest(
                sample_id=sample_id,
                task_id=task_id,
                manifest_path=str(resolved_manifest),
            )
        )

    return tuple(parsed)


def read_run_request(
    path: Path | str,
    *,
    check_manifests: bool = False,
) -> GEPARunRequest:
    """Read a JSON file and parse it as a gepa-run@1 request."""

    request_path = Path(path).resolve()
    if not request_path.is_file():
        raise GEPARunProtocolError(f"Request file does not exist: {request_path}")

    try:
        content = request_path.read_text(encoding="utf-8")
        data = json.loads(content, parse_constant=_reject_json_constant)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise GEPARunProtocolError(
            f"Could not read request file as JSON: {request_path}"
        ) from error

    return parse_run_request(
        data,
        base_dir=request_path.parent,
        check_manifests=check_manifests,
    )


def validate_run_request_datasets(request: GEPARunRequest) -> None:
    """Validate all manifests in the request trainset and valset."""

    batches_to_check = [("trainset", request.trainset)]
    if request.valset is not None:
        batches_to_check.append(("valset", request.valset))

    for batch_name, batch in batches_to_check:
        for example in batch:
            manifest_file = Path(example.manifest_path)
            if not manifest_file.is_file():
                raise DatasetValidationError(
                    f"Manifest does not exist or is not a file: {manifest_file}"
                )
            try:
                raw = json.loads(manifest_file.read_text(encoding="utf-8"))
            except (OSError, UnicodeError, json.JSONDecodeError) as error:
                raise DatasetValidationError(
                    f"Manifest could not be read as JSON: {manifest_file}"
                ) from error

            if not isinstance(raw, dict) or not isinstance(raw.get("tasks"), list):
                raise DatasetValidationError(
                    f"Manifest must contain a tasks array: {manifest_file}"
                )
            tasks = raw["tasks"]
            if len(tasks) != 1:
                raise DatasetValidationError(
                    f"Manifest must contain exactly one task, found {len(tasks)}: {manifest_file}"
                )
            task = tasks[0]
            if not isinstance(task, dict) or task.get("taskId") != example.task_id:
                found_task_id = task.get("taskId") if isinstance(task, dict) else None
                raise DatasetValidationError(
                    "Manifest task ID does not match the sample: "
                    f"expected {example.task_id!r}, found {found_task_id!r}"
                )
            validate_manifest_file(
                LazyGoalEvaluationExample(
                    sample_id=example.sample_id,
                    benchmark_id=request.benchmark,
                    task_id=example.task_id,
                    manifest_path=manifest_file,
                ),
                request.benchmark,
            )
