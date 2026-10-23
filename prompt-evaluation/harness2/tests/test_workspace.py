from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from lazygoal_harness2.workspace import (
    HarnessWorkspace,
    MUTABLE_TEMPLATE_SOURCE_PATHS,
    compute_prompt_sha256,
)

REPO_ROOT = Path(__file__).resolve().parents[3]


class TestHarnessWorkspace(unittest.TestCase):
    def test_materialize_and_read_back_extracts_only_modified_templates(self) -> None:
        ws = HarnessWorkspace(REPO_ROOT)
        baseline = ws.create_baseline_candidate()
        self.assertEqual(baseline.template_overrides, {})
        self.assertEqual(len(ws.base_templates), 5)

        with tempfile.TemporaryDirectory() as tmp:
            tree_dir = Path(tmp) / "tree"
            ws.materialize_tree(baseline, tree_dir)

            for tid in MUTABLE_TEMPLATE_SOURCE_PATHS:
                self.assertTrue((tree_dir / "prompt-bundle" / f"{tid}.njk").is_file())

            run_mode_file = tree_dir / "prompt-bundle" / "run-mode@1.njk"
            modified_run_mode = run_mode_file.read_text(encoding="utf-8") + "\n<!-- custom rule -->\n"
            run_mode_file.write_text(modified_run_mode, encoding="utf-8")

            reconstructed = ws.read_tree_as_candidate(
                tree_dir,
                parent_candidate_id=baseline.candidate_id,
                scope="invariant",
                hypothesis="Add explicit run mode reminder",
            )
            self.assertEqual(list(reconstructed.template_overrides.keys()), ["run-mode@1"])
            self.assertEqual(reconstructed.template_overrides["run-mode@1"], modified_run_mode)
            self.assertNotEqual(reconstructed.candidate_id, baseline.candidate_id)

    def test_rejects_locked_template_edits(self) -> None:
        ws = HarnessWorkspace(REPO_ROOT)
        baseline = ws.create_baseline_candidate()
        with self.assertRaisesRegex(ValueError, "locked or unknown template"):
            ws.build_candidate_from_edits(
                baseline,
                template_edits={"working-memory@1": "forbidden"},
            )

    def test_canonical_sha256_changes_with_template_overrides(self) -> None:
        d1 = compute_prompt_sha256("sys", ["inst1"], {})
        d2 = compute_prompt_sha256("sys", ["inst1"], None)
        d3 = compute_prompt_sha256("sys", ["inst1"], {"run-mode@1": "mode: {{ mode }}"})
        self.assertEqual(d1, d2)
        self.assertNotEqual(d1, d3)


if __name__ == "__main__":
    unittest.main()
