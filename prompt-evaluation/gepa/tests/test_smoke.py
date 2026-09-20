from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa.smoke import main


class SmokeTests(unittest.TestCase):
    def test_runs_one_sample_through_the_adapter_entrypoint(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manifest = root / "manifest.json"
            manifest.write_text(
                json.dumps({"tasks": [{"taskId": "task-1"}]}),
                encoding="utf-8",
            )
            profile = root / "profile.json"
            profile.write_text(
                json.dumps(
                    {
                        "id": "alfworld-profile",
                        "systemPrompt": "System prompt",
                        "instructions": ["Instruction"],
                    }
                ),
                encoding="utf-8",
            )
            executable = root / "lazygoal"
            fixture = Path(__file__).parent / "fixtures" / "fake_lazygoal.py"
            shutil.copyfile(fixture, executable)
            executable.chmod(0o755)
            stdout = StringIO()

            with (
                patch.dict(os.environ, {"LAZYGOAL_GEPA_FAKE_MODE": "passed"}),
                redirect_stdout(stdout),
            ):
                exit_code = main(
                    [
                        "--workspace-root",
                        str(root),
                        "--manifest",
                        str(manifest),
                        "--profile",
                        str(profile),
                        "--output-directory",
                        str(root / "output"),
                        "--lazygoal-executable",
                        str(executable),
                        "--model-config-id",
                        "test",
                        "--model-id",
                        "model-1",
                    ]
                )

            self.assertEqual(exit_code, 0)
            summary = json.loads(stdout.getvalue())
            self.assertEqual(summary["status"], "passed")
            self.assertEqual(summary["score"], 1.0)
            self.assertEqual(len(list((root / "output").glob("**/result.json"))), 1)


if __name__ == "__main__":
    unittest.main()
