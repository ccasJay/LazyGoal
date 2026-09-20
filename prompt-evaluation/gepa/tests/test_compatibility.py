from __future__ import annotations

import inspect
import unittest
from importlib import metadata
from pathlib import Path
from unittest.mock import patch

from gepa import optimize
from gepa.core.adapter import EvaluationBatch, GEPAAdapter

from lazygoal_gepa import (
    EXPECTED_GEPA_VERSION,
    GEPACompatibilityError,
    ensure_gepa_compatibility,
)


class CompatibilityTests(unittest.TestCase):
    def test_package_pins_official_gepa(self) -> None:
        package_root = Path(__file__).resolve().parents[1]
        project_text = (package_root / "pyproject.toml").read_text(encoding="utf-8")

        self.assertIn('"gepa==0.1.4"', project_text)
        self.assertIn('requires-python = ">=3.10,<3.15"', project_text)
        self.assertEqual(metadata.version("gepa"), EXPECTED_GEPA_VERSION)

    def test_official_public_contract_matches_adapter_boundary(self) -> None:
        self.assertTrue(callable(optimize))
        self.assertEqual(
            tuple(inspect.signature(GEPAAdapter.evaluate).parameters),
            ("self", "batch", "candidate", "capture_traces"),
        )
        self.assertEqual(
            tuple(inspect.signature(GEPAAdapter.make_reflective_dataset).parameters),
            ("self", "candidate", "eval_batch", "components_to_update"),
        )
        self.assertEqual(
            tuple(EvaluationBatch.__dataclass_fields__),
            (
                "outputs",
                "scores",
                "trajectories",
                "objective_scores",
                "num_metric_calls",
            ),
        )

        ensure_gepa_compatibility()

    def test_version_mismatch_fails_before_other_imports(self) -> None:
        with (
            patch("lazygoal_gepa.compatibility.version", return_value="0.1.5"),
            patch("lazygoal_gepa.compatibility.import_module") as import_module,
        ):
            with self.assertRaisesRegex(
                GEPACompatibilityError,
                "expected 0.1.4, found 0.1.5",
            ):
                ensure_gepa_compatibility()

        import_module.assert_not_called()

    def test_missing_public_symbol_is_classified(self) -> None:
        class EmptyModule:
            pass

        with (
            patch("lazygoal_gepa.compatibility.version", return_value="0.1.4"),
            patch(
                "lazygoal_gepa.compatibility.import_module",
                side_effect=[EmptyModule(), EmptyModule()],
            ),
        ):
            with self.assertRaisesRegex(
                GEPACompatibilityError,
                "public symbol optimize is unavailable",
            ):
                ensure_gepa_compatibility()


if __name__ == "__main__":
    unittest.main()
