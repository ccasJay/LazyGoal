"""摘要保护的最佳 Agent Profile 发布器。"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Mapping

from .candidate import AgentProfileSnapshot, CandidateCodec

PublicationStatus = Literal["published", "unchanged", "conflict", "failed"]
_MAX_PUBLICATION_ERROR_CHARS = 4_096
_REDACTED = "[REDACTED]"


@dataclass(frozen=True)
class PublicationResult:
    """一次最佳 Profile 发布尝试的稳定摘要。"""

    status: PublicationStatus
    target_path: Path
    best_profile_path: Path | None
    candidate_id: str | None = None
    error_code: Literal["publish_conflict", "publish_failed"] | None = None
    error_message: str | None = None

    def __post_init__(self) -> None:
        if self.error_message is not None:
            object.__setattr__(self, "error_message", _safe_error_message(self.error_message))

    @property
    def publication_status(self) -> Literal["published", "unchanged", "blocked", "failed"]:
        """返回可直接投影到 RunState 的 publication 状态。"""

        if self.status == "conflict":
            return "blocked"
        return self.status

    @property
    def artifact_path(self) -> Path | None:
        """兼容报告层使用的最佳 Profile 产物路径别名。"""

        return self.best_profile_path

    def to_dict(self) -> dict[str, Any]:
        """返回不包含 Prompt 正文的稳定报告摘要。"""

        result: dict[str, Any] = {
            "status": self.status,
            "publicationStatus": self.publication_status,
            "targetPath": str(self.target_path),
            "bestProfilePath": (
                str(self.best_profile_path)
                if self.best_profile_path is not None
                else None
            ),
            "candidateId": self.candidate_id,
            "errorCode": self.error_code,
        }
        if self.error_message is not None:
            result["errorMessage"] = self.error_message
        return result


class ProfilePublisher:
    """将 GEPA 最佳候选安全地发布为目标 Agent Profile。

    发布器先把最佳完整 Profile 保存到 artifacts，再以启动时冻结的目标文件
    SHA-256 作为乐观并发条件执行同目录原子替换。任何冲突或写入失败都不会
    通过本类主动覆盖目标文件。
    """

    def __init__(
        self,
        target_path: Path | str,
        frozen_digest: str,
        base_profile: AgentProfileSnapshot,
        artifacts_dir: Path | str,
    ) -> None:
        self.target_path = Path(target_path).resolve()
        self.frozen_digest = frozen_digest
        self.base_profile = base_profile
        self.artifacts_dir = Path(artifacts_dir).resolve()
        self.best_profile_path = self.artifacts_dir / "best-profile.json"

    def publish(self, best_candidate: Mapping[str, str]) -> PublicationResult:
        """保存并尝试发布 GEPA 最佳候选，返回可序列化的发布摘要。"""

        try:
            prompt = CandidateCodec().decode(best_candidate)
        except Exception as error:
            return PublicationResult(
                status="failed",
                target_path=self.target_path,
                best_profile_path=None,
                error_code="publish_failed",
                error_message=f"Invalid best candidate: {error}",
            )

        candidate_id = prompt.candidate_id
        best_profile = AgentProfileSnapshot(
            schema_version=self.base_profile.schema_version,
            id=self.base_profile.id,
            name=self.base_profile.name,
            description=self.base_profile.description,
            system_prompt=prompt.system_prompt,
            instructions=prompt.instructions,
            tool_ids=self.base_profile.tool_ids,
        )
        best_profile_data = best_profile.to_dict()

        try:
            _atomic_write_json(self.best_profile_path, best_profile_data)
        except OSError as error:
            return PublicationResult(
                status="failed",
                target_path=self.target_path,
                best_profile_path=self.best_profile_path,
                candidate_id=candidate_id,
                error_code="publish_failed",
                error_message=f"Could not write best Profile artifact: {error}",
            )

        try:
            current_bytes = self.target_path.read_bytes()
        except OSError as error:
            return PublicationResult(
                status="failed",
                target_path=self.target_path,
                best_profile_path=self.best_profile_path,
                candidate_id=candidate_id,
                error_code="publish_failed",
                error_message=f"Could not read target Profile: {error}",
            )

        current_digest = hashlib.sha256(current_bytes).hexdigest()
        if current_digest != self.frozen_digest:
            return PublicationResult(
                status="conflict",
                target_path=self.target_path,
                best_profile_path=self.best_profile_path,
                candidate_id=candidate_id,
                error_code="publish_conflict",
                error_message="Target Profile changed after the run started",
            )

        if (
            prompt.system_prompt == self.base_profile.system_prompt
            and prompt.instructions == self.base_profile.instructions
        ):
            return PublicationResult(
                status="unchanged",
                target_path=self.target_path,
                best_profile_path=self.best_profile_path,
                candidate_id=candidate_id,
            )

        try:
            # Agent Profile 文件始终收紧到 POSIX 0600，避免继承旧文件的可读权限。
            mode = stat.S_IRUSR | stat.S_IWUSR
            _atomic_replace_json(self.target_path, best_profile_data, mode)
        except OSError as error:
            return PublicationResult(
                status="failed",
                target_path=self.target_path,
                best_profile_path=self.best_profile_path,
                candidate_id=candidate_id,
                error_code="publish_failed",
                error_message=f"Could not publish target Profile: {error}",
            )

        return PublicationResult(
            status="published",
            target_path=self.target_path,
            best_profile_path=self.best_profile_path,
            candidate_id=candidate_id,
        )


def _json_bytes(data: Any) -> bytes:
    return json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")


def _safe_error_message(message: str) -> str:
    safe = message
    for name, value in os.environ.items():
        if value and len(value) >= 4 and re.search(r"(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)", name, re.IGNORECASE):
            safe = safe.replace(value, _REDACTED)
    safe = re.sub(r"sk-[A-Za-z0-9][A-Za-z0-9._-]*", _REDACTED, safe)
    safe = re.sub(r"Bearer\s+[^\s,;]+", "Bearer " + _REDACTED, safe, flags=re.IGNORECASE)
    safe = re.sub(
        r"((?:api[-_ ]?key|access[-_ ]?token|secret|password)\s*[:=]\s*)[^\s,;]+",
        r"\1" + _REDACTED,
        safe,
        flags=re.IGNORECASE,
    )
    return safe if len(safe) <= _MAX_PUBLICATION_ERROR_CHARS else (
        safe[:_MAX_PUBLICATION_ERROR_CHARS - 1] + "…"
    )


def _atomic_write_json(target: Path, data: Any) -> None:
    """Write an artifact with a same-directory fsync and atomic replace."""

    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(target.parent, 0o700)
    except OSError:
        pass
    _atomic_replace_json(target, data, None)


def _atomic_replace_json(target: Path, data: Any, mode: int | None) -> None:
    """Atomically replace a JSON file, optionally preserving its mode bits."""

    target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        os.chmod(target.parent, 0o700)
    except OSError:
        pass
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{target.name}.tmp.",
        dir=str(target.parent),
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(_json_bytes(data))
            file.flush()
            os.fsync(file.fileno())
        if mode is not None:
            os.chmod(temp_path, mode)
        os.replace(temp_path, target)
        _fsync_directory(target.parent)
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            pass


def _fsync_directory(directory: Path) -> None:
    """Synchronize the directory when the platform exposes directory fds."""

    try:
        directory_fd = os.open(directory, os.O_RDONLY)
    except OSError:
        return
    try:
        try:
            os.fsync(directory_fd)
        except OSError:
            # Some filesystems do not support directory fsync. The file was
            # already flushed before replace, so this is not a write failure.
            return
    finally:
        os.close(directory_fd)
