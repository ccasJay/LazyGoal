"""Harness2 Propose-Probe-Compose optimization engine and lifecycle controller."""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .exporter import ExportedArtifacts, apply_run_exports, export_best_candidate
from .library import ImprovementEntry, ImprovementLibrary
from .models import (
    CandidateEvaluationSummary,
    EditScope,
    Harness2Candidate,
    Harness2RunRequest,
    Harness2StatusReport,
    TaskTrajectoryComparison,
)
from .trajectory_reader import (
    build_contrastive_trajectory_view,
    format_full_trajectories_for_prompt,
    load_evaluation_trajectories,
)
from .workspace import (
    HarnessWorkspace,
    MUTABLE_TEMPLATE_SOURCE_PATHS,
)


class PromptEvalBridge(Protocol):
    """Protocol for invoking `lazygoal eval prompt` on a candidate."""

    def evaluate(
        self,
        *,
        candidate: Harness2Candidate,
        request: Harness2RunRequest,
        task_ids: tuple[str, ...],
        output_dir: Path,
    ) -> CandidateEvaluationSummary: ...


class ReflectionBridge(Protocol):
    """Protocol for invoking the Editor/Composer LLM via `lazygoal gepa reflect`."""

    def generate(
        self,
        *,
        config_id: str,
        model_id: str,
        prompt: str,
    ) -> str: ...


@dataclass(frozen=True)
class ProbeOutcome:
    """Result of probing a single proposed edit against the parent candidate."""

    candidate: Harness2Candidate
    evaluation: CandidateEvaluationSummary
    comparisons: tuple[TaskTrajectoryComparison, ...]
    score_delta: float
    fault_delta: int
    resolved_fault_codes: tuple[str, ...]
    introduced_fault_codes: tuple[str, ...]
    library_entry: ImprovementEntry


class SubprocessPromptEvalBridge:
    """Invokes `node bin/lazygoal.cjs eval prompt --request <path>`."""

    def __init__(self, workspace_root: Path) -> None:
        self.workspace_root = workspace_root.resolve()
        self.cli_bin = self.workspace_root / "bin" / "lazygoal.cjs"

    def evaluate(
        self,
        *,
        candidate: Harness2Candidate,
        request: Harness2RunRequest,
        task_ids: tuple[str, ...],
        output_dir: Path,
    ) -> CandidateEvaluationSummary:
        output_dir = output_dir.resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        base_manifest_path = (
            Path(request.manifest_path).resolve()
            if Path(request.manifest_path).is_absolute()
            else (self.workspace_root / request.manifest_path).resolve()
        )
        effective_manifest_path = base_manifest_path
        if task_ids and base_manifest_path.is_file():
            try:
                raw_manifest = json.loads(base_manifest_path.read_text(encoding="utf-8"))
                if (
                    isinstance(raw_manifest, dict)
                    and "instanceIds" in raw_manifest
                    and list(raw_manifest["instanceIds"]) != list(task_ids)
                ):
                    subset_manifest = {
                        **raw_manifest,
                        "instanceIds": list(task_ids),
                    }
                    effective_manifest_path = output_dir / "subset-manifest.json"
                    effective_manifest_path.write_text(
                        json.dumps(subset_manifest, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
            except Exception:
                effective_manifest_path = base_manifest_path

        req_payload = {
            "protocol": "prompt-evaluation@1",
            "benchmark": {
                "id": request.benchmark_id,
                "manifestPath": str(effective_manifest_path),
            },
            "candidate": candidate.to_prompt_evaluation_candidate(),
            "model": {
                "configId": request.agent_model_config_id,
                "modelId": request.agent_model_id,
            },
            "outputDirectory": str(output_dir),
        }
        req_file = output_dir / f"prompt-eval-request-{candidate.candidate_id}.json"
        req_file.write_text(
            json.dumps(req_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        proc = subprocess.run(
            ["node", str(self.cli_bin), "eval", "prompt", "--request", str(req_file)],
            cwd=str(self.workspace_root),
            capture_output=True,
            text=True,
            check=False,
        )
        result_path: str | None = None
        for line in reversed(proc.stdout.splitlines()):
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                if isinstance(event, dict) and isinstance(event.get("resultPath"), str):
                    result_path = event["resultPath"]
                    break
            except json.JSONDecodeError:
                continue

        if result_path is None:
            stderr_msg = proc.stderr.strip() or proc.stdout.strip()
            raise RuntimeError(
                f"Prompt Evaluation failed (exit={proc.returncode}): {stderr_msg}"
            )
        return load_evaluation_trajectories(result_path)


class SubprocessReflectionBridge:
    """Invokes `node bin/lazygoal.cjs gepa reflect --request <path>`."""

    def __init__(self, workspace_root: Path) -> None:
        self.workspace_root = workspace_root.resolve()
        self.cli_bin = self.workspace_root / "bin" / "lazygoal.cjs"

    def generate(
        self,
        *,
        config_id: str,
        model_id: str,
        prompt: str,
    ) -> str:
        import tempfile

        model_target: dict[str, str] = {"modelId": model_id}
        if config_id and config_id not in ("default", ""):
            model_target["configId"] = config_id
        payload = json.dumps(
            {
                "model": model_target,
                "prompt": prompt,
            },
            ensure_ascii=False,
        )
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json",
            prefix="lg-h2-reflect-",
            encoding="utf-8",
            delete=False,
        ) as tmp:
            tmp.write(payload)
            req_path = Path(tmp.name)

        try:
            proc = subprocess.run(
                [
                    "node",
                    str(self.cli_bin),
                    "gepa",
                    "reflect",
                    "--request",
                    str(req_path),
                ],
                cwd=str(self.workspace_root),
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            req_path.unlink(missing_ok=True)

        if proc.returncode != 0:
            raise RuntimeError(
                f"Reflection bridge failed (exit={proc.returncode}): {proc.stderr.strip()}"
            )
        parsed = json.loads(proc.stdout.strip())
        return str(parsed.get("text", ""))


def extract_json_object(text: str) -> dict[str, Any]:
    """Extract a JSON object from an LLM response (handling markdown code fences)."""
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.DOTALL)
    candidate_str = fence_match.group(1) if fence_match else text.strip()
    if not candidate_str.startswith("{"):
        start = candidate_str.find("{")
        end = candidate_str.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate_str = candidate_str[start : end + 1]
    parsed = json.loads(candidate_str)
    if not isinstance(parsed, dict):
        raise ValueError("Expected top-level JSON object in model output")
    return parsed


class ProposeProbeComposeEngine:
    """Executes the Harness2 Propose-Probe-Compose iterative optimization loop."""

    def __init__(
        self,
        *,
        workspace: HarnessWorkspace,
        library: ImprovementLibrary,
        eval_bridge: PromptEvalBridge,
        reflection_bridge: ReflectionBridge,
    ) -> None:
        self.workspace = workspace
        self.library = library
        self.eval_bridge = eval_bridge
        self.reflection_bridge = reflection_bridge

    def propose(
        self,
        *,
        parent: Harness2Candidate,
        parent_eval: CandidateEvaluationSummary,
        request: Harness2RunRequest,
        iteration: int,
    ) -> list[Harness2Candidate]:
        """Generate K focused Invariant (.njk) and Domain (Profile) edit proposals."""
        effective_templates = self.workspace.resolve_effective_templates(parent)
        trajectory_report = format_full_trajectories_for_prompt(parent_eval)
        prior_entries = [e.to_dict() for e in self.library.top_positive(limit=6)]

        prompt = (
            "You are the Harness2 Propose (Editor) agent for LazyGoal.\n"
            "Your objective is to eliminate Runtime protocol friction (repairs, stage rejections, "
            "tool failures, unverified completions) and maximize SWE-bench runtime health.\n\n"
            "## Mutable Framework Templates (Invariant Edits)\n"
            "Only these 5 Nunjucks templates may be edited; you MUST preserve all required `{{ ... }}` "
            "and `{% ... %}` interpolation variables and section headers:\n"
            + "\n".join(
                f"### `{tid}`\n```njk\n{content}\n```"
                for tid, content in sorted(effective_templates.items())
            )
            + "\n\n## Current SWE-bench AgentProfile (Domain Edits)\n"
            "Must reference `/testbed` and all 5 tools (`read_file`, `write_file`, `edit_file`, `grep`, `bash`).\n"
            f"```json\n{json.dumps({'systemPrompt': parent.system_prompt, 'instructions': list(parent.instructions)}, ensure_ascii=False, indent=2)}\n```\n\n"
            "## Full Committed Trajectory & Fault Report (Parent Candidate)\n"
            f"{trajectory_report}\n\n"
            "## Historical Positive Improvements in Library\n"
            f"```json\n{json.dumps(prior_entries, ensure_ascii=False, indent=2)}\n```\n\n"
            f"Return a JSON object with key `proposals` containing up to {request.proposals_per_iteration} "
            "focused proposals. Each proposal object must have:\n"
            '- `"scope"`: `"invariant"` (edits `.njk` templates) or `"domain"` (edits `systemPrompt`/`instructions`)\n'
            '- `"hypothesis"`: concise root-cause diagnosis grounded in the trajectory events\n'
            '- `"targetFaultCodes"`: array of fault codes targeted\n'
            '- `"templateEdits"`: optional object mapping templateId to full updated `.njk` string\n'
            '- `"systemPrompt"`: optional updated systemPrompt string\n'
            '- `"instructions"`: optional updated array of instruction strings\n'
        )

        raw_response = self.reflection_bridge.generate(
            config_id=request.editor_model_config_id,
            model_id=request.editor_model_id,
            prompt=prompt,
        )
        parsed = extract_json_object(raw_response)
        raw_proposals = parsed.get("proposals") or []

        candidates: list[Harness2Candidate] = []
        seen_ids: set[str] = {parent.candidate_id}
        for item in raw_proposals[: request.proposals_per_iteration]:
            if not isinstance(item, dict):
                continue
            scope: EditScope = (
                item.get("scope")
                if item.get("scope") in ("invariant", "domain", "composed")
                else "composed"
            )
            template_edits = {
                str(k): str(v)
                for k, v in (item.get("templateEdits") or {}).items()
                if str(k) in MUTABLE_TEMPLATE_SOURCE_PATHS and isinstance(v, str) and v.strip()
            }
            sys_prompt = item.get("systemPrompt")
            instructions = item.get("instructions")
            try:
                cand = self.workspace.build_candidate_from_edits(
                    parent,
                    system_prompt=sys_prompt if isinstance(sys_prompt, str) else None,
                    instructions=instructions if isinstance(instructions, list) else None,
                    template_edits=template_edits,
                    scope=scope,
                    hypothesis=str(item.get("hypothesis", f"Iteration {iteration} proposal")),
                    target_fault_codes=tuple(
                        str(c) for c in (item.get("targetFaultCodes") or [])
                    ),
                )
            except ValueError:
                continue
            if cand.candidate_id not in seen_ids:
                seen_ids.add(cand.candidate_id)
                candidates.append(cand)
        return candidates

    def probe(
        self,
        *,
        parent: Harness2Candidate,
        parent_eval: CandidateEvaluationSummary,
        proposals: list[Harness2Candidate],
        request: Harness2RunRequest,
        iteration_dir: Path,
    ) -> list[ProbeOutcome]:
        """Evaluate each proposed candidate on the train set and record contrastive trajectory deltas."""
        outcomes: list[ProbeOutcome] = []
        for idx, proposal in enumerate(proposals):
            probe_dir = iteration_dir / f"probe-{idx + 1}-{proposal.candidate_id}"
            self.workspace.materialize_tree(proposal, probe_dir / "workspace")
            eval_summary = self.eval_bridge.evaluate(
                candidate=proposal,
                request=request,
                task_ids=request.train_task_ids,
                output_dir=probe_dir / "eval",
            )
            comparisons = tuple(build_contrastive_trajectory_view(parent_eval, eval_summary))
            score_delta = round(
                eval_summary.mean_runtime_score - parent_eval.mean_runtime_score, 6
            )
            fault_delta = eval_summary.total_fault_count - parent_eval.total_fault_count
            resolved_codes = tuple(
                sorted({code for comp in comparisons for code in comp.resolved_fault_codes})
            )
            introduced_codes = tuple(
                sorted({code for comp in comparisons for code in comp.introduced_fault_codes})
            )

            entry_hash = hashlib.sha256(
                f"{proposal.scope}:{proposal.candidate_id}".encode("utf-8")
            ).hexdigest()[:12]
            entry_id = f"imp-{entry_hash}"
            template_delta = {
                tid: content
                for tid, content in proposal.template_overrides.items()
                if parent.template_overrides.get(tid) != content
            }
            entry = ImprovementEntry(
                entry_id=entry_id,
                scope=proposal.scope,
                hypothesis=proposal.hypothesis,
                target_fault_codes=resolved_codes or proposal.target_fault_codes,
                template_edits=template_delta,
                system_prompt_edit=(
                    proposal.system_prompt
                    if proposal.system_prompt != parent.system_prompt
                    else None
                ),
                instructions_edit=(
                    proposal.instructions
                    if proposal.instructions != parent.instructions
                    else None
                ),
            )
            entry.record_probe(score_delta=score_delta, fault_delta=fault_delta)
            self.library.upsert(entry)

            outcomes.append(
                ProbeOutcome(
                    candidate=proposal,
                    evaluation=eval_summary,
                    comparisons=comparisons,
                    score_delta=score_delta,
                    fault_delta=fault_delta,
                    resolved_fault_codes=resolved_codes,
                    introduced_fault_codes=introduced_codes,
                    library_entry=entry,
                )
            )
        return outcomes

    def compose(
        self,
        *,
        parent: Harness2Candidate,
        parent_eval: CandidateEvaluationSummary,
        outcomes: list[ProbeOutcome],
        request: Harness2RunRequest,
        iteration: int,
    ) -> Harness2Candidate | None:
        """Synthesize beneficial Probe edits using contrastive trajectory analysis."""
        beneficial = [
            o
            for o in outcomes
            if o.score_delta > 0.0
            or o.fault_delta < 0
            or (len(o.resolved_fault_codes) > len(o.introduced_fault_codes))
        ]
        if not beneficial:
            return None
        beneficial.sort(
            key=lambda o: (o.score_delta, -o.fault_delta, len(o.resolved_fault_codes)),
            reverse=True,
        )
        if len(beneficial) == 1:
            return beneficial[0].candidate

        # Attempt LLM-assisted contrastive composition with deterministic orthogonal fallback
        contrastive_summary: list[dict[str, Any]] = []
        for outcome in beneficial:
            contrastive_summary.append(
                {
                    "candidateId": outcome.candidate.candidate_id,
                    "scope": outcome.candidate.scope,
                    "hypothesis": outcome.candidate.hypothesis,
                    "scoreDelta": outcome.score_delta,
                    "faultDelta": outcome.fault_delta,
                    "resolvedFaultCodes": list(outcome.resolved_fault_codes),
                    "introducedFaultCodes": list(outcome.introduced_fault_codes),
                    "templateOverrides": outcome.candidate.template_overrides,
                    "systemPrompt": outcome.candidate.system_prompt,
                    "instructions": list(outcome.candidate.instructions),
                    "taskComparisons": [
                        {
                            "taskId": c.task_id,
                            "scoreDelta": c.score_delta,
                            "faultDelta": c.fault_delta,
                            "resolvedFaultCodes": list(c.resolved_fault_codes),
                            "introducedFaultCodes": list(c.introduced_fault_codes),
                            "baselineFaults": list(c.baseline.faults),
                            "probeFaults": list(c.probe.faults),
                        }
                        for c in outcome.comparisons
                    ],
                }
            )

        compose_prompt = (
            "You are the Harness2 Composer agent for LazyGoal.\n"
            "Multiple Probe candidates improved over the Baseline/Parent trajectory.\n"
            "Inspect their contrastive trajectory outcomes (resolved vs. introduced faults) "
            "and synthesize a unified candidate combining non-conflicting Invariant (`.njk`) "
            "and Domain (`systemPrompt`/`instructions`) improvements.\n\n"
            f"## Contrastive Probe Outcomes\n```json\n{json.dumps(contrastive_summary, ensure_ascii=False, indent=2)}\n```\n\n"
            "Return a JSON object with keys `hypothesis`, `templateEdits`, `systemPrompt`, and `instructions`."
        )

        try:
            raw_text = self.reflection_bridge.generate(
                config_id=request.editor_model_config_id,
                model_id=request.editor_model_id,
                prompt=compose_prompt,
            )
            parsed = extract_json_object(raw_text)
            composed_templates = {
                str(k): str(v)
                for k, v in (parsed.get("templateEdits") or {}).items()
                if str(k) in MUTABLE_TEMPLATE_SOURCE_PATHS and isinstance(v, str) and v.strip()
            }
            composed_candidate = self.workspace.build_candidate_from_edits(
                parent,
                system_prompt=parsed.get("systemPrompt"),
                instructions=parsed.get("instructions"),
                template_edits=composed_templates,
                scope="composed",
                hypothesis=str(
                    parsed.get("hypothesis", f"Iteration {iteration} composed candidate")
                ),
                target_fault_codes=tuple(
                    sorted(
                        {
                            code
                            for o in beneficial
                            for code in o.resolved_fault_codes
                        }
                    )
                ),
            )
            if composed_candidate.candidate_id != parent.candidate_id:
                return composed_candidate
        except Exception:
            pass

        # Deterministic orthogonal merge fallback (combine non-overlapping template & profile edits)
        merged_templates = dict(parent.template_overrides)
        merged_system_prompt = parent.system_prompt
        merged_instructions = parent.instructions
        hypotheses: list[str] = []
        for outcome in reversed(beneficial):
            cand = outcome.candidate
            for tid, content in cand.template_overrides.items():
                if content != parent.template_overrides.get(tid):
                    merged_templates[tid] = content
            if cand.system_prompt != parent.system_prompt:
                merged_system_prompt = cand.system_prompt
            if cand.instructions != parent.instructions:
                merged_instructions = cand.instructions
            if cand.hypothesis:
                hypotheses.append(cand.hypothesis)

        return self.workspace.build_candidate_from_edits(
            parent,
            system_prompt=merged_system_prompt,
            instructions=merged_instructions,
            template_edits=merged_templates,
            scope="composed",
            hypothesis=" + ".join(hypotheses[-2:]) or f"Iteration {iteration} orthogonal merge",
            target_fault_codes=tuple(
                sorted({code for o in beneficial for code in o.resolved_fault_codes})
            ),
        )


class Harness2Controller:
    """Lifecycle controller for Harness2 runs (preflight, start, status, stop, resume, report, apply)."""

    def __init__(
        self,
        *,
        workspace_root: str | Path | None = None,
        runs_dir: str | Path | None = None,
        eval_bridge: PromptEvalBridge | None = None,
        reflection_bridge: ReflectionBridge | None = None,
    ) -> None:
        self.workspace_root = Path(workspace_root or os.getcwd()).resolve()
        default_home = Path(os.environ.get("LAZYGOAL_HOME", Path.home() / ".lazygoal")).resolve()
        ws_hash = hashlib.sha256(str(self.workspace_root).encode("utf-8")).hexdigest()[:12]
        self.runs_dir = (
            Path(runs_dir).resolve()
            if runs_dir is not None
            else (default_home / "workspaces" / ws_hash / "harness2" / "runs")
        )
        self.shared_library_path = self.runs_dir.parent / "library" / "improvement-library.json"
        self.eval_bridge = eval_bridge or SubprocessPromptEvalBridge(self.workspace_root)
        self.reflection_bridge = reflection_bridge or SubprocessReflectionBridge(self.workspace_root)

    def preflight(self, request_path: str | Path) -> dict[str, Any]:
        """Validate request, workspace templates, and SWE-bench manifest before running."""
        req_file = Path(request_path).resolve()
        raw = json.loads(req_file.read_text(encoding="utf-8"))
        request = Harness2RunRequest.from_dict(raw)
        workspace = HarnessWorkspace(self.workspace_root)
        baseline = workspace.create_baseline_candidate()

        manifest_path = (
            Path(request.manifest_path)
            if Path(request.manifest_path).is_absolute()
            else (self.workspace_root / request.manifest_path).resolve()
        )
        if not manifest_path.is_file():
            raise FileNotFoundError(f"Benchmark manifest not found: {manifest_path}")

        return {
            "ok": True,
            "protocol": "lazygoal-harness2-preflight@1",
            "workspaceRoot": str(self.workspace_root),
            "runsDir": str(self.runs_dir),
            "mutableTemplates": sorted(MUTABLE_TEMPLATE_SOURCE_PATHS.keys()),
            "baselineCandidateId": baseline.candidate_id,
            "request": request.to_dict(),
        }

    def start(
        self,
        request_path: str | Path,
        *,
        foreground: bool = True,
    ) -> dict[str, Any]:
        """Initialize a new Harness2 run directory and execute (foreground or detached worker)."""
        req_file = Path(request_path).resolve()
        raw = json.loads(req_file.read_text(encoding="utf-8"))
        request = Harness2RunRequest.from_dict(raw)
        run_id = request.run_id or f"h2-{uuid.uuid4().hex[:12]}"
        run_dir = (self.runs_dir / run_id).resolve()
        run_dir.mkdir(parents=True, exist_ok=True)

        persisted_req = {**request.to_dict(), "runId": run_id}
        (run_dir / "request.json").write_text(
            json.dumps(persisted_req, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        workspace = HarnessWorkspace(self.workspace_root)
        baseline = workspace.create_baseline_candidate()
        self._write_state(
            run_dir,
            {
                "runId": run_id,
                "lifecycleStatus": "pending",
                "currentIteration": 0,
                "maxIterations": request.max_iterations,
                "baselineScore": None,
                "bestScore": None,
                "bestCandidate": baseline.to_dict(),
                "history": [],
                "error": None,
            },
        )

        if foreground:
            return self.execute_run_dir(run_dir)

        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "lazygoal_harness2.cli",
                "worker",
                "--run-dir",
                str(run_dir),
                "--workspace-root",
                str(self.workspace_root),
            ],
            cwd=str(self.workspace_root),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        (run_dir / "worker.pid").write_text(str(proc.pid), encoding="utf-8")
        return self.status(run_id)

    def execute_run_dir(self, run_dir: Path) -> dict[str, Any]:
        """Run or resume the Propose-Probe-Compose loop inside `run_dir`."""
        run_dir = run_dir.resolve()
        request = Harness2RunRequest.from_dict(
            json.loads((run_dir / "request.json").read_text(encoding="utf-8"))
        )
        state = json.loads((run_dir / "state.json").read_text(encoding="utf-8"))
        run_id = str(state["runId"])

        workspace = HarnessWorkspace(self.workspace_root)
        library = ImprovementLibrary(self.shared_library_path)
        engine = ProposeProbeComposeEngine(
            workspace=workspace,
            library=library,
            eval_bridge=self.eval_bridge,
            reflection_bridge=self.reflection_bridge,
        )

        state["lifecycleStatus"] = "running"
        state["error"] = None
        self._write_state(run_dir, state)

        try:
            best_candidate = Harness2Candidate.from_dict(state["bestCandidate"])
            if state.get("baselineScore") is None:
                baseline_dir = run_dir / "iter-00-baseline"
                workspace.materialize_tree(best_candidate, baseline_dir / "workspace")
                best_eval = self.eval_bridge.evaluate(
                    candidate=best_candidate,
                    request=request,
                    task_ids=request.train_task_ids,
                    output_dir=baseline_dir / "eval",
                )
                state["baselineScore"] = round(best_eval.mean_runtime_score, 6)
                state["bestScore"] = round(best_eval.mean_runtime_score, 6)
                state["bestEvaluation"] = best_eval.to_dict()
                self._write_state(run_dir, state)
            else:
                best_eval_path = state.get("bestEvaluation", {}).get("resultPath")
                if best_eval_path and Path(best_eval_path).is_file():
                    best_eval = load_evaluation_trajectories(best_eval_path)
                else:
                    baseline_dir = run_dir / "iter-00-baseline"
                    best_eval = self.eval_bridge.evaluate(
                        candidate=best_candidate,
                        request=request,
                        task_ids=request.train_task_ids,
                        output_dir=baseline_dir / "eval",
                    )

            export_best_candidate(
                run_dir=run_dir,
                workspace=workspace,
                candidate=best_candidate,
                library=library,
            )

            start_iter = int(state.get("currentIteration", 0)) + 1
            for iteration in range(start_iter, request.max_iterations + 1):
                if self._is_stop_requested(run_dir):
                    state["lifecycleStatus"] = "stopped"
                    self._write_state(run_dir, state)
                    return self.status(run_id, run_dir=run_dir)

                iter_dir = run_dir / f"iter-{iteration:02d}"
                iter_dir.mkdir(parents=True, exist_ok=True)

                proposals = engine.propose(
                    parent=best_candidate,
                    parent_eval=best_eval,
                    request=request,
                    iteration=iteration,
                )
                probe_outcomes = engine.probe(
                    parent=best_candidate,
                    parent_eval=best_eval,
                    proposals=proposals,
                    request=request,
                    iteration_dir=iter_dir,
                )

                composed = engine.compose(
                    parent=best_candidate,
                    parent_eval=best_eval,
                    outcomes=probe_outcomes,
                    request=request,
                    iteration=iteration,
                )

                promoted = False
                composed_eval: CandidateEvaluationSummary | None = None
                if composed is not None:
                    matching_probe = next(
                        (o for o in probe_outcomes if o.candidate.candidate_id == composed.candidate_id),
                        None,
                    )
                    if matching_probe is not None and request.validation_task_ids == request.train_task_ids:
                        composed_eval = matching_probe.evaluation
                    else:
                        compose_dir = iter_dir / f"compose-{composed.candidate_id}"
                        workspace.materialize_tree(composed, compose_dir / "workspace")
                        composed_eval = self.eval_bridge.evaluate(
                            candidate=composed,
                            request=request,
                            task_ids=request.validation_task_ids,
                            output_dir=compose_dir / "eval",
                        )

                    if (
                        composed_eval.mean_runtime_score > best_eval.mean_runtime_score
                        or (
                            composed_eval.mean_runtime_score == best_eval.mean_runtime_score
                            and composed_eval.total_fault_count < best_eval.total_fault_count
                        )
                    ):
                        best_candidate = composed
                        best_eval = composed_eval
                        promoted = True
                        state["bestCandidate"] = best_candidate.to_dict()
                        state["bestScore"] = round(best_eval.mean_runtime_score, 6)
                        state["bestEvaluation"] = best_eval.to_dict()

                state["currentIteration"] = iteration
                state["history"].append(
                    {
                        "iteration": iteration,
                        "proposalCount": len(proposals),
                        "probeScores": [
                            {
                                "candidateId": o.candidate.candidate_id,
                                "scope": o.candidate.scope,
                                "meanRuntimeScore": round(o.evaluation.mean_runtime_score, 6),
                                "scoreDelta": o.score_delta,
                                "faultDelta": o.fault_delta,
                                "resolvedFaultCodes": list(o.resolved_fault_codes),
                            }
                            for o in probe_outcomes
                        ],
                        "composedCandidateId": composed.candidate_id if composed else None,
                        "composedScore": round(composed_eval.mean_runtime_score, 6)
                        if composed_eval
                        else None,
                        "promoted": promoted,
                    }
                )
                export_best_candidate(
                    run_dir=run_dir,
                    workspace=workspace,
                    candidate=best_candidate,
                    library=library,
                )
                self._write_state(run_dir, state)

            state["lifecycleStatus"] = "completed"
            exports = export_best_candidate(
                run_dir=run_dir,
                workspace=workspace,
                candidate=best_candidate,
                library=library,
            )
            state["exports"] = exports.to_dict()
            self._write_state(run_dir, state)
            self._write_final_report(run_dir, state, exports)
            return self.report(run_id, run_dir=run_dir)
        except Exception as exc:
            state["lifecycleStatus"] = "failed"
            state["error"] = str(exc)
            self._write_state(run_dir, state)
            raise

    def status(self, run_id: str, *, run_dir: Path | None = None) -> dict[str, Any]:
        target_dir = (run_dir or (self.runs_dir / run_id)).resolve()
        state = json.loads((target_dir / "state.json").read_text(encoding="utf-8"))
        best_cand = state.get("bestCandidate") or {}
        overrides = tuple(sorted((best_cand.get("templateOverrides") or {}).keys()))
        library = ImprovementLibrary(self.shared_library_path)
        exports_dir = target_dir / "exports"
        report = Harness2StatusReport(
            run_id=str(state["runId"]),
            lifecycle_status=state["lifecycleStatus"],
            current_iteration=int(state.get("currentIteration", 0)),
            max_iterations=int(state.get("maxIterations", 0)),
            baseline_score=state.get("baselineScore"),
            best_score=state.get("bestScore"),
            best_candidate_id=best_cand.get("candidateId"),
            overridden_template_ids=overrides,
            library_size=len(library),
            run_dir=str(target_dir),
            exports_dir=str(exports_dir) if exports_dir.is_dir() else None,
            error=state.get("error"),
        )
        return report.to_dict()

    def stop(self, run_id: str) -> dict[str, Any]:
        target_dir = (self.runs_dir / run_id).resolve()
        (target_dir / "stop.lock").write_text("stop\n", encoding="utf-8")
        state_file = target_dir / "state.json"
        if state_file.is_file():
            state = json.loads(state_file.read_text(encoding="utf-8"))
            if state.get("lifecycleStatus") in ("pending", "running"):
                state["lifecycleStatus"] = "stopped"
                self._write_state(target_dir, state)
        return self.status(run_id, run_dir=target_dir)

    def resume(self, run_id: str, *, foreground: bool = True) -> dict[str, Any]:
        target_dir = (self.runs_dir / run_id).resolve()
        stop_lock = target_dir / "stop.lock"
        if stop_lock.is_file():
            stop_lock.unlink()
        if foreground:
            return self.execute_run_dir(target_dir)
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "lazygoal_harness2.cli",
                "worker",
                "--run-dir",
                str(target_dir),
                "--workspace-root",
                str(self.workspace_root),
            ],
            cwd=str(self.workspace_root),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        (target_dir / "worker.pid").write_text(str(proc.pid), encoding="utf-8")
        return self.status(run_id, run_dir=target_dir)

    def report(self, run_id: str, *, run_dir: Path | None = None) -> dict[str, Any]:
        target_dir = (run_dir or (self.runs_dir / run_id)).resolve()
        report_file = target_dir / "report.json"
        if report_file.is_file():
            return json.loads(report_file.read_text(encoding="utf-8"))
        state = json.loads((target_dir / "state.json").read_text(encoding="utf-8"))
        return {
            **self.status(run_id, run_dir=target_dir),
            "bestCandidate": state.get("bestCandidate"),
            "history": state.get("history", []),
            "exports": state.get("exports"),
        }

    def wait(
        self,
        run_id: str,
        *,
        timeout_seconds: float | None = None,
        interval_seconds: float = 1.0,
    ) -> dict[str, Any]:
        deadline = time.monotonic() + timeout_seconds if timeout_seconds is not None else None
        while True:
            current = self.status(run_id)
            if current["lifecycleStatus"] in ("completed", "stopped", "failed"):
                return self.report(run_id)
            if deadline is not None and time.monotonic() >= deadline:
                raise TimeoutError(f"Timed out waiting for Harness2 run {run_id}")
            time.sleep(interval_seconds)

    def apply(
        self,
        run_id: str,
        *,
        profile_output_path: str | Path | None = None,
    ) -> dict[str, Any]:
        target_dir = (self.runs_dir / run_id).resolve()
        profile_out = Path(profile_output_path).resolve() if profile_output_path else None
        return apply_run_exports(
            run_dir=target_dir,
            workspace_root=self.workspace_root,
            profile_output_path=profile_out,
        )

    def _is_stop_requested(self, run_dir: Path) -> bool:
        return (run_dir / "stop.lock").is_file()

    def _write_state(self, run_dir: Path, state: dict[str, Any]) -> None:
        state_path = run_dir / "state.json"
        tmp_path = run_dir / "state.json.tmp"
        tmp_path.write_text(
            json.dumps(state, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp_path.replace(state_path)

    def _write_final_report(
        self,
        run_dir: Path,
        state: dict[str, Any],
        exports: ExportedArtifacts,
    ) -> None:
        report_payload = {
            **self.status(str(state["runId"]), run_dir=run_dir),
            "bestCandidate": state.get("bestCandidate"),
            "bestEvaluation": state.get("bestEvaluation"),
            "history": state.get("history", []),
            "exports": exports.to_dict(),
        }
        report_path = run_dir / "report.json"
        tmp_path = run_dir / "report.json.tmp"
        tmp_path.write_text(
            json.dumps(report_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp_path.replace(report_path)
