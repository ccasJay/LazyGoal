"""Comprehensive deterministic tests for GEPA lifecycle controller and CLI."""

from __future__ import annotations

import hashlib
import io
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
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
    ConfirmationRequiredError,
    LifecycleController,
    ProfileDriftError,
    ReportNotReadyError,
    get_run_report,
    get_run_status,
    launch_detached_worker,
    preflight_run,
    resume_run,
    start_run,
    stop_run,
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


class LifecycleControllerTests(unittest.TestCase):
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

        # 准备 request.json
        self.request_path = self.workspace_root / "request.json"
        self.request_data = {
            "protocol": "gepa-run@1",
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "sample-01",
                    "taskId": "task-clean-001",
                    "manifestPath": str(self.manifest_path),
                }
            ],
            "maxMetricCalls": 20,
        }
        self.request_path.write_text(json.dumps(self.request_data), encoding="utf-8")

        # 记录派生的测试进程 PID，确保 tearDown 清理
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

    def _create_helper_manifest(self, run_id: str) -> FrozenRunManifest:
        req = parse_run_request(self.request_data, check_manifests=False)
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

    # -------------------------------------------------------------------------
    # 1. 确认门测试
    # -------------------------------------------------------------------------
    def test_start_and_resume_require_confirmation_gate(self) -> None:
        """start 与 resume 必须在未提供 --yes 时拒绝执行，绝不创建目录或启动进程。"""
        # start 未带 yes
        with self.assertRaises(ConfirmationRequiredError):
            start_run(
                request_path=self.request_path,
                yes=False,
                workspace_root=self.workspace_root,
                runs_root=self.runs_dir,
            )

        # 验证没有在 runs_dir 创建任何 run 目录
        created_runs = list(self.runs_dir.iterdir())
        self.assertEqual(len(created_runs), 0)

        # 构造一个合规 run
        run_id = "run_test_resume_gate"
        manifest = self._create_helper_manifest(run_id)
        self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")

        # resume 未带 yes
        with self.assertRaises(ConfirmationRequiredError):
            resume_run(
                run_id=run_id,
                yes=False,
                workspace_root=self.workspace_root,
                runs_root=self.runs_dir,
            )

    # -------------------------------------------------------------------------
    # 2. 会话脱离与独立后台进程派生测试
    # -------------------------------------------------------------------------
    def test_start_spawns_detached_worker_and_returns_immediately(self) -> None:
        """start 立即返回 runId，派生后台 Worker（start_new_session=True），重定向日志。"""
        dummy_worker = [
            sys.executable,
            "-c",
            "import time; time.sleep(10)",
        ]

        t0 = time.monotonic()
        result = start_run(
            request_path=self.request_path,
            yes=True,
            workspace_root=self.workspace_root,
            runs_root=self.runs_dir,
            worker_cmd=dummy_worker,
        )
        elapsed = time.monotonic() - t0

        # 立即返回（耗时必须极小）
        self.assertLess(elapsed, 2.0)
        self.assertIn("runId", result)
        self.assertEqual(result["lifecycleStatus"], "starting")
        self.assertIn("runDir", result)
        self.assertIn("workerPid", result)

        pid = self._track_pid(result["workerPid"])
        run_dir = Path(result["runDir"])

        # 验证后台进程在操作系统中存活
        self.assertTrue(is_pid_alive(pid))

        # 验证进程组独立（会话脱离）：调用 setsid 后，子进程 pgid == pid != 当前进程 pid
        child_pgid = os.getpgid(pid)
        self.assertEqual(child_pgid, pid)
        self.assertNotEqual(child_pgid, os.getpid())

        # 验证 run.json 与 state.json 已创建
        self.assertTrue((run_dir / "run.json").is_file())
        self.assertTrue((run_dir / "state.json").is_file())
        self.assertTrue((run_dir / "worker.log").is_file())

    # -------------------------------------------------------------------------
    # 3. 只读 status 测试
    # -------------------------------------------------------------------------
    def test_status_query_is_strictly_read_only(self) -> None:
        """status 查询完全只读，多次调用绝不改变磁盘上任何文件的哈希与修改时间。"""
        run_id = "run_readonly_check"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(
            run_id,
            lifecycle_status="running",
            metric_calls=5,
            candidate_count=2,
            best_score=0.75,
            best_candidate_id="cand_123",
        )

        owner = OwnerInfo(
            pid=os.getpid(),
            worker_token="tok_123",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        # 记录关键文件的原始 sha256 与 mtime_ns
        tracked_files = [run_dir / "run.json", run_dir / "state.json", run_dir / "owner.json"]
        initial_digests = {f: hashlib.sha256(f.read_bytes()).hexdigest() for f in tracked_files}
        initial_mtimes = {f: f.stat().st_mtime_ns for f in tracked_files}

        # 连续调用 5 次 status
        for _ in range(5):
            status = get_run_status(run_id, runs_root=self.runs_dir)
            self.assertEqual(status["runId"], run_id)
            self.assertEqual(status["lifecycleStatus"], "running")
            self.assertEqual(status["workerHealth"], "active")
            self.assertEqual(status["workerPid"], os.getpid())
            self.assertEqual(status["metricCalls"], 5)
            self.assertEqual(status["candidateCount"], 2)
            self.assertEqual(status["bestScore"], 0.75)
            self.assertEqual(status["bestCandidateId"], "cand_123")
            self.assertFalse(status["stopRequested"])

        # 检查所有被追踪文件完全未被修改
        for f in tracked_files:
            new_digest = hashlib.sha256(f.read_bytes()).hexdigest()
            new_mtime = f.stat().st_mtime_ns
            self.assertEqual(new_digest, initial_digests[f], f"File {f.name} content was modified!")
            self.assertEqual(new_mtime, initial_mtimes[f], f"File {f.name} mtime was touched!")

    # -------------------------------------------------------------------------
    # 4. 协作 stop 与零信号红线测试
    # -------------------------------------------------------------------------
    def test_stop_creates_stop_marker_without_killing_pid(self) -> None:
        """stop 仅向 gepa/gepa.stop 写入停止标记，绝不向 Worker PID 发送终止信号。"""
        run_id = "run_stop_check"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        fake_worker_pid = 99999
        owner = OwnerInfo(
            pid=fake_worker_pid,
            worker_token="tok_stop",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        with patch("os.kill") as mock_kill:
            # 模拟存活性探测：os.kill(pid, 0)
            mock_kill.return_value = None

            stop_result = stop_run(run_id, runs_root=self.runs_dir)

            self.assertEqual(stop_result["runId"], run_id)
            self.assertEqual(stop_result["lifecycleStatus"], "stop_requested")
            self.assertTrue(stop_result["stopRequested"])

            # 验证 gepa.stop 文件已经生成
            self.assertTrue((run_dir / "gepa" / "gepa.stop").is_file())

            # 严格核查 os.kill 调用：只能是 signal 0（探测存活），绝无 SIGTERM (15)、SIGKILL (9)
            for call in mock_kill.call_args_list:
                _, sig = call[0]
                self.assertEqual(
                    sig,
                    0,
                    f"Violation: os.kill was called with signal {sig} instead of 0!",
                )

        # 再次调用 stop，验证幂等性
        idempotent_stop = stop_run(run_id, runs_root=self.runs_dir)
        self.assertTrue(idempotent_stop["stopRequested"])

    # -------------------------------------------------------------------------
    # 5. Worker 存活性与异常状态投影测试
    # -------------------------------------------------------------------------
    def test_worker_health_projections_and_anomalies(self) -> None:
        """测试 lost、stale、unformed、corrupted 和 report 未就绪等异常状态。"""
        run_id = "run_anomalies_check"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        # 5.1 Lost Worker: PID 不存在但 owner.json 遗留
        dead_pid = 88888  # 假定不存在的 PID
        owner = OwnerInfo(
            pid=dead_pid,
            worker_token="tok_dead",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        status = get_run_status(run_id, runs_root=self.runs_dir)
        self.assertEqual(status["workerHealth"], "lost")

        # 5.2 Stale Worker: 当前进程存活，但心跳超过 30s
        stale_time = datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat()
        owner_stale = OwnerInfo(
            pid=os.getpid(),
            worker_token="tok_stale",
            started_at=stale_time,
            heartbeat_at=stale_time,
        )
        atomic_write_json(run_dir / "owner.json", owner_stale.to_dict())

        status = get_run_status(run_id, runs_root=self.runs_dir)
        self.assertEqual(status["workerHealth"], "stale")

        # 5.3 Unformed Run
        with self.assertRaises(RunStoreError) as cm_unformed:
            get_run_status("run_non_existent", runs_root=self.runs_dir)
        self.assertEqual(cm_unformed.exception.code, "unformed")

        # 5.4 Corrupted State
        (run_dir / "state.json").write_text("{broken json", encoding="utf-8")
        with self.assertRaises(RunStoreError) as cm_corrupt:
            get_run_status(run_id, runs_root=self.runs_dir)
        self.assertEqual(cm_corrupt.exception.code, "corrupted")

        # 5.5 Report Not Ready
        # 重构合法 state 为 running
        valid_state_data = {
            "runId": run_id,
            "lifecycleStatus": "running",
            "stopRequested": False,
            "metricCalls": 0,
            "maxMetricCalls": 20,
            "candidateCount": 1,
            "bestScore": None,
            "bestCandidateId": None,
            "publicationStatus": "pending",
            "errorCode": None,
            "errorMessage": None,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        atomic_write_json(run_dir / "state.json", valid_state_data)
        with self.assertRaises(ReportNotReadyError):
            get_run_report(run_id, runs_root=self.runs_dir)

        # 5.6 Report Succeeded
        self.store.update_state(run_id, lifecycle_status="succeeded")
        report_data = {
            "runId": run_id,
            "status": "succeeded",
            "bestCandidate": {"score": 0.95},
        }
        atomic_write_json(run_dir / "artifacts" / "report.json", report_data)
        read_report = get_run_report(run_id, runs_root=self.runs_dir)
        self.assertEqual(read_report["status"], "succeeded")
        self.assertEqual(read_report["bestCandidate"]["score"], 0.95)

    # -------------------------------------------------------------------------
    # 6. Resume 漂移防御与并发排他锁测试
    # -------------------------------------------------------------------------
    def test_resume_drift_rejection_and_concurrency_lock(self) -> None:
        """测试 resume 时目标 profile 摘要漂移拦截与锁冲突防御。"""
        run_id = "run_resume_drift_check"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")

        # 6.1 目标 profile 被外部修改导致摘要漂移
        modified_data = dict(self.profile_data)
        modified_data["systemPrompt"] = "Mutated system prompt by human user."
        self.profile_path.write_text(json.dumps(modified_data, indent=2), encoding="utf-8")

        with self.assertRaises(ProfileDriftError):
            resume_run(
                run_id=run_id,
                yes=True,
                workspace_root=self.workspace_root,
                runs_root=self.runs_dir,
            )

        # 恢复 profile 内容
        self.profile_path.write_text(self.profile_raw, encoding="utf-8")

        # 6.2 存在存活活跃 Worker 时拒绝 resume 并发冲突
        owner = OwnerInfo(
            pid=os.getpid(),
            worker_token="tok_active",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        with self.assertRaises(WorkerAlreadyRunningError):
            resume_run(
                run_id=run_id,
                yes=True,
                workspace_root=self.workspace_root,
                runs_root=self.runs_dir,
            )

        # 清除活跃所有权并重新 resume
        (run_dir / "owner.json").unlink()
        dummy_worker = [sys.executable, "-c", "import time; time.sleep(10)"]
        resumed = resume_run(
            run_id=run_id,
            yes=True,
            workspace_root=self.workspace_root,
            runs_root=self.runs_dir,
            worker_cmd=dummy_worker,
        )
        self._track_pid(resumed["workerPid"])
        self.assertEqual(resumed["lifecycleStatus"], "starting")

    # -------------------------------------------------------------------------
    # 7. CLI 端到端与单行 JSON 契约测试
    # -------------------------------------------------------------------------
    def test_cli_stdout_stderr_contract(self) -> None:
        """测试 Python CLI 的命令行参数解析、单行合法 JSON 输出与错误码。"""
        # 7.1 preflight: 成功输出单行合法 JSON
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "preflight",
                "--request",
                str(self.request_path),
                "--workspace-root",
                str(self.workspace_root),
                "--runs-dir",
                str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        lines = [line for line in stdout_buf.getvalue().splitlines() if line.strip()]
        self.assertEqual(len(lines), 1, "stdout must contain exactly one line of JSON")
        preflight_obj = json.loads(lines[0])
        self.assertTrue(preflight_obj["valid"])
        self.assertEqual(preflight_obj["benchmark"], "alfworld")

        # 7.2 start 缺少 --yes: exit code 1, stderr 诊断, stdout 无 JSON
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "start",
                "--request",
                str(self.request_path),
                "--workspace-root",
                str(self.workspace_root),
                "--runs-dir",
                str(self.runs_dir),
            ])
        self.assertEqual(code, 1)
        self.assertEqual(stdout_buf.getvalue(), "")
        self.assertIn("ConfirmationRequiredError", stderr_buf.getvalue())

        # 7.3 start 携带 --yes: exit code 0, stdout 单行 JSON
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "start",
                "--request",
                str(self.request_path),
                "--yes",
                "--workspace-root",
                str(self.workspace_root),
                "--runs-dir",
                str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        start_lines = [line for line in stdout_buf.getvalue().splitlines() if line.strip()]
        self.assertEqual(len(start_lines), 1)
        start_obj = json.loads(start_lines[0])
        run_id = start_obj["runId"]
        self._track_pid(start_obj["workerPid"])
        self.assertEqual(start_obj["lifecycleStatus"], "starting")

        # 7.4 status: exit code 0, stdout 单行 JSON
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "status",
                "--run",
                run_id,
                "--runs-dir",
                str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        status_lines = [line for line in stdout_buf.getvalue().splitlines() if line.strip()]
        self.assertEqual(len(status_lines), 1)
        status_obj = json.loads(status_lines[0])
        self.assertEqual(status_obj["runId"], run_id)

        # 7.5 stop: exit code 0, stdout 单行 JSON
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "stop",
                "--run",
                run_id,
                "--runs-dir",
                str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        stop_lines = [line for line in stdout_buf.getvalue().splitlines() if line.strip()]
        self.assertEqual(len(stop_lines), 1)
        stop_obj = json.loads(stop_lines[0])
        self.assertTrue(stop_obj["stopRequested"])

    def test_terminal_state_stop_invariant_and_corrupted_manifest_uniform_contract(self) -> None:
        """Verify terminal state invariant during stop and uniform RunStoreError(corrupted) on broken run.json."""
        # 1. 终态不可逆：当 run 处于 stopped 终态时，stop_run 不会将状态重置为 stop_requested
        run_id = "run_ctrl_terminal_inv"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="stopped")

        stop_result = stop_run(run_id, runs_root=self.runs_dir)
        self.assertEqual(stop_result["lifecycleStatus"], "stopped")
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "stopped")

        # 2. 统一 corrupted 契约：当 run.json 损坏时，get_run_status 必须抛出 RunStoreError(code="corrupted")
        (run_dir / "run.json").write_text("{broken manifest json content", encoding="utf-8")
        with self.assertRaises(RunStoreError) as cm:
            get_run_status(run_id, runs_root=self.runs_dir)
        self.assertEqual(cm.exception.code, "corrupted")

        # 验证 CLI status 对损坏 run.json 优雅退出并输出友好错误
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "status",
                "--run",
                run_id,
                "--runs-dir",
                str(self.runs_dir),
            ])
        self.assertEqual(code, 1)
        self.assertEqual(stdout_buf.getvalue(), "")
        self.assertIn("RunStoreError", stderr_buf.getvalue())
        self.assertIn("corrupted", stderr_buf.getvalue())


if __name__ == "__main__":
    unittest.main()
