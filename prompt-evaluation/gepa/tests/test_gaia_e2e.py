from __future__ import annotations

import json
import os
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from lazygoal_gepa import gaia_e2e


class GaiaRealE2ETests(unittest.TestCase):
    def test_requires_environment_gate_before_reading_or_invoking(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with (
                patch.object(gaia_e2e, "read_run_request") as read_request,
                patch.object(gaia_e2e.subprocess, "run") as run,
                redirect_stderr(StringIO()),
            ):
                exit_code = gaia_e2e.main(
                    [
                        "--request",
                        "/does/not/exist.json",
                        "--profile-path",
                        "/does/not/exist-profile.json",
                        "--dry-run",
                    ]
                )

        self.assertEqual(exit_code, 2)
        read_request.assert_not_called()
        run.assert_not_called()

    def test_dry_run_only_performs_preflight(self) -> None:
        request = SimpleNamespace(
            valset=(SimpleNamespace(manifest_path="/data/gaia/validation.json", task_id="validation-1"),)
        )
        preflight = {
            "benchmark": "gaia",
            "sampleCount": {"train": 1, "validation": 1},
            "maxMetricCalls": 4,
            "models": {"working": {"profileName": "default", "modelId": "work"}},
            "targetProfile": {"profileId": "gaia-worker-profile"},
            "estimatedSideEffects": {"incursContainerExecution": True},
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            with (
                patch.dict(os.environ, {gaia_e2e._REAL_E2E_ENV: "1"}, clear=True),
                patch.object(gaia_e2e, "read_run_request", return_value=request),
                patch.object(gaia_e2e, "validate_gaia_minimal_request"),
                patch.object(gaia_e2e, "_run_lifecycle", return_value=preflight) as lifecycle,
                redirect_stdout(StringIO()) as stdout,
            ):
                exit_code = gaia_e2e.main(
                    [
                        "--request",
                        str(Path(temporary_directory) / "request.json"),
                        "--profile-path",
                        str(Path(temporary_directory) / "profile.json"),
                        "--workspace-root",
                        temporary_directory,
                        "--runs-directory",
                        str(Path(temporary_directory) / "runs"),
                        "--dry-run",
                    ]
                )

        self.assertEqual(exit_code, 0)
        self.assertEqual(lifecycle.call_count, 1)
        self.assertEqual(lifecycle.call_args.args[2][0], "preflight")
        self.assertIn('"promptEvaluation":"not_run"', stdout.getvalue())

    def test_domain_failure_does_not_become_e2e_success(self) -> None:
        request = SimpleNamespace(
            valset=(SimpleNamespace(manifest_path="/data/gaia/validation.json", task_id="validation-1"),)
        )
        profile = SimpleNamespace(
            id="gaia-worker-profile",
            system_prompt="system",
            instructions=("instruction",),
        )
        preflight = {
            "benchmark": "gaia",
            "sampleCount": {"train": 1, "validation": 1},
            "maxMetricCalls": 4,
            "models": {"working": {"profileName": "default", "modelId": "work"}},
        }
        result_path_content = {"tasks": [{"taskId": "validation-1", "status": "failed"}]}
        with tempfile.TemporaryDirectory() as temporary_directory:
            result_path = Path(temporary_directory) / "result.json"
            result_path.write_text(json.dumps(result_path_content), encoding="utf-8")
            lifecycle_responses = [
                preflight,
                {"runId": "run-1"},
                {"runId": "run-1", "lifecycleStatus": "succeeded"},
                {
                    "runId": "run-1",
                    "complete": True,
                    "publication": {"status": "published"},
                    "artifacts": {"reportPath": str(Path(temporary_directory) / "report.json")},
                },
            ]
            prompt_process = SimpleNamespace(
                returncode=0,
                stdout=json.dumps(
                    {
                        "type": "terminal",
                        "resultPath": str(result_path),
                    }
                ),
                stderr="",
            )
            with (
                patch.dict(os.environ, {gaia_e2e._REAL_E2E_ENV: "1"}, clear=True),
                patch.object(gaia_e2e, "read_run_request", return_value=request),
                patch.object(gaia_e2e, "validate_gaia_minimal_request"),
                patch.object(gaia_e2e, "load_agent_profile", return_value=(profile, "digest")),
                patch.object(
                    gaia_e2e,
                    "_run_lifecycle",
                    side_effect=lifecycle_responses,
                ) as lifecycle,
                patch.object(gaia_e2e, "_run_process", return_value=prompt_process),
                redirect_stdout(StringIO()) as stdout,
            ):
                exit_code = gaia_e2e.main(
                    [
                        "--request",
                        str(Path(temporary_directory) / "request.json"),
                        "--profile-path",
                        str(Path(temporary_directory) / "profile.json"),
                        "--workspace-root",
                        temporary_directory,
                        "--runs-directory",
                        str(Path(temporary_directory) / "runs"),
                        "--yes",
                        "--poll-interval",
                        "0",
                    ]
                )

        self.assertEqual(exit_code, 1)
        self.assertEqual(lifecycle.call_count, 4)
        self.assertIn('"promptEvaluationStatus":"failed"', stdout.getvalue())
        self.assertIn('"success":false', stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
