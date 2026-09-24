"""Deterministic offline tests for worker orchestration, callbacks, and GEPA loop."""

from __future__ import annotations

import hashlib
import json
import os
import signal
import sys
import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

from lazygoal_gepa.adapter import LazyGoalGEPAAdapter
from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    _fingerprint,
    extract_seed_candidate,
)
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
from lazygoal_gepa.errors import PromptEvaluationInfrastructureError
from lazygoal_gepa.ownership import RunOwnership, is_pid_alive
from lazygoal_gepa.protocol import GEPAExampleRequest, GEPARunRequest, parse_run_request
from lazygoal_gepa.reporter import generate_and_save_run_report, read_run_report
from lazygoal_gepa.store import RunStore
from lazygoal_gepa.worker import (
    ReflectionExecutionError,
    ReflectionLMClient,
    WorkerProgressCallback,
    run_gepa_worker,
)


class WorkerOrchestrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.workspace_root = self.root / "workspace"
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.runs_dir = self.root / "test-runs" / "gepa"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.store = RunStore(self.runs_dir)

        # 准备 default.json profile
        self.profile_dir = self.root / "agent-profiles"
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        self.profile_path = self.profile_dir / "default.json"
        self.profile_data = {
            "schemaVersion": 1,
            "id": "default",
            "name": "Default Agent",
            "description": "Deterministic Assistant for Lifecycle Testing",
            "systemPrompt": "You are a dependable test assistant.",
            "instructions": [
                "Follow all explicit rules.",
                "Maintain complete deterministic outputs.",
            ],
            "toolIds": ["fs_read", "fs_write"],
        }
        self.profile_raw = json.dumps(self.profile_data, indent=2, ensure_ascii=False)
        self.profile_path.write_text(self.profile_raw, encoding="utf-8")
        self.profile_digest = hashlib.sha256(self.profile_raw.encode("utf-8")).hexdigest()

        # 准备 task manifest
        self.manifest_path = self.workspace_root / "task_manifest.json"
        self.manifest_data = {
            "benchmark": "alfworld",
            "tasks": [{"taskId": "task-clean-001", "benchmark": "alfworld"}],
        }
        self.manifest_path.write_text(json.dumps(self.manifest_data), encoding="utf-8")

        # 准备 fake CLI path
        import shutil
        self.fake_cli = self.workspace_root / "lazygoal"
        fixture = Path(__file__).parent / "fixtures" / "fake_lazygoal.py"
        shutil.copyfile(fixture, self.fake_cli)
        self.fake_cli.chmod(0o755)

        self.spawned_pids: list[int] = []

    def tearDown(self) -> None:
        for pid in self.spawned_pids:
            if is_pid_alive(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                except OSError:
                    pass
        self.temp_dir.cleanup()

    def _track_pid(self, pid: int) -> int:
        self.spawned_pids.append(pid)
        return pid

    def _create_helper_manifest(
        self,
        run_id: str,
        max_metric_calls: int = 4,
    ) -> FrozenRunManifest:
        req_data = {
            "protocol": "gepa-run@1",
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "sample-01",
                    "taskId": "task-clean-001",
                    "manifestPath": str(self.manifest_path),
                }
            ],
            "maxMetricCalls": max_metric_calls,
            "reflectionMinibatchSize": 1,
        }
        req = parse_run_request(req_data, check_manifests=False)
        snapshot = AgentProfileSnapshot(
            schema_version=self.profile_data["schemaVersion"],
            id=self.profile_data["id"],
            name=self.profile_data["name"],
            description=self.profile_data["description"],
            system_prompt=self.profile_data["systemPrompt"],
            instructions=tuple(self.profile_data["instructions"]),
            tool_ids=tuple(self.profile_data["toolIds"]),
        )
        seed = extract_seed_candidate(snapshot)
        now_str = datetime.now(timezone.utc).isoformat()
        return FrozenRunManifest(
            protocol="gepa-run@1",
            run_id=run_id,
            created_at=now_str,
            gepa_version=EXPECTED_GEPA_VERSION,
            request=req,
            target_profile=TargetProfileSnapshot(
                profile_id=snapshot.id,
                profile_path=str(self.profile_path),
                frozen_digest=self.profile_digest,
                profile=snapshot,
            ),
            seed_candidate=seed,
            seed_candidate_id=_fingerprint(snapshot.system_prompt, snapshot.instructions),
            working_model=ModelIdentity(profile_name="default", model_id="default"),
            reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection"),
        )

    def test_worker_full_optimization_cycle_offline(self) -> None:
        """Verify worker runs official gepa.optimize end-to-end and marks succeeded."""
        run_id = "run_test_worker_success"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=3)
        run_dir = self.store.initialize_run(manifest)

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "```\nYou are an improved test assistant.\n```",
            },
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 0)

        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "succeeded")
        self.assertEqual(state.publication_status, "published")
        self.assertGreaterEqual(state.candidate_count, 1)

        # Check official GEPA checkpoint exists
        checkpoint_file = run_dir / "gepa" / "gepa_state.bin"
        self.assertTrue(checkpoint_file.is_file())

        # Check report generated
        report = read_run_report(run_dir)
        self.assertEqual(report["terminalStatus"], "succeeded")
        self.assertEqual(report["runId"], run_id)
        self.assertIn("models", report)
        self.assertIn("budget", report)

        # Check best profile created
        best_profile_path = run_dir / "artifacts" / "best-profile.json"
        self.assertTrue(best_profile_path.is_file())
        published_profile = json.loads(self.profile_path.read_text(encoding="utf-8"))
        self.assertEqual(published_profile["systemPrompt"], "You are an improved test assistant.")
        self.assertEqual(published_profile["instructions"], self.profile_data["instructions"])

        # Check ownership lock released
        health, owner = RunOwnership(run_dir).check_health()
        self.assertEqual(health, "none")

    def test_worker_forwards_request_reflection_minibatch_size(self) -> None:
        """Worker forwards reflection_minibatch_size directly from request without benchmark defaults."""
        run_id = "run_test_generic_defaults"
        request = GEPARunRequest(
            protocol="gepa-run@1",
            benchmark="custom-benchmark",
            trainset=(GEPAExampleRequest("train", "task-train", str(self.manifest_path)),),
            valset=(GEPAExampleRequest("val", "task-val", str(self.manifest_path)),),
            max_metric_calls=4,
            reflection_minibatch_size=None,
            seed=None,
        )
        snapshot = AgentProfileSnapshot(
            schema_version=self.profile_data["schemaVersion"],
            id=self.profile_data["id"],
            name=self.profile_data["name"],
            description=self.profile_data["description"],
            system_prompt=self.profile_data["systemPrompt"],
            instructions=tuple(self.profile_data["instructions"]),
            tool_ids=tuple(self.profile_data["toolIds"]),
        )
        run_dir = self.store.initialize_run(FrozenRunManifest(
            protocol="gepa-run@1",
            run_id=run_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            gepa_version=EXPECTED_GEPA_VERSION,
            request=request,
            target_profile=TargetProfileSnapshot(
                profile_id=snapshot.id,
                profile_path=str(self.profile_path),
                frozen_digest=self.profile_digest,
                profile=snapshot,
            ),
            seed_candidate=extract_seed_candidate(snapshot),
            seed_candidate_id=_fingerprint(snapshot.system_prompt, snapshot.instructions),
            working_model=ModelIdentity(profile_name="default", model_id="default"),
            reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection"),
        ))
        captured: dict[str, object] = {}

        def capture_optimize(**kwargs):
            captured.update(kwargs)
            raise RuntimeError("stop after inspecting worker configuration")

        with (
            patch.dict(os.environ, {"LAZYGOAL_EXECUTABLE": str(self.fake_cli)}),
            patch("lazygoal_gepa.worker.gepa.optimize", side_effect=capture_optimize),
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 1)
        self.assertEqual(captured["seed"], 0)
        self.assertIsNone(captured["reflection_minibatch_size"])
        self.assertEqual(captured["max_metric_calls"], 4)
        self.assertEqual(captured["module_selector"], "round_robin")

    def test_tua_worker_selects_all_prompt_components_in_each_gepa_proposal(self) -> None:
        run_id = "run_test_tua_all_components"
        manifest = self._create_tua_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        captured: dict[str, object] = {}

        def capture_optimize(**kwargs):
            captured.update(kwargs)
            raise RuntimeError("stop after inspecting worker configuration")

        with (
            patch.dict(os.environ, {"LAZYGOAL_EXECUTABLE": str(self.fake_cli)}),
            patch("lazygoal_gepa.worker.gepa.optimize", side_effect=capture_optimize),
            patch("lazygoal_gepa.worker.TuaCandidateLeakAuditor") as auditor_factory,
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 1)
        self.assertEqual(captured["module_selector"], "all")
        self.assertEqual(captured["seed"], 0)
        self.assertEqual(auditor_factory.call_args.kwargs["task_ids"], ("train-doc", "validation-doc"))

    def test_tua_report_blocks_a_best_candidate_with_private_literal_findings(self) -> None:
        run_id = "run_test_tua_audit_report"
        manifest = self._create_tua_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        candidate_id = manifest.seed_candidate_id
        audit_directory = run_dir / "candidate-audits"
        audit_directory.mkdir()
        (audit_directory / f"{candidate_id}.json").write_text(json.dumps({
            "candidateId": candidate_id,
            "auditedTaskIds": ["train-doc", "validation-doc"],
            "findings": [{
                "taskId": "train-doc",
                "component": "instruction_000",
                "matchKind": "expected_answer",
            }],
            "positiveConclusionBlocked": True,
        }), encoding="utf-8")
        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            candidate_count=1,
            best_candidate_id=candidate_id,
            best_score=0.5,
            publication_status="pending",
        )

        generate_and_save_run_report(run_dir)
        report = read_run_report(run_dir)

        self.assertEqual(report["candidateAudit"]["status"], "blocked")
        self.assertTrue(report["candidateAudit"]["positiveConclusionBlocked"])
        self.assertEqual(report["candidateAudit"]["findings"], [{
            "taskId": "train-doc",
            "component": "instruction_000",
            "matchKind": "expected_answer",
        }])
        self.assertNotIn("private answer", json.dumps(report))

    def _create_tua_helper_manifest(self, run_id: str) -> FrozenRunManifest:
        task_ids = {
            "train": ("train-doc",),
            "validation": ("validation-doc",),
            "holdout": ("holdout-doc",),
        }
        inspection_tasks = {
            task_id: {
                "taskId": task_id,
                "taskFamily": "document",
                "networkMode": "none",
                "agentTimeoutSec": 600,
                "verifierTimeoutSec": 600,
                "resourceDigest": "d" * 64,
                "imageDigest": "sha256:" + "e" * 64,
            }
            for ids in task_ids.values()
            for task_id in ids
        }
        inspection = {
            "sourceRevision": "b" * 40,
            "datasetDigest": "c" * 64,
            "workingTreeDirty": False,
            "changedPaths": [],
            "tasks": inspection_tasks,
            "partitions": {
                partition: {
                    "taskIds": list(ids),
                    "taskFamilies": ["document"],
                    "networkTasks": [],
                }
                for partition, ids in task_ids.items()
            },
        }
        request = parse_run_request({
            "protocol": "gepa-run@1",
            "benchmark": "tua-bench",
            "trainset": [{
                "sampleId": "train-sample",
                "taskId": "train-doc",
                "manifestPath": str(self.manifest_path),
            }],
            "valset": [{
                "sampleId": "validation-sample",
                "taskId": "validation-doc",
                "manifestPath": str(self.manifest_path),
            }],
            "tuaDataset": {
                "repoRoot": str(self.workspace_root),
                "trainTaskIds": list(task_ids["train"]),
                "validationTaskIds": list(task_ids["validation"]),
                "holdoutTaskIds": list(task_ids["holdout"]),
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
            "maxMetricCalls": 4,
            "reflectionMinibatchSize": 1,
        }, check_manifests=False)
        snapshot = AgentProfileSnapshot(
            schema_version=self.profile_data["schemaVersion"],
            id=self.profile_data["id"],
            name=self.profile_data["name"],
            description=self.profile_data["description"],
            system_prompt=self.profile_data["systemPrompt"],
            instructions=tuple(self.profile_data["instructions"]),
            tool_ids=tuple(self.profile_data["toolIds"]),
        )
        return FrozenRunManifest(
            protocol="gepa-run@1",
            run_id=run_id,
            created_at=datetime.now(timezone.utc).isoformat(),
            gepa_version=EXPECTED_GEPA_VERSION,
            request=request,
            target_profile=TargetProfileSnapshot(
                profile_id=snapshot.id,
                profile_path=str(self.profile_path),
                frozen_digest=self.profile_digest,
                profile=snapshot,
            ),
            seed_candidate=extract_seed_candidate(snapshot),
            seed_candidate_id=_fingerprint(snapshot.system_prompt, snapshot.instructions),
            working_model=ModelIdentity(profile_name="default", model_id="default"),
            reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection"),
            tua_dataset_inspection=inspection,
        )

    def test_worker_records_unchanged_publication(self) -> None:
        """A seed-only result is complete without rewriting the target Profile."""
        run_id = "run_test_worker_unchanged"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=1)
        run_dir = self.store.initialize_run(manifest)

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "unused",
            },
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 0)
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "succeeded")
        self.assertEqual(state.publication_status, "unchanged")
        self.assertEqual(self.profile_path.read_text(encoding="utf-8"), self.profile_raw)
        self.assertTrue(read_run_report(run_dir)["complete"])

    def test_worker_publish_conflict_preserves_external_profile(self) -> None:
        """External edits block publication while retaining the best Profile artifact."""
        run_id = "run_test_worker_publish_conflict"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=3)
        run_dir = self.store.initialize_run(manifest)
        external_profile = dict(self.profile_data)
        external_profile["description"] = "Edited while optimization was running"
        self.profile_path.write_text(json.dumps(external_profile), encoding="utf-8")
        external_bytes = self.profile_path.read_bytes()

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "```\nYou are an improved test assistant.\n```",
            },
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 1)
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "publish_blocked")
        self.assertEqual(state.publication_status, "blocked")
        self.assertEqual(state.error_code, "publish_conflict")
        self.assertEqual(self.profile_path.read_bytes(), external_bytes)
        self.assertTrue((run_dir / "artifacts" / "best-profile.json").is_file())
        report = read_run_report(run_dir)
        self.assertEqual(report["publication"]["status"], "blocked")
        self.assertFalse(report["complete"])

    def test_worker_progress_and_heartbeat_projection(self) -> None:
        """Verify callback updates heartbeat in owner.json and projects metrics to state.json."""
        run_id = "run_test_callback"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=10)
        run_dir = self.store.initialize_run(manifest)

        ownership = RunOwnership(run_dir)
        ownership.acquire()

        try:
            callback = WorkerProgressCallback(
                run_id=run_id,
                store=self.store,
                ownership=ownership,
            )

            # 模拟 BudgetUpdatedEvent
            budget_event = {"iteration": 1, "metric_calls_used": 5}
            callback.on_budget_updated(budget_event)  # type: ignore

            state = self.store.read_state(run_id)
            self.assertEqual(state.metric_calls, 5)

            # 验证 owner 心跳更新
            _, owner = ownership.check_health()
            self.assertIsNotNone(owner)
            first_hb = owner.heartbeat_at

            time.sleep(0.01)
            # 模拟 IterationEndEvent
            mock_gepa_state = MagicMock()
            mock_gepa_state.total_num_evals = 7
            mock_gepa_state.program_candidates = [{"system_prompt": "s", "instruction_000": "i"}]
            mock_gepa_state.program_full_scores_val_set = [0.85]

            iter_event = {"iteration": 1, "state": mock_gepa_state, "proposal_accepted": True}
            callback.on_iteration_end(iter_event)  # type: ignore

            state = self.store.read_state(run_id)
            self.assertEqual(state.metric_calls, 7)
            self.assertEqual(state.candidate_count, 1)
            self.assertEqual(state.best_score, 0.85)

            _, owner2 = ownership.check_health()
            self.assertIsNotNone(owner2)
            self.assertGreaterEqual(owner2.heartbeat_at, first_hb)
        finally:
            ownership.release()

    def test_worker_cooperative_stop_via_marker(self) -> None:
        """Verify worker stops cooperatively when gepa.stop is present, preserving checkpoint."""
        run_id = "run_test_worker_stop"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=20)
        run_dir = self.store.initialize_run(manifest)

        # 写入停止标记
        self.store.request_stop(run_id)

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "```\nmutated\n```",
            },
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 0)

        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "stopped")
        self.assertTrue(state.stop_requested)

        # 确保 checkpoint 产生
        checkpoint_file = run_dir / "gepa" / "gepa_state.bin"
        self.assertTrue(checkpoint_file.is_file())

        report = read_run_report(run_dir)
        self.assertEqual(report["terminalStatus"], "stopped")
        self.assertEqual(report["publication"]["status"], "pending")

        # 锁已释放
        health, _ = RunOwnership(run_dir).check_health()
        self.assertEqual(health, "none")

    def test_worker_evaluation_failure_isolation(self) -> None:
        """Verify evaluation infrastructure error transitions state to failed and saves report."""
        run_id = "run_test_worker_eval_fail"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=5)
        run_dir = self.store.initialize_run(manifest)

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "infrastructure",
            },
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 1)

        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "failed")
        self.assertEqual(state.error_code, "evaluation_failed")
        self.assertEqual(self.profile_path.read_text(encoding="utf-8"), self.profile_raw)

        report = read_run_report(run_dir)
        self.assertEqual(report["terminalStatus"], "failed")
        self.assertEqual(report["error"]["code"], "evaluation_failed")

        health, _ = RunOwnership(run_dir).check_health()
        self.assertEqual(health, "none")

    def test_stop_marker_does_not_hide_evaluation_failure(self) -> None:
        """A stop request cannot turn a pre-checkpoint evaluation error into stopped."""
        run_id = "run_test_worker_stop_with_eval_failure"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=5)
        run_dir = self.store.initialize_run(manifest)
        self.store.request_stop(run_id)

        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "infrastructure",
            },
        ):
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code, 1)
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "failed")
        self.assertEqual(state.error_code, "evaluation_failed")
        self.assertEqual(state.publication_status, "pending")
        self.assertEqual(self.profile_path.read_text(encoding="utf-8"), self.profile_raw)

    def test_worker_acquire_lock_failure(self) -> None:
        """Verify worker handles acquire failure cleanly when another worker holds lock."""
        run_id = "run_test_worker_contention"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=5)
        run_dir = self.store.initialize_run(manifest)

        # 抢占锁模拟并发竞争
        primary_ownership = RunOwnership(run_dir)
        primary_ownership.acquire()

        try:
            code = run_gepa_worker(run_dir, workspace_root=self.workspace_root)
            self.assertEqual(code, 1)

            state = self.store.read_state(run_id)
            self.assertEqual(state.lifecycle_status, "failed")
            self.assertEqual(state.error_code, "worker_acquire_failed")
        finally:
            primary_ownership.release()


if __name__ == "__main__":
    unittest.main()
