"""Subprocess client for the public LazyGoal Prompt Evaluation protocol."""

from __future__ import annotations

import json
import os
import re
import signal
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from .candidate import LazyGoalPrompt
from .errors import (
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
)
from .invocation import InvocationContext, InvocationDirectoryManager
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig
from .protocol import (
    PROMPT_EVALUATION_PROTOCOL,
    PromptEvaluationResultRecord,
    PromptEvaluationTaskRecord,
    parse_event_stream,
    read_result,
)

_DEFAULT_CAPTURE_LIMIT = 1_048_576
_TERMINATION_GRACE_SECONDS = 2.0
_SECRET_ENV_NAME = re.compile(
    r"(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)(?:_|$)",
    re.IGNORECASE,
)
_REDACTION_MARKER = b"[REDACTED]"


@dataclass(frozen=True)
class LazyGoalEvaluationRecord:
    """One authoritative domain outcome returned by LazyGoal."""

    evaluation_id: str
    result_path: Path
    task: PromptEvaluationTaskRecord


@dataclass(frozen=True)
class _CapturedStream:
    data: bytes
    overflowed: bool


@dataclass(frozen=True)
class _ProcessResult:
    exit_code: int
    stdout: _CapturedStream
    stderr: _CapturedStream


class PromptEvaluationClient:
    """Evaluate one sample through ``lazygoal eval prompt`` without a shell."""

    def __init__(
        self,
        config: LazyGoalGEPAConfig,
        directory_manager: InvocationDirectoryManager,
        capture_limit: int = _DEFAULT_CAPTURE_LIMIT,
    ) -> None:
        if capture_limit <= 0:
            raise ValueError("capture_limit must be positive")
        self._config = config
        self._directory_manager = directory_manager
        self._capture_limit = capture_limit

    def evaluate_one(
        self,
        example: LazyGoalEvaluationExample,
        prompt: LazyGoalPrompt,
        invocation: InvocationContext,
    ) -> LazyGoalEvaluationRecord:
        sample_directory = self._directory_manager.create_sample_directory(
            invocation,
            example,
        )
        request_path = sample_directory / "request.json"
        request = self._create_request(example, prompt, sample_directory)
        request_path.write_text(
            json.dumps(request, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

        command = [
            str(self._config.lazygoal_executable),
            "eval",
            "prompt",
            "--request",
            str(request_path.resolve()),
        ]
        try:
            process_result = self._run(command)
        except PromptEvaluationCancelled as error:
            raise PromptEvaluationCancelled(
                self._context(example, "LazyGoal evaluation was cancelled")
            ) from error
        (sample_directory / "stdout.ndjson").write_bytes(
            _redact_environment_secrets(process_result.stdout.data)
        )
        (sample_directory / "stderr.log").write_bytes(
            _redact_environment_secrets(process_result.stderr.data)
        )

        if process_result.stdout.overflowed or process_result.stderr.overflowed:
            raise PromptEvaluationProtocolError(
                self._context(
                    example,
                    f"CLI output exceeded the {self._capture_limit}-byte capture limit",
                )
            )

        events = parse_event_stream(process_result.stdout.data)
        terminal = next(
            (event for event in events if event.event_type == "terminal"),
            None,
        )

        if process_result.exit_code == 2:
            raise PromptEvaluationProtocolError(
                self._context(example, "LazyGoal rejected the Prompt Evaluation request")
            )
        if terminal is None:
            if process_result.exit_code == 1:
                raise PromptEvaluationInfrastructureError(
                    self._context(example, "LazyGoal failed before publishing a result")
                )
            if process_result.exit_code == 130:
                raise PromptEvaluationCancelled(
                    self._context(example, "LazyGoal evaluation was cancelled")
                )
            raise PromptEvaluationProtocolError(
                self._context(example, "LazyGoal did not emit a terminal event")
            )
        if terminal.result_path is None:
            if process_result.exit_code == 1 and terminal.stage == "infrastructure_error":
                raise PromptEvaluationInfrastructureError(
                    self._context(example, "LazyGoal could not publish result.json")
                )
            if process_result.exit_code == 130 and terminal.stage == "cancelled":
                raise PromptEvaluationCancelled(
                    self._context(example, "LazyGoal evaluation was cancelled")
                )
            raise PromptEvaluationProtocolError(
                self._context(example, "Terminal event does not contain resultPath")
            )

        result_path = self._resolve_result_path(
            terminal.result_path,
            sample_directory,
            example,
        )
        result = read_result(result_path)
        self._validate_result_identity(result, terminal.evaluation_id, example, prompt)
        self._validate_terminal_status(
            process_result.exit_code,
            terminal.stage,
            result,
            example,
        )

        if process_result.exit_code == 1:
            task = result.tasks[0]
            raise PromptEvaluationInfrastructureError(
                self._context(
                    example,
                    _format_task_failure(task),
                )
            )
        if process_result.exit_code == 130:
            raise PromptEvaluationCancelled(
                self._context(example, "LazyGoal evaluation was cancelled")
            )
        if process_result.exit_code != 0:
            raise PromptEvaluationProtocolError(
                self._context(
                    example,
                    f"LazyGoal returned unsupported exit code {process_result.exit_code}",
                )
            )

        task = result.tasks[0]
        return LazyGoalEvaluationRecord(result.evaluation_id, result_path, task)

    def _create_request(
        self,
        example: LazyGoalEvaluationExample,
        prompt: LazyGoalPrompt,
        sample_directory: Path,
    ) -> dict[str, object]:
        return {
            "protocol": PROMPT_EVALUATION_PROTOCOL,
            "benchmark": {
                "id": self._config.benchmark_id,
                "manifestPath": str(example.manifest_path.resolve()),
            },
            "candidate": {
                "id": prompt.candidate_id,
                "baseProfileId": self._config.base_profile_id,
                **prompt.to_request_candidate(),
            },
            "model": {
                "configId": self._config.model_config_id,
                "modelId": self._config.model_id,
            },
            "outputDirectory": str(sample_directory.resolve()),
        }

    def _run(self, command: list[str]) -> _ProcessResult:
        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=False,
                start_new_session=True,
            )
        except OSError as error:
            raise PromptEvaluationInfrastructureError(
                f"LazyGoal executable could not be started: {self._config.lazygoal_executable}"
            ) from error

        assert process.stdout is not None
        assert process.stderr is not None
        try:
            with ThreadPoolExecutor(max_workers=2) as executor:
                stdout_future = executor.submit(
                    _read_bounded,
                    process.stdout,
                    self._capture_limit,
                )
                stderr_future = executor.submit(
                    _read_bounded,
                    process.stderr,
                    self._capture_limit,
                )
                try:
                    exit_code = process.wait()
                except KeyboardInterrupt as error:
                    _terminate_process_group(process)
                    raise PromptEvaluationCancelled(
                        "LazyGoal evaluation was interrupted"
                    ) from error
                stdout = stdout_future.result()
                stderr = stderr_future.result()
        finally:
            process.stdout.close()
            process.stderr.close()
        return _ProcessResult(exit_code, stdout, stderr)

    def _resolve_result_path(
        self,
        raw_path: str,
        sample_directory: Path,
        example: LazyGoalEvaluationExample,
    ) -> Path:
        path = Path(raw_path)
        if not path.is_absolute():
            raise PromptEvaluationProtocolError(
                self._context(example, "Terminal resultPath must be absolute")
            )
        resolved = path.resolve()
        allowed_root = sample_directory.resolve()
        if not resolved.is_relative_to(allowed_root):
            raise PromptEvaluationProtocolError(
                self._context(example, "Terminal resultPath escapes the sample directory")
            )
        return resolved

    def _validate_result_identity(
        self,
        result: PromptEvaluationResultRecord,
        event_evaluation_id: str,
        example: LazyGoalEvaluationExample,
        prompt: LazyGoalPrompt,
    ) -> None:
        expected = {
            "evaluationId": (event_evaluation_id, result.evaluation_id),
            "benchmarkId": (self._config.benchmark_id, result.benchmark_id),
            "manifestPath": (
                example.manifest_path.resolve(),
                Path(result.manifest_path).resolve(),
            ),
            "candidateId": (prompt.candidate_id, result.candidate_id),
            "baseProfileId": (self._config.base_profile_id, result.base_profile_id),
            "modelConfigId": (self._config.model_config_id, result.model_config_id),
            "modelId": (self._config.model_id, result.model_id),
        }
        for field, (expected_value, actual_value) in expected.items():
            if actual_value != expected_value:
                raise PromptEvaluationProtocolError(
                    self._context(
                        example,
                        f"Authoritative result {field} does not match the request",
                    )
                )
        if len(result.tasks) != 1 or result.tasks[0].task_id != example.task_id:
            raise PromptEvaluationProtocolError(
                self._context(
                    example,
                    "Authoritative result must contain exactly the requested task",
                )
            )

    def _validate_terminal_status(
        self,
        exit_code: int,
        terminal_stage: str,
        result: PromptEvaluationResultRecord,
        example: LazyGoalEvaluationExample,
    ) -> None:
        expected = {
            0: "completed",
            1: "infrastructure_error",
            130: "cancelled",
        }.get(exit_code)
        if expected is None:
            raise PromptEvaluationProtocolError(
                self._context(example, f"Unsupported LazyGoal exit code: {exit_code}")
            )
        if terminal_stage != expected or result.status != expected:
            raise PromptEvaluationProtocolError(
                self._context(
                    example,
                    "LazyGoal exit code, terminal event, and result status disagree",
                )
            )
        task_status = result.tasks[0].status
        if expected == "completed" and task_status not in ("passed", "failed"):
            raise PromptEvaluationProtocolError(
                self._context(
                    example,
                    "Completed result contains a non-domain task status",
                )
            )
        if expected != "completed" and task_status != expected:
            raise PromptEvaluationProtocolError(
                self._context(
                    example,
                    "Terminal result and task status disagree",
                )
            )

    @staticmethod
    def _context(example: LazyGoalEvaluationExample, message: str) -> str:
        return f"{message} [sample={example.sample_id!r}, task={example.task_id!r}]"


def _read_bounded(stream: BinaryIO, limit: int) -> _CapturedStream:
    captured = bytearray()
    overflowed = False
    while True:
        chunk = stream.read(65_536)
        if not chunk:
            break
        remaining = limit - len(captured)
        if remaining > 0:
            captured.extend(chunk[:remaining])
        if len(chunk) > max(remaining, 0):
            overflowed = True
    return _CapturedStream(bytes(captured), overflowed)


def _redact_environment_secrets(data: bytes) -> bytes:
    redacted = data
    values = {
        value.encode("utf-8")
        for name, value in os.environ.items()
        if _SECRET_ENV_NAME.search(name) and value
    }
    for value in sorted(values, key=len, reverse=True):
        redacted = redacted.replace(value, _REDACTION_MARKER)
    return redacted


def _format_task_failure(task: PromptEvaluationTaskRecord) -> str:
    """Return bounded task diagnostics suitable for the public GEPA status."""

    if not task.errors:
        return "LazyGoal reported an infrastructure failure without task diagnostics"

    details: list[str] = []
    for error in task.errors[:3]:
        code = error.code or "unspecified"
        message = " ".join(error.message.split())
        if len(message) > 500:
            message = f"{message[:499]}…"
        details.append(
            f"stage={error.stage!r}, code={code!r}, message={message!r}"
        )
    suffix = "; ".join(details)
    if len(task.errors) > 3:
        suffix = f"{suffix}; additionalErrors={len(task.errors) - 3}"
    return f"LazyGoal reported an infrastructure failure: {suffix}"


def _terminate_process_group(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        process.terminate()
    try:
        process.wait(timeout=_TERMINATION_GRACE_SECONDS)
        return
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except (OSError, ProcessLookupError):
        process.kill()
    try:
        process.wait(timeout=_TERMINATION_GRACE_SECONDS)
    except subprocess.TimeoutExpired as error:
        raise PromptEvaluationInfrastructureError(
            "LazyGoal process group did not exit after forced termination"
        ) from error
