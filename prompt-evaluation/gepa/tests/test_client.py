from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa import (
    CandidateCodec,
    InvocationDirectoryManager,
    LazyGoalEvaluationExample,
    LazyGoalGEPAConfig,
    PromptEvaluationCancelled,
    PromptEvaluationClient,
    PromptEvaluationInfrastructureError,
    PromptEvaluationProtocolError,
)


class PromptEvaluationClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        executable_directory = self.root / "bin with space"
        executable_directory.mkdir()
        self.executable = executable_directory / "lazygoal fake"
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
        self.prompt = CandidateCodec().decode(
            {
                "system_prompt": "System prompt",
                "instruction_000": "Instruction one",
            }
        )
        self.sequence = 0

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_reads_passed_and_failed_authoritative_results(self) -> None:
        for mode, expected_status in (("passed", "passed"), ("failed", "failed")):
            with self.subTest(mode=mode):
                record = self._evaluate(mode)

                self.assertEqual(record.task.task_id, "task-1")
                self.assertEqual(record.task.status, expected_status)
                self.assertTrue(record.result_path.is_file())
                request_path = record.result_path.parents[2] / "request.json"
                request = json.loads(request_path.read_text(encoding="utf-8"))
                self.assertEqual(request["protocol"], "prompt-evaluation@1")
                self.assertEqual(request["candidate"]["id"], self.prompt.candidate_id)
                self.assertEqual(
                    request["candidate"]["instructions"],
                    ["Instruction one"],
                )

    def test_rejects_malformed_or_contradictory_protocol_outputs(self) -> None:
        modes = (
            "bad_json",
            "multiple_terminal",
            "missing_terminal",
            "escape_path",
            "corrupt_result",
            "task_mismatch",
            "exit_mismatch",
            "unknown_result_field",
        )
        for mode in modes:
            with self.subTest(mode=mode):
                with self.assertRaises(PromptEvaluationProtocolError):
                    self._evaluate(mode)

    def test_classifies_infrastructure_cancellation_and_invalid_request(self) -> None:
        cases = (
            ("infrastructure", PromptEvaluationInfrastructureError),
            ("cancelled", PromptEvaluationCancelled),
            ("invalid_request", PromptEvaluationProtocolError),
        )
        for mode, error_type in cases:
            with self.subTest(mode=mode):
                with self.assertRaises(error_type):
                    self._evaluate(mode)

    def test_infrastructure_error_includes_bounded_task_diagnostics(self) -> None:
        with self.assertRaisesRegex(
            PromptEvaluationInfrastructureError,
            r"stage='fixture'.*code='FIXTURE_FAILURE'.*infrastructure failed",
        ):
            self._evaluate("infrastructure")

    def test_bounds_captured_process_output(self) -> None:
        with self.assertRaisesRegex(PromptEvaluationProtocolError, "capture limit"):
            self._evaluate("overflow", capture_limit=64)

        stdout_files = list(self.root.glob("output/**/stdout.ndjson"))
        self.assertEqual(len(stdout_files), 1)
        self.assertEqual(stdout_files[0].stat().st_size, 64)

    def test_redacts_inherited_secrets_and_records_safe_metadata(self) -> None:
        secret = "provider-secret-that-must-not-be-persisted"
        with patch.dict(os.environ, {"FAKE_PROVIDER_SECRET": secret}):
            record = self._evaluate("echo_secret")

        sample_directory = record.result_path.parents[2]
        stderr = (sample_directory / "stderr.log").read_text(encoding="utf-8")
        self.assertNotIn(secret, stderr)
        self.assertIn("[REDACTED]", stderr)

        output_root = (self.root / "output").resolve()
        for artifact in output_root.rglob("*"):
            self.assertTrue(artifact.resolve().is_relative_to(output_root))

    def test_classifies_process_start_failure(self) -> None:
        self.executable.unlink()

        with self.assertRaisesRegex(
            PromptEvaluationInfrastructureError,
            "could not be started",
        ):
            self._evaluate("passed")

    def _evaluate(self, mode: str, capture_limit: int = 1_048_576):
        self.sequence += 1
        manager = InvocationDirectoryManager(
            self.root / "output",
            id_factory=lambda: f"run{self.sequence}",
        )
        invocation = manager.create_invocation(self.prompt.candidate_id)
        client = PromptEvaluationClient(
            LazyGoalGEPAConfig(
                benchmark_id="alfworld",
                base_profile_id="alfworld-profile",
                model_config_id="default",
                model_id="model-1",
                output_directory=self.root / "output",
                lazygoal_executable=self.executable,
            ),
            manager,
            capture_limit=capture_limit,
        )
        with patch.dict(os.environ, {"LAZYGOAL_GEPA_FAKE_MODE": mode}):
            return client.evaluate_one(self.example, self.prompt, invocation)


if __name__ == "__main__":
    unittest.main()
