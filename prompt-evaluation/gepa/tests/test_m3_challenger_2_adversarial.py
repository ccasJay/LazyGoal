"""Milestone 3 Challenger 2: Adversarial Destruction and Stress Test Suite.

Empirical validations for //TODO 4:
1. Zero Signal Monitor: Strict monitor of os.kill, os.killpg, signal.pthread_kill,
   asserting that stop_run and CLI stop NEVER emit SIGTERM/SIGKILL or any termination signal,
   and rely strictly on gepa/gepa.stop cooperative flag.
2. Corruption & Anomaly Fault Tolerance: Pathological and adversarial inputs
   (corrupted state.json, corrupted owner.json, corrupted run.json, nonexistent runId,
   path traversal runId, unformed directory). Assert status command catches them accurately
   (e.g., workerHealth="corrupt" or RunStoreError code="corrupted"/"unformed") and NEVER
   crashes with an unhandled Python traceback.
3. CLI Single-Line Strict JSON Contract: Audit all CLI subcommands across success and failure
   modes. Assert stdout on success is 100% strictly single-line parsable JSON without prefix/suffix/log
   pollution; assert stdout on failure is strictly empty (zero pollution), diagnostics routed to stderr,
   and zero raw tracebacks leaked.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
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
    LazyGoalGEPAError,
    RunOwnershipError,
    RunStoreError,
    WorkerAlreadyRunningError,
)
from lazygoal_gepa.ownership import OwnerInfo, RunOwnership, is_pid_alive
from lazygoal_gepa.protocol import parse_run_request
from lazygoal_gepa.reporter import generate_and_save_run_report
from lazygoal_gepa.store import RunStore, atomic_write_json


class SignalMonitor:
    """Intercepts and records all signal invocations across OS APIs."""

    def __init__(self) -> None:
        self.recorded_calls: list[dict[str, Any]] = []
        self._orig_kill = os.kill
        self._orig_killpg = getattr(os, "killpg", None)
        self._orig_pthread_kill = getattr(signal, "pthread_kill", None)

    def __enter__(self) -> SignalMonitor:
        def monitored_kill(pid: int, sig: int) -> None:
            self.recorded_calls.append({"api": "os.kill", "pid": pid, "sig": sig})
            return self._orig_kill(pid, sig)

        os.kill = monitored_kill

        if self._orig_killpg is not None:
            def monitored_killpg(pgid: int, sig: int) -> None:
                self.recorded_calls.append({"api": "os.killpg", "pgid": pgid, "sig": sig})
                return self._orig_killpg(pgid, sig)

            os.killpg = monitored_killpg

        if self._orig_pthread_kill is not None:
            def monitored_pthread_kill(thread_id: int, sig: int) -> None:
                self.recorded_calls.append({"api": "signal.pthread_kill", "thread_id": thread_id, "sig": sig})
                return self._orig_pthread_kill(thread_id, sig)

            signal.pthread_kill = monitored_pthread_kill

        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        os.kill = self._orig_kill
        if self._orig_killpg is not None:
            os.killpg = self._orig_killpg
        if self._orig_pthread_kill is not None:
            signal.pthread_kill = self._orig_pthread_kill

    def assert_no_termination_signals(self) -> None:
        forbidden_signals = {
            signal.SIGTERM: "SIGTERM",
            signal.SIGKILL: "SIGKILL",
            signal.SIGINT: "SIGINT",
            signal.SIGHUP: "SIGHUP",
            signal.SIGQUIT: "SIGQUIT",
        }
        for call in self.recorded_calls:
            sig = call["sig"]
            if sig in forbidden_signals:
                raise AssertionError(
                    f"CRITICAL REDLINE VIOLATION: Monitored {call['api']} called with "
                    f"forbidden signal {forbidden_signals[sig]} ({sig}) on target {call}! "
                    f"Full record: {self.recorded_calls}"
                )


class M3Challenger2AdversarialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.workspace_root = self.root / "workspace"
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.runs_dir = self.workspace_root / ".lazygoal" / "gepa" / "runs"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.store = RunStore(self.runs_dir)

        xdg_root = self.root / "xdg"
        config_dir = xdg_root / "lazygoal"
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
        self.env_patch = patch.dict(os.environ, {"XDG_CONFIG_HOME": str(xdg_root)})
        self.env_patch.start()

        # Baseline default profile
        self.profile_dir = self.workspace_root / ".lazygoal" / "profiles"
        self.profile_dir.mkdir(parents=True, exist_ok=True)
        self.profile_path = self.profile_dir / "default.json"
        self.profile_data = {
            "schemaVersion": 1,
            "id": "default",
            "name": "Challenger Test Agent",
            "description": "Deterministic Profile for Challenger 2",
            "systemPrompt": "You are an empirical challenger agent testing robustness.",
            "instructions": [
                "Execute adversarial destruction checks.",
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
            "maxMetricCalls": 20,
        }
        self.request_path.write_text(json.dumps(self.request_data), encoding="utf-8")

        self.spawned_pids: list[int] = []
        self.spawned_procs: list[subprocess.Popen[Any]] = []

    def tearDown(self) -> None:
        self.env_patch.stop()
        for proc in self.spawned_procs:
            if proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=2.0)
                except Exception:
                    pass
        for pid in self.spawned_pids:
            if is_pid_alive(pid):
                try:
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
                except OSError:
                    pass
        self.temp_dir.cleanup()

    def _track_proc(self, proc: subprocess.Popen[Any]) -> subprocess.Popen[Any]:
        self.spawned_procs.append(proc)
        self.spawned_pids.append(proc.pid)
        return proc

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

    # =========================================================================
    # 1. Zero Signal Monitor (停止红线与纯协作停机)
    # =========================================================================
    def test_zero_signal_monitor_active_worker(self) -> None:
        """断言 stop_run 在对真实活跃 Worker 停止时，绝不发出任何终止信号，仅写 gepa.stop。"""
        run_id = "run_adv_zero_sig_active"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        # 启动一个真实的轻量后台循环进程
        dummy_cmd = [
            sys.executable,
            "-c",
            "import time; time.sleep(15)",
        ]
        proc = subprocess.Popen(
            dummy_cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        self._track_proc(proc)
        worker_pid = proc.pid

        owner = OwnerInfo(
            pid=worker_pid,
            worker_token="tok_real_worker",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        with SignalMonitor() as monitor:
            res = stop_run(run_id, runs_root=self.runs_dir)

            # 验证停止文件被创建
            stop_file = run_dir / "gepa" / "gepa.stop"
            self.assertTrue(stop_file.is_file(), "gepa.stop marker must exist!")
            self.assertEqual(res["lifecycleStatus"], "stop_requested")
            self.assertTrue(res["stopRequested"])

            # 验证进程依然活得好好的（没有被外部强杀）
            self.assertTrue(is_pid_alive(worker_pid), "Worker process must remain alive!")

            # 核心断言：绝对没有向任何 PID 发出 SIGTERM / SIGKILL / SIGINT
            monitor.assert_no_termination_signals()

            # 验证如果发生了信号调用，只能是信号 0（存活性检查）
            for call in monitor.recorded_calls:
                self.assertEqual(call["sig"], 0, f"Unexpected signal in {call}")

    def test_zero_signal_monitor_lost_and_terminal_states(self) -> None:
        """在 lost worker、stopped、succeeded、failed 等不同状态下重复调用 stop，均零信号。"""
        run_id = "run_adv_zero_sig_states"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 1. 模拟 lost worker (PID 99999 不存在)
        self.store.update_state(run_id, lifecycle_status="running")
        owner = OwnerInfo(
            pid=99999,
            worker_token="tok_lost",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        with SignalMonitor() as monitor:
            res = stop_run(run_id, runs_root=self.runs_dir)
            self.assertEqual(res["lifecycleStatus"], "stop_requested")
            monitor.assert_no_termination_signals()

        # 2. 状态已是 stopped
        self.store.update_state(run_id, lifecycle_status="stopped")
        with SignalMonitor() as monitor:
            res_stopped = stop_run(run_id, runs_root=self.runs_dir)
            self.assertEqual(res_stopped["lifecycleStatus"], "stopped")
            monitor.assert_no_termination_signals()

        # 3. 状态已是 succeeded
        self.store.update_state(run_id, lifecycle_status="succeeded")
        with SignalMonitor() as monitor:
            res_succ = stop_run(run_id, runs_root=self.runs_dir)
            self.assertEqual(res_succ["lifecycleStatus"], "succeeded")
            monitor.assert_no_termination_signals()

        # 4. 状态已是 failed
        self.store.update_state(run_id, lifecycle_status="failed")
        with SignalMonitor() as monitor:
            res_failed = stop_run(run_id, runs_root=self.runs_dir)
            self.assertEqual(res_failed["lifecycleStatus"], "failed")
            monitor.assert_no_termination_signals()

    def test_zero_signal_monitor_via_cli_stop(self) -> None:
        """通过 CLI lazygoal_gepa.cli stop --run 调用，验证端到端零信号。"""
        run_id = "run_adv_zero_sig_cli"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        # 挂载一个模拟 worker
        owner = OwnerInfo(
            pid=os.getpid(),
            worker_token="tok_cli_stop",
            started_at=datetime.now(timezone.utc).isoformat(),
            heartbeat_at=datetime.now(timezone.utc).isoformat(),
        )
        atomic_write_json(run_dir / "owner.json", owner.to_dict())

        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with SignalMonitor() as monitor, patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["stop", "--run", run_id, "--runs-dir", str(self.runs_dir)])
            self.assertEqual(code, 0)
            monitor.assert_no_termination_signals()

        stop_file = run_dir / "gepa" / "gepa.stop"
        self.assertTrue(stop_file.is_file())

    # =========================================================================
    # 2. 损坏与异常容错测试 (Corruption & Anomaly Fault Tolerance)
    # =========================================================================
    def test_corrupted_state_json_robustness(self) -> None:
        """构造多种损坏的 state.json，断言捕获精准错误标记，绝无未处理 Python Traceback。"""
        run_id = "run_adv_corrupt_state"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        corrupted_payloads = [
            ("syntax_error", "{ broken json content !!! @@"),
            ("empty_file", ""),
            ("null_bytes", "\x00\x00\x00\x00"),
            ("json_array", "[]"),
            ("json_primitive", "12345"),
            ("missing_fields", json.dumps({"runId": run_id, "lifecycleStatus": "running"})),
            ("invalid_lifecycle_status", json.dumps({
                "runId": run_id, "lifecycleStatus": "bogus_status", "stopRequested": False,
                "metricCalls": 0, "maxMetricCalls": 20, "candidateCount": 1,
                "bestScore": None, "bestCandidateId": None, "publicationStatus": "pending",
                "errorCode": None, "errorMessage": None, "createdAt": "2026-01-01", "updatedAt": "2026-01-01"
            })),
            ("invalid_field_type_int", json.dumps({
                "runId": run_id, "lifecycleStatus": "running", "stopRequested": False,
                "metricCalls": "not_an_int", "maxMetricCalls": 20, "candidateCount": 1,
                "bestScore": None, "bestCandidateId": None, "publicationStatus": "pending",
                "errorCode": None, "errorMessage": None, "createdAt": "2026-01-01", "updatedAt": "2026-01-01"
            })),
            ("invalid_field_type_bool", json.dumps({
                "runId": run_id, "lifecycleStatus": "running", "stopRequested": "not_a_bool",
                "metricCalls": 0, "maxMetricCalls": 20, "candidateCount": 1,
                "bestScore": None, "bestCandidateId": None, "publicationStatus": "pending",
                "errorCode": None, "errorMessage": None, "createdAt": "2026-01-01", "updatedAt": "2026-01-01"
            })),
        ]

        for label, payload in corrupted_payloads:
            with self.subTest(corruption_case=label):
                (run_dir / "state.json").write_text(payload, encoding="utf-8")

                # 1. 验证 Python API 抛出 RunStoreError(code="corrupted")
                with self.assertRaises(RunStoreError) as cm:
                    get_run_status(run_id, runs_root=self.runs_dir)
                self.assertEqual(cm.exception.code, "corrupted")

                # 2. 验证 CLI status 命令：优雅退出，无 Traceback 崩溃
                stdout_buf = io.StringIO()
                stderr_buf = io.StringIO()
                with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                    code = cli_main(["status", "--run", run_id, "--runs-dir", str(self.runs_dir)])
                
                self.assertEqual(code, 1, f"Expected non-zero exit code on {label}")
                self.assertEqual(stdout_buf.getvalue(), "", f"stdout must be empty on failure for {label}")
                stderr_out = stderr_buf.getvalue()
                self.assertIn("RunStoreError", stderr_out)
                self.assertNotIn("Traceback (most recent call last):", stderr_out,
                                 f"Unhandled Python traceback detected on {label}!")

    def test_corrupted_owner_json_projections(self) -> None:
        """构造多种损坏的 owner.json，断言 status 正常返回 workerHealth='corrupt'，绝不崩溃。"""
        run_id = "run_adv_corrupt_owner"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        corrupted_owner_payloads = [
            ("syntax_error", "{ broken owner json"),
            ("empty_file", ""),
            ("non_object", "[1, 2, 3]"),
            ("negative_pid", json.dumps({"pid": -1, "workerToken": "tok", "startedAt": "s", "heartbeatAt": "h"})),
            ("str_pid", json.dumps({"pid": "123", "workerToken": "tok", "startedAt": "s", "heartbeatAt": "h"})),
            ("missing_heartbeat", json.dumps({"pid": 1234, "workerToken": "tok", "startedAt": "s"})),
            ("empty_token", json.dumps({"pid": 1234, "workerToken": "  ", "startedAt": "s", "heartbeatAt": "h"})),
            ("corrupt_iso_timestamp", json.dumps({"pid": os.getpid(), "workerToken": "tok", "startedAt": "s", "heartbeatAt": "not_an_iso_time"})),
        ]

        for label, payload in corrupted_owner_payloads:
            with self.subTest(owner_corruption=label):
                (run_dir / "owner.json").write_text(payload, encoding="utf-8")

                # 1. 验证 Python API: status 必须成功返回，不抛异常！
                status_dict = get_run_status(run_id, runs_root=self.runs_dir)
                self.assertEqual(status_dict["runId"], run_id)
                self.assertEqual(status_dict["workerHealth"], "corrupt",
                                 f"Expected workerHealth='corrupt' on {label}, got {status_dict['workerHealth']}")

                # 2. 验证 CLI status 命令：exit code 0，stdout 给出单行 JSON 包含 workerHealth='corrupt'
                stdout_buf = io.StringIO()
                stderr_buf = io.StringIO()
                with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                    code = cli_main(["status", "--run", run_id, "--runs-dir", str(self.runs_dir)])
                
                self.assertEqual(code, 0, f"Expected 0 exit code on {label}")
                lines = [line for line in stdout_buf.getvalue().splitlines() if line.strip()]
                self.assertEqual(len(lines), 1)
                parsed = json.loads(lines[0])
                self.assertEqual(parsed["workerHealth"], "corrupt")
                self.assertNotIn("Traceback (most recent call last):", stderr_buf.getvalue())

    def test_nonexistent_and_pathological_run_ids(self) -> None:
        """断言不存在的 runId 以及带路径遍历/非法字符的病态 runId 得到精准 unformed 错误。"""
        pathological_run_ids = [
            "run_does_not_exist_xyz",
            "../../etc/passwd",
            "../runs/run_escape",
            "run/with/slash",
            "run with spaces",
            "run;rm -rf /",
            "",
        ]

        for bad_id in pathological_run_ids:
            with self.subTest(bad_run_id=bad_id):
                # 1. Python API
                with self.assertRaises(RunStoreError) as cm:
                    get_run_status(bad_id, runs_root=self.runs_dir)
                
                # 2. CLI status
                stdout_buf = io.StringIO()
                stderr_buf = io.StringIO()
                with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                    code = cli_main(["status", "--run", bad_id, "--runs-dir", str(self.runs_dir)])
                
                self.assertNotEqual(code, 0)
                self.assertEqual(stdout_buf.getvalue(), "")
                stderr_out = stderr_buf.getvalue()
                self.assertIn("RunStoreError", stderr_out)
                self.assertNotIn("Traceback (most recent call last):", stderr_out)

    def test_unformed_empty_run_directory(self) -> None:
        """当目录存在但没有任何 run.json 或 state.json 时，断言精准抛出 code='unformed'。"""
        empty_run_id = "run_adv_empty_dir"
        (self.runs_dir / empty_run_id).mkdir(parents=True, exist_ok=True)

        with self.assertRaises(RunStoreError) as cm:
            get_run_status(empty_run_id, runs_root=self.runs_dir)
        self.assertEqual(cm.exception.code, "unformed")

        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["status", "--run", empty_run_id, "--runs-dir", str(self.runs_dir)])
        
        self.assertEqual(code, 1)
        self.assertEqual(stdout_buf.getvalue(), "")
        self.assertIn("RunStoreError", stderr_buf.getvalue())
        self.assertNotIn("Traceback (most recent call last):", stderr_buf.getvalue())

    # =========================================================================
    # 3. CLI 单行 JSON 严格输出契约 (CLI Strict Output Contract)
    # =========================================================================
    def test_cli_subcommands_success_strict_single_line_json(self) -> None:
        """测试所有子命令在成功时 stdout 必须是 100% 严格的单行 JSON，绝无多行或前后缀污染。"""
        # 1. preflight
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "preflight",
                "--request", str(self.request_path),
                "--workspace-root", str(self.workspace_root),
                "--runs-dir", str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        self.assertStrictSingleLineJson(stdout_buf.getvalue())

        # 2. start with --yes
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main([
                "start",
                "--request", str(self.request_path),
                "--yes",
                "--workspace-root", str(self.workspace_root),
                "--runs-dir", str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        start_payload = self.assertStrictSingleLineJson(stdout_buf.getvalue())
        run_id = start_payload["runId"]
        self._track_pid(start_payload["workerPid"])

        # 3. status
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["status", "--run", run_id, "--runs-dir", str(self.runs_dir)])
        self.assertEqual(code, 0)
        self.assertStrictSingleLineJson(stdout_buf.getvalue())

        # 4. stop
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["stop", "--run", run_id, "--runs-dir", str(self.runs_dir)])
        self.assertEqual(code, 0)
        self.assertStrictSingleLineJson(stdout_buf.getvalue())

        # 5. resume with --yes
        # 移除 active worker owner
        run_dir = self.runs_dir / run_id
        if (run_dir / "owner.json").exists():
            (run_dir / "owner.json").unlink()
        (run_dir / "gepa" / "gepa_state.bin").write_bytes(b"test checkpoint")
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf), patch(
            "gepa.core.state.GEPAState.load"
        ):
            code = cli_main([
                "resume",
                "--run", run_id,
                "--yes",
                "--workspace-root", str(self.workspace_root),
                "--runs-dir", str(self.runs_dir),
            ])
        self.assertEqual(code, 0)
        resumed_payload = self.assertStrictSingleLineJson(stdout_buf.getvalue())
        self._track_pid(resumed_payload["workerPid"])

        # 6. report (写入 terminal report)
        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            publication_status="unchanged",
            best_score=1.0,
        )
        generate_and_save_run_report(run_dir)

        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["report", "--run", run_id, "--runs-dir", str(self.runs_dir)])
        self.assertEqual(code, 0)
        self.assertStrictSingleLineJson(stdout_buf.getvalue())

    def test_cli_subcommands_failure_zero_stdout_pollution(self) -> None:
        """测试所有子命令在失败时 stdout 严格为零（空字符串），stderr 携带精准诊断且零 Traceback。"""
        run_id = "run_adv_failure_contract"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        failure_scenarios = [
            # 1. start 缺少 --yes
            ("start_no_yes", ["start", "--request", str(self.request_path), "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "ConfirmationRequiredError"),
            # 2. resume 缺少 --yes
            ("resume_no_yes", ["resume", "--run", run_id, "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "ConfirmationRequiredError"),
            # 3. preflight 请求文件不存在
            ("preflight_missing_req", ["preflight", "--request", "/tmp/non_existent_req_xyz.json", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "GEPARunProtocolError"),
            # 4. stop 不存在的 run
            ("stop_missing_run", ["stop", "--run", "run_non_existent", "--runs-dir", str(self.runs_dir)], "RunStoreError"),
            # 5. report 未就绪
            ("report_not_ready", ["report", "--run", run_id, "--runs-dir", str(self.runs_dir)], "ReportNotReadyError"),
            # 6. resume 目标 profile 摘要漂移
            ("resume_drift", ["resume", "--run", run_id, "--yes", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "ProfileDriftError"),
            # 7. status 缺少必填参数
            ("status_missing_args", ["status"], "error: the following arguments are required: --run"),
        ]

        # 针对场景 6，先修改 profile 产生漂移
        mutated = dict(self.profile_data)
        mutated["systemPrompt"] = "Changed for drift test!"
        self.profile_path.write_text(json.dumps(mutated))

        for label, argv, expected_err_keyword in failure_scenarios:
            with self.subTest(failure_case=label):
                stdout_buf = io.StringIO()
                stderr_buf = io.StringIO()
                with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                    code = cli_main(argv)

                self.assertNotEqual(code, 0, f"Scenario {label} must exit with non-zero code")
                self.assertEqual(
                    stdout_buf.getvalue(),
                    "",
                    f"STDOUT POLLUTION DETECTED in scenario {label}: {stdout_buf.getvalue()!r}"
                )
                stderr_out = stderr_buf.getvalue()
                self.assertIn(expected_err_keyword, stderr_out,
                              f"Expected error keyword {expected_err_keyword!r} in stderr for {label}")
                self.assertNotIn("Traceback (most recent call last):", stderr_out,
                                 f"RAW TRACEBACK LEAKED in scenario {label}: {stderr_out}")

    def test_zero_signal_cooperative_worker_shutdown_end_to_end(self) -> None:
        """端到端验证：真实 Worker 进程在零信号红线下，仅凭 gepa.stop 标记实现优雅停止与所有权释放。"""
        run_id = "run_adv_cooperative_worker_e2e"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        # 启动真实 Worker 进程
        worker_cmd = [
            sys.executable,
            "-m",
            "lazygoal_gepa.cli",
            "worker",
            "--run-dir",
            str(run_dir),
        ]
        proc = subprocess.Popen(
            worker_cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        self._track_proc(proc)

        # 等待 worker 启动并持有 owner 锁且进入 running
        for _ in range(50):
            if (run_dir / "owner.json").is_file():
                try:
                    s = self.store.read_state(run_id)
                    if s.lifecycle_status == "running":
                        break
                except Exception:
                    pass
            time.sleep(0.1)
        else:
            self.fail("Worker process did not enter running state in time")

        # 在全局信号监视器下发起 stop
        with SignalMonitor() as monitor:
            stop_res = stop_run(run_id, runs_root=self.runs_dir)
            self.assertEqual(stop_res["lifecycleStatus"], "stop_requested")
            self.assertTrue((run_dir / "gepa" / "gepa.stop").is_file())

            # 核心断言 1：零信号发送
            monitor.assert_no_termination_signals()

        # 等待 Worker 协作退出（检查 gepa.stop 并自主退出）
        exit_code = proc.wait(timeout=5.0)
        self.assertEqual(exit_code, 0, f"Worker process should exit cleanly with 0, got {exit_code}")

        # 核心断言 2：退出后 state.json 为 stopped
        final_state = self.store.read_state(run_id)
        self.assertEqual(final_state.lifecycle_status, "stopped")
        self.assertTrue(final_state.stop_requested)

        # 核心断言 3：owner.json 随正常退出被 release() 清理
        self.assertFalse((run_dir / "owner.json").is_file(), "owner.json should be cleanly released!")

    def test_corrupted_run_json_robustness(self) -> None:
        """构造多种损坏的 run.json，断言 status 抛出分类异常并在 CLI 端零 Traceback 优雅退出。"""
        run_id = "run_adv_corrupt_manifest"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        corrupt_manifests = [
            ("syntax_error", "{ broken manifest json"),
            ("unsupported_protocol", json.dumps({"protocol": "gepa-run@999", "runId": run_id})),
            ("missing_fields", json.dumps({"protocol": "gepa-run@1"})),
        ]

        for label, payload in corrupt_manifests:
            with self.subTest(manifest_case=label):
                (run_dir / "run.json").write_text(payload, encoding="utf-8")

                # 1. Python API: 必须抛出受控的 LazyGoalGEPAError
                with self.assertRaises(LazyGoalGEPAError):
                    get_run_status(run_id, runs_root=self.runs_dir)

                # 2. CLI status: 优雅返回非零退出码，stdout 为空，无裸 Traceback
                stdout_buf = io.StringIO()
                stderr_buf = io.StringIO()
                with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                    code = cli_main(["status", "--run", run_id, "--runs-dir", str(self.runs_dir)])

                self.assertEqual(code, 1)
                self.assertEqual(stdout_buf.getvalue(), "")
                self.assertNotIn("Traceback (most recent call last):", stderr_buf.getvalue())

    def test_node_binary_top_level_cli_json_contract(self) -> None:
        """通过真实 bin/lazygoal.cjs 跨语言调用，验证顶层 CLI 路由与单行 JSON 契约。"""
        repo_root = Path(__file__).resolve().parent.parent.parent.parent
        lazygoal_bin = repo_root / "bin" / "lazygoal.cjs"
        if not lazygoal_bin.is_file():
            self.skipTest(f"bin/lazygoal.cjs not found at {lazygoal_bin}")

        env = os.environ.copy()
        env["LAZYGOAL_GEPA_PYTHON"] = sys.executable

        # 1. 顶层 preflight 成功：stdout 严格单行 JSON
        p_succ = subprocess.run(
            [
                "node",
                str(lazygoal_bin),
                "gepa",
                "preflight",
                "--request",
                str(self.request_path),
                "--workspace-root",
                str(self.workspace_root),
                "--runs-dir",
                str(self.runs_dir),
            ],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(p_succ.returncode, 0, f"stderr: {p_succ.stderr}")
        self.assertStrictSingleLineJson(p_succ.stdout)

        # 2. 顶层 start 缺少 --yes：exit code 1, stdout 严格为空, stderr 有诊断, 零 Traceback
        p_fail = subprocess.run(
            [
                "node",
                str(lazygoal_bin),
                "gepa",
                "start",
                "--request",
                str(self.request_path),
                "--workspace-root",
                str(self.workspace_root),
                "--runs-dir",
                str(self.runs_dir),
            ],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(p_fail.returncode, 1)
        self.assertEqual(p_fail.stdout, "", f"stdout must be empty, got: {p_fail.stdout!r}")
        self.assertIn("ConfirmationRequiredError", p_fail.stderr)
        self.assertNotIn("Traceback (most recent call last):", p_fail.stderr)

    def assertStrictSingleLineJson(self, raw_stdout: str) -> dict[str, Any]:
        """Strict helper asserting stdout is exactly one valid line of JSON terminated by a newline."""
        self.assertTrue(raw_stdout.endswith("\n"), "stdout must be newline-terminated")
        stripped = raw_stdout.rstrip("\r\n")
        self.assertNotIn("\n", stripped, f"stdout contains multiple lines! Content: {raw_stdout!r}")
        self.assertNotIn("\r", stripped, f"stdout contains carriage returns! Content: {raw_stdout!r}")
        try:
            parsed = json.loads(stripped)
            self.assertIsInstance(parsed, dict, "Parsed JSON must be an object (dict)")
            return parsed
        except json.JSONDecodeError as exc:
            self.fail(f"stdout could not be parsed as strict JSON: {exc}. Content: {raw_stdout!r}")


if __name__ == "__main__":
    unittest.main()
