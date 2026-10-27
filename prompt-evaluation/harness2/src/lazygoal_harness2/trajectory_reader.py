"""Full committed JSONL trajectory reader and contrastive view builder for Harness2."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .models import (
    CandidateEvaluationSummary,
    TaskRuntimeSummary,
    TaskTrajectoryComparison,
)

_SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"sk-[A-Za-z0-9_-]{16,}"), "sk-[REDACTED]"),
    (re.compile(r"AIza[0-9A-Za-z_-]{20,}"), "AIza[REDACTED]"),
    (re.compile(r"(?i)(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(api[_-]?key\s*[:=]\s*['\"]?)[A-Za-z0-9._-]{12,}"), r"\1[REDACTED]"),
)


def redact_secrets(text: str) -> str:
    """Mask API keys or bearer tokens while keeping full trajectory events intact."""
    result = text
    for pattern, replacement in _SECRET_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def read_committed_jsonl_trajectory(trajectory_locator: str | Path | None) -> tuple[dict[str, Any], ...]:
    """Read all committed JSONL trajectory events from a file or trajectory directory."""
    if trajectory_locator is None:
        return ()
    path = Path(trajectory_locator)
    if not path.exists():
        return ()

    jsonl_files: list[Path] = []
    if path.is_file() and path.suffix == ".jsonl":
        jsonl_files.append(path)
    elif path.is_dir():
        jsonl_files.extend(sorted(path.rglob("*.jsonl")))

    events: list[dict[str, Any]] = []
    for jsonl_file in jsonl_files:
        raw_text = redact_secrets(jsonl_file.read_text(encoding="utf-8", errors="replace"))
        for line in raw_text.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, dict):
                    events.append(parsed)
            except json.JSONDecodeError:
                continue

    events.sort(key=lambda e: int(e.get("sequence", 0)) if isinstance(e.get("sequence"), int) else 0)
    return tuple(events)


def load_evaluation_trajectories(result_json_path: str | Path) -> CandidateEvaluationSummary:
    """Parse a PromptEvaluationResultV1 file and attach full JSONL trajectories for every task."""
    result_path = Path(result_json_path).resolve()
    raw: dict[str, Any] = json.loads(result_path.read_text(encoding="utf-8"))

    evaluation_id = str(raw.get("evaluationId", "eval-unknown"))
    candidate_info = raw.get("candidate") or {}
    candidate_id = str(raw.get("candidateId") or candidate_info.get("id", "cand-unknown"))

    tasks_map: dict[str, TaskRuntimeSummary] = {}
    total_score = 0.0
    zero_fault_passes = 0
    total_repairs = 0
    total_stage_rejections = 0
    total_tool_faults = 0
    total_terminal_faults = 0

    raw_tasks = raw.get("tasks") or []
    for item in raw_tasks:
        if not isinstance(item, dict):
            continue
        task_id = str(item.get("taskId", ""))
        status = str(item.get("status", "failed"))
        domain = item.get("domainResult") or {}
        health = domain.get("runtimeHealth") or {}
        locator = item.get("artifactLocator") or {}
        trajectory_dir = locator.get("trajectory")

        committed_events = read_committed_jsonl_trajectory(trajectory_dir)
        runtime_score = float(
            health.get(
                "runtimeScore",
                item.get("metricScore", 1.0 if status == "passed" else 0.0),
            )
        )
        zero_fault_pass = bool(health.get("zeroFaultPass", status == "passed"))
        call_error_rate = float(health.get("callErrorRate", 0.0 if zero_fault_pass else 1.0))
        repair_count = int(health.get("repairCount", 0))
        stage_rejection_count = int(health.get("stageRejectionCount", 0))
        tool_fault_count = int(health.get("toolFaultCount", 0))
        terminal_fault_count = int(health.get("terminalFaultCount", 0 if status == "passed" else 1))
        has_patch = bool(health.get("hasNonEmptyPatch", bool(domain.get("patchBytes", 0) > 0)))
        has_verify = bool(health.get("hasVerificationBashCall", False))
        faults = tuple(
            f for f in (health.get("faults") or []) if isinstance(f, dict)
        )

        summary = TaskRuntimeSummary(
            task_id=task_id,
            status=status,
            zero_fault_pass=zero_fault_pass,
            runtime_score=runtime_score,
            call_error_rate=call_error_rate,
            repair_count=repair_count,
            stage_rejection_count=stage_rejection_count,
            tool_fault_count=tool_fault_count,
            terminal_fault_count=terminal_fault_count,
            has_non_empty_patch=has_patch,
            has_verification_bash_call=has_verify,
            faults=faults,
            committed_events=committed_events,
            trajectory_path=str(trajectory_dir) if trajectory_dir else None,
            patch_path=domain.get("patchPath"),
        )
        tasks_map[task_id] = summary
        total_score += runtime_score
        if zero_fault_pass:
            zero_fault_passes += 1
        total_repairs += repair_count
        total_stage_rejections += stage_rejection_count
        total_tool_faults += tool_fault_count
        total_terminal_faults += terminal_fault_count

    count = max(1, len(tasks_map))
    total_faults = (
        total_repairs
        + total_stage_rejections
        + total_tool_faults
        + total_terminal_faults
    )
    return CandidateEvaluationSummary(
        evaluation_id=evaluation_id,
        candidate_id=candidate_id,
        mean_runtime_score=total_score / count,
        zero_fault_pass_rate=zero_fault_passes / count,
        total_fault_count=total_faults,
        repair_count=total_repairs,
        stage_rejection_count=total_stage_rejections,
        tool_fault_count=total_tool_faults,
        terminal_fault_count=total_terminal_faults,
        tasks=tasks_map,
        result_path=str(result_path),
    )


def build_contrastive_trajectory_view(
    baseline: CandidateEvaluationSummary,
    probe: CandidateEvaluationSummary,
) -> list[TaskTrajectoryComparison]:
    """Pair Baseline and Probe task trajectories to highlight resolved and introduced faults."""
    comparisons: list[TaskTrajectoryComparison] = []
    common_task_ids = sorted(set(baseline.tasks.keys()) & set(probe.tasks.keys()))
    for task_id in common_task_ids:
        b_task = baseline.tasks[task_id]
        p_task = probe.tasks[task_id]
        b_codes = {str(f.get("code", "")) for f in b_task.faults if f.get("code")}
        p_codes = {str(f.get("code", "")) for f in p_task.faults if f.get("code")}
        resolved = tuple(sorted(b_codes - p_codes))
        introduced = tuple(sorted(p_codes - b_codes))
        comparisons.append(
            TaskTrajectoryComparison(
                task_id=task_id,
                baseline=b_task,
                probe=p_task,
                score_delta=round(p_task.runtime_score - b_task.runtime_score, 6),
                fault_delta=p_task.total_fault_count() - b_task.total_fault_count(),
                resolved_fault_codes=resolved,
                introduced_fault_codes=introduced,
            )
        )
    return comparisons


def format_full_trajectories_for_prompt(
    summary: CandidateEvaluationSummary,
    *,
    max_events_per_task: int = 80,
) -> str:
    """Serialize full committed trajectory events and fault breakdowns for Editor/Composer prompts."""
    blocks: list[str] = [
        f"Candidate `{summary.candidate_id}` | Mean Runtime Score: {summary.mean_runtime_score:.4f} "
        f"| Zero-Fault Pass Rate: {summary.zero_fault_pass_rate:.2%} "
        f"| Total Faults: {summary.total_fault_count} "
        f"(repairs={summary.repair_count}, stage_rejections={summary.stage_rejection_count}, "
        f"tool_faults={summary.tool_fault_count}, terminal_faults={summary.terminal_fault_count})"
    ]
    for task_id, task in sorted(summary.tasks.items()):
        blocks.append(
            f"\n### Task `{task_id}` (status={task.status}, score={task.runtime_score:.4f}, "
            f"zeroFaultPass={task.zero_fault_pass}, hasPatch={task.has_non_empty_patch}, "
            f"hasVerificationBash={task.has_verification_bash_call})"
        )
        if task.faults:
            blocks.append("#### Faults Recorded:")
            for fault in task.faults:
                seq = fault.get("sequence")
                cat = fault.get("category")
                code = fault.get("code")
                origin = fault.get("origin", "")
                msg = fault.get("message", "")
                blocks.append(f"- [seq={seq}][{cat}][{code}] ({origin}): {msg}")
        else:
            blocks.append("#### Faults Recorded: None (Zero-Fault Execution)")

        blocks.append(f"#### Committed Trajectory Events ({len(task.committed_events)} total):")
        for event in task.committed_events[:max_events_per_task]:
            seq = event.get("sequence")
            payload = event.get("payload") or {}
            etype = payload.get("type", "unknown")
            serialized = json.dumps(payload, ensure_ascii=False)
            if len(serialized) > 600:
                serialized = serialized[:597] + "..."
            blocks.append(f"  seq={seq} [{etype}]: {serialized}")
    return "\n".join(blocks)
