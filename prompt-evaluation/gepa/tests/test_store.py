from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
)
from lazygoal_gepa.errors import RunStoreError
from lazygoal_gepa.protocol import GEPAExampleRequest, GEPARunRequest
from lazygoal_gepa.store import RunState, RunStore, atomic_write_json


class RunStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.runs_dir = self.root / "runs"
        self.store = RunStore(self.runs_dir)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_manifest(self, run_id: str = "run_001") -> FrozenRunManifest:
        profile_snapshot = AgentProfileSnapshot(
            schema_version=1,
            id="default",
            name="Default Agent",
            description="Assistant",
            system_prompt="System prompt text",
            instructions=("Inst 1", "Inst 2"),
            tool_ids=("tool1",),
        )
        target_profile = TargetProfileSnapshot(
            profile_id="default",
            profile_path="/fake/profile.json",
            frozen_digest="a" * 64,
            profile=profile_snapshot,
        )
        request = GEPARunRequest(
            protocol="gepa-run@1",
            benchmark="alfworld",
            trainset=(
                GEPAExampleRequest(
                    sample_id="s1",
                    task_id="t1",
                    manifest_path="/fake/manifest.json",
                ),
            ),
            max_metric_calls=20,
        )
        return FrozenRunManifest(
            protocol="gepa-run@1",
            run_id=run_id,
            created_at="2026-09-20T10:00:00Z",
            gepa_version="0.1.4",
            request=request,
            target_profile=target_profile,
            seed_candidate={
                "system_prompt": "System prompt text",
                "instruction_000": "Inst 1",
                "instruction_001": "Inst 2",
            },
            seed_candidate_id="b" * 64,
            working_model=ModelIdentity("default", "gpt-4o"),
            reflection_model=ModelIdentity("gepa-reflection", "claude-3-5-sonnet"),
        )

    def test_run_directory_tree_initialization(self) -> None:
        manifest = self._create_manifest("run_init_test")
        run_dir = self.store.initialize_run(manifest)

        self.assertTrue(run_dir.is_dir())
        self.assertTrue((run_dir / "gepa").is_dir())
        self.assertTrue((run_dir / "adapter").is_dir())
        self.assertTrue((run_dir / "reflection").is_dir())
        self.assertTrue((run_dir / "artifacts").is_dir())

        self.assertTrue((run_dir / "run.json").is_file())
        self.assertTrue((run_dir / "request.json").is_file())
        self.assertTrue((run_dir / "artifacts" / "base-profile.json").is_file())
        self.assertTrue((run_dir / "state.json").is_file())

        # Check initial state values
        state = self.store.read_state("run_init_test")
        self.assertEqual(state.lifecycle_status, "starting")
        self.assertEqual(state.metric_calls, 0)
        self.assertEqual(state.max_metric_calls, 20)
        self.assertEqual(state.candidate_count, 1)
        self.assertFalse(state.stop_requested)
        self.assertEqual(state.publication_status, "pending")

    def test_immutable_run_json_persistence(self) -> None:
        manifest = self._create_manifest("run_immutable")
        self.store.initialize_run(manifest)

        read_back = self.store.read_manifest("run_immutable")
        self.assertEqual(read_back.run_id, "run_immutable")
        self.assertEqual(read_back.target_profile.frozen_digest, "a" * 64)
        self.assertEqual(read_back.working_model.model_id, "gpt-4o")

        # Double initialization should fail
        with self.assertRaises(RunStoreError):
            self.store.initialize_run(manifest)

    def test_atomic_state_mutation_via_temp_file(self) -> None:
        manifest = self._create_manifest("run_atomic")
        self.store.initialize_run(manifest)

        initial_state = self.store.read_state("run_atomic")

        # Mutate state
        updated = self.store.update_state(
            "run_atomic",
            lifecycle_status="running",
            metric_calls=5,
            candidate_count=2,
            best_score=0.85,
            best_candidate_id="cand_best_123",
        )

        self.assertEqual(updated.lifecycle_status, "running")
        self.assertEqual(updated.metric_calls, 5)
        self.assertEqual(updated.candidate_count, 2)
        self.assertEqual(updated.best_score, 0.85)
        self.assertEqual(updated.best_candidate_id, "cand_best_123")
        self.assertNotEqual(updated.updated_at, initial_state.updated_at)

        # Directly read state file to verify disk consistency
        on_disk = self.store.read_state("run_atomic")
        self.assertEqual(on_disk.metric_calls, 5)
        self.assertEqual(on_disk.best_score, 0.85)

    def test_corrupted_or_truncated_state_protection(self) -> None:
        manifest = self._create_manifest("run_corrupt")
        run_dir = self.store.initialize_run(manifest)

        state_path = run_dir / "state.json"
        state_path.write_text('{"lifecycleStatus": "run', encoding="utf-8")

        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("run_corrupt")
        self.assertEqual(cm.exception.code, "corrupted")

    def test_state_missing_handling(self) -> None:
        run_dir = self.store.get_run_dir("run_unformed")
        run_dir.mkdir(parents=True, exist_ok=True)

        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("run_unformed")
        self.assertEqual(cm.exception.code, "unformed")

    def test_lifecycle_state_transitions(self) -> None:
        manifest = self._create_manifest("run_lifecycle")
        self.store.initialize_run(manifest)

        s1 = self.store.update_state("run_lifecycle", lifecycle_status="running")
        self.assertEqual(s1.lifecycle_status, "running")

        # Stop request via gepa.stop
        self.assertFalse(self.store.has_stop_request("run_lifecycle"))
        self.store.request_stop("run_lifecycle")
        self.assertTrue(self.store.has_stop_request("run_lifecycle"))

        s2 = self.store.read_state("run_lifecycle")
        self.assertTrue(s2.stop_requested)
        self.assertEqual(s2.lifecycle_status, "stop_requested")

        # Worker stops cleanly
        s3 = self.store.update_state("run_lifecycle", lifecycle_status="stopped")
        self.assertEqual(s3.lifecycle_status, "stopped")

        # Clear stop request
        self.store.clear_stop_request("run_lifecycle")
        self.assertFalse(self.store.has_stop_request("run_lifecycle"))

    def test_stop_cannot_revert_terminal_states(self) -> None:
        """When a run is in any terminal status, request_stop or update_state must never revert it to stop_requested."""
        terminal_statuses = ["stopped", "succeeded", "publish_blocked", "failed"]

        for terminal_status in terminal_statuses:
            with self.subTest(terminal_status=terminal_status):
                run_id = f"run_regress_terminal_{terminal_status}"
                manifest = self._create_manifest(run_id)
                self.store.initialize_run(manifest)

                # Transition to terminal status
                self.store.update_state(run_id, lifecycle_status=terminal_status)
                state_before = self.store.read_state(run_id)
                self.assertEqual(state_before.lifecycle_status, terminal_status)

                # Calling request_stop must not revert terminal status
                self.store.request_stop(run_id)
                state_after_store = self.store.read_state(run_id)
                self.assertEqual(
                    state_after_store.lifecycle_status,
                    terminal_status,
                    f"request_stop illegally reverted terminal status {terminal_status!r} to {state_after_store.lifecycle_status!r}!",
                )

                # Explicitly attempting to update to non-terminal status (stop_requested) must be guarded
                self.store.update_state(run_id, lifecycle_status="stop_requested")
                state_after_update = self.store.read_state(run_id)
                self.assertEqual(
                    state_after_update.lifecycle_status,
                    terminal_status,
                    f"update_state illegally bypassed guard and reverted {terminal_status!r}!",
                )

        # Confirm legitimate resume from stopped to starting is allowed
        resume_run_id = "run_regress_resume_allowed"
        resume_manifest = self._create_manifest(resume_run_id)
        self.store.initialize_run(resume_manifest)
        self.store.update_state(resume_run_id, lifecycle_status="stopped")
        resumed_state = self.store.update_state(resume_run_id, lifecycle_status="starting")
        self.assertEqual(resumed_state.lifecycle_status, "starting")

    def test_stop_race_with_instant_worker_shutdown_deterministic(self) -> None:
        """Simulate Worker instantly responding to gepa.stop and writing stopped before Caller updates state."""
        run_id = "run_regress_stop_race"
        manifest = self._create_manifest(run_id)
        self.store.initialize_run(manifest)
        self.store.update_state(run_id, lifecycle_status="running")

        stop_file = self.store.get_stop_file_path(run_id)
        worker_wrote_stopped = threading.Event()

        def _mock_worker() -> None:
            while not stop_file.is_file():
                time.sleep(0.0001)
            self.store.update_state(run_id, lifecycle_status="stopped", stop_requested=True)
            worker_wrote_stopped.set()

        t_worker = threading.Thread(target=_mock_worker)
        t_worker.start()

        self.store.request_stop(run_id)
        t_worker.join(timeout=2.0)

        self.assertTrue(worker_wrote_stopped.is_set(), "Worker mock should have executed")
        final_state = self.store.read_state(run_id)
        self.assertEqual(
            final_state.lifecycle_status,
            "stopped",
            f"Race condition occurred! Expected 'stopped', but got {final_state.lifecycle_status!r}",
        )

    def test_read_manifest_corrupted_contract_strict(self) -> None:
        """When run.json is corrupted or fails validation, read_manifest must strictly raise RunStoreError(code='corrupted')."""
        run_id = "run_regress_corrupt_manifest"
        manifest = self._create_manifest(run_id)
        run_dir = self.store.initialize_run(manifest)

        corrupt_scenarios = [
            ("invalid_json", "{ broken manifest json content"),
            ("unsupported_protocol", json.dumps({"protocol": "gepa-run@999", "runId": run_id})),
            ("missing_required_field", json.dumps({"protocol": "gepa-run@1"})),
        ]

        for label, payload in corrupt_scenarios:
            with self.subTest(scenario=label):
                (run_dir / "run.json").write_text(payload, encoding="utf-8")

                with self.assertRaises(RunStoreError) as cm:
                    self.store.read_manifest(run_id)

                self.assertEqual(
                    cm.exception.code,
                    "corrupted",
                    f"Scenario {label}: Expected RunStoreError code 'corrupted', got {cm.exception.code!r}",
                )


if __name__ == "__main__":
    unittest.main()
