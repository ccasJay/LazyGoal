from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lazygoal_harness2.loop import Harness2Controller
from lazygoal_harness2.models import (
    CandidateEvaluationSummary,
    Harness2Candidate,
    Harness2RunRequest,
    TaskRuntimeSummary,
)
from lazygoal_harness2.workspace import HarnessWorkspace

REPO_ROOT = Path(__file__).resolve().parents[3]


class FakeEvalBridge:
    def evaluate(
        self,
        *,
        candidate: Harness2Candidate,
        request: Harness2RunRequest,
        task_ids: tuple[str, ...],
        output_dir: Path,
    ) -> CandidateEvaluationSummary:
        has_invariant = "run-mode@1" in candidate.template_overrides
        has_domain = "pytest" in " ".join(candidate.instructions)
        if has_invariant and has_domain:
            score = 1.0
            repairs = 0
            tool_faults = 0
            zero_fault = True
            faults = ()
        elif has_invariant:
            score = 0.8
            repairs = 0
            tool_faults = 1
            zero_fault = False
            faults = (
                {
                    "sequence": 3,
                    "category": "tool",
                    "code": "TARGET_NOT_FOUND",
                    "origin": "edit_file",
                    "message": "oldText not matched",
                },
            )
        elif has_domain:
            score = 0.75
            repairs = 1
            tool_faults = 0
            zero_fault = False
            faults = (
                {
                    "sequence": 1,
                    "category": "repair",
                    "code": "INVALID_AGENT_DECISION",
                    "origin": "decision_semantics",
                    "message": "Missing stage",
                },
            )
        else:
            score = 0.45
            repairs = 1
            tool_faults = 1
            zero_fault = False
            faults = (
                {
                    "sequence": 1,
                    "category": "repair",
                    "code": "INVALID_AGENT_DECISION",
                    "origin": "decision_semantics",
                    "message": "Missing stage",
                },
                {
                    "sequence": 3,
                    "category": "tool",
                    "code": "TARGET_NOT_FOUND",
                    "origin": "edit_file",
                    "message": "oldText not matched",
                },
            )

        tasks = {
            tid: TaskRuntimeSummary(
                task_id=tid,
                status="passed" if zero_fault else "failed",
                zero_fault_pass=zero_fault,
                runtime_score=score,
                call_error_rate=0.0 if zero_fault else 0.25,
                repair_count=repairs,
                stage_rejection_count=0,
                tool_fault_count=tool_faults,
                terminal_fault_count=0,
                has_non_empty_patch=True,
                has_verification_bash_call=True,
                faults=faults,
                committed_events=(
                    {"sequence": 1, "payload": {"type": "model_response_received"}},
                ),
            )
            for tid in task_ids
        }
        return CandidateEvaluationSummary(
            evaluation_id=f"eval-{candidate.candidate_id}",
            candidate_id=candidate.candidate_id,
            mean_runtime_score=score,
            zero_fault_pass_rate=1.0 if zero_fault else 0.0,
            total_fault_count=repairs + tool_faults,
            repair_count=repairs,
            stage_rejection_count=0,
            tool_fault_count=tool_faults,
            terminal_fault_count=0,
            tasks=tasks,
        )


class FakeReflectionBridge:
    def __init__(self, workspace: HarnessWorkspace) -> None:
        self.workspace = workspace

    def generate(self, *, config_id: str, model_id: str, prompt: str) -> str:
        base_run_mode = self.workspace.base_templates["run-mode@1"]
        updated_run_mode = base_run_mode + "\nAlways ensure a Run stage is active before tool actions.\n"
        updated_instructions = [
            "Use read_file, write_file, edit_file, grep, and bash only; all paths are relative to /testbed.",
            "Do not access model configuration, credentials, or files outside /testbed.",
            "Read surrounding lines before edit_file and run pytest verification with bash before completion.",
        ]
        if "Composer agent" in prompt:
            return json.dumps(
                {
                    "hypothesis": "Combine invariant run-mode stage rule with domain read-before-edit & pytest rule",
                    "templateEdits": {"run-mode@1": updated_run_mode},
                    "systemPrompt": self.workspace.base_profile["systemPrompt"],
                    "instructions": updated_instructions,
                }
            )
        return json.dumps(
            {
                "proposals": [
                    {
                        "scope": "invariant",
                        "hypothesis": "Clarify run stage requirement in run-mode@1",
                        "targetFaultCodes": ["INVALID_AGENT_DECISION"],
                        "templateEdits": {"run-mode@1": updated_run_mode},
                    },
                    {
                        "scope": "domain",
                        "hypothesis": "Inspect target lines before edit_file and run pytest",
                        "targetFaultCodes": ["TARGET_NOT_FOUND"],
                        "instructions": updated_instructions,
                    },
                ]
            }
        )


class TestHarness2LoopAndExporter(unittest.TestCase):
    def test_propose_probe_compose_promotes_composed_candidate_and_exports_git_patch(self) -> None:
        ws = HarnessWorkspace(REPO_ROOT)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            runs_dir = tmp_root / "runs"
            req_path = tmp_root / "request.json"
            req_path.write_text(
                json.dumps(
                    {
                        "protocol": "lazygoal-harness2-run@1",
                        "runId": "h2-test-run",
                        "benchmark": {
                            "id": "swebench",
                            "manifestPath": "benchmarks/swebench/manifests/smoke.json",
                            "trainTaskIds": ["astropy__astropy-12907"],
                            "validationTaskIds": ["astropy__astropy-12907"],
                        },
                        "agentModel": {"configId": "default", "modelId": "test-agent"},
                        "editorModel": {"configId": "default", "modelId": "test-editor"},
                        "budget": {
                            "maxIterations": 1,
                            "proposalsPerIteration": 2,
                            "maxConcurrency": 1,
                        },
                    }
                ),
                encoding="utf-8",
            )

            controller = Harness2Controller(
                workspace_root=REPO_ROOT,
                runs_dir=runs_dir,
                eval_bridge=FakeEvalBridge(),
                reflection_bridge=FakeReflectionBridge(ws),
            )

            preflight = controller.preflight(req_path)
            self.assertTrue(preflight["ok"])

            report = controller.start(req_path, foreground=True)
            self.assertEqual(report["lifecycleStatus"], "completed")
            self.assertAlmostEqual(report["baselineScore"], 0.45)
            self.assertAlmostEqual(report["bestScore"], 1.0)
            self.assertEqual(report["overriddenTemplateIds"], ["run-mode@1"])
            self.assertEqual(report["librarySize"], 2)

            exports = report["exports"]
            patch_path = Path(exports["promptBundlePatchPath"])
            self.assertTrue(patch_path.is_file())
            patch_text = patch_path.read_text(encoding="utf-8")
            self.assertIn("diff --git a/packages/prompt-bundle/src/prompting/run-mode@1.njk", patch_text)
            self.assertIn("+Always ensure a Run stage is active before tool actions.", patch_text)

    def test_parallel_mode_execution_with_concurrency(self) -> None:
        ws = HarnessWorkspace(REPO_ROOT)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            runs_dir = tmp_root / "runs"
            req_path = tmp_root / "request.json"
            req_path.write_text(
                json.dumps(
                    {
                        "protocol": "lazygoal-harness2-run@1",
                        "runId": "h2-test-parallel",
                        "mode": "parallel",
                        "benchmark": {
                            "id": "swebench",
                            "manifestPath": "benchmarks/swebench/manifests/smoke.json",
                            "trainTaskIds": ["astropy__astropy-12907"],
                        },
                        "agentModel": {"configId": "default", "modelId": "test-agent"},
                        "editorModel": {"configId": "default", "modelId": "test-editor"},
                        "budget": {
                            "maxIterations": 1,
                            "proposalsPerIteration": 2,
                            "maxConcurrency": 2,
                        },
                    }
                ),
                encoding="utf-8",
            )

            controller = Harness2Controller(
                workspace_root=REPO_ROOT,
                runs_dir=runs_dir,
                eval_bridge=FakeEvalBridge(),
                reflection_bridge=FakeReflectionBridge(ws),
            )

            report = controller.start(req_path, mode="parallel", concurrency=2, foreground=True)
            self.assertEqual(report["lifecycleStatus"], "completed")
            self.assertAlmostEqual(report["bestScore"], 1.0)

    def test_initial_candidate_as_baseline(self) -> None:
        ws = HarnessWorkspace(REPO_ROOT)
        with tempfile.TemporaryDirectory() as tmp:
            tmp_root = Path(tmp)
            runs_dir = tmp_root / "runs"
            req_path = tmp_root / "request.json"
            initial_cand = Harness2Candidate(
                candidate_id="cand-custom-seed",
                base_profile_id="swebench-acp-profile",
                system_prompt="Custom system prompt",
                instructions=("Custom instruction 1",),
                template_overrides={"run-mode@1": "Custom run-mode template"},
            )
            req_path.write_text(
                json.dumps(
                    {
                        "protocol": "lazygoal-harness2-run@1",
                        "runId": "h2-test-initial-cand",
                        "mode": "sequential",
                        "benchmark": {
                            "id": "swebench",
                            "manifestPath": "benchmarks/swebench/manifests/smoke.json",
                            "trainTaskIds": ["astropy__astropy-12907"],
                        },
                        "agentModel": {"configId": "default", "modelId": "test-agent"},
                        "editorModel": {"configId": "default", "modelId": "test-editor"},
                        "initialCandidate": initial_cand.to_dict(),
                        "budget": {
                            "maxIterations": 1,
                            "proposalsPerIteration": 1,
                        },
                    }
                ),
                encoding="utf-8",
            )

            controller = Harness2Controller(
                workspace_root=REPO_ROOT,
                runs_dir=runs_dir,
                eval_bridge=FakeEvalBridge(),
                reflection_bridge=FakeReflectionBridge(ws),
            )

            preflight = controller.preflight(req_path)
            self.assertEqual(preflight["baselineCandidateId"], "cand-custom-seed")

            report = controller.start(req_path, foreground=True)
            self.assertEqual(report["lifecycleStatus"], "completed")
            self.assertAlmostEqual(report["baselineScore"], 0.8)


if __name__ == "__main__":
    unittest.main()
