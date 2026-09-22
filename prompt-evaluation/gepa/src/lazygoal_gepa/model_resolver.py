"""Credential-free model identity resolution through the canonical TypeScript loader."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from .candidate import ModelIdentity
from .errors import ConfigurationError
from .models import resolve_lazygoal_executable

_MAX_OUTPUT_CHARS = 16 * 1024
_MAX_DIAGNOSTIC_CHARS = 4 * 1024


def resolve_model_identities(
    workspace_root: Path | str,
    executable: Path | str | None = None,
) -> tuple[ModelIdentity, ModelIdentity]:
    """Resolve Working and Reflection identities without exposing credentials."""

    workspace = Path(workspace_root).resolve()
    command = Path(executable).resolve() if executable is not None else resolve_lazygoal_executable(workspace)
    try:
        completed = subprocess.run(
            [str(command), "gepa", "resolve-models"],
            cwd=str(workspace),
            env=os.environ.copy(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise ConfigurationError(f"Could not resolve GEPA model identities: {error}") from error

    stdout = completed.stdout.strip()
    if completed.returncode != 0:
        diagnostic = completed.stderr.strip()[:_MAX_DIAGNOSTIC_CHARS]
        raise ConfigurationError(
            "GEPA model identity resolution failed"
            + (f": {diagnostic}" if diagnostic else f" (exit {completed.returncode})")
        )
    if not stdout or "\n" in stdout or len(stdout) > _MAX_OUTPUT_CHARS:
        raise ConfigurationError("GEPA model identity resolver returned invalid bounded output")

    try:
        payload: Any = json.loads(stdout)
        if not isinstance(payload, dict) or set(payload) != {"working", "reflection"}:
            raise ValueError("root fields must be working and reflection")
        working = _parse_identity(payload["working"], "working")
        reflection = _parse_identity(payload["reflection"], "reflection")
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise ConfigurationError(f"Invalid GEPA model identity response: {error}") from error

    if working.profile_name == reflection.profile_name:
        raise ConfigurationError(
            "Working profile and reflection profile must not share the same name: "
            f"{working.profile_name!r}"
        )
    return working, reflection


def _parse_identity(value: Any, role: str) -> ModelIdentity:
    if not isinstance(value, dict) or set(value) != {"profileName", "provider", "modelId"}:
        raise ValueError(f"{role} identity has invalid fields")
    for field in ("profileName", "provider", "modelId"):
        if not isinstance(value[field], str) or not value[field].strip():
            raise ValueError(f"{role}.{field} must be a non-empty string")
    return ModelIdentity(
        profile_name=value["profileName"],
        provider=value["provider"],
        model_id=value["modelId"],
    )
