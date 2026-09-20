"""Explicit real-model smoke for the GEPA lifecycle control plane.

This entry point is deliberately separate from the deterministic adapter tests.
It invokes the public ``lazygoal gepa`` lifecycle CLI and therefore may use both
the Working LM and the configured Reflection LM, as well as benchmark resources.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Sequence


_TERMINAL_STATUSES = {"stopped", "succeeded", "publish_blocked", "failed"}
_COST_WARNING = (
    "WARNING: this explicit GEPA smoke can incur Working LM and Reflection LM API "
    "charges, run benchmark/container resources, and update the default Agent Profile. "
    "Review the preflight summary before confirming with --yes."
)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    if not arguments.yes:
        print(_COST_WARNING, file=sys.stderr)
        print(
            "Refusing to start the real GEPA smoke without explicit confirmation; "
            "rerun with --yes after reviewing preflight.",
            file=sys.stderr,
        )
        return 2

    workspace_root = arguments.workspace_root.resolve()
    request_path = arguments.request.resolve()
    executable = (arguments.lazygoal_executable or workspace_root / "bin/lazygoal.cjs").resolve()
    runs_directory = (
        arguments.runs_directory
        or workspace_root / ".lazygoal" / "gepa" / "runs"
    ).resolve()

    print(_COST_WARNING, file=sys.stderr)
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
        ],
    )
    _print_preflight_summary(preflight)

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
            "--yes",
        ],
    )
    run_id = _require_string(started, "runId")

    status: dict[str, Any]
    if arguments.max_polls < 1:
        raise SystemExit("--max-polls must be positive")
    if arguments.poll_interval < 0:
        raise SystemExit("--poll-interval must be non-negative")
    for _ in range(arguments.max_polls):
        status = _run_lifecycle(
            executable,
            workspace_root,
            ["status", "--run", run_id, "--runs-dir", str(runs_directory)],
        )
        if status.get("lifecycleStatus") in _TERMINAL_STATUSES:
            break
        time.sleep(arguments.poll_interval)
    else:
        raise SystemExit(
            f"GEPA smoke did not reach a terminal state within {arguments.max_polls} status polls"
        )

    report = _run_lifecycle(
        executable,
        workspace_root,
        ["report", "--run", run_id, "--runs-dir", str(runs_directory)],
    )
    print(
        json.dumps(
            {
                "runId": run_id,
                "lifecycleStatus": status.get("lifecycleStatus"),
                "workerHealth": status.get("workerHealth"),
                "publicationStatus": status.get("publicationStatus"),
                "reportStatus": report.get("terminalStatus", report.get("lifecycleStatus")),
                "runDir": started.get("runDir"),
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run one explicit real dual-model GEPA lifecycle smoke",
    )
    parser.add_argument(
        "--request",
        type=Path,
        required=True,
        help="Path to a validated gepa-run@1 request",
    )
    parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    parser.add_argument("--runs-directory", type=Path)
    parser.add_argument("--lazygoal-executable", type=Path)
    parser.add_argument(
        "--max-polls",
        type=int,
        default=120,
        help="Maximum read-only status polls before failing (default: 120)",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=1.0,
        help="Seconds between status polls (default: 1.0)",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm possible model/container costs and default Profile mutation",
    )
    return parser


def _run_lifecycle(
    executable: Path,
    workspace_root: Path,
    arguments: Sequence[str],
) -> dict[str, Any]:
    command = [str(executable), "gepa", *arguments]
    try:
        completed = subprocess.run(
            command,
            cwd=str(workspace_root),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError as error:
        raise SystemExit(f"Could not invoke GEPA lifecycle CLI: {error}") from error

    if completed.returncode != 0:
        detail = completed.stderr.strip() or f"process exited with {completed.returncode}"
        raise SystemExit(f"GEPA lifecycle command failed: {detail}")
    try:
        value = json.loads(completed.stdout.strip())
    except json.JSONDecodeError as error:
        raise SystemExit("GEPA lifecycle CLI returned invalid JSON") from error
    if not isinstance(value, dict):
        raise SystemExit("GEPA lifecycle CLI returned a JSON value other than an object")
    return value


def _print_preflight_summary(preflight: dict[str, Any]) -> None:
    """Print only the non-sensitive fields needed to review the paid run."""
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
        raise SystemExit(f"GEPA lifecycle response is missing a non-empty {key}")
    return result


if __name__ == "__main__":
    raise SystemExit(main())
