"""Deterministic offline tests for authoritative status and final run reports."""

from __future__ import annotations

import hashlib
import json
import os
import signal
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    _fingerprint,
    extract_seed_candidate,
)
from lazygoal_gepa.cli import main as cli_main
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
from lazygoal_gepa.controller import (
    LifecycleController,
    ReportNotReadyError,
)
from lazygoal_gepa.errors import RunStoreError
from lazygoal_gepa.protocol import GEPARunRequest, parse_run_request
from lazygoal_gepa.reporter import (
    generate_and_save_run_report,
    read_run_report,
)
from lazygoal_gepa.store import RunStore, atomic_write_json


class LifecycleReportTests(unittest.TestCase):
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

        self.spawned_pids: list[int] = []

    def tearDown(self) -> None:
        for pid in self.spawned_pids:
            try:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)
            except OSError:
                pass
        self.temp_dir.cleanup()

    def _create_helper_manifest(
        self,
        run_id: str,
        max_metric_calls: int = 10,
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

    def test_report_rejected_when_run_is_not_terminal(self) -> None:
        """Verify report raises ReportNotReadyError when run is starting or running."""
        run_id = "run_test_report_not_ready"
        manifest = self._create_helper_manifest(run_id)
        self.store.initialize_run(manifest)

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        for non_terminal_status in ("starting", "running", "stop_requested"):
            self.store.update_state(run_id, lifecycle_status=non_terminal_status)  # type: ignore
            with self.assertRaises(ReportNotReadyError):
                controller.report(run_id)

            # Test CLI behavior as well
            code = cli_main(["report", "--run", run_id, "--runs-dir", str(self.runs_dir)])
            self.assertEqual(code, 1)

    def test_report_full_schema_contract_for_succeeded_run(self) -> None:
        """Verify full schema contract, types, and sensitive credential redaction."""
        run_id = "run_test_report_succeeded"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=20)
        run_dir = self.store.initialize_run(manifest)

        # 准备 best profile artifact
        best_snapshot = AgentProfileSnapshot(
            schema_version=1,
            id="default",
            name="Default Agent",
            description="Best evolved agent",
            system_prompt="Evolved system prompt",
            instructions=("Evolved instruction 1", "Evolved instruction 2"),
            tool_ids=("fs_read", "fs_write"),
        )
        atomic_write_json(
            run_dir / "artifacts" / "best-profile.json",
            best_snapshot.to_dict(),
        )

        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            metric_calls=12,
            candidate_count=5,
            best_score=0.95,
            best_candidate_id="c_best_12345",
            publication_status="published",
        )

        generate_and_save_run_report(run_dir)

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )
        report = controller.report(run_id)

        # 1. 协议与基本标识
        self.assertEqual(report["protocol"], "gepa-run@1")
        self.assertEqual(report["runId"], run_id)
        self.assertEqual(report["terminalStatus"], "succeeded")
        self.assertEqual(report["benchmark"], "alfworld")

        # 2. 预算统计
        self.assertIn("budget", report)
        self.assertEqual(report["budget"]["maxMetricCalls"], 20)
        self.assertEqual(report["budget"]["consumedMetricCalls"], 12)

        # 3. 候选与分数
        self.assertIn("candidates", report)
        self.assertEqual(report["candidates"]["totalCandidates"], 5)
        self.assertEqual(report["candidates"]["bestCandidateId"], "c_best_12345")
        self.assertEqual(report["candidates"]["seedCandidateId"], manifest.seed_candidate_id)

        self.assertIn("scores", report)
        self.assertEqual(report["scores"]["bestScore"], 0.95)
        self.assertNotIn("seedScore", report["scores"])
        self.assertNotIn("scoreGain", report["scores"])
        self.assertTrue(report["complete"])

        # 4. 关键产物路径
        self.assertIn("artifacts", report)
        self.assertTrue(Path(report["artifacts"]["baseProfilePath"]).is_file())
        self.assertTrue(Path(report["artifacts"]["bestProfilePath"]).is_file())
        self.assertTrue(Path(report["artifacts"]["reportPath"]).is_file())

        # 5. 模型身份脱敏断言
        self.assertIn("models", report)
        self.assertEqual(report["models"]["working"]["profileName"], "default")
        self.assertEqual(report["models"]["reflection"]["profileName"], "gepa-reflection")

        report_raw = json.dumps(report)
        self.assertNotIn("apiKey", report_raw)
        self.assertNotIn("sk-", report_raw)
        self.assertNotIn("Bearer", report_raw)
        self.assertNotIn("thinking", report_raw)

        # 6. 时间戳与耗时
        self.assertIn("timestamps", report)
        self.assertTrue(report["timestamps"]["startedAt"])
        self.assertTrue(report["timestamps"]["completedAt"])
        self.assertGreaterEqual(report["timestamps"]["durationSeconds"], 0.0)

    def test_succeeded_with_pending_publication_is_not_complete(self) -> None:
        """Optimization success must not be reported as complete before publication."""
        run_id = "run_test_report_publication_pending"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            best_score=0.75,
            best_candidate_id="c_best_pending",
            publication_status="pending",
        )

        generate_and_save_run_report(run_dir)
        report = read_run_report(run_dir)

        self.assertEqual(report["terminalStatus"], "succeeded")
        self.assertEqual(report["publication"]["status"], "pending")
        self.assertFalse(report["complete"])
        self.assertEqual(report["scores"], {"bestScore": 0.75})

    def test_report_structure_for_stopped_run(self) -> None:
        """Verify stopped terminal run report has terminalStatus=stopped and pending publication."""
        run_id = "run_test_report_stopped"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=20)
        run_dir = self.store.initialize_run(manifest)

        self.store.update_state(
            run_id,
            lifecycle_status="stopped",
            stop_requested=True,
            metric_calls=4,
            candidate_count=2,
            best_score=0.5,
            best_candidate_id="c_cand_01",
        )

        generate_and_save_run_report(run_dir)

        report = read_run_report(run_dir)
        self.assertEqual(report["terminalStatus"], "stopped")
        self.assertEqual(report["budget"]["consumedMetricCalls"], 4)
        self.assertEqual(report["publication"]["status"], "pending")
        self.assertIsNone(report["error"])

    def test_report_structure_for_failed_run(self) -> None:
        """Verify failed terminal run report contains structured error object."""
        run_id = "run_test_report_failed"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        self.store.update_state(
            run_id,
            lifecycle_status="failed",
            error_code="evaluation_failed",
            error_message=(
                "Subprocess crashed on sample-01 with Authorization: Bearer "
                "sk-proj-secret123 and apiKey=provider-secret"
            ),
        )

        generate_and_save_run_report(run_dir)

        report = read_run_report(run_dir)
        self.assertEqual(report["terminalStatus"], "failed")
        self.assertIsNotNone(report["error"])
        self.assertEqual(report["error"]["code"], "evaluation_failed")
        # 验证敏感凭据在错误文本中被脱敏
        self.assertNotIn("sk-proj-secret123", report["error"]["message"])
        self.assertNotIn("provider-secret", report["error"]["message"])
        self.assertNotIn("apiKey", json.dumps(report))
        self.assertIn("[REDACTED]", report["error"]["message"])
        self.assertLessEqual(len(report["error"]["message"]), 4_096)

    def test_report_schema_is_validated_and_rejects_fabricated_fields(self) -> None:
        """A report with missing required fields or fictional score fields is corrupted."""
        run_id = "run_test_report_schema"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")
        generate_and_save_run_report(run_dir)

        report_file = run_dir / "artifacts" / "report.json"
        report = json.loads(report_file.read_text(encoding="utf-8"))
        report.pop("protocol")
        report_file.write_text(json.dumps(report), encoding="utf-8")
        with self.assertRaises(RunStoreError) as missing_protocol:
            read_run_report(run_dir)
        self.assertEqual(missing_protocol.exception.code, "corrupted")

        report = json.loads(report_file.read_text(encoding="utf-8"))
        report["protocol"] = "gepa-run@1"
        report["scores"]["seedScore"] = 0.0
        report_file.write_text(json.dumps(report), encoding="utf-8")
        with self.assertRaises(RunStoreError) as fictional_score:
            read_run_report(run_dir)
        self.assertEqual(fictional_score.exception.code, "corrupted")

    def test_report_file_present_while_run_is_running_is_not_accepted(self) -> None:
        """An early artifact cannot turn a running run into a reportable terminal run."""
        run_id = "run_test_report_early_artifact"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")
        report_file = run_dir / "artifacts" / "report.json"
        report_file.write_text(json.dumps({"protocol": "gepa-run@1"}), encoding="utf-8")

        with self.assertRaises(ReportNotReadyError):
            read_run_report(run_dir)

    def test_report_missing_or_corrupted_artifact_raises_corrupted(self) -> None:
        """Verify corrupted/unformed exceptions when report artifact is missing or bad JSON."""
        run_id = "run_test_report_corrupt"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="succeeded")

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        # 场景 A: 终态已达成，但 report.json 缺失
        with self.assertRaises(RunStoreError) as ctx1:
            controller.report(run_id)
        self.assertEqual(ctx1.exception.code, "corrupted")

        # 场景 B: report.json 存在但内容损坏
        report_file = run_dir / "artifacts" / "report.json"
        report_file.parent.mkdir(parents=True, exist_ok=True)
        report_file.write_text("{invalid json", encoding="utf-8")

        with self.assertRaises(RunStoreError) as ctx2:
            controller.report(run_id)
        self.assertEqual(ctx2.exception.code, "corrupted")

        # 场景 C: Run 目录完全不存在
        with self.assertRaises(RunStoreError) as ctx3:
            controller.report("run_non_existent")
        self.assertEqual(ctx3.exception.code, "unformed")

    def test_report_when_worker_is_lost(self) -> None:
        """Verify that a running run with dead PID raises ReportNotReadyError."""
        run_id = "run_test_report_worker_lost"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        # 伪造一个已死去的 PID 写入 owner.json
        owner_file = run_dir / "owner.json"
        dead_pid = 999999
        owner_data = {
            "pid": dead_pid,
            "workerToken": "token-lost",
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "heartbeatAt": datetime.now(timezone.utc).isoformat(),
        }
        atomic_write_json(owner_file, owner_data)

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        with self.assertRaises(ReportNotReadyError):
            controller.report(run_id)


if __name__ == "__main__":
    unittest.main()
