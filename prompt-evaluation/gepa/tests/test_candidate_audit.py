from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa.adapter import LazyGoalGEPAAdapter
from lazygoal_gepa.candidate import CandidateCodec
from lazygoal_gepa.candidate_audit import TuaCandidateLeakAuditor
from lazygoal_gepa.errors import PromptEvaluationInfrastructureError
from lazygoal_gepa.client import LazyGoalEvaluationRecord
from lazygoal_gepa.models import LazyGoalEvaluationExample, LazyGoalGEPAConfig
from lazygoal_gepa.protocol import PromptEvaluationTaskRecord


class TuaCandidateLeakAuditorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.executable = self.root / "lazygoal-audit"
        self.request_capture = self.root / "captured-request.json"
        self.audit_directory = self.root / "candidate-audits"
        self.task_ids = ("train-doc", "validation-doc")
        self.environment = patch.dict(os.environ, {"AUDIT_REQUEST_CAPTURE": str(self.request_capture)})
        self.environment.start()
        self.candidate = CandidateCodec().decode({
            "system_prompt": "Candidate system prompt",
            "instruction_000": "Candidate first instruction",
            "instruction_001": "Candidate second instruction",
        })

    def tearDown(self) -> None:
        self.environment.stop()
        self.temporary_directory.cleanup()

    def test_sends_both_fields_and_only_train_validation_tasks_then_persists_safe_result(self) -> None:
        self._write_cli(finding=True)
        auditor = self._auditor()

        result = auditor.audit(self.candidate)

        request = json.loads(self.request_capture.read_text(encoding="utf-8"))
        self.assertEqual(request["taskIds"], ["train-doc", "validation-doc"])
        self.assertNotIn("holdout-doc", request["taskIds"])
        self.assertEqual(request["candidateId"], self.candidate.candidate_id)
        self.assertEqual(request["systemPrompt"], self.candidate.system_prompt)
        self.assertEqual(request["instructions"], list(self.candidate.instructions))
        self.assertTrue(result["positiveConclusionBlocked"])
        self.assertEqual(result["findings"], [{
            "taskId": "train-doc",
            "component": "instruction_001",
            "matchKind": "expected_answer",
        }])
        stored = json.loads((self.audit_directory / f"{self.candidate.candidate_id}.json").read_text())
        self.assertEqual(stored, result)
        self.assertNotIn("private answer text", json.dumps(stored))

    def test_rejects_an_audit_result_that_includes_holdout_or_unbounded_fields(self) -> None:
        self._write_cli(finding=False, include_holdout=True)
        with self.assertRaisesRegex(PromptEvaluationInfrastructureError, "identity does not match"):
            self._auditor().audit(self.candidate)
        self.assertFalse(list(self.audit_directory.glob("*.json")))

    def test_tua_adapter_audits_complete_prompt_before_evaluation(self) -> None:
        calls: list[object] = []

        class RecordingAuditor:
            def audit(self, prompt):
                calls.append(prompt)
                return {"positiveConclusionBlocked": False}

        class StaticClient:
            def evaluate_one(self, example, prompt, invocation):
                return LazyGoalEvaluationRecord(
                    evaluation_id="eval-tua",
                    result_path=self.root / "result.json",
                    task=PromptEvaluationTaskRecord(
                        task_id=example.task_id,
                        status="passed",
                        domain_result={
                            "taskFamily": "document",
                            "passed": True,
                            "reward": 1.0,
                        },
                        attempt_path=None,
                        artifact_locator=None,
                        errors=(),
                        metric_score=1.0,
                    ),
                )

            def __init__(self, root: Path) -> None:
                self.root = root

        manifest = self.root / "tua-manifest.json"
        manifest.write_text(json.dumps({"tasks": [{"taskId": "train-doc"}]}), encoding="utf-8")
        example = LazyGoalEvaluationExample(
            sample_id="sample-train",
            benchmark_id="tua-bench",
            task_id="train-doc",
            manifest_path=manifest,
        )
        adapter = LazyGoalGEPAAdapter(
            LazyGoalGEPAConfig(
                benchmark_id="tua-bench",
                base_profile_id="tua-bench-worker-profile",
                model_config_id="default",
                model_id="model-1",
                output_directory=self.root / "tua-output",
                lazygoal_executable=self.executable,
            ),
            candidate_auditor=RecordingAuditor(),  # type: ignore[arg-type]
            client=StaticClient(self.root),  # type: ignore[arg-type]
        )

        adapter.evaluate([example], {
            "system_prompt": "Candidate system prompt",
            "instruction_000": "Candidate first instruction",
            "instruction_001": "Candidate second instruction",
        })

        self.assertEqual(len(calls), 1)
        prompt = calls[0]
        self.assertEqual(prompt.system_prompt, "Candidate system prompt")
        self.assertEqual(prompt.instructions, (
            "Candidate first instruction",
            "Candidate second instruction",
        ))

    def test_tua_adapter_fails_closed_when_auditor_is_missing(self) -> None:
        manifest = self.root / "tua-manifest.json"
        manifest.write_text(json.dumps({"tasks": [{"taskId": "train-doc"}]}), encoding="utf-8")
        example = LazyGoalEvaluationExample(
            sample_id="sample-train",
            benchmark_id="tua-bench",
            task_id="train-doc",
            manifest_path=manifest,
        )
        adapter = LazyGoalGEPAAdapter(LazyGoalGEPAConfig(
            benchmark_id="tua-bench",
            base_profile_id="tua-bench-worker-profile",
            model_config_id="default",
            model_id="model-1",
            output_directory=self.root / "tua-output",
            lazygoal_executable=self.executable,
        ))

        with self.assertRaisesRegex(PromptEvaluationInfrastructureError, "audit is required"):
            adapter.evaluate([example], {"system_prompt": "Prompt", "instruction_000": "Instruction"})

    def _auditor(self) -> TuaCandidateLeakAuditor:
        return TuaCandidateLeakAuditor(
            repo_root=self.root / "TUA-Bench",
            task_ids=self.task_ids,
            executable=self.executable,
            workspace_root=self.root,
            audit_directory=self.audit_directory,
        )

    def _write_cli(self, *, finding: bool, include_holdout: bool = False) -> None:
        finding_items = ([{
            "taskId": "train-doc",
            "component": "instruction_001",
            "matchKind": "expected_answer",
        }] if finding else [])
        script = f'''#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path
request_path = Path(sys.argv[-1])
request = json.loads(request_path.read_text(encoding="utf-8"))
Path(os.environ["AUDIT_REQUEST_CAPTURE"]).write_text(json.dumps(request), encoding="utf-8")
task_ids = request["taskIds"] + (["holdout-doc"] if {include_holdout!r} else [])
print(json.dumps({{
    "candidateId": request["candidateId"],
    "auditedTaskIds": task_ids,
    "findings": {finding_items!r},
    "positiveConclusionBlocked": {finding!r},
}}))
'''
        self.executable.write_text(script, encoding="utf-8")
        self.executable.chmod(0o755)


if __name__ == "__main__":
    unittest.main()
