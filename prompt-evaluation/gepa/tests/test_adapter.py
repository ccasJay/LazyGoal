from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa import (
    LazyGoalEvaluationExample,
    LazyGoalGEPAAdapter,
    LazyGoalGEPAConfig,
    PromptEvaluationCancelled,
    PromptEvaluationInfrastructureError,
)
from lazygoal_gepa.client import LazyGoalEvaluationRecord
from lazygoal_gepa.protocol import PromptEvaluationTaskRecord


class LazyGoalGEPAAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.executable = self.root / "lazygoal"
        fixture = Path(__file__).parent / "fixtures" / "fake_lazygoal.py"
        shutil.copyfile(fixture, self.executable)
        self.executable.chmod(0o755)
        self.counter = self.root / "counter.txt"
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
        self.candidate = {
            "system_prompt": "System prompt",
            "instruction_000": "Instruction",
        }

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_preserves_batch_order_scores_and_optional_trajectories(self) -> None:
        batch = [self._example("sample-fail", "task-fail"), self._example("sample-pass", "task-pass")]
        environment = {
            "LAZYGOAL_GEPA_FAKE_MODE": "status_by_task",
            "LAZYGOAL_GEPA_FAKE_COUNTER": str(self.counter),
        }

        with patch.dict(os.environ, environment):
            without_traces = self.adapter.evaluate(batch, self.candidate)
            with_traces = self.adapter.evaluate(
                batch,
                self.candidate,
                capture_traces=True,
            )

        self.assertEqual(
            [output.sample_id for output in without_traces.outputs],
            ["sample-fail", "sample-pass"],
        )
        self.assertEqual(without_traces.scores, [0.0, 1.0])
        self.assertIsNone(without_traces.trajectories)
        self.assertEqual(without_traces.num_metric_calls, 2)
        self.assertIsNotNone(with_traces.trajectories)
        assert with_traces.trajectories is not None
        self.assertEqual(
            [trajectory.sample_id for trajectory in with_traces.trajectories],
            ["sample-fail", "sample-pass"],
        )
        self.assertEqual(
            [trajectory.score for trajectory in with_traces.trajectories],
            [0.0, 1.0],
        )
        self.assertEqual(self.counter.read_text(encoding="utf-8"), "4")

    def test_uses_metric_score_verbatim_for_domain_results(self) -> None:
        class StaticClient:
            def evaluate_one(self, example, prompt, invocation):
                score = 0.0 if example.task_id.endswith("zero") else 0.375
                return LazyGoalEvaluationRecord(
                    evaluation_id="eval-metric-score",
                    result_path=self.root / "result.json",
                    task=PromptEvaluationTaskRecord(
                        task_id=example.task_id,
                        status="failed",
                        domain_result={"reward": score, "passed": False},
                        attempt_path=None,
                        artifact_locator=None,
                        errors=(),
                        metric_score=score,
                    ),
                )

            def __init__(self, root: Path) -> None:
                self.root = root

        adapter = LazyGoalGEPAAdapter(
            self.adapter._config,
            client=StaticClient(self.root),  # type: ignore[arg-type]
        )
        evaluation = adapter.evaluate(
            [self._example("sample-partial", "task-partial"), self._example("sample-zero", "task-zero")],
            self.candidate,
            capture_traces=True,
        )

        self.assertEqual(evaluation.scores, [0.375, 0.0])
        assert evaluation.trajectories is not None
        self.assertEqual([item.score for item in evaluation.trajectories], [0.375, 0.0])

    def test_infrastructure_failure_stops_before_later_samples(self) -> None:
        batch = [self._example("sample-1", "task-1"), self._example("sample-2", "task-2")]

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_GEPA_FAKE_MODE": "infrastructure",
                "LAZYGOAL_GEPA_FAKE_COUNTER": str(self.counter),
            },
        ):
            with self.assertRaises(PromptEvaluationInfrastructureError):
                self.adapter.evaluate(batch, self.candidate)

        self.assertEqual(self.counter.read_text(encoding="utf-8"), "1")
        self.assertEqual(len(list((self.root / "output").glob("**/request.json"))), 1)

    def test_non_domain_task_status_is_never_converted_to_zero_score(self) -> None:
        class StaticClient:
            def evaluate_one(self, example, prompt, invocation):
                return LazyGoalEvaluationRecord(
                    evaluation_id="eval-infrastructure",
                    result_path=self.root / "result.json",
                    task=PromptEvaluationTaskRecord(
                        task_id=example.task_id,
                        status="infrastructure_error",
                        domain_result=None,
                        attempt_path=None,
                        artifact_locator=None,
                        errors=(),
                    ),
                )

            def __init__(self, root: Path) -> None:
                self.root = root

        adapter = LazyGoalGEPAAdapter(
            self.adapter._config,
            client=StaticClient(self.root),  # type: ignore[arg-type]
        )
        with self.assertRaises(PromptEvaluationInfrastructureError):
            adapter.evaluate([self._example("sample-infrastructure", "task-infrastructure")], self.candidate)

    def test_keyboard_interrupt_terminates_current_process_and_stops_batch(self) -> None:
        batch = [self._example("sample-1", "task-1"), self._example("sample-2", "task-2")]
        original_wait = subprocess.Popen.wait
        interrupted = False

        def interrupt_first_wait(process, *args, **kwargs):
            nonlocal interrupted
            if not interrupted and "timeout" not in kwargs:
                deadline = time.monotonic() + 2.0
                while not self.counter.exists() and time.monotonic() < deadline:
                    time.sleep(0.01)
                interrupted = True
                raise KeyboardInterrupt
            return original_wait(process, *args, **kwargs)

        started_at = time.monotonic()
        with (
            patch.dict(
                os.environ,
                {
                    "LAZYGOAL_GEPA_FAKE_MODE": "sleep",
                    "LAZYGOAL_GEPA_FAKE_COUNTER": str(self.counter),
                },
            ),
            patch.object(subprocess.Popen, "wait", new=interrupt_first_wait),
        ):
            with self.assertRaises(PromptEvaluationCancelled):
                self.adapter.evaluate(batch, self.candidate)

        self.assertLess(time.monotonic() - started_at, 5.0)
        self.assertEqual(self.counter.read_text(encoding="utf-8"), "1")
        self.assertEqual(len(list((self.root / "output").glob("**/request.json"))), 1)

    def _example(self, sample_id: str, task_id: str) -> LazyGoalEvaluationExample:
        manifest = self.root / f"{sample_id}.json"
        manifest.write_text(
            json.dumps({"tasks": [{"taskId": task_id}]}),
            encoding="utf-8",
        )
        return LazyGoalEvaluationExample(
            sample_id=sample_id,
            benchmark_id="alfworld",
            task_id=task_id,
            manifest_path=manifest,
        )


if __name__ == "__main__":
    unittest.main()
