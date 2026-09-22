from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from lazygoal_gepa.smoke import main


class SmokeTests(unittest.TestCase):
    def test_refuses_without_explicit_confirmation_before_invoking_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            request = Path(temporary_directory) / "request.json"
            request.write_text("{}", encoding="utf-8")
            stderr = StringIO()

            with patch("lazygoal_gepa.smoke.subprocess.run") as run, redirect_stderr(stderr):
                exit_code = main(["--request", str(request)])

            self.assertEqual(exit_code, 2)
            run.assert_not_called()
            self.assertIn("API charges", stderr.getvalue())
            self.assertIn("--yes", stderr.getvalue())

    def test_confirmed_entrypoint_routes_preflight_start_status_and_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            request = root / "request.json"
            request.write_text(
                json.dumps(
                    {
                        "protocol": "gepa-run@1",
                        "benchmark": "alfworld",
                        "trainset": [],
                        "valset": None,
                        "maxMetricCalls": 1,
                    }
                ),
                encoding="utf-8",
            )
            responses = [
                {
                    "benchmark": "alfworld",
                    "sampleCount": {"train": 1, "validation": 1},
                    "maxMetricCalls": 1,
                    "models": {
                        "working": {"profileName": "default"},
                        "reflection": {"profileName": "gepa-reflection"},
                    },
                    "targetProfile": {"profileId": "default"},
                    "estimatedSideEffects": {"incursLlmCosts": True},
                },
                {
                    "runId": "run_20260920_010203_ab12cd34",
                    "lifecycleStatus": "starting",
                    "runDir": str(root / "runs" / "run_20260920_010203_ab12cd34"),
                },
                {
                    "runId": "run_20260920_010203_ab12cd34",
                    "lifecycleStatus": "succeeded",
                    "workerHealth": "inactive",
                    "publicationStatus": "published",
                },
                {"runId": "run_20260920_010203_ab12cd34", "terminalStatus": "succeeded"},
            ]
            completed = [
                SimpleNamespace(returncode=0, stdout=json.dumps(value), stderr="")
                for value in responses
            ]
            stdout = StringIO()
            stderr = StringIO()

            with (
                patch("lazygoal_gepa.smoke.subprocess.run", side_effect=completed) as run,
                redirect_stdout(stdout),
                redirect_stderr(stderr),
            ):
                exit_code = main(
                    [
                        "--request",
                        str(request),
                        "--workspace-root",
                        str(root),
                        "--runs-directory",
                        str(root / "runs"),
                        "--yes",
                    ]
                )

            self.assertEqual(exit_code, 0)
            self.assertEqual(run.call_count, 4)
            commands = [call.args[0] for call in run.call_args_list]
            self.assertEqual(commands[0][1:3], ["gepa", "preflight"])
            self.assertEqual(commands[1][1:3], ["gepa", "start"])
            self.assertIn("--yes", commands[1])
            self.assertEqual(commands[2][1:3], ["gepa", "status"])
            self.assertEqual(commands[3][1:3], ["gepa", "report"])
            summary = json.loads(stdout.getvalue().splitlines()[-1])
            self.assertEqual(summary["runId"], "run_20260920_010203_ab12cd34")
            self.assertEqual(summary["lifecycleStatus"], "succeeded")
            self.assertIn("API charges", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
