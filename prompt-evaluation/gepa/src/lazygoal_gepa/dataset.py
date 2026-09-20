"""Validation of GEPA batches against the shared Manifest envelope."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

from .errors import DatasetValidationError
from .models import LazyGoalEvaluationExample, LazyGoalGEPAConfig


class DatasetValidator:
    """Reject invalid batches before any LazyGoal evaluation process starts."""

    def validate_batch(
        self,
        config: LazyGoalGEPAConfig,
        batch: Sequence[LazyGoalEvaluationExample],
    ) -> tuple[LazyGoalEvaluationExample, ...]:
        sample_ids: set[str] = set()
        task_ids: set[str] = set()
        validated: list[LazyGoalEvaluationExample] = []

        for index, example in enumerate(batch):
            if not isinstance(example, LazyGoalEvaluationExample):
                raise DatasetValidationError(
                    f"Batch item {index} is not a LazyGoalEvaluationExample"
                )
            if example.sample_id in sample_ids:
                raise DatasetValidationError(
                    f"Duplicate sample ID: {example.sample_id}"
                )
            if example.task_id in task_ids:
                raise DatasetValidationError(f"Duplicate task ID: {example.task_id}")
            if example.benchmark_id != config.benchmark_id:
                raise DatasetValidationError(
                    "Sample benchmark does not match the run: "
                    f"sample {example.sample_id!r} uses {example.benchmark_id!r}, "
                    f"run uses {config.benchmark_id!r}"
                )

            self._validate_manifest(example)
            sample_ids.add(example.sample_id)
            task_ids.add(example.task_id)
            validated.append(example)

        return tuple(validated)

    def _validate_manifest(self, example: LazyGoalEvaluationExample) -> None:
        path = example.manifest_path
        if not path.is_file():
            raise DatasetValidationError(
                f"Manifest does not exist or is not a file: {path}"
            )

        try:
            raw: Any = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as error:
            raise DatasetValidationError(
                f"Manifest could not be read as JSON: {path}"
            ) from error

        if not isinstance(raw, dict) or not isinstance(raw.get("tasks"), list):
            raise DatasetValidationError(
                f"Manifest must contain a tasks array: {path}"
            )
        tasks = raw["tasks"]
        if len(tasks) != 1:
            raise DatasetValidationError(
                f"Manifest must contain exactly one task, found {len(tasks)}: {path}"
            )
        task = tasks[0]
        if not isinstance(task, dict) or task.get("taskId") != example.task_id:
            found_task_id = task.get("taskId") if isinstance(task, dict) else None
            raise DatasetValidationError(
                "Manifest task ID does not match the sample: "
                f"expected {example.task_id!r}, found {found_task_id!r}"
            )

