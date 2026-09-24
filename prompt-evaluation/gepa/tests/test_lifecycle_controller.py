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
from typing import Any
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
    get_run_status,
    launch_detached_worker,
    preflight_run,
    start_run,
    stop_run,
    wait_run,
)
from lazygoal_gepa.errors import (
    ConfigurationError,
    DatasetValidationError,
    GEPARunProtocolError,
    RunStoreError,
    WorkerAlreadyRunningError,
)
from lazygoal_gepa.ownership import OwnerInfo, RunOwnership, is_pid_alive
from lazygoal_gepa.protocol import GEPARunRequest, parse_run_request
from lazygoal_gepa.reporter import generate_and_save_run_report
from lazygoal_gepa.store import RunStore, atomic_write_json


def _tua_inspection_fixture() -> dict[str, Any]:
    task_ids = ("train-doc", "validation-doc", "holdout-doc")
    tasks = {
        task_id: {
            "taskId": task_id,
            "taskFamily": "document",
            "networkMode": "public" if task_id == "holdout-doc" else "none",
            "agentTimeoutSec": 600,
            "verifierTimeoutSec": 600,
            "resourceDigest": "c" * 64,
            "imageDigest": f"sha256:{'d' * 64}",
        }
        for task_id in task_ids
    }
    return {
        "sourceRevision": "a" * 40,
        "datasetDigest": "b" * 64,
        "workingTreeDirty": False,
        "changedPaths": [],
        "tasks": tasks,
        "partitions": {
            "train": {
                "taskIds": ["train-doc"],
                "taskFamilies": ["document"],
                "networkTasks": [],
            },
            "validation": {
                "taskIds": ["validation-doc"],
                "taskFamilies": ["document"],
                "networkTasks": [],
            },
            "holdout": {
                "taskIds": ["holdout-doc"],
                "taskFamilies": ["document"],
                "networkTasks": ["holdout-doc"],
            },
        },
    }


class LifecycleControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.workspace_root = self.root / "workspace"
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.runs_dir = self.root / "test-runs" / "gepa"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.store = RunStore(self.runs_dir)

        self.lazygoal_home = self.root / "lazygoal-home"
        config_dir = self.lazygoal_home
        profiles_dir = config_dir / "profiles"
        profiles_dir.mkdir(parents=True, exist_ok=True)
        (config_dir / "config.toml").write_text(
            '[gepa]\nreflection_profile = "gepa-reflection"\n', encoding="utf-8"
        )
        (profiles_dir / "default.toml").write_text(
            '[llm]\nprovider = "openai"\nmodel = "default"\napi_key = "test-working"\n',
            encoding="utf-8",
        )
        (profiles_dir / "gepa-reflection.toml").write_text(
            '[llm]\nprovider = "openai"\nmodel = "reflection"\napi_key = "test-reflection"\n',
            encoding="utf-8",
        )
        self.env_patch = patch.dict(os.environ, {"LAZYGOAL_HOME": str(self.lazygoal_home)})
        self.env_patch.start()

        # 准备 default.json profile
        self.profile_dir = self.lazygoal_home / "agent-profiles"
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

    def test_default_paths_use_lazygoal_home_and_workspace_identity(self) -> None:
        controller = LifecycleController(workspace_root=self.workspace_root)
        self.assertEqual(
            controller.profile_path,
            (self.lazygoal_home / "agent-profiles" / "default.json").resolve(),
        )
        self.assertIn(str(self.lazygoal_home / "workspaces"), str(controller.runs_dir))
        self.assertNotIn(".lazygoal", str(controller.runs_dir))

    def tearDown(self) -> None:
        self.env_patch.stop()
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
            working_model=ModelIdentity(profile_name="default", model_id="default", provider="openai"),
            reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection", provider="openai"),
        )

    # -------------------------------------------------------------------------
    # 1. 确认门测试
    # -------------------------------------------------------------------------
    def test_start_and_resume_require_confirmation_gate(self) -> None:
        """start 与 resume 必须在未提供 --yes 时拒绝执行，绝不创建目录或启动进程。"""
        # start 未带 yes
        with self.assertRaises(ConfirmationRequiredError):
            LifecycleController(
                workspace_root=self.workspace_root,
                runs_dir=self.runs_dir,
            ).start(
                request_path=self.request_path,
                yes=False,
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
            LifecycleController(
                workspace_root=self.workspace_root,
                runs_dir=self.runs_dir,
            ).resume(
                run_id=run_id,
                yes=False,
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
        result = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            worker_cmd=dummy_worker,
        ).start(
            request_path=self.request_path,
            yes=True,
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

    def test_default_detached_worker_receives_workspace_root(self) -> None:
        """默认后台 Worker 必须保留组合根，避免从 run 目录错误解析 lazygoal。"""
        run_dir = self.runs_dir / "run_workspace_root"
        fake_process = type("FakeProcess", (), {"pid": 12345})()
        with patch("lazygoal_gepa.controller.subprocess.Popen", return_value=fake_process) as popen:
            pid = launch_detached_worker(
                run_dir,
                workspace_root=self.workspace_root,
            )

        self.assertEqual(pid, 12345)
        command = popen.call_args.args[0]
        self.assertEqual(command[-2:], ["--workspace-root", str(self.workspace_root)])
        self.assertEqual(popen.call_args.kwargs["cwd"], str(self.workspace_root))

    def test_profile_path_is_explicitly_selected_and_frozen(self) -> None:
        """preflight/start must use the requested profile and persist its identity."""
        custom_profile_path = self.profile_dir / "gaia-worker.json"
        custom_profile_data = dict(self.profile_data)
        custom_profile_data["id"] = "gaia-worker-profile"
        custom_profile_path.write_text(
            json.dumps(custom_profile_data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

        preflight = preflight_run(
            request_path=self.request_path,
            workspace_root=self.workspace_root,
            runs_root=self.runs_dir,
            profile_path=custom_profile_path,
        )
        self.assertEqual(preflight["targetProfile"]["profileId"], "gaia-worker-profile")
        self.assertEqual(
            preflight["targetProfile"]["profilePath"],
            str(custom_profile_path.resolve()),
        )
        self.assertTrue(preflight["estimatedSideEffects"]["willMutateProfile"])
        self.assertIn("working", preflight["models"])
        self.assertIn("reflection", preflight["models"])

        result = start_run(
            request_path=self.request_path,
            yes=True,
            workspace_root=self.workspace_root,
            runs_root=self.runs_dir,
            profile_path=custom_profile_path,
            worker_cmd=[sys.executable, "-c", "import time; time.sleep(10)"],
        )
        self._track_pid(result["workerPid"])
        manifest = self.store.read_manifest(result["runId"])
        self.assertEqual(manifest.target_profile.profile_id, "gaia-worker-profile")
        self.assertEqual(
            manifest.target_profile.profile_path,
            str(custom_profile_path.resolve()),
        )

        # The lifecycle manifest is authoritative: changing the controller's
        # default profile path must not alter the frozen target.
        status = get_run_status(result["runId"], runs_root=self.runs_dir)
        self.assertEqual(status["runId"], result["runId"])

    def test_tua_preflight_inspects_partitions_before_model_resolution_and_freezes_identity(self) -> None:
        request_path = self.workspace_root / "tua-request.json"
        request_data = {
            "protocol": "gepa-run@1",
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.workspace_root / "TUA-Bench"),
                "trainTaskIds": ["train-doc"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        }
        request_path.write_text(json.dumps(request_data), encoding="utf-8")
        inspection = _tua_inspection_fixture()
        calls: list[str] = []
        expected_dataset = request_data["tuaDataset"]

        def inspect_cli(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
            self.assertEqual(command[1:4], ["gepa", "inspect-tua", "--request"])
            inspector_request = json.loads(Path(command[4]).read_text(encoding="utf-8"))
            self.assertEqual(inspector_request, {"tuaDataset": expected_dataset})
            calls.append("inspect")
            return subprocess.CompletedProcess(command, 0, json.dumps(inspection), "")

        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
            working_model=ModelIdentity("default", "working-model", "openai"),
            reflection_model=ModelIdentity("reflection", "reflection-model", "openai"),
            worker_cmd=[sys.executable, "-c", "pass"],
        )
        original_profile = self.profile_path.read_bytes()
        original_models = controller._models

        def resolve_models() -> tuple[ModelIdentity, ModelIdentity]:
            calls.append("models")
            return original_models()

        with patch("lazygoal_gepa.controller.subprocess.run", side_effect=inspect_cli):
            with patch.object(controller, "_models", side_effect=resolve_models):
                preflight = controller.preflight(request_path)
                self.assertEqual(calls, ["inspect", "models"])
                self.assertEqual(preflight["sampleCount"], {"train": 1, "validation": 1})
                self.assertEqual(preflight["tuaDatasetInspection"], inspection)
                self.assertEqual(preflight["finalComparison"]["tuaHoldoutTrials"], 3)
                self.assertEqual(preflight["costEstimate"]["status"], "unknown")
                self.assertFalse(preflight["estimatedSideEffects"]["willMutateProfile"])
                self.assertEqual(self.profile_path.read_bytes(), original_profile)

                with patch("lazygoal_gepa.controller.launch_detached_worker", return_value=12345):
                    started = controller.start(request_path, yes=True)

        manifest = controller.store.read_manifest(started["runId"])
        self.assertEqual(manifest.tua_dataset_inspection, inspection)
        self.assertEqual(calls, ["inspect", "models", "inspect", "models", "models"])

    def test_tua_preflight_rejects_inspector_failure_before_model_resolution(self) -> None:
        request_path = self.workspace_root / "tua-invalid-request.json"
        request_path.write_text(json.dumps({
            "protocol": "gepa-run@1",
            "benchmark": "tua-bench",
            "maxMetricCalls": 20,
            "tuaDataset": {
                "repoRoot": str(self.workspace_root / "TUA-Bench"),
                "trainTaskIds": ["missing-task"],
                "validationTaskIds": ["validation-doc"],
                "holdoutTaskIds": ["holdout-doc"],
            },
            "finalComparison": {"tuaHoldoutTrials": 3},
            "publicationPolicy": "candidate-only",
        }), encoding="utf-8")
        controller = LifecycleController(
            workspace_root=self.workspace_root,
            runs_dir=self.runs_dir,
            profile_path=self.profile_path,
        )
        failed = subprocess.CompletedProcess(
            ["lazygoal", "gepa", "inspect-tua"], 2, "", "TUA task does not exist: missing-task"
        )
        with patch("lazygoal_gepa.controller.subprocess.run", return_value=failed):
            with patch.object(controller, "_models") as resolve_models:
                with self.assertRaisesRegex(DatasetValidationError, "missing-task"):
                    controller.preflight(request_path)
                resolve_models.assert_not_called()

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
            status = LifecycleController(runs_dir=self.runs_dir).status(run_id)
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

            stop_result = LifecycleController(runs_dir=self.runs_dir).stop(run_id)

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
        idempotent_stop = LifecycleController(runs_dir=self.runs_dir).stop(run_id)
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

        status = LifecycleController(runs_dir=self.runs_dir).status(run_id)
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

        status = LifecycleController(runs_dir=self.runs_dir).status(run_id)
        self.assertEqual(status["workerHealth"], "stale")

        # 5.3 Unformed Run
        with self.assertRaises(RunStoreError) as cm_unformed:
            LifecycleController(runs_dir=self.runs_dir).status("run_non_existent")
        self.assertEqual(cm_unformed.exception.code, "unformed")

        # 5.4 Corrupted State
        (run_dir / "state.json").write_text("{broken json", encoding="utf-8")
        with self.assertRaises(RunStoreError) as cm_corrupt:
            LifecycleController(runs_dir=self.runs_dir).status(run_id)
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
            LifecycleController(runs_dir=self.runs_dir).report(run_id)

        # 5.6 Report Succeeded
        self.store.update_state(run_id, lifecycle_status="succeeded")
        self.store.update_state(run_id, best_score=0.95)
        generate_and_save_run_report(run_dir)
        read_report = LifecycleController(runs_dir=self.runs_dir).report(run_id)
        self.assertEqual(read_report["terminalStatus"], "succeeded")
        self.assertEqual(read_report["scores"]["bestScore"], 0.95)

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
            LifecycleController(
                workspace_root=self.workspace_root,
                runs_dir=self.runs_dir,
            ).resume(
                run_id=run_id,
                yes=True,
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
            LifecycleController(
                workspace_root=self.workspace_root,
                runs_dir=self.runs_dir,
            ).resume(
                run_id=run_id,
                yes=True,
            )

        # 清除活跃所有权并重新 resume
        (run_dir / "owner.json").unlink()
        checkpoint_file = run_dir / "gepa" / "gepa_state.bin"
        checkpoint_file.write_bytes(b"test checkpoint")
        dummy_worker = [sys.executable, "-c", "import time; time.sleep(10)"]
        with patch("gepa.core.state.GEPAState.load"):
            resumed = LifecycleController(
                workspace_root=self.workspace_root,
                runs_dir=self.runs_dir,
                worker_cmd=dummy_worker,
            ).resume(
                run_id=run_id,
                yes=True,
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

        custom_profile_path = self.profile_dir / "cli-custom.json"
        custom_profile_data = dict(self.profile_data)
        custom_profile_data["id"] = "cli-custom-profile"
        custom_profile_path.write_text(
            json.dumps(custom_profile_data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
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
                "--profile-path",
                str(custom_profile_path),
            ])
        self.assertEqual(code, 0)
        custom_preflight = json.loads(stdout_buf.getvalue())
        self.assertEqual(
            custom_preflight["targetProfile"]["profileId"],
            "cli-custom-profile",
        )
        self.assertEqual(
            custom_preflight["targetProfile"]["profilePath"],
            str(custom_profile_path.resolve()),
        )

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

        stop_result = LifecycleController(runs_dir=self.runs_dir).stop(run_id)
        self.assertEqual(stop_result["lifecycleStatus"], "stopped")
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "stopped")

        # 2. 统一 corrupted 契约：当 run.json 损坏时，get_run_status 必须抛出 RunStoreError(code="corrupted")
        (run_dir / "run.json").write_text("{broken manifest json content", encoding="utf-8")
        with self.assertRaises(RunStoreError) as cm:
            LifecycleController(runs_dir=self.runs_dir).status(run_id)
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

    def test_wait_terminal_status_and_cli(self) -> None:
        """Verify wait method immediately returns on terminal states and CLI exits accordingly."""
        run_id = "run_ctrl_wait_test"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            best_score=1.0,
            metric_calls=4,
        )

        # 1. 成功终态：wait_run 立即返回且包含 status 信息
        controller = LifecycleController(runs_dir=self.runs_dir)
        res = controller.wait(run_id, timeout_seconds=1.0)
        self.assertEqual(res["lifecycleStatus"], "succeeded")
        self.assertEqual(res["bestScore"], 1.0)

        # 验证 CLI wait 在成功终态退出码为 0，stdout 输出 json
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["wait", "--run", run_id, "--runs-dir", str(self.runs_dir)])
        self.assertEqual(code, 0)
        out = json.loads(stdout_buf.getvalue().strip())
        self.assertEqual(out["lifecycleStatus"], "succeeded")

        # 2. 失败终态：CLI wait 退出码为 1，stdout 输出 json
        self.store.update_state(run_id, lifecycle_status="failed", error_message="Task failed")
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["wait", "--run", run_id, "--runs-dir", str(self.runs_dir)])
        self.assertEqual(code, 1)
        out = json.loads(stdout_buf.getvalue().strip())
        self.assertEqual(out["lifecycleStatus"], "failed")

        # 3. 超时退出：当处于 running 且超时时，抛出 TimeoutError，CLI 返回 124
        run_id_running = "run_ctrl_wait_timeout"
        m_running = self._create_helper_manifest(run_id_running)
        self.store.initialize_run(m_running)
        self.store.update_state(run_id_running, lifecycle_status="running")

        # Mock is_pid_alive so workerHealth is active instead of lost
        fake_owner = OwnerInfo(pid=999999, worker_token="tok", started_at="2026-09-23T00:00:00Z", heartbeat_at="2026-09-23T00:00:00Z")
        with patch.object(RunOwnership, "check_health", return_value=("active", fake_owner)):
            with self.assertRaises(TimeoutError):
                controller.wait(run_id_running, timeout_seconds=0.1, interval_seconds=0.05)

            stdout_buf = io.StringIO()
            stderr_buf = io.StringIO()
            with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                code = cli_main([
                    "wait",
                    "--run",
                    run_id_running,
                    "--runs-dir",
                    str(self.runs_dir),
                    "--timeout-seconds",
                    "0.1",
                    "--interval-seconds",
                    "0.05",
                ])
            self.assertEqual(code, 124)
            self.assertIn("TimeoutError", stderr_buf.getvalue())


if __name__ == "__main__":
    unittest.main()
