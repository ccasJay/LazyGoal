"""Filesystem isolation for adapter invocations and evaluated samples."""

from __future__ import annotations

import hashlib
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .errors import ConfigurationError
from .models import LazyGoalEvaluationExample


@dataclass(frozen=True)
class InvocationContext:
    """Adapter-generated directory identity for one evaluate call."""

    invocation_id: str
    candidate_id: str
    directory: Path


class InvocationDirectoryManager:
    """Create paths that never interpolate caller-controlled identifiers."""

    def __init__(
        self,
        output_directory: Path,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._output_directory = output_directory
        self._id_factory = id_factory or (lambda: uuid.uuid4().hex)

    def create_invocation(self, candidate_id: str) -> InvocationContext:
        if not _is_sha256(candidate_id):
            raise ConfigurationError("candidate_id must be a lowercase SHA-256 digest")
        invocation_id = self._id_factory()
        if not invocation_id or not invocation_id.isascii() or not invocation_id.isalnum():
            raise ConfigurationError(
                "Generated invocation ID must contain only ASCII letters and digits"
            )

        directory = self._output_directory / invocation_id / candidate_id
        try:
            directory.mkdir(parents=True, exist_ok=False)
        except OSError as error:
            raise ConfigurationError(
                f"Invocation directory could not be created: {directory}"
            ) from error
        return InvocationContext(invocation_id, candidate_id, directory)

    def create_sample_directory(
        self,
        invocation: InvocationContext,
        example: LazyGoalEvaluationExample,
    ) -> Path:
        sample_identity = f"{example.sample_id}\0{example.task_id}".encode("utf-8")
        safe_name = hashlib.sha256(sample_identity).hexdigest()
        directory = invocation.directory / safe_name
        try:
            directory.mkdir(parents=False, exist_ok=False)
        except OSError as error:
            raise ConfigurationError(
                f"Sample directory could not be created: {directory}"
            ) from error
        return directory


def _is_sha256(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)

