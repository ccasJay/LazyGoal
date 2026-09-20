from __future__ import annotations

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from lazygoal_gepa.errors import WorkerAlreadyRunningError
from lazygoal_gepa.ownership import (
    OwnerInfo,
    RunOwnership,
    is_pid_alive,
    parse_owner_info,
)


class RunOwnershipTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.run_dir = Path(self.temp_dir.name).resolve()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_first_worker_acquire_lock_success(self) -> None:
        ownership = RunOwnership(self.run_dir)
        self.addCleanup(ownership.release)

        owner = ownership.acquire("token-abc-123")

        self.assertEqual(owner.pid, os.getpid())
        self.assertEqual(owner.worker_token, "token-abc-123")
        self.assertTrue((self.run_dir / "owner.json").is_file())
        self.assertTrue((self.run_dir / "owner.lock").is_file())

        # Verify parsed owner.json content
        read_owner = ownership.read_owner_info()
        self.assertIsNotNone(read_owner)
        assert read_owner is not None
        self.assertEqual(read_owner.pid, os.getpid())
        self.assertEqual(read_owner.worker_token, "token-abc-123")

    def test_concurrent_worker_acquire_rejected(self) -> None:
        worker_a = RunOwnership(self.run_dir)
        self.addCleanup(worker_a.release)
        worker_a.acquire("token-worker-a")

        worker_b = RunOwnership(self.run_dir)
        self.addCleanup(worker_b.release)

        with self.assertRaises(WorkerAlreadyRunningError) as cm:
            worker_b.acquire("token-worker-b")

        self.assertEqual(cm.exception.pid, os.getpid())

        # Verify owner.json still belongs to worker A
        current = worker_a.read_owner_info()
        self.assertIsNotNone(current)
        assert current is not None
        self.assertEqual(current.worker_token, "token-worker-a")

    def test_heartbeat_atomic_update(self) -> None:
        ownership = RunOwnership(self.run_dir)
        self.addCleanup(ownership.release)

        owner = ownership.acquire()
        initial_hb = owner.heartbeat_at

        updated = ownership.update_heartbeat()

        self.assertEqual(updated.pid, owner.pid)
        self.assertEqual(updated.worker_token, owner.worker_token)
        self.assertEqual(updated.started_at, owner.started_at)
        # Verify heartbeat updated on disk
        on_disk = ownership.read_owner_info()
        self.assertIsNotNone(on_disk)
        assert on_disk is not None
        self.assertEqual(on_disk.heartbeat_at, updated.heartbeat_at)

    def test_voluntary_lock_release(self) -> None:
        worker_a = RunOwnership(self.run_dir)
        worker_a.acquire("token-voluntary")

        self.assertTrue((self.run_dir / "owner.json").is_file())
        worker_a.release()

        self.assertFalse((self.run_dir / "owner.json").is_file())
        self.assertIsNone(worker_a.current_owner)

        # Worker B can now acquire cleanly
        worker_b = RunOwnership(self.run_dir)
        self.addCleanup(worker_b.release)
        owner_b = worker_b.acquire("token-worker-b")
        self.assertEqual(owner_b.worker_token, "token-worker-b")

    def test_detect_orphan_deadlock_dead_pid(self) -> None:
        # Find an unused PID that is definitely not alive
        dead_pid = 9999999
        while is_pid_alive(dead_pid):
            dead_pid += 1

        orphan_owner = OwnerInfo(
            pid=dead_pid,
            worker_token="dead-token",
            started_at="2026-09-20T00:00:00Z",
            heartbeat_at="2026-09-20T00:00:00Z",
        )
        owner_file = self.run_dir / "owner.json"
        owner_file.write_text(json.dumps(orphan_owner.to_dict()), encoding="utf-8")

        ownership = RunOwnership(self.run_dir)
        self.addCleanup(ownership.release)

        health, info = ownership.check_health()
        self.assertEqual(health, "lost")
        self.assertIsNotNone(info)
        assert info is not None
        self.assertEqual(info.pid, dead_pid)

        # New worker can safely acquire and recover the orphan lock
        recovered = ownership.acquire("token-recovered")
        self.assertEqual(recovered.pid, os.getpid())
        self.assertEqual(recovered.worker_token, "token-recovered")

    def test_heartbeat_stale_projection(self) -> None:
        old_time = (datetime.now(timezone.utc) - timedelta(seconds=120)).isoformat()
        living_owner = OwnerInfo(
            pid=os.getpid(),
            worker_token="living-token",
            started_at=old_time,
            heartbeat_at=old_time,
        )
        owner_file = self.run_dir / "owner.json"
        owner_file.write_text(json.dumps(living_owner.to_dict()), encoding="utf-8")

        ownership = RunOwnership(self.run_dir)
        # Check with stale threshold of 30 seconds
        health, info = ownership.check_health(stale_threshold_seconds=30.0)
        self.assertEqual(health, "stale")
        self.assertIsNotNone(info)

        # Check with stale threshold of 300 seconds -> should be active
        health_active, _ = ownership.check_health(stale_threshold_seconds=300.0)
        self.assertEqual(health_active, "active")


if __name__ == "__main__":
    unittest.main()
