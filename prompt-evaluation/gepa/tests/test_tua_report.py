from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    CandidateCodec,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    extract_seed_candidate,
)
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
from lazygoal_gepa.errors import RunStoreError
from lazygoal_gepa.protocol import parse_run_request
from lazygoal_gepa.reporter import generate_and_save_run_report, read_run_report
from lazygoal_gepa.store import RunStore, atomic_write_json


class TuaReportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.runs_dir = self.root / "runs"
        self.runs_dir.mkdir()
        self.store = RunStore(self.runs_dir)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_report_includes_candidate_diffs_paired_scores_usage_and_human_review_gate(self) -> None:
        manifest, run_dir, candidate = self._run("run_tua_report_complete")
        self._write_comparison(run_dir, manifest, candidate, rewards=(0.2, 0.6, 1.0, 1.0, 0.0, 0.0))

        report = generate_and_save_run_report(run_dir)
        loaded = read_run_report(run_dir)
        review = report["tuaReview"]

        self.assertEqual(loaded, report)
        self.assertEqual(review["prompt"]["candidateId"], candidate.candidate_id)
        self.assertEqual(review["prompt"]["status"], "available")
        self.assertEqual(review["prompt"]["changedComponents"], ["system_prompt"])
        self.assertEqual(review["prompt"]["components"][0]["seedText"], "Seed system")
        self.assertEqual(review["prompt"]["components"][0]["candidateText"], "Candidate system")
        self.assertEqual(review["dataset"]["sourceRevision"], "b" * 40)
        self.assertEqual(review["evaluationPlan"]["tuaHoldoutTrials"], 1)
        self.assertEqual(review["finalComparison"]["taskFamilies"][0]["taskFamily"], "document")
        self.assertAlmostEqual(review["finalComparison"]["taskFamilies"][0]["statistics"]["meanDelta"], 0.4)
        tua_outcome = review["finalComparison"]["groups"][0]["tasks"][0]["trials"][0]["seed"]
        self.assertEqual(tua_outcome["officialReward"], 0.2)
        self.assertEqual(review["coverage"]["uncoveredBenchmarks"], ["swebench"])
        self.assertEqual(review["promotion"]["status"], "human_review_required")
        self.assertFalse(review["promotion"]["automaticPublication"])
        self.assertEqual(review["usageAndCost"]["benchmarkAttemptsWithUsage"], 4)
        self.assertEqual(review["usageAndCost"]["benchmarkAttemptsWithoutUsage"], 2)
        self.assertEqual(review["usageAndCost"]["benchmarkTokenUsage"]["inputTokens"], 40)
        self.assertEqual(review["usageAndCost"]["estimatedCost"]["status"], "unknown")

        report_path = run_dir / "artifacts" / "report.json"
        report_data = json.loads(report_path.read_text(encoding="utf-8"))
        report_data["tuaReview"]["promotion"]["status"] = "not_recommended"
        report_path.write_text(json.dumps(report_data), encoding="utf-8")
        with self.assertRaises(RunStoreError):
            read_run_report(run_dir)

    def test_regression_and_candidate_audit_finding_block_positive_review(self) -> None:
        manifest, run_dir, candidate = self._run(
            "run_tua_report_regressed",
            candidate_system="Candidate includes expected answer 42",
        )
        self._write_comparison(run_dir, manifest, candidate, rewards=(0.6, 0.4, 1.0, 0.0, 0.0, 1.0))
        atomic_write_json(
            run_dir / "candidate-audits" / f"{candidate.candidate_id}.json",
            {
                "candidateId": candidate.candidate_id,
                "auditedTaskIds": ["train-1", "validation-1"],
                "findings": [
                    {"taskId": "train-1", "component": "system_prompt", "matchKind": "expected_answer"}
                ],
                "positiveConclusionBlocked": True,
            },
        )

        report = generate_and_save_run_report(run_dir)
        review = report["tuaReview"]

        self.assertEqual(review["promotion"]["status"], "not_recommended")
        self.assertIn("candidate_audit_blocked", review["promotion"]["reasonCodes"])
        self.assertIn("tua_holdout_candidate_not_better", review["promotion"]["reasonCodes"])
        self.assertTrue(review["promotion"]["checks"]["gaiaNoRegression"] is False)
        report_text = json.dumps(report, ensure_ascii=False)
        self.assertNotIn("expected answer 42", report_text)
        self.assertIn("candidate matched private benchmark content", report_text)

    def test_incomplete_cross_environment_evidence_is_not_recommended_for_promotion(self) -> None:
        manifest, run_dir, candidate = self._run("run_tua_report_incomplete")
        self.store.update_state(
            manifest.run_id,
            lifecycle_status="succeeded",
            best_candidate_id=candidate.candidate_id,
            publication_status="candidate_only",
        )
        atomic_write_json(
            run_dir / "candidate-audits" / f"{candidate.candidate_id}.json",
            {
                "candidateId": candidate.candidate_id,
                "auditedTaskIds": ["train-1", "validation-1"],
                "findings": [],
                "positiveConclusionBlocked": False,
            },
        )

        report = generate_and_save_run_report(run_dir)

        self.assertEqual(report["tuaReview"]["finalComparison"]["status"], "missing")
        self.assertEqual(report["tuaReview"]["promotion"]["status"], "evidence_insufficient")
        self.assertIn("gaia", report["tuaReview"]["coverage"]["uncoveredBenchmarks"])
        self.assertIn("alfworld", report["tuaReview"]["coverage"]["uncoveredBenchmarks"])

    def test_prompt_credentials_are_redacted_and_block_positive_review(self) -> None:
        manifest, run_dir, candidate = self._run(
            "run_tua_report_redacted",
            candidate_system="Candidate apiKey=sk-report-secret",
        )
        atomic_write_json(
            run_dir / "candidate-audits" / f"{candidate.candidate_id}.json",
            {
                "candidateId": candidate.candidate_id,
                "auditedTaskIds": ["train-1", "validation-1"],
                "findings": [],
                "positiveConclusionBlocked": False,
            },
        )

        report = generate_and_save_run_report(run_dir)
        encoded = json.dumps(report, ensure_ascii=False)

        self.assertEqual(report["tuaReview"]["prompt"]["status"], "redacted")
        self.assertEqual(report["tuaReview"]["promotion"]["status"], "evidence_insufficient")
        self.assertNotIn("sk-report-secret", encoded)
        self.assertIn("[REDACTED]", encoded)

    def _run(
        self,
        run_id: str,
        *,
        candidate_system: str = "Candidate system",
    ) -> tuple[FrozenRunManifest, Path, object]:
        profile_path = self.root / f"{run_id}-default.json"
        baseline = AgentProfileSnapshot(
            schema_version=1,
            id="default",
            name="Default Agent",
            description="Frozen baseline",
            system_prompt="Seed system",
            instructions=("Seed instruction",),
            tool_ids=("bash_exec",),
        )
        profile_raw = json.dumps(baseline.to_dict(), ensure_ascii=False)
        profile_path.write_text(profile_raw, encoding="utf-8")
        seed = CandidateCodec().decode(extract_seed_candidate(baseline))
        candidate = CandidateCodec().decode({
            "system_prompt": candidate_system,
            "instruction_000": "Seed instruction",
        })
        manifests = {}
        for benchmark in ("gaia", "alfworld"):
            path = self.root / f"{run_id}-{benchmark}.json"
            if benchmark == "gaia":
                value = {"benchmark": "gaia", "dataRoot": str(self.root), "tasks": [{"taskId": "gaia-1"}]}
            else:
                value = {"version": 1, "name": "report", "tasks": [{"taskId": "alfworld-1", "seed": 1}]}
            path.write_text(json.dumps(value), encoding="utf-8")
            manifests[benchmark] = str(path)
        request = parse_run_request(
            {
                "protocol": "gepa-run@1",
                "benchmark": "tua-bench",
                "maxMetricCalls": 10,
                "tuaDataset": {
                    "repoRoot": str(self.root),
                    "trainTaskIds": ["train-1"],
                    "validationTaskIds": ["validation-1"],
                    "holdoutTaskIds": ["holdout-1"],
                },
                "finalComparison": {
                    "tuaHoldoutTrials": 1,
                    "gaia": {"manifestPath": manifests["gaia"], "taskIds": ["gaia-1"], "trials": 1},
                    "alfworld": {"manifestPath": manifests["alfworld"], "taskIds": ["alfworld-1"], "trials": 1},
                },
                "publicationPolicy": "candidate-only",
            },
            check_manifests=False,
        )
        selected_ids = ("train-1", "validation-1", "holdout-1")
        task_facts = {
            task_id: {
                "taskId": task_id,
                "taskFamily": "document",
                "networkMode": "none",
                "agentTimeoutSec": 60,
                "verifierTimeoutSec": 60,
                "resourceDigest": "d" * 64,
                "imageDigest": "sha256:" + "e" * 64,
            }
            for task_id in selected_ids
        }
        inspection = {
            "sourceRevision": "b" * 40,
            "datasetDigest": "c" * 64,
            "workingTreeDirty": False,
            "changedPaths": [],
            "tasks": task_facts,
            "partitions": {
                "train": {"taskIds": ["train-1"], "taskFamilies": ["document"], "networkTasks": []},
                "validation": {"taskIds": ["validation-1"], "taskFamilies": ["document"], "networkTasks": []},
                "holdout": {"taskIds": ["holdout-1"], "taskFamilies": ["document"], "networkTasks": []},
            },
        }
        now = datetime.now(timezone.utc).isoformat()
        manifest = FrozenRunManifest(
            protocol="gepa-run@1",
            run_id=run_id,
            created_at=now,
            gepa_version=EXPECTED_GEPA_VERSION,
            request=request,
            target_profile=TargetProfileSnapshot(
                profile_id=baseline.id,
                profile_path=str(profile_path),
                frozen_digest=hashlib.sha256(profile_raw.encode()).hexdigest(),
                profile=baseline,
            ),
            seed_candidate=extract_seed_candidate(baseline),
            seed_candidate_id=seed.candidate_id,
            working_model=ModelIdentity(profile_name="default", model_id="test-model", provider="test"),
            reflection_model=ModelIdentity(profile_name="reflection", model_id="test-reflection", provider="test"),
            tua_dataset_inspection=inspection,
            preflight_input_digest="a" * 64,
        )
        run_dir = self.store.initialize_run(manifest)
        best_profile = AgentProfileSnapshot(
            schema_version=1,
            id=baseline.id,
            name=baseline.name,
            description=baseline.description,
            system_prompt=candidate_system,
            instructions=baseline.instructions,
            tool_ids=baseline.tool_ids,
        )
        atomic_write_json(run_dir / "artifacts" / "best-profile.json", best_profile.to_dict())
        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            metric_calls=8,
            candidate_count=2,
            best_score=0.8,
            best_candidate_id=candidate.candidate_id,
            publication_status="candidate_only",
        )
        atomic_write_json(
            run_dir / "candidate-audits" / f"{candidate.candidate_id}.json",
            {
                "candidateId": candidate.candidate_id,
                "auditedTaskIds": ["train-1", "validation-1"],
                "findings": [],
                "positiveConclusionBlocked": False,
            },
        )
        return manifest, run_dir, candidate

    def _write_comparison(
        self,
        run_dir: Path,
        manifest: FrozenRunManifest,
        candidate,
        *,
        rewards: tuple[float, float, float, float, float, float],
    ) -> None:
        root = run_dir / "final-comparison"
        root.mkdir()
        groups = []
        planned_groups = []
        task_sets = {"tua-bench": ["holdout-1"], "gaia": ["gaia-1"], "alfworld": ["alfworld-1"]}
        profiles = {"tua-bench": "tua-bench-worker-profile", "gaia": "gaia-worker-profile", "alfworld": "alfworld-profile"}
        reward_index = 0
        for benchmark_id, task_ids in task_sets.items():
            task_results = []
            planned_tasks = []
            for task_id in task_ids:
                trial_results = []
                for trial in (1,):
                    outcomes = {}
                    for variant, candidate_id in (("seed", manifest.seed_candidate_id), ("candidate", candidate.candidate_id)):
                        score = rewards[reward_index]
                        reward_index += 1
                        attempt_dir = root / "evaluations" / f"{benchmark_id}-{task_id}-{variant}"
                        attempt_dir.mkdir(parents=True)
                        result_file = attempt_dir / "result.json"
                        attempt_file = attempt_dir / "attempt.json"
                        usage = None if benchmark_id == "tua-bench" else {
                            "inputTokens": 10,
                            "outputTokens": 5,
                            "missingCalls": 0,
                        }
                        atomic_write_json(attempt_file, {
                            "benchmarkId": benchmark_id,
                            "taskId": task_id,
                            "usage": usage,
                            "promptEvaluation": {
                                "candidateId": candidate_id,
                                "modelConfigId": manifest.working_model.profile_name,
                                "modelId": manifest.working_model.model_id,
                            },
                        })
                        atomic_write_json(result_file, {
                            "benchmarkId": benchmark_id,
                            "candidateId": candidate_id,
                            "modelConfigId": manifest.working_model.profile_name,
                            "modelId": manifest.working_model.model_id,
                            "tasks": [{"taskId": task_id, "attemptPath": str(attempt_file)}],
                        })
                        status = "passed" if score >= 1.0 else "failed"
                        outcomes[variant] = {
                            "status": status,
                            "metricScore": score,
                            "attemptPath": str(result_file),
                            "durationMs": 100,
                            "attemptNumber": 1,
                            "errorCode": None,
                        }
                    trial_results.append({
                        "trial": trial,
                        "seed": outcomes["seed"],
                        "candidate": outcomes["candidate"],
                        "paired": True,
                        "scoreDelta": outcomes["candidate"]["metricScore"] - outcomes["seed"]["metricScore"],
                    })
                task_results.append({"taskId": task_id, "status": "completed", "reasonCode": None, "trials": trial_results})
                planned_tasks.append({"taskId": task_id, "manifestDigest": "f" * 64, "unavailableReason": None})
            groups.append({
                "benchmarkId": benchmark_id,
                "status": "completed",
                "plannedTaskIds": task_ids,
                "trialsPerCandidate": 1,
                "baseProfileId": profiles[benchmark_id],
                "reasonCodes": [],
                "tasks": task_results,
            })
            planned_groups.append({
                "benchmarkId": benchmark_id,
                "plannedTaskIds": task_ids,
                "trialsPerCandidate": 1,
                "baseProfileId": profiles[benchmark_id],
                "tasks": planned_tasks,
            })
        atomic_write_json(root / "plan.json", {
            "protocol": "gepa-final-comparison@1",
            "runId": manifest.run_id,
            "seedCandidateId": manifest.seed_candidate_id,
            "candidateId": candidate.candidate_id,
            "workingModel": manifest.working_model.to_dict(),
            "tuaHoldoutTrials": 1,
            "groups": planned_groups,
            "frozenInputDigest": manifest.preflight_input_digest,
        })
        atomic_write_json(root / "result.json", {
            "protocol": "gepa-final-comparison@1",
            "runId": manifest.run_id,
            "status": "completed",
            "candidateId": candidate.candidate_id,
            "seedCandidateId": manifest.seed_candidate_id,
            "model": manifest.working_model.to_dict(),
            "frozenInputDigest": manifest.preflight_input_digest,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "reasonCodes": [],
            "groups": groups,
        })


if __name__ == "__main__":
    unittest.main()
