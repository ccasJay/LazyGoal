"""Deterministic tests for Checkpoint resume, preflight checks, and drift detection."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
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
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
from lazygoal_gepa.controller import (
    ConfirmationRequiredError,
    LifecycleController,
    ProfileDriftError,
    resume_run,
)
from lazygoal_gepa.errors import (
    ConfigurationError,
    GEPARunProtocolError,
    RunStoreError,
    WorkerAlreadyRunningError,
)
from lazygoal_gepa.ownership import OwnerInfo, RunOwnership, is_pid_alive
from lazygoal_gepa.protocol import GEPARunRequest, parse_run_request
from lazygoal_gepa.store import RunStore, atomic_write_json
from lazygoal_gepa.worker import run_gepa_worker


class LifecycleResumeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.workspace_root = self.root / "workspace"
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.runs_dir = self.workspace_root / ".lazygoal" / "gepa" / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.store = RunStore(self.runs_dir)

        # 准备 default.json profile
        self.profile_dir = self.workspace_root / ".lazygoal" / "profiles"
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

        # 准备 fake CLI
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
        max_metric_calls: int = 6,
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

    def test_resume_from_checkpoint_advances_optimization(self) -> None:
        """Verify resume clears gepa.stop, loads existing checkpoint, and finishes optimization."""
        run_id = "run_test_resume_success"
        manifest = self._create_helper_manifest(run_id, max_metric_calls=6)
        run_dir = self.store.initialize_run(manifest)

        # Phase 1: 预先写入 gepa.stop，让首次 worker 执行基础评估后协作停止并保存 checkpoint
        self.store.request_stop(run_id)

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
        state_phase1 = self.store.read_state(run_id)
        self.assertEqual(state_phase1.lifecycle_status, "stopped")
        cand_count_1 = state_phase1.candidate_count

        checkpoint_file = run_dir / "gepa" / "gepa_state.bin"
        self.assertTrue(checkpoint_file.is_file())
        self.assertTrue(self.store.has_stop_request(run_id))

        # Phase 2: 调用 controller.resume
        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        with patch("lazygoal_gepa.controller.launch_detached_worker") as mock_launch:
            mock_launch.return_value = 99999
            resume_result = controller.resume(run_id, yes=True)

        self.assertEqual(resume_result["runId"], run_id)
        self.assertEqual(resume_result["lifecycleStatus"], "starting")
        self.assertFalse(self.store.has_stop_request(run_id))

        # Phase 3: 新 Worker 接入该目录继续运行（无 stop request）
        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "```\nYou are an improved test assistant.\n```",
            },
        ):
            code2 = run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        self.assertEqual(code2, 0)
        state_phase2 = self.store.read_state(run_id)
        self.assertEqual(state_phase2.lifecycle_status, "succeeded")
        self.assertGreaterEqual(state_phase2.candidate_count, cand_count_1)
        self.assertEqual(state_phase2.best_score, 1.0)

    def test_resume_rejected_when_target_profile_drifted(self) -> None:
        """Verify resume fails with ProfileDriftError if default.json changed."""
        run_id = "run_test_resume_drift"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 准备已停止且具有 checkpoint 的状态
        self.store.update_state(run_id, lifecycle_status="stopped")
        checkpoint_dir = run_dir / "gepa"
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
        # 运行一次生成合法 checkpoint
        self.store.request_stop(run_id)
        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "```\nmutated\n```",
            },
        ):
            run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        # 场景 A: 修改 profile 内容
        self.profile_path.write_text(
            json.dumps({**self.profile_data, "description": "Mutated Externally"}),
            encoding="utf-8",
        )
        with self.assertRaises(ProfileDriftError):
            controller.resume(run_id, yes=True)

        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "stopped")

        # 场景 B: 仅修改空行或缩进
        self.profile_path.write_text(
            self.profile_raw + "\n\n",
            encoding="utf-8",
        )
        with self.assertRaises(ProfileDriftError):
            controller.resume(run_id, yes=True)

        # 场景 C: profile 文件被删除
        self.profile_path.unlink()
        with self.assertRaises(ProfileDriftError):
            controller.resume(run_id, yes=True)

    def test_resume_rejected_when_worker_is_alive(self) -> None:
        """Verify resume fails with WorkerAlreadyRunningError if worker process is active."""
        run_id = "run_test_resume_alive"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")

        checkpoint_file = run_dir / "gepa" / "gepa_state.bin"
        checkpoint_file.parent.mkdir(parents=True, exist_ok=True)
        checkpoint_file.write_bytes(b"dummy")

        # 持有锁模拟存活进程
        ownership = RunOwnership(run_dir)
        ownership.acquire()

        try:
            controller = LifecycleController(
                workspace_root=self.workspace_root,
                runs_dir=self.runs_dir,
                profile_path=self.profile_path,
            )
            with self.assertRaises(WorkerAlreadyRunningError) as ctx:
                controller.resume(run_id, yes=True)

            self.assertEqual(ctx.exception.pid, os.getpid())
            state = self.store.read_state(run_id)
            self.assertEqual(state.lifecycle_status, "stopped")
        finally:
            ownership.release()

    def test_resume_rejected_when_run_already_terminal(self) -> None:
        """Verify resume fails on succeeded or publish_blocked runs."""
        run_id = "run_test_resume_terminal"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        # 场景 1: succeeded
        self.store.update_state(run_id, lifecycle_status="succeeded")
        with self.assertRaises(GEPARunProtocolError) as ctx:
            controller.resume(run_id, yes=True)
        self.assertIn("already succeeded", str(ctx.exception))

        # 场景 2: publish_blocked
        self.store.update_state(run_id, lifecycle_status="publish_blocked")
        with self.assertRaises(GEPARunProtocolError) as ctx2:
            controller.resume(run_id, yes=True)
        self.assertIn("publish_blocked", str(ctx2.exception))

    def test_resume_rejected_without_confirmation(self) -> None:
        """Verify resume fails when yes=False."""
        run_id = "run_test_resume_no_yes"
        manifest = self._create_helper_manifest(run_id)
        self.store.initialize_run(manifest)

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )
        with self.assertRaises(ConfirmationRequiredError):
            controller.resume(run_id, yes=False)

    def test_resume_rejected_when_checkpoint_missing_or_corrupted(self) -> None:
        """Verify resume fails when official checkpoint is missing or corrupt."""
        run_id = "run_test_resume_checkpoint"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )

        # 场景 1: checkpoint 缺失
        gepa_dir = run_dir / "gepa"
        checkpoint_file = gepa_dir / "gepa_state.bin"
        if checkpoint_file.exists():
            checkpoint_file.unlink()

        with self.assertRaises(RunStoreError) as ctx1:
            controller.resume(run_id, yes=True)
        self.assertEqual(ctx1.exception.code, "checkpoint_failed")

        # 场景 2: checkpoint 损坏（0 字节）
        checkpoint_file.write_bytes(b"")
        with self.assertRaises(RunStoreError) as ctx2:
            controller.resume(run_id, yes=True)
        self.assertEqual(ctx2.exception.code, "checkpoint_corrupted")

    def test_resume_rejected_when_model_identity_drifted(self) -> None:
        """Verify resume fails with ConfigurationError if models differ from frozen manifest."""
        run_id = "run_test_resume_model_drift"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")

        # 制造合法 checkpoint
        self.store.request_stop(run_id)
        with patch.dict(
            os.environ,
            {
                "LAZYGOAL_EXECUTABLE": str(self.fake_cli),
                "LAZYGOAL_GEPA_FAKE_MODE": "score_if_improved",
                "LAZYGOAL_GEPA_FAKE_REFLECTION_TEXT": "```\nmutated\n```",
            },
        ):
            run_gepa_worker(run_dir, workspace_root=self.workspace_root)

        # 使用不同的 reflection model
        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
            reflection_model=ModelIdentity(profile_name="different-reflection", model_id="r2"),
        )
        with self.assertRaises(ConfigurationError):
            controller.resume(run_id, yes=True)


if __name__ == "__main__":
    unittest.main()
