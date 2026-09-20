"""Strict readers for the current Prompt Evaluation wire protocol."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, TypeAlias, cast

from .errors import PromptEvaluationProtocolError

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
    ("accepted", "task_started", "task_progress", "task_completed")
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
    benchmark_id: Literal["alfworld", "gaia"]
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
    if benchmark_id not in ("alfworld", "gaia"):
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
        benchmark_id=cast(Literal["alfworld", "gaia"], benchmark_id),
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
