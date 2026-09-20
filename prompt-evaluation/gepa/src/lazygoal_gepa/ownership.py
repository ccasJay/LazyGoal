"""Exclusive worker ownership and alive detection for GEPA runs."""

from __future__ import annotations

import fcntl
import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, TypeAlias

from .errors import RunOwnershipError, RunStoreError, WorkerAlreadyRunningError
from .store import atomic_write_json

WorkerHealth: TypeAlias = Literal["active", "stale", "lost", "none", "corrupt"]


@dataclass(frozen=True)
class OwnerInfo:
    """Persistent ownership metadata of a running GEPA worker."""

    pid: int
    worker_token: str
    started_at: str
    heartbeat_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "pid": self.pid,
            "workerToken": self.worker_token,
            "startedAt": self.started_at,
            "heartbeatAt": self.heartbeat_at,
        }


def parse_owner_info(data: Any) -> OwnerInfo:
    """Parse and strictly validate owner.json data."""

    if not isinstance(data, dict) or not all(isinstance(k, str) for k in data):
        raise RunStoreError("Owner info must be an object", code="corrupted")

    required_keys = {"pid", "workerToken", "startedAt", "heartbeatAt"}
    actual_keys = set(data)
    missing = required_keys - actual_keys
    if missing:
        raise RunStoreError(
            f"Owner info missing required fields: {', '.join(sorted(missing))}",
            code="corrupted",
        )

    pid = data["pid"]
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        raise RunStoreError("pid must be a positive integer", code="corrupted")

    worker_token = data["workerToken"]
    if not isinstance(worker_token, str) or not worker_token.strip():
        raise RunStoreError("workerToken must be a non-empty string", code="corrupted")

    started_at = data["startedAt"]
    if not isinstance(started_at, str) or not started_at.strip():
        raise RunStoreError("startedAt must be a non-empty string", code="corrupted")

    heartbeat_at = data["heartbeatAt"]
    if not isinstance(heartbeat_at, str) or not heartbeat_at.strip():
        raise RunStoreError("heartbeatAt must be a non-empty string", code="corrupted")

    return OwnerInfo(
        pid=pid,
        worker_token=worker_token,
        started_at=started_at,
        heartbeat_at=heartbeat_at,
    )


def is_pid_alive(pid: int) -> bool:
    """Check if a process exists using os.kill(pid, 0) without sending any signal."""

    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


class RunOwnership:
    """Manages exclusive worker ownership and heartbeats for a run directory."""

    def __init__(self, run_dir: Path | str) -> None:
        self.run_dir = Path(run_dir).resolve()
        self.owner_file = self.run_dir / "owner.json"
        self.lock_file = self.run_dir / "owner.lock"
        self._lock_fd: int | None = None
        self._current_owner: OwnerInfo | None = None

    @property
    def current_owner(self) -> OwnerInfo | None:
        return self._current_owner

    def acquire(self, worker_token: str | None = None) -> OwnerInfo:
        """Acquire exclusive ownership of the run, preventing concurrent workers."""

        if self._current_owner is not None and self._lock_fd is not None:
            raise WorkerAlreadyRunningError(
                f"Run {self.run_dir.name} is already acquired by this instance",
                pid=self._current_owner.pid,
            )

        self.run_dir.mkdir(parents=True, exist_ok=True)

        fd = os.open(self.lock_file, os.O_CREAT | os.O_RDWR, 0o644)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (BlockingIOError, OSError) as error:
            os.close(fd)
            existing = self._safe_read_owner_info()
            active_pid = existing.pid if existing is not None else None
            raise WorkerAlreadyRunningError(
                f"Worker already running for run {self.run_dir.name} (PID {active_pid})",
                pid=active_pid,
            ) from error

        # Check existing owner.json on disk to detect living process or orphan lock
        existing = self._safe_read_owner_info()
        if existing is not None and is_pid_alive(existing.pid):
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
            os.close(fd)
            raise WorkerAlreadyRunningError(
                f"Worker already running for run {self.run_dir.name} (PID {existing.pid})",
                pid=existing.pid,
            )

        token = worker_token or uuid.uuid4().hex
        now = datetime.now(timezone.utc).isoformat()
        current_pid = os.getpid()

        owner = OwnerInfo(
            pid=current_pid,
            worker_token=token,
            started_at=now,
            heartbeat_at=now,
        )

        try:
            atomic_write_json(self.owner_file, owner.to_dict())
        except Exception:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
            os.close(fd)
            raise

        self._lock_fd = fd
        self._current_owner = owner
        return owner

    def update_heartbeat(self) -> OwnerInfo:
        """Update the heartbeat timestamp of the currently held ownership."""

        if self._current_owner is None or self._lock_fd is None:
            raise RunOwnershipError(
                "Cannot update heartbeat: run ownership is not held by this worker"
            )

        now = datetime.now(timezone.utc).isoformat()
        updated = OwnerInfo(
            pid=self._current_owner.pid,
            worker_token=self._current_owner.worker_token,
            started_at=self._current_owner.started_at,
            heartbeat_at=now,
        )

        atomic_write_json(self.owner_file, updated.to_dict())
        self._current_owner = updated
        return updated

    def release(self) -> None:
        """Voluntarily and cleanly release ownership and remove owner.json."""

        if self._current_owner is not None:
            # Only remove owner.json if our workerToken matches
            existing = self._safe_read_owner_info()
            if existing is not None and existing.worker_token == self._current_owner.worker_token:
                if self.owner_file.exists():
                    try:
                        self.owner_file.unlink()
                    except OSError:
                        pass

        if self._lock_fd is not None:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
            except OSError:
                pass
            try:
                os.close(self._lock_fd)
            except OSError:
                pass
            self._lock_fd = None

        self._current_owner = None

    def read_owner_info(self) -> OwnerInfo | None:
        """Read and parse owner.json if it exists."""

        if not self.owner_file.is_file():
            return None
        content = self.owner_file.read_text(encoding="utf-8")
        data = json.loads(content)
        return parse_owner_info(data)

    def _safe_read_owner_info(self) -> OwnerInfo | None:
        try:
            return self.read_owner_info()
        except Exception:
            return None

    def check_health(
        self,
        stale_threshold_seconds: float = 30.0,
    ) -> tuple[WorkerHealth, OwnerInfo | None]:
        """Inspect worker health without acquiring locks or modifying state."""

        if not self.owner_file.is_file():
            return ("none", None)

        try:
            owner = self.read_owner_info()
        except Exception:
            return ("corrupt", None)

        if owner is None:
            return ("none", None)

        if not is_pid_alive(owner.pid):
            return ("lost", owner)

        try:
            heartbeat_dt = datetime.fromisoformat(owner.heartbeat_at.replace("Z", "+00:00"))
            now_dt = datetime.now(timezone.utc)
            elapsed = (now_dt - heartbeat_dt).total_seconds()
            if elapsed > stale_threshold_seconds:
                return ("stale", owner)
            return ("active", owner)
        except Exception:
            return ("corrupt", owner)

    def __del__(self) -> None:
        if self._lock_fd is not None:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
            except OSError:
                pass
            try:
                os.close(self._lock_fd)
            except OSError:
                pass
            self._lock_fd = None
