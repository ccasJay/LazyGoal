"""Explicit one-task smoke for the GEPA adapter and real LazyGoal CLI."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Sequence

from .adapter import LazyGoalGEPAAdapter
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    workspace_root = arguments.workspace_root.resolve()
    manifest_path = (arguments.manifest or workspace_root / "benchmarks/alfworld/manifests/smoke.json").resolve()
    profile_path = (arguments.profile or workspace_root / ".lazygoal/profiles/alfworld-profile.json").resolve()
    output_directory = (arguments.output_directory or workspace_root / ".lazygoal/gepa-adapter-smoke").resolve()
    executable = (arguments.lazygoal_executable or workspace_root / "bin/lazygoal.cjs").resolve()
    model_id = arguments.model_id or os.environ.get("LLM_MODEL", "").strip()
    model_config_id = arguments.model_config_id or os.environ.get("LLM_PROVIDER", "").strip()
    if not model_id:
        raise SystemExit("LLM_MODEL or --model-id is required")
    if not model_config_id:
        raise SystemExit("LLM_PROVIDER or --model-config-id is required")

    task_id = _read_single_task_id(manifest_path)
    profile = _read_profile(profile_path)
    candidate = {"system_prompt": profile["systemPrompt"]}
    candidate.update(
        {
            f"instruction_{index:03d}": instruction
            for index, instruction in enumerate(profile["instructions"])
        }
    )
    adapter = LazyGoalGEPAAdapter(
        LazyGoalGEPAConfig(
            benchmark_id="alfworld",
            base_profile_id=profile["id"],
            model_config_id=model_config_id,
            model_id=model_id,
            output_directory=output_directory,
            lazygoal_executable=executable,
        )
    )
    result = adapter.evaluate(
        [
            LazyGoalEvaluationExample(
                sample_id=f"alfworld:{task_id}",
                benchmark_id="alfworld",
                task_id=task_id,
                manifest_path=manifest_path,
            )
        ],
        candidate,
        capture_traces=True,
    )
    output = result.outputs[0]
    print(
        json.dumps(
            {
                "benchmarkId": "alfworld",
                "taskId": output.task_id,
                "status": output.status,
                "score": result.scores[0],
                "outputDirectory": str(output_directory),
            },
            separators=(",", ":"),
        )
    )
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run one ALFWorld sample through GEPA's LazyGoal adapter",
    )
    parser.add_argument("--workspace-root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--profile", type=Path)
    parser.add_argument("--output-directory", type=Path)
    parser.add_argument("--lazygoal-executable", type=Path)
    parser.add_argument("--model-config-id")
    parser.add_argument("--model-id")
    return parser


def _read_single_task_id(path: Path) -> str:
    raw = _read_json_object(path, "Manifest")
    tasks = raw.get("tasks")
    if not isinstance(tasks, list) or len(tasks) != 1:
        raise SystemExit("Manifest must contain exactly one task")
    task = tasks[0]
    if not isinstance(task, dict) or not isinstance(task.get("taskId"), str) or not task["taskId"].strip():
        raise SystemExit("Manifest taskId must be a non-empty string")
    return task["taskId"]


def _read_profile(path: Path) -> dict[str, Any]:
    raw = _read_json_object(path, "Profile")
    profile_id = raw.get("id")
    system_prompt = raw.get("systemPrompt")
    instructions = raw.get("instructions")
    if not isinstance(profile_id, str) or not profile_id.strip():
        raise SystemExit("Profile id must be a non-empty string")
    if not isinstance(system_prompt, str) or not system_prompt.strip():
        raise SystemExit("Profile systemPrompt must be a non-empty string")
    if (
        not isinstance(instructions, list)
        or not instructions
        or any(not isinstance(item, str) or not item.strip() for item in instructions)
    ):
        raise SystemExit("Profile instructions must contain non-empty strings")
    return {
        "id": profile_id,
        "systemPrompt": system_prompt,
        "instructions": instructions,
    }


def _read_json_object(path: Path, label: str) -> dict[str, Any]:
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise SystemExit(f"{label} could not be read as JSON: {path}") from error
    if not isinstance(raw, dict):
        raise SystemExit(f"{label} must be a JSON object: {path}")
    return raw


if __name__ == "__main__":
    raise SystemExit(main())
