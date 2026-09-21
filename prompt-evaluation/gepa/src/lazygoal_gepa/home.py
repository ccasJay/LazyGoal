"""LazyGoal Home and workspace path resolution for the GEPA adapter."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Mapping


class LazyGoalHomeError(ValueError):
    """Raised when ``LAZYGOAL_HOME`` is configured with an invalid path."""


def resolve_lazygoal_home(env: Mapping[str, str] | None = None) -> Path:
    """Resolve the global LazyGoal Home without creating directories.

    ``LAZYGOAL_HOME`` is the only override.  A missing or blank value defaults
    to ``~/.lazygoal`` and a non-blank value must be absolute.
    """

    source = os.environ if env is None else env
    configured = source.get("LAZYGOAL_HOME", "").strip()
    if configured:
        home = Path(configured)
        if not home.is_absolute():
            raise LazyGoalHomeError(
                "LAZYGOAL_HOME must be an absolute path when it is set"
            )
        return home
    return Path.home() / ".lazygoal"


def resolve_workspace_home(
    workspace_root: Path | str,
    env: Mapping[str, str] | None = None,
) -> Path:
    """Resolve the current checkout's isolated Home subtree.

    The workspace identity is the lower-case SHA-256 digest of the normalized
    real path, matching the TypeScript Home resolver.
    """

    normalized_root = Path(workspace_root).resolve()
    workspace_id = hashlib.sha256(str(normalized_root).encode("utf-8")).hexdigest()
    return resolve_lazygoal_home(env) / "workspaces" / workspace_id
