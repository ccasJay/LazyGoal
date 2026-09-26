from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import gepa

from lazygoal_gepa import (
    LazyGoalEvaluationExample,
    LazyGoalGEPAAdapter,
    LazyGoalGEPAConfig,
    ReflectiveDatasetError,
)


class FakeReflectionLM:
    def __init__(self) -> None:
        self.prompts: list[object] = []

    def __call__(self, prompt):
        self.prompts.append(prompt)
        return "```improved component text```"


class QuietLogger:
    def log(self, message: str) -> None:
        del message


class ReflectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.executable = self.root / "lazygoal"
        fixture = Path(__file__).parent / "fixtures" / "fake_lazygoal.py"
        shutil.copyfile(fixture, self.executable)
        self.executable.chmod(0o755)
        self.manifest = self.root / "manifest.json"
        self.manifest.write_text(
            json.dumps({"tasks": [{"taskId": "task-1"}]}),
            encoding="utf-8",
        )
        self.example = LazyGoalEvaluationExample(
            sample_id="sample-1",
            benchmark_id="alfworld",
            task_id="task-1",
            manifest_path=self.manifest,
        )
        self.candidate = {
            "system_prompt": "Initial system prompt",
            "instruction_000": "Initial instruction",
            "instruction_001": "Initial second instruction",
        }
        self.adapter = LazyGoalGEPAAdapter(
            LazyGoalGEPAConfig(
                benchmark_id="alfworld",
                base_profile_id="alfworld-profile",
                model_config_id="default",
                model_id="model-1",
                output_directory=self.root / "output",
                lazygoal_executable=self.executable,
            )
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_builds_component_scoped_json_safe_bounded_records(self) -> None:
        with patch.dict(os.environ, {"LAZYGOAL_GEPA_FAKE_MODE": "large_domain"}):
            evaluation = self.adapter.evaluate(
                [self.example],
                self.candidate,
                capture_traces=True,
            )

        reflective = self.adapter.make_reflective_dataset(
            self.candidate,
            evaluation,
            ["system_prompt", "instruction_000"],
        )
        serialized = json.dumps(reflective)

        self.assertEqual(set(reflective), {"system_prompt", "instruction_000"})
        for component, records in reflective.items():
            self.assertEqual(len(records), 1)
            record = records[0]
            self.assertEqual(
                set(record),
                {"Inputs", "Generated Outputs", "Feedback", "Score", "Artifacts"},
            )
            self.assertEqual(record["Inputs"]["component"], component)
            self.assertEqual(record["Score"], 1.0)
        self.assertIn("lazygoal truncated", serialized)
        self.assertLess(len(serialized), 10_000)

    def test_rejects_unknown_component_or_missing_trace_source(self) -> None:
        with patch.dict(os.environ, {"LAZYGOAL_GEPA_FAKE_MODE": "passed"}):
            without_traces = self.adapter.evaluate([self.example], self.candidate)
            with_traces = self.adapter.evaluate(
                [self.example],
                self.candidate,
                capture_traces=True,
            )

        with self.assertRaisesRegex(ReflectiveDatasetError, "capture_traces=True"):
            self.adapter.make_reflective_dataset(
                self.candidate,
                without_traces,
                ["system_prompt"],
            )
        with self.assertRaisesRegex(ReflectiveDatasetError, "Unknown candidate"):
            self.adapter.make_reflective_dataset(
                self.candidate,
                with_traces,
                ["unknown"],
            )

    def test_tua_reflection_only_exposes_safe_result_fields_and_stages(self) -> None:
        class AcceptingCandidateAuditor:
            def audit(self, prompt):
                del prompt
                return {}

        task_id = "PRIVATE_TASK_ID_MARKER"
        manifest = self.root / "tua-manifest.json"
        manifest.write_text(
            json.dumps({"tasks": [{"taskId": task_id}]}),
            encoding="utf-8",
        )
        example = LazyGoalEvaluationExample(
            sample_id="PRIVATE_SAMPLE_ID_MARKER",
            benchmark_id="tua-bench",
            task_id=task_id,
            manifest_path=manifest,
        )
        adapter = LazyGoalGEPAAdapter(
            LazyGoalGEPAConfig(
                benchmark_id="tua-bench",
                base_profile_id="tua-bench-worker",
                model_config_id="default",
                model_id="model-1",
                output_directory=self.root / "tua-output",
                lazygoal_executable=self.executable,
            ),
            candidate_auditor=AcceptingCandidateAuditor(),  # type: ignore[arg-type]
        )

        with patch.dict(os.environ, {"LAZYGOAL_GEPA_FAKE_MODE": "tua_sensitive"}):
            evaluation = adapter.evaluate([example], self.candidate, capture_traces=True)
        reflective = adapter.make_reflective_dataset(
            self.candidate,
            evaluation,
            ["system_prompt"],
        )
        record = reflective["system_prompt"][0]
        serialized = json.dumps(record)

        self.assertEqual(
            record["Inputs"],
            {
                "agentRole": "goal-driven coding and reasoning agent solving a task in a sandboxed container",
                "taskFamily": "document",
                "taskContext": (
                    "Autonomous agent execution in an industrial Linux container (code analysis, numerical modeling, scientific computing, physics simulation)"
                ),
            },
        )
        self.assertEqual(
            record["Generated Outputs"],
            {
                "executionStatus": "failed",
                "completionOutcome": "goal_not_achieved",
            },
        )
        self.assertEqual(
            record["Feedback"],
            {
                "taskFamily": "document",
                "officialReward": 0.35,
                "passed": False,
                "status": "failed",
                "diagnostics": [{"stage": "agent"}],
            },
        )
        self.assertEqual(record["Score"], 0.35)
        self.assertEqual(record["Artifacts"], {})
        for marker in (
            "PRIVATE_TASK_ID_MARKER",
            "PRIVATE_SAMPLE_ID_MARKER",
            "PRIVATE_VERIFIER_OUTPUT_MARKER",
            "PRIVATE_ANSWER_MARKER",
            "PRIVATE_HOLDOUT_TASK_MARKER",
            "PRIVATE_HOLDOUT_SNAPSHOT_MARKER",
            "PRIVATE_HOLDOUT_TRAJECTORY_MARKER",
            "PRIVATE_HOLDOUT_TRACE_MARKER",
            "PRIVATE_PRIVATE_PATH_MARKER",
        ):
            self.assertNotIn(marker, serialized)

    def test_official_optimize_updates_candidate_through_fake_cli(self) -> None:
        reflection_lm = FakeReflectionLM()
        with patch.dict(os.environ, {"LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved"}):
            result = gepa.optimize(
                seed_candidate=self.candidate,
                trainset=[self.example],
                valset=[self.example],
                adapter=self.adapter,
                reflection_lm=reflection_lm,
                reflection_minibatch_size=1,
                module_selector="all",
                max_metric_calls=6,
                display_progress_bar=False,
                logger=QuietLogger(),
                seed=0,
            )

        self.assertGreaterEqual(result.num_candidates, 2)
        self.assertTrue(reflection_lm.prompts)
        self.assertIn("improved", " ".join(result.best_candidate.values()))
        self.assertIn("improved", result.best_candidate["system_prompt"])
        self.assertIn("improved", result.best_candidate["instruction_000"])
        self.assertIn("improved", result.best_candidate["instruction_001"])
        self.assertEqual(result.val_aggregate_scores[result.best_idx], 1.0)


if __name__ == "__main__":
    unittest.main()
