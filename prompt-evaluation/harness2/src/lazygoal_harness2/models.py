"""Data models and protocol contracts for the LazyGoal Harness2 control plane."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

HARNESS2_RUN_PROTOCOL = "lazygoal-harness2-run@1"

EditScope = Literal["invariant", "domain", "composed"]
LifecycleStatus = Literal["pending", "running", "completed", "stopped", "failed"]


@dataclass(frozen=True)
class Harness2Candidate:
    """Immutable snapshot of a dual-track candidate (Prompt Bundle templates + AgentProfile)."""

    candidate_id: str
    base_profile_id: str
    system_prompt: str
    instructions: tuple[str, ...]
    template_overrides: dict[str, str] = field(default_factory=dict)
    parent_candidate_id: str | None = None
    scope: EditScope = "composed"
    hypothesis: str = ""
    target_fault_codes: tuple[str, ...] = ()

    def to_prompt_evaluation_candidate(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.candidate_id,
            "baseProfileId": self.base_profile_id,
            "systemPrompt": self.system_prompt,
            "instructions": list(self.instructions),
        }
        if self.template_overrides:
            payload["templateOverrides"] = dict(sorted(self.template_overrides.items()))
        return payload

    def to_dict(self) -> dict[str, Any]:
        return {
            "candidateId": self.candidate_id,
            "baseProfileId": self.base_profile_id,
            "systemPrompt": self.system_prompt,
            "instructions": list(self.instructions),
            "templateOverrides": dict(sorted(self.template_overrides.items())),
            "parentCandidateId": self.parent_candidate_id,
            "scope": self.scope,
            "hypothesis": self.hypothesis,
            "targetFaultCodes": list(self.target_fault_codes),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Harness2Candidate:
        raw_overrides = data.get("templateOverrides") or {}
        return cls(
            candidate_id=str(data["candidateId"]),
            base_profile_id=str(data["baseProfileId"]),
            system_prompt=str(data["systemPrompt"]),
            instructions=tuple(str(item) for item in data.get("instructions", [])),
            template_overrides={str(k): str(v) for k, v in sorted(raw_overrides.items())},
            parent_candidate_id=data.get("parentCandidateId"),
            scope=data.get("scope", "composed"),
            hypothesis=str(data.get("hypothesis", "")),
            target_fault_codes=tuple(str(c) for c in data.get("targetFaultCodes", [])),
        )


@dataclass(frozen=True)
class TaskRuntimeSummary:
    """Per-task runtime health and full committed trajectory events."""

    task_id: str
    status: str
    zero_fault_pass: bool
    runtime_score: float
    call_error_rate: float
    repair_count: int
    stage_rejection_count: int
    tool_fault_count: int
    terminal_fault_count: int
    has_non_empty_patch: bool
    has_verification_bash_call: bool
    faults: tuple[dict[str, Any], ...]
    committed_events: tuple[dict[str, Any], ...]
    trajectory_path: str | None = None
    patch_path: str | None = None

    def total_fault_count(self) -> int:
        return (
            self.repair_count
            + self.stage_rejection_count
            + self.tool_fault_count
            + self.terminal_fault_count
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "taskId": self.task_id,
            "status": self.status,
            "zeroFaultPass": self.zero_fault_pass,
            "runtimeScore": self.runtime_score,
            "callErrorRate": self.call_error_rate,
            "repairCount": self.repair_count,
            "stageRejectionCount": self.stage_rejection_count,
            "toolFaultCount": self.tool_fault_count,
            "terminalFaultCount": self.terminal_fault_count,
            "hasNonEmptyPatch": self.has_non_empty_patch,
            "hasVerificationBashCall": self.has_verification_bash_call,
            "faults": list(self.faults),
            "committedEventCount": len(self.committed_events),
            "trajectoryPath": self.trajectory_path,
            "patchPath": self.patch_path,
        }


@dataclass(frozen=True)
class CandidateEvaluationSummary:
    """Aggregated evaluation outcome of a candidate across a task subset."""

    evaluation_id: str
    candidate_id: str
    mean_runtime_score: float
    zero_fault_pass_rate: float
    total_fault_count: int
    repair_count: int
    stage_rejection_count: int
    tool_fault_count: int
    terminal_fault_count: int
    tasks: dict[str, TaskRuntimeSummary]
    result_path: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "evaluationId": self.evaluation_id,
            "candidateId": self.candidate_id,
            "meanRuntimeScore": round(self.mean_runtime_score, 6),
            "zeroFaultPassRate": round(self.zero_fault_pass_rate, 6),
            "totalFaultCount": self.total_fault_count,
            "repairCount": self.repair_count,
            "stageRejectionCount": self.stage_rejection_count,
            "toolFaultCount": self.tool_fault_count,
            "terminalFaultCount": self.terminal_fault_count,
            "tasks": {tid: summary.to_dict() for tid, summary in sorted(self.tasks.items())},
            "resultPath": self.result_path,
        }


@dataclass(frozen=True)
class TaskTrajectoryComparison:
    """Contrastive pairing of a Baseline trajectory and a Probe trajectory on the same task."""

    task_id: str
    baseline: TaskRuntimeSummary
    probe: TaskRuntimeSummary
    score_delta: float
    fault_delta: int
    resolved_fault_codes: tuple[str, ...]
    introduced_fault_codes: tuple[str, ...]


@dataclass(frozen=True)
class Harness2RunRequest:
    """Validated input request for a Harness2 optimization run."""

    benchmark_id: str
    manifest_path: str
    train_task_ids: tuple[str, ...]
    validation_task_ids: tuple[str, ...]
    agent_model_config_id: str
    agent_model_id: str
    editor_model_config_id: str
    editor_model_id: str
    base_profile_id: str = "swebench-acp-profile"
    max_iterations: int = 3
    proposals_per_iteration: int = 2
    max_concurrency: int = 1
    run_id: str | None = None

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> Harness2RunRequest:
        protocol = raw.get("protocol", HARNESS2_RUN_PROTOCOL)
        if protocol != HARNESS2_RUN_PROTOCOL:
            raise ValueError(f"Unsupported Harness2 protocol: {protocol!r}")
        benchmark = raw.get("benchmark") or {}
        benchmark_id = str(benchmark.get("id", "swebench"))
        manifest_path = str(benchmark.get("manifestPath", "")).strip()
        if not manifest_path:
            raise ValueError("Harness2 request requires benchmark.manifestPath")
        train_ids = tuple(str(x) for x in benchmark.get("trainTaskIds") or benchmark.get("taskIds") or [])
        if not train_ids:
            raise ValueError("Harness2 request requires non-empty benchmark.trainTaskIds or benchmark.taskIds")
        val_ids = tuple(str(x) for x in benchmark.get("validationTaskIds") or train_ids)

        agent_model = raw.get("agentModel") or raw.get("model") or {}
        agent_config_id = str(agent_model.get("configId", "default")).strip()
        agent_model_id = str(agent_model.get("modelId", "")).strip()
        if not agent_model_id:
            raise ValueError("Harness2 request requires agentModel.modelId (or model.modelId)")

        editor_model = raw.get("editorModel") or agent_model
        editor_config_id = str(editor_model.get("configId", agent_config_id)).strip()
        editor_model_id = str(editor_model.get("modelId", agent_model_id)).strip()

        budget = raw.get("budget") or {}
        max_iterations = int(budget.get("maxIterations", 3))
        proposals_per_iteration = int(budget.get("proposalsPerIteration", 2))
        max_concurrency = int(budget.get("maxConcurrency", 1))
        if max_iterations < 1 or proposals_per_iteration < 1 or max_concurrency < 1:
            raise ValueError("Harness2 budget values must be positive integers")

        return cls(
            benchmark_id=benchmark_id,
            manifest_path=manifest_path,
            train_task_ids=train_ids,
            validation_task_ids=val_ids,
            agent_model_config_id=agent_config_id,
            agent_model_id=agent_model_id,
            editor_model_config_id=editor_config_id,
            editor_model_id=editor_model_id,
            base_profile_id=str(raw.get("baseProfileId", "swebench-acp-profile")),
            max_iterations=max_iterations,
            proposals_per_iteration=proposals_per_iteration,
            max_concurrency=max_concurrency,
            run_id=raw.get("runId"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol": HARNESS2_RUN_PROTOCOL,
            "runId": self.run_id,
            "baseProfileId": self.base_profile_id,
            "benchmark": {
                "id": self.benchmark_id,
                "manifestPath": self.manifest_path,
                "trainTaskIds": list(self.train_task_ids),
                "validationTaskIds": list(self.validation_task_ids),
            },
            "agentModel": {
                "configId": self.agent_model_config_id,
                "modelId": self.agent_model_id,
            },
            "editorModel": {
                "configId": self.editor_model_config_id,
                "modelId": self.editor_model_id,
            },
            "budget": {
                "maxIterations": self.max_iterations,
                "proposalsPerIteration": self.proposals_per_iteration,
                "maxConcurrency": self.max_concurrency,
            },
        }


@dataclass(frozen=True)
class Harness2StatusReport:
    """Authoritative status snapshot of a Harness2 run."""

    run_id: str
    lifecycle_status: LifecycleStatus
    current_iteration: int
    max_iterations: int
    baseline_score: float | None
    best_score: float | None
    best_candidate_id: str | None
    overridden_template_ids: tuple[str, ...]
    library_size: int
    run_dir: str
    exports_dir: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "lifecycleStatus": self.lifecycle_status,
            "currentIteration": self.current_iteration,
            "maxIterations": self.max_iterations,
            "baselineScore": self.baseline_score,
            "bestScore": self.best_score,
            "bestCandidateId": self.best_candidate_id,
            "overriddenTemplateIds": list(self.overridden_template_ids),
            "librarySize": self.library_size,
            "runDir": self.run_dir,
            "exportsDir": self.exports_dir,
            "error": self.error,
        }
