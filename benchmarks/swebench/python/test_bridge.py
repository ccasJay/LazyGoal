import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import bridge


class BridgeTests(unittest.TestCase):
    def test_selection_preserves_manifest_order_and_fails_missing(self):
        rows = [{"instance_id": "a"}, {"instance_id": "b"}, {"instance_id": "c"}]
        self.assertEqual(bridge.select_instances(rows, ["c", "a"]), [rows[2], rows[0]])
        with self.assertRaisesRegex(ValueError, "missing"):
            bridge.select_instances(rows, ["absent"])

    def test_version_is_exact_not_a_compatibility_fallback(self):
        with patch.object(bridge.importlib.metadata, "version", return_value="4.1.0"):
            bridge.check_version()
        with patch.object(bridge.importlib.metadata, "version", return_value="4.2.0"):
            with self.assertRaisesRegex(RuntimeError, "Expected swebench==4.1.0"):
                bridge.check_version()

    def test_official_reports_are_only_source_of_resolved(self):
        with tempfile.TemporaryDirectory() as directory:
            predictions = [dict(instance_id=i, model_name_or_path="lazygoal", model_patch=p)
                           for i, p in [("resolved", "patch"), ("unresolved", "patch"),
                                        ("empty", ""), ("missing", "patch")]]
            for instance_id, resolved in [("resolved", True), ("unresolved", False)]:
                folder = Path(directory, "logs/run_evaluation", "unique", "lazygoal", instance_id)
                folder.mkdir(parents=True)
                (folder / "report.json").write_text(json.dumps({instance_id: {"resolved": resolved}}))
            results = bridge.read_grades(directory, "unique", predictions)
            self.assertEqual([r["status"] for r in results], ["resolved", "unresolved", "empty_patch", "grading_error"])
            self.assertTrue(all(Path(r["logDirectory"]).is_relative_to(directory) for r in results))

    def test_invalid_official_report_is_not_truthy_success(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory, "logs/run_evaluation", "unique", "lazygoal", "a")
            folder.mkdir(parents=True)
            (folder / "report.json").write_text('{"a":{"resolved":"false"}}')
            with self.assertRaisesRegex(ValueError, "Invalid official resolved"):
                bridge.read_grades(directory, "unique", [dict(instance_id="a", model_name_or_path="lazygoal", model_patch="patch")])

    def test_grading_uses_saved_dataset_and_predictions_without_new_inference(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "predictions.jsonl").write_text(json.dumps(dict(instance_id="a", model_name_or_path="lazygoal", model_patch="patch")) + "\n")
            with patch.object(bridge.subprocess, "run") as run:
                run.return_value.returncode = 1
                result = bridge.grade(directory, "unique", "30")
            args = run.call_args.args[0]
            self.assertEqual(args[:3], [bridge.sys.executable, "-m", "swebench.harness.run_evaluation"])
            self.assertEqual(args[args.index("--dataset_name") + 1], str(Path(directory, "dataset.json")))
            self.assertEqual(args[args.index("--run_id") + 1], "unique")
            self.assertEqual(args[args.index("--max_workers") + 1], "1")
            self.assertEqual(result["exitCode"], 1)
            self.assertEqual(result["results"][0]["status"], "grading_error")


if __name__ == "__main__":
    unittest.main()
