from __future__ import annotations

import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest.mock import patch

from lazygoal_harness2.cli import main


class TestExecutionCommandsDisabled(unittest.TestCase):
    def test_start_resume_and_internal_worker_fail_without_constructing_controller(self) -> None:
        commands = (
            ["start", "--request", "/tmp/request.json"],
            ["resume", "--run", "run-1"],
            ["worker", "--run-dir", "/tmp/run"],
        )
        for command in commands:
            with self.subTest(command=command):
                stdout = io.StringIO()
                stderr = io.StringIO()
                with patch("lazygoal_harness2.cli.Harness2Controller") as controller:
                    with redirect_stdout(stdout), redirect_stderr(stderr):
                        self.assertEqual(main(command), 1)
                    controller.assert_not_called()
                self.assertEqual(stdout.getvalue(), "")
                self.assertIn("Unsupported: Harness2 execution", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
