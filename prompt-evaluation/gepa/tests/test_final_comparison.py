from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    CandidateCodec,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    extract_seed_candidate,
)
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
from lazygoal_gepa.final_comparison import FinalComparisonExecutor
from lazygoal_gepa.protocol import parse_run_request


class FinalComparisonTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.run_dir = self.root / "run-final-comparison"
        self.run_dir.mkdir()
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.cli = self.workspace / "lazygoal"
        shutil.copyfile(
            Path(__file__).parent / "fixtures" / "fake_lazygoal.py",
            self.cli,
        )
        self.cli.chmod(0o755)
        self.counter = self.root / "evaluation-count.txt"
        self.gaia_manifest = self.root / "gaia.json"
        self.gaia_manifest.write_text(
            json.dumps(
                {
                    "benchmark": "gaia",
                    "dataRoot": str(self.root / "gaia-data"),
                    "tasks": [{"taskId": "gaia-1"}, {"taskId": "gaia-unused"}],
                }
            ),
            encoding="utf-8",
        )
        self.alfworld_manifest = self.root / "alfworld.json"
        self.alfworld_manifest.write_text(
            json.dumps(
                {
                    "version": 1,
                    "name": "comparison",
                    "tasks": [
                        {"taskId": "alfworld-1", "seed": 7},
                        {"taskId": "alfworld-unused", "seed": 8},
                    ],
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_default_three_trial_tua_pairs_and_native_cross_environment_requests(self) -> None:
        manifest = self._manifest()
        candidate = _improved_candidate(manifest.seed_candidate)
        executor = self._executor(manifest)

        with self._fake_cli("metric_score"):
            result = executor.execute(candidate)

        self.assertEqual(result["status"], "completed")
        groups = {group["benchmarkId"]: group for group in result["groups"]}
        self.assertEqual(groups["tua-bench"]["trialsPerCandidate"], 3)
        self.assertEqual(len(groups["tua-bench"]["tasks"][0]["trials"]), 3)
        self.assertTrue(all(
            trial["paired"] and trial["seed"]["metricScore"] == 0.35
            for trial in groups["tua-bench"]["tasks"][0]["trials"]
        ))
        self.assertEqual(groups["gaia"]["tasks"][0]["taskId"], "gaia-1")
        self.assertEqual(groups["alfworld"]["tasks"][0]["taskId"], "alfworld-1")
        self.assertEqual(self._count_evaluations(), 10)

        requests = [
            json.loads(path.read_text(encoding="utf-8"))
            for path in self.run_dir.glob("final-comparison/evaluations/**/request.json")
        ]
        self.assertEqual(len(requests), 10)
        expected_profiles = {
            "tua-bench": "tua-bench-worker-profile",
            "gaia": "gaia-worker-profile",
            "alfworld": "alfworld-profile",
        }
        for request in requests:
            benchmark_id = request["benchmark"]["id"]
            self.assertEqual(
                request["candidate"]["baseProfileId"],
                expected_profiles[benchmark_id],
            )
            self.assertEqual(request["model"], {"configId": "default", "modelId": "work-model"})
            self.assertIn(
                request["candidate"]["systemPrompt"],
                {"seed system", "candidate system"},
            )
            self.assertEqual(
                request["candidate"]["instructions"],
                ["seed instruction"]
                if request["candidate"]["systemPrompt"] == "seed system"
                else ["candidate instruction"],
            )

    def test_explicit_trial_override_and_resume_reuse_completed_pairs(self) -> None:
        manifest = self._manifest(tua_trials=2, cross_trials=2)
        candidate = _improved_candidate(manifest.seed_candidate)
        executor = self._executor(manifest)

        with self._fake_cli("metric_score"):
            first = executor.execute(candidate)
            first_count = self._count_evaluations()
            resumed = self._executor(manifest).execute(candidate)

        self.assertEqual(first["status"], "completed")
        self.assertEqual(resumed["status"], "completed")
        self.assertEqual(first_count, 12)
        self.assertEqual(self._count_evaluations(), first_count)
        self.assertEqual(
            next(group for group in resumed["groups"] if group["benchmarkId"] == "tua-bench")[
                "trialsPerCandidate"
            ],
            2,
        )

    def test_interrupted_pair_resumes_without_repeating_committed_seed(self) -> None:
        manifest = self._manifest(include_cross_environment=False)
        candidate = _improved_candidate(manifest.seed_candidate)
        stop_checks = 0

        def stop_after_seed() -> bool:
            nonlocal stop_checks
            stop_checks += 1
            return stop_checks >= 2

        with self._fake_cli("metric_score"):
            stopped = self._executor(
                manifest,
                stop_requested=stop_after_seed,
            ).execute(candidate)
            self.assertEqual(stopped["status"], "stopped")
            self.assertEqual(self._count_evaluations(), 1)
            resumed = self._executor(manifest).execute(candidate)

        self.assertEqual(resumed["status"], "insufficient_evidence")
        self.assertEqual(self._count_evaluations(), 6)
        holdout = next(group for group in resumed["groups"] if group["benchmarkId"] == "tua-bench")
        self.assertTrue(all(trial["paired"] for trial in holdout["tasks"][0]["trials"]))
        self.assertEqual(holdout["tasks"][0]["trials"][0]["seed"]["attemptNumber"], 1)

    def test_missing_cross_environment_data_is_explicitly_insufficient(self) -> None:
        manifest = self._manifest(include_cross_environment=False)

        with self._fake_cli("metric_score"):
            result = self._executor(manifest).execute(_improved_candidate(manifest.seed_candidate))

        self.assertEqual(result["status"], "insufficient_evidence")
        groups = {group["benchmarkId"]: group for group in result["groups"]}
        self.assertEqual(groups["gaia"]["status"], "unavailable")
        self.assertIn("environment_not_configured", groups["gaia"]["reasonCodes"])
        self.assertEqual(groups["alfworld"]["status"], "unavailable")

    def test_infrastructure_failures_remain_unscored_and_do_not_stop_other_slots(self) -> None:
        manifest = self._manifest(include_cross_environment=False, tua_trials=1)

        with self._fake_cli("infrastructure"):
            result = self._executor(manifest).execute(_improved_candidate(manifest.seed_candidate))

        self.assertEqual(result["status"], "incomplete")
        self.assertEqual(self._count_evaluations(), 2)
        holdout = next(group for group in result["groups"] if group["benchmarkId"] == "tua-bench")
        trial = holdout["tasks"][0]["trials"][0]
        self.assertFalse(trial["paired"])
        self.assertEqual(trial["seed"]["status"], "infrastructure_error")
        self.assertIsNone(trial["seed"]["metricScore"])
        self.assertNotIn("infrastructure failed", json.dumps(result))

    def _executor(self, manifest: FrozenRunManifest, *, stop_requested=None) -> FinalComparisonExecutor:
        return FinalComparisonExecutor(
            manifest,
            self.run_dir,
            executable=self.cli,
            workspace_root=self.workspace,
            verify_frozen_inputs=lambda: (True, None),
            stop_requested=stop_requested,
        )

    def _fake_cli(self, mode: str):
        return patch.dict(
            os.environ,
            {
                "LAZYGOAL_GEPA_FAKE_MODE": mode,
                "LAZYGOAL_GEPA_FAKE_COUNTER": str(self.counter),
            },
        )

    def _count_evaluations(self) -> int:
        return int(self.counter.read_text(encoding="utf-8")) if self.counter.exists() else 0

    def _manifest(
        self,
        *,
        tua_trials: int | None = None,
        cross_trials: int = 1,
        include_cross_environment: bool = True,
    ) -> FrozenRunManifest:
        source_root = self.root / "tua-source"
        source_root.mkdir(exist_ok=True)
        task_ids = {
            "train": ["train-1"],
            "validation": ["validation-1"],
            "holdout": ["holdout-1"],
        }
        cross_environment = (
            {
                "gaia": {
                    "manifestPath": str(self.gaia_manifest),
                    "taskIds": ["gaia-1"],
                    "trials": cross_trials,
                },
                "alfworld": {
                    "manifestPath": str(self.alfworld_manifest),
                    "taskIds": ["alfworld-1"],
                    "trials": cross_trials,
                },
            }
            if include_cross_environment
            else {"gaia": None, "alfworld": None}
        )
        final_comparison = {
            **cross_environment,
        }
        if tua_trials is not None:
            final_comparison["tuaHoldoutTrials"] = tua_trials
        request = parse_run_request(
            {
                "protocol": "gepa-run@1",
                "benchmark": "tua-bench",
                "tuaDataset": {
                    "repoRoot": str(source_root),
                    "trainTaskIds": task_ids["train"],
                    "validationTaskIds": task_ids["validation"],
                    "holdoutTaskIds": task_ids["holdout"],
                },
                "finalComparison": final_comparison,
                "publicationPolicy": "candidate-only",
                "maxMetricCalls": 4,
            },
            check_manifests=False,
        )
        task_facts = {
            task_id: {
                "taskId": task_id,
                "taskFamily": "document",
                "networkMode": "none",
                "agentTimeoutSec": 30,
                "verifierTimeoutSec": 30,
                "resourceDigest": "d" * 64,
                "imageDigest": "sha256:" + "e" * 64,
            }
            for ids in task_ids.values()
            for task_id in ids
        }
        partitions = {
            name: {
                "taskIds": ids,
                "taskFamilies": ["document"],
                "networkTasks": [],
            }
            for name, ids in task_ids.items()
        }
        inspection = {
            "sourceRevision": "b" * 40,
            "datasetDigest": "c" * 64,
            "workingTreeDirty": False,
            "changedPaths": [],
            "tasks": task_facts,
            "partitions": partitions,
        }
        profile = AgentProfileSnapshot(
            schema_version=1,
            id="default",
            name="Default",
            description="Test seed profile",
            system_prompt="seed system",
            instructions=("seed instruction",),
            tool_ids=("bash",),
        )
        return FrozenRunManifest(
            protocol="gepa-run@1",
            run_id="run-final-comparison",
            created_at=datetime.now(timezone.utc).isoformat(),
            gepa_version=EXPECTED_GEPA_VERSION,
            request=request,
            target_profile=TargetProfileSnapshot(
                profile_id=profile.id,
                profile_path=str(self.root / "default.json"),
                frozen_digest="a" * 64,
                profile=profile,
            ),
            seed_candidate=extract_seed_candidate(profile),
            seed_candidate_id=CandidateCodec().decode(
                extract_seed_candidate(profile)
            ).candidate_id,
            working_model=ModelIdentity(profile_name="default", model_id="work-model"),
            reflection_model=ModelIdentity(
                profile_name="gepa-reflection",
                model_id="reflection-model",
            ),
            tua_dataset_inspection=inspection,
            preflight_input_digest="1" * 64,
        )


def _improved_candidate(seed: dict[str, str]) -> dict[str, str]:
    candidate = dict(seed)
    candidate["system_prompt"] = "candidate system"
    candidate["instruction_000"] = "candidate instruction"
    return candidate


if __name__ == "__main__":
    unittest.main()
