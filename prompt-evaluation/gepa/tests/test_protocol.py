from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lazygoal_gepa.errors import DatasetValidationError, GEPARunProtocolError
from lazygoal_gepa.protocol import (
    GEPA_RUN_PROTOCOL,
    GEPARunRequest,
    parse_event_stream,
    parse_run_request,
    read_run_request,
    gepa_metric_call_threshold,
    gepa_reflection_minibatch_size,
    validate_gaia_minimal_request,
)


class GEPARunProtocolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_manifest(self, filename: str, task_id: str, benchmark: str = "alfworld") -> Path:
        manifest_path = self.root / filename
        data = {
            "benchmark": benchmark,
            "tasks": [{"taskId": task_id, "domain": "test"}],
        }
        manifest_path.write_text(json.dumps(data), encoding="utf-8")
        return manifest_path

    def test_parse_valid_minimal_request(self) -> None:
        manifest = self._write_manifest("m1.json", "task-1")
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "s1",
                    "taskId": "task-1",
                    "manifestPath": str(manifest),
                }
            ],
            "maxMetricCalls": 10,
        }

        request = parse_run_request(data)

        self.assertIsInstance(request, GEPARunRequest)
        self.assertEqual(request.protocol, "gepa-run@1")
        self.assertEqual(request.benchmark, "alfworld")
        self.assertEqual(request.max_metric_calls, 10)
        self.assertIsNone(request.valset)
        self.assertIsNone(request.reflection_minibatch_size)
        self.assertIsNone(request.seed)
        self.assertEqual(len(request.trainset), 1)
        self.assertEqual(request.trainset[0].sample_id, "s1")
        self.assertEqual(request.trainset[0].task_id, "task-1")
        self.assertEqual(request.trainset[0].manifest_path, str(manifest.resolve()))

    def test_parse_valid_full_request(self) -> None:
        train_m = self._write_manifest("train.json", "task-train")
        val_m = self._write_manifest("val.json", "task-val")
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "gaia",
            "trainset": [
                {
                    "sampleId": "s-train",
                    "taskId": "task-train",
                    "manifestPath": str(train_m),
                }
            ],
            "valset": [
                {
                    "sampleId": "s-val",
                    "taskId": "task-val",
                    "manifestPath": str(val_m),
                }
            ],
            "maxMetricCalls": 50,
            "reflectionMinibatchSize": 3,
            "seed": 42,
        }

        request = parse_run_request(data)

        self.assertEqual(request.protocol, "gepa-run@1")
        self.assertEqual(request.benchmark, "gaia")
        self.assertEqual(request.max_metric_calls, 50)
        self.assertEqual(request.reflection_minibatch_size, 3)
        self.assertEqual(request.seed, 42)
        self.assertIsNotNone(request.valset)
        assert request.valset is not None
        self.assertEqual(len(request.valset), 1)
        self.assertEqual(request.valset[0].sample_id, "s-val")

    def test_tua_gepa_metric_budget_reserves_both_reflection_batches(self) -> None:
        request = parse_run_request({
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["train-doc", "train-sheet", "train-web", "train-code"],
                "validationTaskIds": ["validation-doc", "validation-sheet"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        })

        threshold, reserve = gepa_metric_call_threshold(
            request,
            train_count=4,
            validation_count=2,
        )

        self.assertEqual(reserve, 8)
        self.assertEqual(threshold, 13)

    def test_tua_gepa_metric_budget_must_cover_seed_validation(self) -> None:
        request = parse_run_request({
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "maxMetricCalls": 1,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["train-doc"],
                "validationTaskIds": ["validation-doc", "validation-sheet"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        })

        with self.assertRaisesRegex(GEPARunProtocolError, "initial full validation"):
            gepa_metric_call_threshold(request, train_count=1, validation_count=2)

    def test_tua_default_reflection_batch_shrinks_to_trainset(self) -> None:
        request = parse_run_request({
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["train-doc"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        })

        self.assertEqual(
            gepa_reflection_minibatch_size(request, train_count=1),
            1,
        )
        self.assertEqual(
            gepa_metric_call_threshold(request, train_count=1, validation_count=1),
            (18, 3),
        )

    def test_tua_explicit_reflection_batch_cannot_exceed_trainset(self) -> None:
        request = parse_run_request({
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "reflectionMinibatchSize": 2,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["train-doc"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        })

        with self.assertRaisesRegex(GEPARunProtocolError, "cannot exceed"):
            gepa_reflection_minibatch_size(request, train_count=1)

    def test_parse_tua_gepa_request_and_default_holdout_trials(self) -> None:
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["train-doc"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        }

        request = parse_run_request(data)

        self.assertEqual(request.benchmark, "tua-bench")
        self.assertEqual(request.trainset, ())
        self.assertEqual(request.valset, None)
        self.assertIsNotNone(request.tua_dataset)
        assert request.tua_dataset is not None
        self.assertEqual(request.tua_dataset.repo_root, str((self.root / "TUA-Bench").resolve()))
        self.assertEqual(request.tua_dataset.validation_task_ids, ("validation-doc",))
        self.assertIsNotNone(request.final_comparison)
        assert request.final_comparison is not None
        self.assertEqual(request.final_comparison.tua_holdout_trials, 3)
        self.assertEqual(request.publication_policy, "candidate-only")

    def test_tua_request_rejects_partition_overlap_and_invalid_trial_plan(self) -> None:
        base = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["same-task"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        }
        overlap = dict(base)
        overlap["tuaDataset"] = {
            **base["tuaDataset"],
            "validationTaskIds": ["same-task"],
        }
        with self.assertRaisesRegex(DatasetValidationError, "both trainTaskIds and validationTaskIds"):
            parse_run_request(overlap)

        for trials in (0, -1, True, 1.5):
            with self.subTest(trials=trials):
                invalid = dict(base)
                invalid["finalComparison"] = {"tuaHoldoutTrials": trials}
                with self.assertRaisesRegex(GEPARunProtocolError, "positive integer"):
                    parse_run_request(invalid)

        invalid_policy = dict(base)
        invalid_policy["publicationPolicy"] = "publish"
        with self.assertRaisesRegex(GEPARunProtocolError, "candidate-only"):
            parse_run_request(invalid_policy)

    def test_tua_materialized_tasksets_must_match_the_explicit_ids(self) -> None:
        train_m = self._write_manifest("tua-train.json", "wrong-task", benchmark="tua-bench")
        val_m = self._write_manifest("tua-val.json", "validation-doc", benchmark="tua-bench")
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "tua-bench",
            "trainset": [{"sampleId": "s-train", "taskId": "wrong-task", "manifestPath": str(train_m)}],
            "valset": [{"sampleId": "s-val", "taskId": "validation-doc", "manifestPath": str(val_m)}],
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.root / "TUA-Bench"),
                "trainTaskIds": ["train-doc"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        }
        with self.assertRaisesRegex(DatasetValidationError, "trainset does not match"):
            parse_run_request(data)

    def test_gaia_minimal_lifecycle_bounds(self) -> None:
        train_m = self._write_manifest("train.json", "task-train")
        val_m = self._write_manifest("val.json", "task-val")
        base = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "gaia",
            "trainset": [{"sampleId": "s-train", "taskId": "task-train", "manifestPath": str(train_m)}],
            "valset": [{"sampleId": "s-val", "taskId": "task-val", "manifestPath": str(val_m)}],
            "maxMetricCalls": 4,
        }
        request = parse_run_request(base)
        validate_gaia_minimal_request(request)

        cases = (
            ({"maxMetricCalls": 5}, "at most 4"),
            ({"reflectionMinibatchSize": 2}, "reflectionMinibatchSize"),
            ({"seed": 1}, "seed"),
            ({"valset": None}, "validation sample"),
        )
        for overrides, expected in cases:
            with self.subTest(overrides=overrides):
                data = dict(base)
                data.update(overrides)
                parsed = parse_run_request(data)
                with self.assertRaisesRegex((DatasetValidationError, GEPARunProtocolError), expected):
                    validate_gaia_minimal_request(parsed)

    def test_rejects_train_and_validation_identity_overlap(self) -> None:
        train_m = self._write_manifest("train.json", "task-shared")
        val_m = self._write_manifest("val.json", "task-shared")
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "gaia",
            "trainset": [{"sampleId": "s-train", "taskId": "task-shared", "manifestPath": str(train_m)}],
            "valset": [{"sampleId": "s-val", "taskId": "task-shared", "manifestPath": str(val_m)}],
            "maxMetricCalls": 4,
        }
        with self.assertRaisesRegex(DatasetValidationError, "task IDs"):
            parse_run_request(data)

        data["valset"] = [{"sampleId": "s-train", "taskId": "task-other", "manifestPath": str(val_m)}]
        with self.assertRaisesRegex(DatasetValidationError, "sample IDs"):
            parse_run_request(data)

    def test_check_manifests_accepts_domain_specific_fields(self) -> None:
        manifest = self.root / "custom.json"
        manifest_payload = {
            "benchmark": "custom-benchmark",
            "tasks": [{
                "taskId": "task-custom",
                "domainConfig": {"mode": "benchmark-owned"},
            }],
        }
        manifest.write_text(
            json.dumps(manifest_payload),
            encoding="utf-8",
        )
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "custom-benchmark",
            "trainset": [{
                "sampleId": "s1",
                "taskId": "task-custom",
                "manifestPath": str(manifest),
            }],
            "maxMetricCalls": 4,
        }
        request = parse_run_request(data, check_manifests=True)
        self.assertEqual(request.benchmark, "custom-benchmark")

    def test_reject_unsupported_protocol_version(self) -> None:
        manifest = self._write_manifest("m.json", "task-1")
        cases = ("gepa-run@2", "gepa-run@0", "prompt-evaluation@1", "")

        for invalid_protocol in cases:
            with self.subTest(protocol=invalid_protocol):
                data = {
                    "protocol": invalid_protocol,
                    "benchmark": "alfworld",
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "task-1",
                            "manifestPath": str(manifest),
                        }
                    ],
                    "maxMetricCalls": 10,
                }
                with self.assertRaises(GEPARunProtocolError):
                    parse_run_request(data)

    def test_reject_invalid_benchmark(self) -> None:
        manifest = self._write_manifest("m.json", "task-1")
        cases = ("", "   ", 123, None, False)

        for invalid_bm in cases:
            with self.subTest(benchmark=invalid_bm):
                data = {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": invalid_bm,
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "task-1",
                            "manifestPath": str(manifest),
                        }
                    ],
                    "maxMetricCalls": 10,
                }
                with self.assertRaises(GEPARunProtocolError):
                    parse_run_request(data)

    def test_accepts_arbitrary_valid_benchmark(self) -> None:
        manifest = self._write_manifest("m.json", "task-1")
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "custom-benchmark",
            "trainset": [
                {
                    "sampleId": "s1",
                    "taskId": "task-1",
                    "manifestPath": str(manifest),
                }
            ],
            "maxMetricCalls": 10,
        }
        request = parse_run_request(data)
        self.assertEqual(request.benchmark, "custom-benchmark")

    def test_reject_cross_benchmark_samples(self) -> None:
        # Declares alfworld, but manifest declares gaia
        gaia_manifest = self._write_manifest("gaia_m.json", "task-1", benchmark="gaia")
        data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "s1",
                    "taskId": "task-1",
                    "manifestPath": str(gaia_manifest),
                }
            ],
            "maxMetricCalls": 10,
        }
        with self.assertRaises(DatasetValidationError):
            parse_run_request(data, check_manifests=True)

    def test_budget_boundary_validation(self) -> None:
        manifest = self._write_manifest("m.json", "task-1")
        invalid_budgets = (0, -1, -100, "10", 10.5, True, False)

        for budget in invalid_budgets:
            with self.subTest(budget=budget):
                data = {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "task-1",
                            "manifestPath": str(manifest),
                        }
                    ],
                    "maxMetricCalls": budget,
                }
                with self.assertRaises(GEPARunProtocolError):
                    parse_run_request(data)

        # 1 is the valid minimal positive boundary
        valid_data = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "s1",
                    "taskId": "task-1",
                    "manifestPath": str(manifest),
                }
            ],
            "maxMetricCalls": 1,
        }
        req = parse_run_request(valid_data)
        self.assertEqual(req.max_metric_calls, 1)

    def test_reject_missing_or_empty_trainset(self) -> None:
        manifest = self._write_manifest("m.json", "task-1")

        # Missing trainset
        with self.assertRaises(GEPARunProtocolError):
            parse_run_request(
                {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "maxMetricCalls": 10,
                }
            )

        # Empty trainset
        with self.assertRaises((DatasetValidationError, GEPARunProtocolError)):
            parse_run_request(
                {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "trainset": [],
                    "maxMetricCalls": 10,
                }
            )

        # Trainset sample missing taskId
        with self.assertRaises(GEPARunProtocolError):
            parse_run_request(
                {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "trainset": [{"sampleId": "s1", "manifestPath": str(manifest)}],
                    "maxMetricCalls": 10,
                }
            )

    def test_valset_fallback_and_validation(self) -> None:
        manifest = self._write_manifest("m.json", "task-1")

        # Scenario A: valset is null
        data_null_valset = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "s1",
                    "taskId": "task-1",
                    "manifestPath": str(manifest),
                }
            ],
            "valset": None,
            "maxMetricCalls": 10,
        }
        req = parse_run_request(data_null_valset)
        self.assertIsNone(req.valset)

        # Scenario B: valset is empty list -> should reject
        data_empty_valset = {
            "protocol": GEPA_RUN_PROTOCOL,
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "s1",
                    "taskId": "task-1",
                    "manifestPath": str(manifest),
                }
            ],
            "valset": [],
            "maxMetricCalls": 10,
        }
        with self.assertRaises(DatasetValidationError):
            parse_run_request(data_empty_valset)

    def test_resolve_relative_manifest_path(self) -> None:
        sub_dir = self.root / "sub"
        sub_dir.mkdir()
        manifest_path = sub_dir / "task.json"
        manifest_path.write_text(
            json.dumps({"benchmark": "alfworld", "tasks": [{"taskId": "task-sub"}]}),
            encoding="utf-8",
        )

        request_file = sub_dir / "request.json"
        request_file.write_text(
            json.dumps(
                {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "task-sub",
                            "manifestPath": "./task.json",
                        }
                    ],
                    "maxMetricCalls": 10,
                }
            ),
            encoding="utf-8",
        )

        req = read_run_request(request_file, check_manifests=True)
        self.assertEqual(req.trainset[0].manifest_path, str(manifest_path.resolve()))

        # If relative manifest does not exist, check_manifests raises DatasetValidationError
        non_existent_file = sub_dir / "req_missing.json"
        non_existent_file.write_text(
            json.dumps(
                {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "task-sub",
                            "manifestPath": "./missing.json",
                        }
                    ],
                    "maxMetricCalls": 10,
                }
            ),
            encoding="utf-8",
        )
        with self.assertRaises(DatasetValidationError):
            read_run_request(non_existent_file, check_manifests=True)

    def test_reject_malformed_json_and_non_object(self) -> None:
        malformed_file = self.root / "bad.json"
        malformed_file.write_text("{not valid json", encoding="utf-8")
        with self.assertRaises(GEPARunProtocolError):
            read_run_request(malformed_file)

        non_object_cases = ([], "some string", 123, True, None)
        for val in non_object_cases:
            with self.subTest(value=val):
                with self.assertRaises(GEPARunProtocolError):
                    parse_run_request(val)

    def test_parse_event_stream_with_cancelled_progress_stage(self) -> None:
        lines = [
            json.dumps({
                "protocol": "prompt-evaluation@1",
                "evaluationId": "eval-1",
                "type": "progress",
                "authoritative": False,
                "taskId": "task-1",
                "stage": "cancelled",
                "timestamp": "2026-09-22T00:00:00.000Z",
            }),
            json.dumps({
                "protocol": "prompt-evaluation@1",
                "evaluationId": "eval-1",
                "type": "terminal",
                "authoritative": False,
                "taskId": None,
                "stage": "cancelled",
                "timestamp": "2026-09-22T00:00:01.000Z",
            }),
        ]
        data = "\n".join(lines).encode("utf-8")
        events = parse_event_stream(data)
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0].stage, "cancelled")
        self.assertEqual(events[0].event_type, "progress")
        self.assertEqual(events[1].stage, "cancelled")
        self.assertEqual(events[1].event_type, "terminal")


if __name__ == "__main__":
    unittest.main()
