"""Adversarial tests for the GEPA status, storage, and command-line boundary.

The suite checks:
1. Corruption & Anomaly Fault Tolerance: Pathological and adversarial inputs
   (corrupted state.json, corrupted owner.json, corrupted run.json, nonexistent runId,
   path traversal runId, unformed directory). Assert status command catches them accurately
   (e.g., workerHealth="corrupt" or RunStoreError code="corrupted"/"unformed") and NEVER
   crashes with an unhandled Python traceback.
2. CLI Single-Line Strict JSON Contract: Audit supported CLI subcommands across success and failure
   modes. Assert stdout on success is 100% strictly single-line parsable JSON without prefix/suffix/log
   pollution; verify disabled execution commands fail with an explicit diagnostic, no stdout, and no
   Run state or Worker ownership side effects. Failure diagnostics remain on stderr without raw tracebacks.
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
    launch_detached_worker,
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
        self.runs_dir = self.root / "test-runs" / "gepa"
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.store = RunStore(self.runs_dir)

        lazygoal_home = self.root / "lazygoal-home"
        config_dir = lazygoal_home
        profiles_dir = config_dir / "profiles"
        profiles_dir.mkdir(parents=True, exist_ok=True)
        (config_dir / "config.toml").write_text(
            "\n".join(
                [
                    "[providers.openai.working]",
                    'api_key = "test-working"',
                    "[[providers.openai.working.models]]",
                    'id = "default"',
                    "context_window = 128000",
                    "max_output_tokens = 8192",
                    "[providers.openai.reflection]",
                    'api_key = "test-reflection"',
                    "[[providers.openai.reflection.models]]",
                    'id = "reflection"',
                    "context_window = 65536",
                    "max_output_tokens = 8192",
                    "[gepa]",
                    'reflection_profile = "gepa-reflection"',
                    "",
                ]
            ),
            encoding="utf-8",
        )
        (profiles_dir / "default.toml").write_text(
            '[llm]\nprovider = "working"\nmodel = "default"\n', encoding="utf-8"
        )
        (profiles_dir / "gepa-reflection.toml").write_text(
            '[llm]\nprovider = "reflection"\nmodel = "reflection"\n', encoding="utf-8"
        )
        self.env_patch = patch.dict(os.environ, {"LAZYGOAL_HOME": str(lazygoal_home)})
        self.env_patch.start()

        # Baseline default profile
        self.profile_dir = lazygoal_home / "agent-profiles"
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
            working_model=ModelIdentity(profile_name="default", model_id="default", provider="working"),
            reflection_model=ModelIdentity(profile_name="gepa-reflection", model_id="reflection", provider="reflection"),
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
            res = LifecycleController(runs_dir=self.runs_dir).stop(run_id)

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
            res = LifecycleController(runs_dir=self.runs_dir).stop(run_id)
            self.assertEqual(res["lifecycleStatus"], "stop_requested")
            monitor.assert_no_termination_signals()

        # 2. 状态已是 stopped
        self.store.update_state(run_id, lifecycle_status="stopped")
        with SignalMonitor() as monitor:
            res_stopped = LifecycleController(runs_dir=self.runs_dir).stop(run_id)
            self.assertEqual(res_stopped["lifecycleStatus"], "stopped")
            monitor.assert_no_termination_signals()

        # 3. 状态已是 succeeded
        self.store.update_state(run_id, lifecycle_status="succeeded")
        with SignalMonitor() as monitor:
            res_succ = LifecycleController(runs_dir=self.runs_dir).stop(run_id)
            self.assertEqual(res_succ["lifecycleStatus"], "succeeded")
            monitor.assert_no_termination_signals()

        # 4. 状态已是 failed
        self.store.update_state(run_id, lifecycle_status="failed")
        with SignalMonitor() as monitor:
            res_failed = LifecycleController(runs_dir=self.runs_dir).stop(run_id)
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
                    LifecycleController(runs_dir=self.runs_dir).status(run_id)
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
                status_dict = LifecycleController(runs_dir=self.runs_dir).status(run_id)
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
                    LifecycleController(runs_dir=self.runs_dir).status(bad_id)
                
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
            LifecycleController(runs_dir=self.runs_dir).status(empty_run_id)
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
        """可用的只读与控制子命令必须输出严格单行 JSON。"""
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

        # Execution is unavailable; exercise the supported read-only/control commands on a fixture Run.
        run_id = "run_adv_readonly_cli_contract"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(
            run_id,
            lifecycle_status="succeeded",
            publication_status="unchanged",
            best_score=1.0,
        )
        generate_and_save_run_report(run_dir)

        for argv in (
            ["status", "--run", run_id, "--runs-dir", str(self.runs_dir)],
            ["stop", "--run", run_id, "--runs-dir", str(self.runs_dir)],
            ["report", "--run", run_id, "--runs-dir", str(self.runs_dir)],
            ["wait", "--run", run_id, "--runs-dir", str(self.runs_dir)],
        ):
            stdout_buf = io.StringIO()
            stderr_buf = io.StringIO()
            with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                code = cli_main(argv)
            self.assertEqual(code, 0, f"CLI command should succeed: {argv}")
            self.assertStrictSingleLineJson(stdout_buf.getvalue())

    def test_execution_cli_commands_report_unsupported_without_output(self) -> None:
        """start、resume 与 worker 都明确拒绝，且不写入成功结果。"""
        run_id = "run_adv_disabled_cli_contract"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        initial_lifecycle_status = self.store.read_state(run_id).lifecycle_status
        scenarios = (
            ["start", "--request", str(self.request_path), "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)],
            ["start", "--request", str(self.request_path), "--yes", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)],
            ["resume", "--run", run_id, "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)],
            ["resume", "--run", run_id, "--yes", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)],
        )
        for argv in scenarios:
            stdout_buf = io.StringIO()
            stderr_buf = io.StringIO()
            with self.subTest(command=argv[0], confirmed="--yes" in argv), patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                code = cli_main(argv)
            self.assertEqual(code, 1)
            self.assertEqual(stdout_buf.getvalue(), "")
            self.assertIn("Unsupported: GEPA execution is currently unavailable in the Worker/Trigger runtime.", stderr_buf.getvalue())
            self.assertNotIn("Traceback (most recent call last):", stderr_buf.getvalue())
        self.assertFalse((run_dir / "owner.json").exists())
        self.assertEqual(self.store.read_state(run_id).lifecycle_status, initial_lifecycle_status)

    def test_cli_subcommands_failure_zero_stdout_pollution(self) -> None:
        """受支持子命令的失败保持 stdout 为空，诊断写入 stderr 且不泄露裸 Traceback。"""
        run_id = "run_adv_disabled_worker_cli"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        failure_scenarios = [
            # A disabled operation fails with the same explicit reason regardless of confirmation flags.
            ("start_disabled", ["start", "--request", str(self.request_path), "--yes", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "Unsupported: GEPA execution"),
            ("resume_disabled", ["resume", "--run", run_id, "--yes", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "Unsupported: GEPA execution"),
            # Supported command failures retain their normal diagnostics.
            ("preflight_missing_req", ["preflight", "--request", "/tmp/non_existent_req_xyz.json", "--workspace-root", str(self.workspace_root), "--runs-dir", str(self.runs_dir)], "GEPARunProtocolError"),
            ("stop_missing_run", ["stop", "--run", "run_non_existent", "--runs-dir", str(self.runs_dir)], "RunStoreError"),
            ("report_not_ready", ["report", "--run", run_id, "--runs-dir", str(self.runs_dir)], "ReportNotReadyError"),
            ("status_missing_args", ["status"], "error: the following arguments are required: --run"),
        ]

        for label, argv, expected_err_keyword in failure_scenarios:
            with self.subTest(failure_case=label):
                stdout_buf = io.StringIO()
                stderr_buf = io.StringIO()
                with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
                    code = cli_main(argv)

                self.assertNotEqual(code, 0, f"Scenario {label} must exit with non-zero code")
                self.assertEqual(stdout_buf.getvalue(), "", f"STDOUT POLLUTION DETECTED in scenario {label}: {stdout_buf.getvalue()!r}")
                stderr_out = stderr_buf.getvalue()
                self.assertIn(expected_err_keyword, stderr_out, f"Expected error keyword {expected_err_keyword!r} in stderr for {label}")
                self.assertNotIn("Traceback (most recent call last):", stderr_out, f"RAW TRACEBACK LEAKED in scenario {label}: {stderr_out}")

    def test_disabled_worker_subcommand_does_not_start_a_worker(self) -> None:
        """内部 worker 入口明确不可用，不占有 Run 或创建进程。"""
        stdout_buf = io.StringIO()
        stderr_buf = io.StringIO()
        run_id = "run_adv_failure_contract"
        manifest = self._create_helper_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)
        before = self.store.read_state(run_id)
        with patch("sys.stdout", stdout_buf), patch("sys.stderr", stderr_buf):
            code = cli_main(["worker", "--run-dir", str(run_dir)])
        self.assertEqual(code, 1)
        self.assertEqual(stdout_buf.getvalue(), "")
        self.assertIn("Unsupported: GEPA execution", stderr_buf.getvalue())
        self.assertNotIn("Traceback (most recent call last):", stderr_buf.getvalue())
        self.assertEqual(self.store.read_state(run_id), before)
        self.assertFalse((run_dir / "owner.json").exists())

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
                    LifecycleController(runs_dir=self.runs_dir).status(run_id)

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

        # 2. 顶层 start is unavailable: exit code 1, stdout empty, explicit stderr diagnostic.
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
                "--yes",
            ],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(p_fail.returncode, 1)
        self.assertEqual(p_fail.stdout, "", f"stdout must be empty, got: {p_fail.stdout!r}")
        self.assertIn("Unsupported: GEPA execution is currently unavailable in the Worker/Trigger runtime.", p_fail.stderr)
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
