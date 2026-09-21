from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lazygoal_gepa import (
    ConfigurationError,
    DatasetValidationError,
    DatasetValidator,
    LazyGoalEvaluationExample,
    LazyGoalGEPAConfig,
)


class DatasetValidatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.validator = DatasetValidator()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_accepts_single_task_alfworld_and_gaia_manifests(self) -> None:
        for benchmark_id in ("alfworld", "gaia"):
            with self.subTest(benchmark_id=benchmark_id):
                manifest = self._write_manifest(
                    f"{benchmark_id}.json",
                    [{"taskId": f"{benchmark_id}-task", "domain": "untouched"}],
                    benchmark_id=benchmark_id,
                )
                example = LazyGoalEvaluationExample(
                    sample_id=f"{benchmark_id}-sample",
                    benchmark_id=benchmark_id,
                    task_id=f"{benchmark_id}-task",
                    manifest_path=manifest,
                )

                validated = self.validator.validate_batch(
                    self._config(benchmark_id),
                    [example],
                )

                self.assertEqual(validated, (example,))

    def test_rejects_duplicate_sample_or_task_identity(self) -> None:
        first_manifest = self._write_manifest("first.json", [{"taskId": "task-1"}])
        second_manifest = self._write_manifest("second.json", [{"taskId": "task-2"}])
        first = self._example("sample-1", "task-1", first_manifest)

        duplicate_cases = (
            (
                self._example("sample-1", "task-2", second_manifest),
                "Duplicate sample ID",
            ),
            (
                self._example("sample-2", "task-1", first_manifest),
                "Duplicate task ID",
            ),
        )
        for duplicate, expected_message in duplicate_cases:
            with self.subTest(expected_message=expected_message):
                with self.assertRaisesRegex(DatasetValidationError, expected_message):
                    self.validator.validate_batch(
                        self._config("alfworld"),
                        [first, duplicate],
                    )

    def test_rejects_cross_benchmark_sample(self) -> None:
        manifest = self._write_manifest("gaia.json", [{"taskId": "task-1"}])
        example = LazyGoalEvaluationExample(
            sample_id="sample-1",
            benchmark_id="gaia",
            task_id="task-1",
            manifest_path=manifest,
        )

        with self.assertRaisesRegex(
            DatasetValidationError,
            "Sample benchmark does not match the run",
        ):
            self.validator.validate_batch(self._config("alfworld"), [example])

    def test_rejects_missing_malformed_or_multi_task_manifest(self) -> None:
        missing = self.root / "missing.json"
        malformed = self.root / "malformed.json"
        malformed.write_text("{", encoding="utf-8")
        multiple = self._write_manifest(
            "multiple.json",
            [{"taskId": "task-1"}, {"taskId": "task-2"}],
        )

        cases = (
            (missing, "does not exist"),
            (malformed, "could not be read as JSON"),
            (multiple, "exactly one task"),
        )
        for manifest, expected_message in cases:
            with self.subTest(manifest=manifest):
                with self.assertRaisesRegex(DatasetValidationError, expected_message):
                    self.validator.validate_batch(
                        self._config("alfworld"),
                        [self._example("sample-1", "task-1", manifest)],
                    )

    def test_rejects_manifest_task_identity_mismatch(self) -> None:
        manifest = self._write_manifest("mismatch.json", [{"taskId": "other"}])

        with self.assertRaisesRegex(DatasetValidationError, "does not match"):
            self.validator.validate_batch(
                self._config("alfworld"),
                [self._example("sample-1", "expected", manifest)],
            )

    def test_rejects_gaia_manifest_outside_first_stage_boundary(self) -> None:
        cases = (
            (
                {"split": "test", "level": 1, "expectedAnswer": "a", "attachments": []},
                "validation split",
            ),
            (
                {"split": "validation", "level": 2, "expectedAnswer": "a", "attachments": []},
                "level 1",
            ),
            (
                {"split": "validation", "level": 1, "expectedAnswer": "", "attachments": []},
                "non-empty expectedAnswer",
            ),
            (
                {"split": "validation", "level": 1, "expectedAnswer": "a", "attachments": ["file.pdf"]},
                "attachments",
            ),
        )
        for task_fields, expected_message in cases:
            with self.subTest(expected_message=expected_message):
                manifest = self._write_manifest(
                    "gaia-invalid.json",
                    [{"taskId": "gaia-task", **task_fields}],
                    benchmark_id="gaia",
                )
                with self.assertRaisesRegex(DatasetValidationError, expected_message):
                    self.validator.validate_batch(
                        self._config("gaia"),
                        [
                            LazyGoalEvaluationExample(
                                sample_id="gaia-sample",
                                benchmark_id="gaia",
                                task_id="gaia-task",
                                manifest_path=manifest,
                            )
                        ],
                    )

    def test_configuration_rejects_unsupported_or_empty_values(self) -> None:
        with self.assertRaisesRegex(ConfigurationError, "Unsupported benchmark"):
            self._config("swebench")
        with self.assertRaisesRegex(ConfigurationError, "model_id"):
            LazyGoalGEPAConfig(
                benchmark_id="alfworld",
                base_profile_id="base",
                model_config_id="config",
                model_id=" ",
                output_directory=self.root / "output",
                lazygoal_executable=self.root / "lazygoal",
            )

    def _config(self, benchmark_id: str) -> LazyGoalGEPAConfig:
        return LazyGoalGEPAConfig(
            benchmark_id=benchmark_id,
            base_profile_id="base",
            model_config_id="config",
            model_id="model",
            output_directory=self.root / "output",
            lazygoal_executable=self.root / "lazygoal",
        )

    def _example(
        self,
        sample_id: str,
        task_id: str,
        manifest_path: Path,
    ) -> LazyGoalEvaluationExample:
        return LazyGoalEvaluationExample(
            sample_id=sample_id,
            benchmark_id="alfworld",
            task_id=task_id,
            manifest_path=manifest_path,
        )

    def _write_manifest(
        self,
        name: str,
        tasks: list[dict[str, str]],
        benchmark_id: str = "alfworld",
    ) -> Path:
        path = self.root / name
        if benchmark_id == "gaia":
            task = tasks[0]
            task = {
                "taskId": task["taskId"],
                "question": "question",
                "expectedAnswer": "answer",
                "level": 1,
                "split": "validation",
                "attachments": [],
            } | task
            data = {
                "source": "huggingface",
                "loadedAt": "2026-09-21T00:00:00+00:00",
                "dataRoot": str(self.root),
                "tasks": [task],
            }
        else:
            data = {"tasks": tasks}
        path.write_text(json.dumps(data), encoding="utf-8")
        return path


if __name__ == "__main__":
    unittest.main()
