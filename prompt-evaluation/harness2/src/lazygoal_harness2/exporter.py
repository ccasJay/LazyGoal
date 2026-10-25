"""Artifact exporter and worktree applier for Harness2 optimization runs."""

from __future__ import annotations

import difflib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .library import ImprovementLibrary
from .models import Harness2Candidate
from .workspace import HarnessWorkspace, MUTABLE_TEMPLATE_SOURCE_PATHS


@dataclass(frozen=True)
class ExportedArtifacts:
    """Paths of the exported optimization artifacts inside a Harness2 run directory."""

    exports_dir: Path
    best_profile_path: Path
    prompt_bundle_dir: Path
    prompt_bundle_patch_path: Path
    improvement_library_path: Path

    def to_dict(self) -> dict[str, str]:
        return {
            "exportsDir": str(self.exports_dir),
            "bestProfilePath": str(self.best_profile_path),
            "promptBundleDir": str(self.prompt_bundle_dir),
            "promptBundlePatchPath": str(self.prompt_bundle_patch_path),
            "improvementLibraryPath": str(self.improvement_library_path),
        }


def build_prompt_bundle_git_patch(
    workspace: HarnessWorkspace,
    candidate: Harness2Candidate,
) -> str:
    """Generate a standard unified git patch for all modified Prompt Bundle .njk templates."""
    chunks: list[str] = []
    for tid in sorted(MUTABLE_TEMPLATE_SOURCE_PATHS.keys()):
        if tid not in candidate.template_overrides:
            continue
        rel_path = MUTABLE_TEMPLATE_SOURCE_PATHS[tid]
        old_text = workspace.base_templates[tid]
        new_text = candidate.template_overrides[tid]
        if old_text == new_text:
            continue
        old_lines = old_text.splitlines(keepends=True)
        new_lines = new_text.splitlines(keepends=True)
        if old_lines and not old_lines[-1].endswith("\n"):
            old_lines[-1] += "\n"
        if new_lines and not new_lines[-1].endswith("\n"):
            new_lines[-1] += "\n"
        diff_lines = list(
            difflib.unified_diff(
                old_lines,
                new_lines,
                fromfile=f"a/{rel_path}",
                tofile=f"b/{rel_path}",
            )
        )
        if diff_lines:
            chunks.append(f"diff --git a/{rel_path} b/{rel_path}\n" + "".join(diff_lines))
    return "".join(chunks)


def export_best_candidate(
    *,
    run_dir: Path,
    workspace: HarnessWorkspace,
    candidate: Harness2Candidate,
    library: ImprovementLibrary,
) -> ExportedArtifacts:
    """Write best-profile.json, prompt-bundle/*.njk, prompt-bundle.patch, and improvement-library.json."""
    exports_dir = (run_dir / "exports").resolve()
    prompt_bundle_dir = exports_dir / "prompt-bundle"
    prompt_bundle_dir.mkdir(parents=True, exist_ok=True)

    profile_payload: dict[str, Any] = {
        **workspace.base_profile,
        "systemPrompt": candidate.system_prompt,
        "instructions": list(candidate.instructions),
    }
    best_profile_path = exports_dir / "best-profile.json"
    best_profile_path.write_text(
        json.dumps(profile_payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    effective_templates = workspace.resolve_effective_templates(candidate)
    for tid, content in sorted(effective_templates.items()):
        (prompt_bundle_dir / f"{tid}.njk").write_text(content, encoding="utf-8")

    patch_text = build_prompt_bundle_git_patch(workspace, candidate)
    prompt_bundle_patch_path = exports_dir / "prompt-bundle.patch"
    prompt_bundle_patch_path.write_text(patch_text, encoding="utf-8")

    if candidate.framework_edits:
        framework_improvements_path = exports_dir / "framework-improvements.json"
        framework_improvements_path.write_text(
            json.dumps([dict(f) for f in candidate.framework_edits], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    improvement_library_path = exports_dir / "improvement-library.json"
    library.save()
    if library.storage_path.resolve() != improvement_library_path.resolve():
        shutil.copyfile(library.storage_path, improvement_library_path)

    return ExportedArtifacts(
        exports_dir=exports_dir,
        best_profile_path=best_profile_path,
        prompt_bundle_dir=prompt_bundle_dir,
        prompt_bundle_patch_path=prompt_bundle_patch_path,
        improvement_library_path=improvement_library_path,
    )


def apply_run_exports(
    *,
    run_dir: Path,
    workspace_root: Path,
    profile_output_path: Path | None = None,
) -> dict[str, Any]:
    """Apply exported .njk templates (and optionally best-profile.json) into a target worktree."""
    exports_dir = (run_dir / "exports").resolve()
    prompt_bundle_dir = exports_dir / "prompt-bundle"
    best_profile_path = exports_dir / "best-profile.json"
    if not prompt_bundle_dir.is_dir():
        raise FileNotFoundError(f"Run exports directory not found at {prompt_bundle_dir}")

    applied_templates: list[str] = []
    for tid, rel_path in sorted(MUTABLE_TEMPLATE_SOURCE_PATHS.items()):
        exported_tpl = prompt_bundle_dir / f"{tid}.njk"
        if not exported_tpl.is_file():
            continue
        target_tpl = (workspace_root / rel_path).resolve()
        new_content = exported_tpl.read_text(encoding="utf-8")
        old_content = target_tpl.read_text(encoding="utf-8") if target_tpl.is_file() else ""
        if new_content != old_content:
            target_tpl.parent.mkdir(parents=True, exist_ok=True)
            target_tpl.write_text(new_content, encoding="utf-8")
            applied_templates.append(tid)

    written_profile: str | None = None
    if profile_output_path is not None and best_profile_path.is_file():
        profile_output_path = profile_output_path.resolve()
        profile_output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(best_profile_path, profile_output_path)
        written_profile = str(profile_output_path)

    return {
        "appliedTemplates": applied_templates,
        "bestProfileSource": str(best_profile_path),
        "writtenProfilePath": written_profile,
        "patchPath": str(exports_dir / "prompt-bundle.patch"),
    }
