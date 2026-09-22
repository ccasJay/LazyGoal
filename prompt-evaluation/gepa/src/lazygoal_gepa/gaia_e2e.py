"""Explicit GAIA single-task and minimal GEPA real end-to-end gate.

The entry point is intentionally opt-in.  It never reaches the LazyGoal CLI unless
``LAZYGOAL_GAIA_REAL_E2E=1`` is present, and a non-dry run also requires ``--yes``.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Sequence

from .candidate import load_agent_profile
from .protocol import read_run_request, validate_gaia_minimal_request


_REAL_E2E_ENV = "LAZYGOAL_GAIA_REAL_E2E"
_GAIA_PROFILE_ID = "gaia-worker-profile"
_TERMINAL_STATUSES = {"stopped", "succeeded", "publish_blocked", "failed"}
_MAX_DIAGNOSTIC_CHARS = 4096
_COST_WARNING = (
    "WARNING: this explicit GAIA real E2E can incur Working LM and Reflection LM API "
    "charges, run benchmark/container resources, and update the GAIA Profile."
)


class GaiaRealE2EError(RuntimeError):
    """Raised when the explicit GAIA real E2E cannot produce a trustworthy result."""


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)

    if os.environ.get(_REAL_E2E_ENV) != "1":
        print(
            f"Refusing GAIA real E2E: set {_REAL_E2E_ENV}=1 explicitly.",
            file=sys.stderr,
        )
        return 2
    if not arguments.dry_run and not arguments.yes:
        print(_COST_WARNING, file=sys.stderr)
        print(
            "Refusing to start real GAIA E2E without --yes; use --dry-run for a read-only check.",
            file=sys.stderr,
        )
        return 2

    workspace_root = arguments.workspace_root.resolve()
    request_path = arguments.request.resolve()
    profile_path = arguments.profile_path.resolve()
    executable = (
        arguments.lazygoal_executable or workspace_root / "bin" / "lazygoal.cjs"
    ).resolve()
    runs_directory = (
        arguments.runs_directory
        or workspace_root / ".lazygoal" / "gepa" / "runs"
    ).resolve()

    try:
        request = read_run_request(request_path, check_manifests=True)
        validate_gaia_minimal_request(request)
        if request.valset is None or len(request.valset) != 1:
            raise GaiaRealE2EError("GAIA real E2E requires exactly one validation Manifest")

        preflight = _run_lifecycle(
            executable,
            workspace_root,
            [
                "preflight",
                "--request",
                str(request_path),
                "--workspace-root",
                str(workspace_root),
                "--runs-dir",
                str(runs_directory),
                "--profile-path",
                str(profile_path),
            ],
        )
        _print_preflight_summary(preflight)

        if arguments.dry_run:
            print(
                json.dumps(
                    {
                        "mode": "dry-run",
                        "promptEvaluation": "not_run",
                        "lifecycle": "not_run",
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            )
            return 0

        prompt_result = _run_single_validation_evaluation(
            executable=executable,
            workspace_root=workspace_root,
            runs_directory=runs_directory,
            request=request,
            profile_path=profile_path,
            preflight=preflight,
        )
        prompt_status = prompt_result["status"]
        if prompt_status not in {"passed", "failed"}:
            raise GaiaRealE2EError(
                "GAIA Prompt Evaluation did not produce a domain result: "
                f"{prompt_status}"
            )
        print(
            json.dumps(
                {
                    "promptEvaluation": {
                        "status": prompt_status,
                        "taskId": prompt_result["taskId"],
                    }
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )

        started = _run_lifecycle(
            executable,
            workspace_root,
            [
                "start",
                "--request",
                str(request_path),
                "--workspace-root",
                str(workspace_root),
                "--runs-dir",
                str(runs_directory),
                "--profile-path",
                str(profile_path),
                "--yes",
            ],
        )
        run_id = _require_string(started, "runId")
        status = _poll_status(
            executable,
            workspace_root,
            runs_directory,
            run_id,
            arguments.max_polls,
            arguments.poll_interval,
        )
        report = _run_lifecycle(
            executable,
            workspace_root,
            ["report", "--run", run_id, "--runs-dir", str(runs_directory)],
        )
        lifecycle_complete = report.get("complete") is True
        result = {
            "runId": run_id,
            "promptEvaluationStatus": prompt_status,
            "lifecycleStatus": status.get("lifecycleStatus"),
            "publicationStatus": report.get("publication", {}).get("status"),
            "lifecycleComplete": lifecycle_complete,
            # A wrong answer is a valid domain failure, not a protocol success.
            "success": lifecycle_complete and prompt_status == "passed",
            "reportPath": report.get("artifacts", {}).get("reportPath"),
        }
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0 if result["success"] else 1
    except GaiaRealE2EError as error:
        print(_bounded(str(error)), file=sys.stderr)
        return 1
    except Exception as error:
        print(_bounded(f"GAIA real E2E failed: {error}"), file=sys.stderr)
        return 1


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the explicitly enabled GAIA single-task and minimal GEPA E2E",
    )
    parser.add_argument("--request", type=Path, required=True, help="gepa-run@1 request")
    parser.add_argument("--profile-path", type=Path, required=True, help="GAIA Profile JSON")
    parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    parser.add_argument("--runs-directory", type=Path)
    parser.add_argument("--lazygoal-executable", type=Path)
    parser.add_argument("--max-polls", type=int, default=120)
    parser.add_argument("--poll-interval", type=float, default=1.0)
    parser.add_argument("--dry-run", action="store_true", help="Preflight only; no model or container")
    parser.add_argument("--yes", action="store_true", help="Confirm real model/container costs")
    return parser


def _run_single_validation_evaluation(
    *,
    executable: Path,
    workspace_root: Path,
    runs_directory: Path,
    request: Any,
    profile_path: Path,
    preflight: dict[str, Any],
) -> dict[str, Any]:
    profile, _ = load_agent_profile(profile_path)
    if profile.id != _GAIA_PROFILE_ID:
        raise GaiaRealE2EError(
            f"GAIA real E2E requires Profile id {_GAIA_PROFILE_ID!r}, got {profile.id!r}"
        )
    working_model = _require_mapping(preflight, "models.working")
    model_config_id = _require_string_value(working_model, "profileName")
    model_id = _require_string_value(working_model, "modelId")

    execution_directory = runs_directory / "gaia-real-e2e" / uuid.uuid4().hex
    prompt_output_directory = execution_directory / "prompt-evaluation"
    prompt_request_path = execution_directory / "prompt-request.json"
    prompt_request_path.parent.mkdir(parents=True, exist_ok=False)
    prompt_request = {
        "protocol": "prompt-evaluation@1",
        "benchmark": {
            "id": "gaia",
            "manifestPath": request.valset[0].manifest_path,
        },
        "candidate": {
            "id": "gaia-real-e2e-baseline",
            "baseProfileId": profile.id,
            "systemPrompt": profile.system_prompt,
            "instructions": list(profile.instructions),
        },
        "model": {"configId": model_config_id, "modelId": model_id},
        "outputDirectory": str(prompt_output_directory.resolve()),
    }
    prompt_request_path.write_text(
        json.dumps(prompt_request, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    command = [
        str(executable),
        "eval",
        "prompt",
        "--request",
        str(prompt_request_path),
    ]
    completed = _run_process(command, workspace_root)
    if completed.returncode not in (0, 1, 130):
        raise GaiaRealE2EError(
            f"Prompt Evaluation rejected the request (exit {completed.returncode})"
        )
    events = _parse_json_lines(completed.stdout)
    terminal = next((event for event in events if event.get("type") == "terminal"), None)
    if terminal is None or not isinstance(terminal.get("resultPath"), str):
        raise GaiaRealE2EError("Prompt Evaluation did not return an authoritative result path")
    result_path = Path(terminal["resultPath"]).resolve()
    try:
        result = json.loads(result_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise GaiaRealE2EError("Prompt Evaluation result could not be read") from error
    tasks = result.get("tasks") if isinstance(result, dict) else None
    if not isinstance(tasks, list) or len(tasks) != 1 or not isinstance(tasks[0], dict):
        raise GaiaRealE2EError("Prompt Evaluation result must contain exactly one task")
    task = tasks[0]
    expected_task_id = request.valset[0].task_id
    if task.get("taskId") != expected_task_id:
        raise GaiaRealE2EError(
            "Prompt Evaluation result task identity does not match validation Manifest"
        )
    return {
        "status": task.get("status"),
        "taskId": task.get("taskId"),
    }


def _poll_status(
    executable: Path,
    workspace_root: Path,
    runs_directory: Path,
    run_id: str,
    max_polls: int,
    poll_interval: float,
) -> dict[str, Any]:
    if max_polls < 1:
        raise GaiaRealE2EError("--max-polls must be positive")
    if poll_interval < 0:
        raise GaiaRealE2EError("--poll-interval must be non-negative")
    for index in range(max_polls):
        status = _run_lifecycle(
            executable,
            workspace_root,
            ["status", "--run", run_id, "--runs-dir", str(runs_directory)],
        )
        if status.get("lifecycleStatus") in _TERMINAL_STATUSES:
            return status
        if index + 1 < max_polls:
            time.sleep(poll_interval)
    raise GaiaRealE2EError(
        f"GEPA run did not reach a terminal state within {max_polls} status polls"
    )


def _run_lifecycle(
    executable: Path,
    workspace_root: Path,
    arguments: Sequence[str],
) -> dict[str, Any]:
    completed = _run_process([str(executable), "gepa", *arguments], workspace_root)
    if completed.returncode != 0:
        raise GaiaRealE2EError(
            f"GEPA lifecycle command failed (exit {completed.returncode})"
        )
    values = _parse_json_lines(completed.stdout)
    if len(values) != 1:
        raise GaiaRealE2EError("GEPA lifecycle command must return exactly one JSON object")
    return values[0]


def _run_process(command: Sequence[str], workspace_root: Path) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            list(command),
            cwd=str(workspace_root),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )
    except OSError as error:
        raise GaiaRealE2EError(f"Could not invoke LazyGoal CLI: {error}") from error


def _parse_json_lines(stdout: str) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    for line in stdout.splitlines():
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise GaiaRealE2EError("LazyGoal CLI returned invalid JSON") from error
        if not isinstance(value, dict):
            raise GaiaRealE2EError("LazyGoal CLI returned a non-object JSON value")
        values.append(value)
    return values


def _print_preflight_summary(preflight: dict[str, Any]) -> None:
    summary = {
        "benchmark": preflight.get("benchmark"),
        "sampleCount": preflight.get("sampleCount"),
        "maxMetricCalls": preflight.get("maxMetricCalls"),
        "models": preflight.get("models"),
        "targetProfile": preflight.get("targetProfile"),
        "estimatedSideEffects": preflight.get("estimatedSideEffects"),
    }
    print(json.dumps({"preflight": summary}, ensure_ascii=False, separators=(",", ":")))


def _require_string(value: dict[str, Any], key: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result.strip():
        raise GaiaRealE2EError(f"Lifecycle response is missing non-empty {key}")
    return result


def _require_mapping(value: dict[str, Any], path: str) -> dict[str, Any]:
    current: Any = value
    for key in path.split("."):
        if not isinstance(current, dict) or not isinstance(current.get(key), dict):
            raise GaiaRealE2EError(f"Preflight response is missing object {path}")
        current = current[key]
    return current


def _require_string_value(value: dict[str, Any], key: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result.strip():
        raise GaiaRealE2EError(f"Preflight response is missing non-empty {key}")
    return result


def _bounded(value: str) -> str:
    return value[:_MAX_DIAGNOSTIC_CHARS]


if __name__ == "__main__":
    raise SystemExit(main())
