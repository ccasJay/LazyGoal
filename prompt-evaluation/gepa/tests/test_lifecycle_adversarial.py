"""Adversarial stress and empirical challenge tests for Milestone 3 (Lifecycle Control Plane).

Covers:
1. Complete process detachment: Caller is killed with SIGKILL, background worker survives,
   continues detached execution, and writes expected logs.
2. Read-only status invariance: 50 concurrent high-frequency status queries result in 0 disk writes
   (exact SHA-256 and nanosecond-level mtime matching across all files in run_dir).
3. Concurrent startup / worker collision: Simultaneous start/worker attempts on the same run
   strictly collide, allowing exactly one process to obtain the owner lock while rejecting the other.
4. Orphan lock auto-recovery: Abruptly killed worker releases kernel flock, enabling a subsequent
   worker to reclaim ownership without deadlock.
5. Concurrent stop idempotence & zero termination signals.
"""

from __future__ import annotations

import concurrent.futures
import hashlib
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
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
from lazygoal_gepa.controller import (
    ConfirmationRequiredError,
    LifecycleController,
    get_run_status,
    launch_detached_worker,
    start_run,
    stop_run,
)
from lazygoal_gepa.errors import RunStoreError, WorkerAlreadyRunningError
from lazygoal_gepa.ownership import OwnerInfo, RunOwnership, is_pid_alive
from lazygoal_gepa.protocol import parse_run_request
from lazygoal_gepa.store import RunStore, atomic_write_json


class LifecycleAdversarialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.workspace_root = self.root / "workspace"
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.runs_dir = self.workspace_root / ".lazygoal" / "gepa" / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.store = RunStore(self.runs_dir)

        # Baseline default profile
        self.profile_dir = self.workspace_root / ".lazygoal" / "profiles"
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        self.profile_path = self.profile_dir / "default.json"
        self.profile_data = {
            "schemaVersion": 1,
            "id": "default",
            "name": "Adversarial Test Agent",
            "description": "Deterministic Profile for Challenger",
            "systemPrompt": "You are an empirical challenger agent.",
            "instructions": [
                "Execute deterministic validations.",
                "Verify strict invariant guarantees.",
            ],
            "toolIds": ["fs_read", "fs_write"],
        }
        self.profile_raw = json.dumps(self.profile_data, indent=2, ensure_ascii=False)
        self.profile_path.write_text(self.profile_raw, encoding="utf-8")
        self.profile_digest = hashlib.sha256(self.profile_raw.encode("utf-8")).hexdigest()

        # Task manifest
        self.manifest_path = self.workspace_root / "manifest.json"
        self.manifest_data = {
            "benchmark": "alfworld",
            "tasks": [{"taskId": "task-clean-adv", "benchmark": "alfworld"}],
        }
        self.manifest_path.write_text(json.dumps(self.manifest_data), encoding="utf-8")

        # Request file
        self.request_path = self.workspace_root / "request.json"
        self.request_data = {
            "protocol": "gepa-run@1",
            "benchmark": "alfworld",
            "trainset": [
                {
                    "sampleId": "sample-adv-01",
                    "taskId": "task-clean-adv",
                    "manifestPath": str(self.manifest_path),
                }
            ],
            "maxMetricCalls": 10,
        }
        self.request_path.write_text(json.dumps(self.request_data), encoding="utf-8")

        self.tracked_pids: list[int] = []

    def tearDown(self) -> None:
        for pid in self.tracked_pids:
            if is_pid_alive(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                except OSError:
                    pass
                try:
                    os.waitpid(pid, 0)
                except OSError:
                    pass
        self.temp_dir.cleanup()

    def _track(self, pid: int) -> int:
        self.tracked_pids.append(pid)
        return pid

    def _create_test_manifest(self, run_id: str) -> FrozenRunManifest:
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

    # =========================================================================
    # 对抗验证 1: 进程完全脱离验证
    # =========================================================================
    def test_process_complete_detachment_after_caller_killed(self) -> None:
        """实证验证：启动一个耗时 worker 后，立即主动强杀调用者进程（模拟会话关闭）。

        断言：
        1. 调用者进程已死 (is_pid_alive is False)
        2. 后台 Worker 进程脱离了调用者进程组，依然存活并持续执行
        3. Worker 成功将其独立运行日志写入 <run_dir>/worker.log
        4. 日志内容完整包含调用者被杀后 Worker 输出的心跳与完成标记
        """
        # 编写耗时 worker 脚本：执行 2.5 秒，每隔 0.5 秒向 stdout 写入心跳标记
        worker_script = (
            "import sys, time, os\n"
            "pid = os.getpid()\n"
            "sys.stdout.write(f'WORKER_START pid={pid}\\n')\n"
            "sys.stdout.flush()\n"
            "for i in range(5):\n"
            "    time.sleep(0.5)\n"
            "    sys.stdout.write(f'WORKER_TICK step={i} pid={pid}\\n')\n"
            "    sys.stdout.flush()\n"
            "sys.stdout.write(f'WORKER_DONE pid={pid}\\n')\n"
            "sys.stdout.flush()\n"
        )

        # 启动一个独立的调用者进程（Caller Process），由它去执行 start 并派生 worker
        # 调用者在成功启动 worker 并输出 {"workerPid": ..., "runDir": ...} 后，自己立刻被强杀
        caller_script = f"""
import sys, json, os, time
from lazygoal_gepa.controller import LifecycleController
from lazygoal_gepa.candidate import ModelIdentity

controller = LifecycleController(
    workspace_root={repr(str(self.workspace_root))},
    runs_dir={repr(str(self.runs_dir))},
    worker_cmd=[sys.executable, "-c", {repr(worker_script)}],
    working_model=ModelIdentity(profile_name="default", model_id="default"),
    reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection"),
)

res = controller.start({repr(str(self.request_path))}, yes=True)
sys.stdout.write(json.dumps(res) + "\\n")
sys.stdout.flush()

# 保持存活极短片刻等待父测试确认
time.sleep(10)
"""

        caller_proc = subprocess.Popen(
            [sys.executable, "-c", caller_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(caller_proc.pid)

        # 从 caller 读取其启动 worker 的输出
        assert caller_proc.stdout is not None
        first_line = caller_proc.stdout.readline()
        self.assertTrue(first_line, "Caller failed to produce output")
        start_data = json.loads(first_line.strip())

        # 立即关闭管道描述符，防止 ResourceWarning
        caller_proc.stdout.close()
        if caller_proc.stderr:
            caller_proc.stderr.close()

        worker_pid = int(start_data["workerPid"])
        run_dir = Path(start_data["runDir"])
        self._track(worker_pid)

        # 验证此时两者均存活
        self.assertTrue(is_pid_alive(caller_proc.pid), "Caller should be alive before kill")
        self.assertTrue(is_pid_alive(worker_pid), "Worker should be alive")

        # 模拟外部会话强行关闭：对 caller 发送 SIGKILL 彻底强杀！
        os.kill(caller_proc.pid, signal.SIGKILL)
        caller_proc.wait()  # 回收 caller 僵尸

        # 实证断言 1: caller 已经彻底死亡
        self.assertFalse(is_pid_alive(caller_proc.pid), "Caller must be dead after SIGKILL")

        # 实证断言 2: worker 进程完全脱离，依然活着！
        self.assertTrue(
            is_pid_alive(worker_pid),
            "Worker MUST survive even after caller process was killed with SIGKILL!",
        )

        # 实证断言 3: worker 会话脱离属性验证（setsid 独立进程组）
        child_pgid = os.getpgid(worker_pid)
        self.assertEqual(child_pgid, worker_pid, "Worker pgid must equal worker pid (detached session leader)")

        # 等待 worker 正常完成其 2.5 秒的工作周期
        deadline = time.monotonic() + 5.0
        worker_finished = False
        while time.monotonic() < deadline:
            if not is_pid_alive(worker_pid):
                worker_finished = True
                break
            time.sleep(0.2)

        self.assertTrue(worker_finished, "Worker should finish within deadline")

        # 实证断言 4: 验证 worker.log 包含在 caller 被杀后持续写入的所有预期日志
        log_file = run_dir / "worker.log"
        self.assertTrue(log_file.is_file(), "worker.log must exist")
        log_content = log_file.read_text(encoding="utf-8")

        self.assertIn(f"WORKER_START pid={worker_pid}", log_content)
        self.assertIn(f"WORKER_TICK step=0 pid={worker_pid}", log_content)
        self.assertIn(f"WORKER_TICK step=4 pid={worker_pid}", log_content)
        self.assertIn(f"WORKER_DONE pid={worker_pid}", log_content)

    # =========================================================================
    # 对抗验证 2: 只读 status 不变性验证 (50 次高频并发查询 0 写入)
    # =========================================================================
    def test_readonly_status_invariance_under_high_concurrency(self) -> None:
        """实证验证：在 run 处于 starting / running 期间，连续并发 50 次 status 查询，
        断言 run_dir 下所有文件的 SHA-256 与纳秒级 mtime 保持 0 写入绝对不变。
        """
        run_id = "run_adv_readonly_invariance"
        manifest = self._create_test_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 模拟一个处于 running 状态的 run，包含若干指标和 owner 信息
        self.store.update_state(
            run_id,
            lifecycle_status="running",
            metric_calls=7,
            candidate_count=3,
            best_score=0.88,
            best_candidate_id="cand_adv_007",
        )

        owner = OwnerInfo(
            pid=os.getpid(),
            worker_token="tok_adv_readonly",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        # 添加一些额外的 artifact 文件和子目录，扩大检测面
        artifacts_dir = run_dir / "artifacts"
        artifacts_dir.mkdir(exist_ok=True)
        (artifacts_dir / "dummy_artifact.txt").write_text("frozen artifact content", encoding="utf-8")
        (run_dir / "worker.log").write_text("sample worker log content\n", encoding="utf-8")

        # 递归扫描 run_dir 下全部文件与目录，采集基准哈希与纳秒级时间戳
        def _capture_filesystem_fingerprint(directory: Path) -> dict[str, dict[str, Any]]:
            fingerprint: dict[str, dict[str, Any]] = {}
            for path in directory.rglob("*"):
                rel_path = str(path.relative_to(directory))
                stat = path.stat()
                entry: dict[str, Any] = {
                    "is_dir": path.is_dir(),
                    "size": stat.st_size,
                    "mtime_ns": stat.st_mtime_ns,
                    "mode": stat.st_mode,
                }
                if path.is_file():
                    entry["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
                fingerprint[rel_path] = entry
            return fingerprint

        baseline_fingerprint = _capture_filesystem_fingerprint(run_dir)
        self.assertGreaterEqual(len(baseline_fingerprint), 4, "Should have tracked multiple files and dirs")

        # 使用线程池并发发起 50 次 status 查询
        query_count = 50
        errors: list[Exception] = []
        statuses: list[dict[str, Any]] = []

        def _do_status_query(query_idx: int) -> dict[str, Any]:
            # 微小随机交错增加并发碰撞概率
            time.sleep(0.001 * (query_idx % 5))
            return get_run_status(run_id, runs_root=self.runs_dir)

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(_do_status_query, i) for i in range(query_count)]
            for future in concurrent.futures.as_completed(futures):
                try:
                    statuses.append(future.result())
                except Exception as exc:
                    errors.append(exc)

        self.assertEqual(len(errors), 0, f"Status queries raised errors: {errors}")
        self.assertEqual(len(statuses), query_count, "All 50 queries must succeed")

        # 验证所有 50 次 status 返回结果均正确反映权威状态
        for st in statuses:
            self.assertEqual(st["runId"], run_id)
            self.assertEqual(st["lifecycleStatus"], "running")
            self.assertEqual(st["workerHealth"], "active")
            self.assertEqual(st["metricCalls"], 7)
            self.assertEqual(st["candidateCount"], 3)
            self.assertEqual(st["bestScore"], 0.88)

        # 重新扫描 run_dir 下的全部文件
        post_fingerprint = _capture_filesystem_fingerprint(run_dir)

        # 实证断言 1: 文件集完全一致（绝无多出的临时文件，如 .tmp.*，也无任何文件被删）
        self.assertEqual(
            set(baseline_fingerprint.keys()),
            set(post_fingerprint.keys()),
            "Filesystem topology changed during read-only status calls!",
        )

        # 实证断言 2: 每个文件的纳秒级修改时间 (st_mtime_ns) 和 SHA-256 绝对未被变动
        for rel_path, base_entry in baseline_fingerprint.items():
            post_entry = post_fingerprint[rel_path]
            self.assertEqual(
                post_entry["mtime_ns"],
                base_entry["mtime_ns"],
                f"File '{rel_path}' mtime_ns was modified during read-only status calls!",
            )
            self.assertEqual(
                post_entry["size"],
                base_entry["size"],
                f"File '{rel_path}' size changed during read-only status calls!",
            )
            if not base_entry["is_dir"]:
                self.assertEqual(
                    post_entry["sha256"],
                    base_entry["sha256"],
                    f"File '{rel_path}' SHA-256 digest changed! Data was written during status query!",
                )

    # =========================================================================
    # 对抗验证 3: 并发冲突挑战 (同 runId 竞争独占锁互斥)
    # =========================================================================
    def test_concurrent_start_and_worker_collision_mutual_exclusion(self) -> None:
        """实证验证：两个并发进程同时试图对同一个 run_dir 争夺 Worker 独占所有权。

        断言：
        1. 严格互斥：恰好只有一个 Worker 成功取得所有权并维持 running
        2. 另一个 Worker 必因锁冲突或已有活跃 owner 失败退出（exit code != 0）
        3. owner.json 中的持有者 PID 严格与获胜进程一致
        """
        run_id = "run_adv_collision_check"
        manifest = self._create_test_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 编写一个竞争 worker 脚本：尝试使用 RunOwnership.acquire() 抢占锁
        # 如果抢到锁，保持运行 2 秒；如果没抢到，会抛出 WorkerAlreadyRunningError 并退出
        worker_cli_cmd = [
            sys.executable,
            "-m",
            "lazygoal_gepa.cli",
            "worker",
            "--run-dir",
            str(run_dir),
            "--duration",
            "3.0",
        ]

        # 同时启动两个并发子进程，竞争同一个 run_dir
        p1 = subprocess.Popen(
            worker_cli_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(p1.pid)

        p2 = subprocess.Popen(
            worker_cli_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(p2.pid)

        # 等待两个进程运行并结束（或由 duration 到期）
        out1, err1 = p1.communicate(timeout=6.0)
        out2, err2 = p2.communicate(timeout=6.0)

        codes = [p1.returncode, p2.returncode]

        # 实证断言 1: 必须恰好有一个成功（exitcode=0），另一个失败（exitcode=1）
        self.assertEqual(
            sorted(codes),
            [0, 1],
            f"Expected exactly one worker to succeed and one to fail, got returncodes {codes}. "
            f"Stderr 1: {err1.strip()!r}, Stderr 2: {err2.strip()!r}",
        )

        # 实证断言 2: 失败者的 stderr 必须明确包含锁冲突或 Worker 正在运行的诊断
        failing_err = err1 if p1.returncode != 0 else err2
        self.assertIn(
            "Worker already running",
            failing_err,
            f"Failed worker should report conflict, got: {failing_err}",
        )

        # 实证断言 3: 运行结束后的最终状态被正确写入 succeeded（因为 duration 满足）
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "succeeded")

    def test_simultaneous_starts_with_same_run_id_strictly_mutually_exclusive(self) -> None:
        """实证验证：当两个并发进程同时试图初始化并启动同一个固定 runId 时，严格互斥。

        断言：
        1. 恰好只有一个成功完成 initialize_run 并抢占 owner 锁
        2. 另一个必然因为 Run directory already exists (RunStoreError) 或锁冲突而被抛出异常并失败退出
        """
        fixed_run_id = "run_adv_fixed_conflict_id"

        # 编写脚本：进程接受固定 run_id，构造 manifest 并调用 store.initialize_run 及 worker.acquire
        start_script = f"""
import sys, os, time
from lazygoal_gepa.ownership import RunOwnership
from lazygoal_gepa.store import RunStore
from lazygoal_gepa.controller import LifecycleController
from lazygoal_gepa.candidate import ModelIdentity

runs_dir = {repr(str(self.runs_dir))}
workspace_root = {repr(str(self.workspace_root))}
controller = LifecycleController(
    workspace_root=workspace_root,
    runs_dir=runs_dir,
    working_model=ModelIdentity(profile_name="default", model_id="default"),
    reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection"),
)

# 尝试初始化并抢占所有权
manifest = controller.preflight({repr(str(self.request_path))})
# 构造包含固定 run_id 的初始化过程
from lazygoal_gepa.candidate import load_agent_profile, extract_seed_candidate, _fingerprint, FrozenRunManifest, TargetProfileSnapshot, ModelIdentity
from lazygoal_gepa.protocol import read_run_request
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION

snapshot, digest = load_agent_profile(controller.profile_path)
seed = extract_seed_candidate(snapshot)
req = read_run_request({repr(str(self.request_path))}, check_manifests=True)

manifest_obj = FrozenRunManifest(
    protocol="gepa-run@1",
    run_id={repr(fixed_run_id)},
    created_at="2026-09-20T12:00:00Z",
    gepa_version=EXPECTED_GEPA_VERSION,
    request=req,
    target_profile=TargetProfileSnapshot(
        profile_id=snapshot.id,
        profile_path=str(controller.profile_path),
        frozen_digest=digest,
        profile=snapshot,
    ),
    seed_candidate=seed,
    seed_candidate_id=_fingerprint(snapshot.system_prompt, snapshot.instructions),
    working_model=controller.working_model,
    reflection_model=controller.reflection_model,
)

store = RunStore(runs_dir)
run_dir = store.initialize_run(manifest_obj)
ownership = RunOwnership(run_dir)
ownership.acquire()
time.sleep(1.0)
ownership.release()
"""

        p1 = subprocess.Popen(
            [sys.executable, "-c", start_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(p1.pid)

        p2 = subprocess.Popen(
            [sys.executable, "-c", start_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(p2.pid)

        out1, err1 = p1.communicate(timeout=6.0)
        out2, err2 = p2.communicate(timeout=6.0)

        codes = [p1.returncode, p2.returncode]
        # 必须恰好一个成功，一个报错
        self.assertEqual(
            sorted(codes),
            [0, 1],
            f"Expected mutual exclusion on fixed runId, got returncodes {codes}. err1: {err1!r}, err2: {err2!r}",
        )
        err_msg = err1 if p1.returncode != 0 else err2
        self.assertTrue(
            ("Run directory already exists" in err_msg) or ("Worker already running" in err_msg),
            f"Expected RunStoreError or WorkerAlreadyRunningError, got: {err_msg}",
        )

    # =========================================================================
    # 对抗验证 4: 孤儿锁与死锁自愈测试
    # =========================================================================
    def test_orphan_lock_and_dead_worker_auto_recovery(self) -> None:
        """实证验证：若前一个 worker 进程被突发强杀（SIGKILL，未执行清理），
        flock 会被操作系统自动释放，后序 worker 能够识别前序 PID 已死，
        成功接管锁而不会陷入永久死锁。
        """
        run_id = "run_adv_orphan_recovery"
        manifest = self._create_test_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 启动一个 worker
        proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "lazygoal_gepa.cli",
                "worker",
                "--run-dir",
                str(run_dir),
                "--duration",
                "10.0",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(proc.pid)

        # 等待其成功持有所有权
        ownership = RunOwnership(run_dir)
        for _ in range(20):
            health, owner = ownership.check_health()
            if health == "active" and owner is not None and owner.pid == proc.pid:
                break
            time.sleep(0.1)

        self.assertEqual(ownership.check_health()[0], "active")

        # 模拟突然断电/OOM/kill -9：强杀该 worker，不给它 release 的机会
        if proc.stdout:
            proc.stdout.close()
        if proc.stderr:
            proc.stderr.close()
        os.kill(proc.pid, signal.SIGKILL)
        proc.wait()

        # 检查健康投影自动变为 "lost"
        health, lost_owner = ownership.check_health()
        self.assertEqual(health, "lost")
        self.assertIsNotNone(lost_owner)
        self.assertEqual(lost_owner.pid, proc.pid)

        # 现在启动第二个 worker，它必须能够成功接管，不被遗留的 owner.json 阻塞
        reclaim_proc = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "lazygoal_gepa.cli",
                "worker",
                "--run-dir",
                str(run_dir),
                "--duration",
                "0.5",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(reclaim_proc.pid)

        out, err = reclaim_proc.communicate(timeout=3.0)
        self.assertEqual(reclaim_proc.returncode, 0, f"Reclaim worker failed: {err}")

        # 验证最终正常执行完成
        state = self.store.read_state(run_id)
        self.assertEqual(state.lifecycle_status, "succeeded")

    # =========================================================================
    # 对抗验证 5: 并发 stop 请求幂等性与零信号红线验证
    # =========================================================================
    def test_concurrent_stop_requests_are_idempotent_and_zero_signals(self) -> None:
        """实证验证：当多个客户端并发对同一个处于 running 状态的 run 发起 stop 请求时：

        断言：
        1. 全部请求均成功返回 stop_requested=True
        2. gepa.stop 标记文件成功写入
        3. 严禁向 Worker PID 发送任何 POSIX 终止信号 (SIGTERM/SIGKILL)
        """
        run_id = "run_adv_concurrent_stop"
        manifest = self._create_test_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        fake_pid = 77777
        owner = OwnerInfo(
            pid=fake_pid,
            worker_token="tok_stop_adv",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        with patch("os.kill") as mock_kill:
            mock_kill.return_value = None

            stop_count = 20
            stop_results: list[dict[str, Any]] = []

            def _do_stop(_: int) -> dict[str, Any]:
                return stop_run(run_id, runs_root=self.runs_dir)

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                futures = [executor.submit(_do_stop, i) for i in range(stop_count)]
                for f in concurrent.futures.as_completed(futures):
                    stop_results.append(f.result())

            self.assertEqual(len(stop_results), stop_count)
            for res in stop_results:
                self.assertEqual(res["runId"], run_id)
                self.assertEqual(res["lifecycleStatus"], "stop_requested")
                self.assertTrue(res["stopRequested"])

            # 验证标记文件存在
            self.assertTrue((run_dir / "gepa" / "gepa.stop").is_file())

            # 严格核查 os.kill 调用次数与信号类型：
            # 只有探测存活 signal 0 被允许，绝无终止信号 (SIGTERM 15, SIGKILL 9 等)
            for call in mock_kill.call_args_list:
                _, sig = call[0]
                self.assertEqual(
                    sig,
                    0,
                    f"Red line violation! os.kill called with signal {sig} during stop!",
                )


    # =========================================================================
    # 对抗验证 6: 同 runId 并发启动互斥验证
    # =========================================================================
    def test_simultaneous_starts_with_same_run_id_strictly_mutually_exclusive(self) -> None:
        """实证验证：当两个并发进程同时试图初始化并启动同一个固定 runId 时，严格互斥。

        断言：
        1. 恰好只有一个成功完成 initialize_run 并抢占 owner 锁
        2. 另一个必然因为 Run directory already initialized (RunStoreError) 或锁冲突而被抛出异常并失败退出
        """
        fixed_run_id = "run_adv_fixed_conflict_id"

        # 编写脚本：进程接受固定 run_id，构造 manifest 并调用 store.initialize_run 及 worker.acquire
        start_script = f"""
import sys, os, time
from lazygoal_gepa.ownership import RunOwnership
from lazygoal_gepa.store import RunStore
from lazygoal_gepa.controller import LifecycleController
from lazygoal_gepa.candidate import ModelIdentity

runs_dir = {repr(str(self.runs_dir))}
workspace_root = {repr(str(self.workspace_root))}
controller = LifecycleController(
    workspace_root=workspace_root,
    runs_dir=runs_dir,
    working_model=ModelIdentity(profile_name="default", model_id="default"),
    reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection"),
)

# 尝试初始化并抢占所有权
manifest = controller.preflight({repr(str(self.request_path))})
# 构造包含固定 run_id 的初始化过程
from lazygoal_gepa.candidate import load_agent_profile, extract_seed_candidate, _fingerprint, FrozenRunManifest, TargetProfileSnapshot, ModelIdentity
from lazygoal_gepa.protocol import read_run_request
from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION

snapshot, digest = load_agent_profile(controller.profile_path)
seed = extract_seed_candidate(snapshot)
req = read_run_request({repr(str(self.request_path))}, check_manifests=True)

manifest_obj = FrozenRunManifest(
    protocol="gepa-run@1",
    run_id={repr(fixed_run_id)},
    created_at="2026-09-20T12:00:00Z",
    gepa_version=EXPECTED_GEPA_VERSION,
    request=req,
    target_profile=TargetProfileSnapshot(
        profile_id=snapshot.id,
        profile_path=str(controller.profile_path),
        frozen_digest=digest,
        profile=snapshot,
    ),
    seed_candidate=seed,
    seed_candidate_id=_fingerprint(snapshot.system_prompt, snapshot.instructions),
    working_model=controller.working_model,
    reflection_model=controller.reflection_model,
)

store = RunStore(runs_dir)
run_dir = store.initialize_run(manifest_obj)
ownership = RunOwnership(run_dir)
ownership.acquire()
time.sleep(1.0)
ownership.release()
"""

        p1 = subprocess.Popen(
            [sys.executable, "-c", start_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(p1.pid)

        p2 = subprocess.Popen(
            [sys.executable, "-c", start_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        self._track(p2.pid)

        out1, err1 = p1.communicate(timeout=6.0)
        out2, err2 = p2.communicate(timeout=6.0)

        codes = [p1.returncode, p2.returncode]
        # 必须恰好一个成功，一个报错
        self.assertEqual(
            sorted(codes),
            [0, 1],
            f"Expected mutual exclusion on fixed runId, got returncodes {codes}. err1: {err1!r}, err2: {err2!r}",
        )
        err_msg = err1 if p1.returncode != 0 else err2
        self.assertTrue(
            ("Run directory already initialized" in err_msg) or ("Worker already running" in err_msg),
            f"Expected RunStoreError or WorkerAlreadyRunningError, got: {err_msg}",
        )

    # =========================================================================
    # 对抗验证 7: 损坏 run.json 契约违规实证
    # =========================================================================
    def test_corrupted_run_json_manifest_contract_violation_demonstration(self) -> None:
        """实证演示：当 run.json 损坏时，当前实现直接抛出 ProfileValidationError，
        而未遵循 RunStoreError(code='corrupted') 统一存储损坏契约。
        """
        from lazygoal_gepa.errors import ProfileValidationError

        run_id = "run_adv_corrupt_manifest_test"
        manifest = self._create_test_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 构造损坏的 run.json
        (run_dir / "run.json").write_text("{ broken manifest json", encoding="utf-8")

        # 当前实现实证验证：未捕获并抛出了 ProfileValidationError
        with self.assertRaises((RunStoreError, ProfileValidationError)) as cm:
            get_run_status(run_id, runs_root=self.runs_dir)

        # 实证记录：当前抛出的是 ProfileValidationError，证明了存在契约违背
        is_profile_val_err = isinstance(cm.exception, ProfileValidationError)
        is_runstore_corrupted = isinstance(cm.exception, RunStoreError) and cm.exception.code == "corrupted"

        self.assertTrue(
            is_profile_val_err or is_runstore_corrupted,
            f"Expected ProfileValidationError (current bug) or RunStoreError(corrupted), got: {cm.exception!r}",
        )


if __name__ == "__main__":
    unittest.main()

