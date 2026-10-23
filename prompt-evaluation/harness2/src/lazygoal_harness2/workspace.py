"""Modular file-tree workspace projection and candidate codec for Harness2."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .models import EditScope, Harness2Candidate

MUTABLE_TEMPLATE_SOURCE_PATHS: dict[str, str] = {
    "global-overview@1": "packages/prompt-bundle/src/global-system-prompt/global-overview@1.njk",
    "agent-decision@1": "packages/prompt-bundle/src/step-prompt/agent-decision@1.njk",
    "agent-think@1": "packages/prompt-bundle/src/step-prompt/agent-think@1.njk",
    "authorized-tools@1": "packages/prompt-bundle/src/prompting/authorized-tools@1.njk",
    "run-mode@1": "packages/prompt-bundle/src/prompting/run-mode@1.njk",
}

DEFAULT_SWEBENCH_BASE_PROFILE: dict[str, Any] = {
    "id": "swebench-acp-profile",
    "name": "SWE-bench ACP container",
    "description": "Deterministic five-tool profile rooted at /testbed.",
    "systemPrompt": (
        "You are a software engineer working only in /testbed. "
        "Use the authorized tools to resolve the issue and verify the change."
    ),
    "instructions": [
        "Use read_file, write_file, edit_file, grep, and bash only; all paths are relative to /testbed.",
        "Do not access model configuration, credentials, or files outside /testbed.",
        "Complete only after the repository change is ready and relevant verification has run.",
    ],
    "toolIds": ["read_file", "write_file", "edit_file", "grep", "bash"],
}


def compute_prompt_sha256(
    system_prompt: str,
    instructions: tuple[str, ...] | list[str],
    template_overrides: dict[str, str] | None = None,
) -> str:
    """Compute the exact canonical SHA-256 matching TypeScript fingerprintPromptEvaluationCandidate."""
    normalized_overrides = {
        str(k): str(v)
        for k, v in sorted((template_overrides or {}).items())
        if str(v).strip() != ""
    }
    payload: dict[str, Any] = {
        "systemPrompt": system_prompt,
        "instructions": list(instructions),
    }
    if normalized_overrides:
        payload["templateOverrides"] = normalized_overrides
    canonical = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def compute_candidate_id(
    system_prompt: str,
    instructions: tuple[str, ...] | list[str],
    template_overrides: dict[str, str] | None = None,
) -> str:
    """Return a deterministic short candidate ID derived from the canonical SHA-256."""
    digest = compute_prompt_sha256(system_prompt, instructions, template_overrides)
    return f"cand-{digest[:16]}"


class HarnessWorkspace:
    """Manages the 5 mutable Prompt Bundle templates and AgentProfile as a modular file tree."""

    def __init__(
        self,
        repo_root: Path,
        base_profile: dict[str, Any] | None = None,
    ) -> None:
        self.repo_root = repo_root.resolve()
        self.base_profile = dict(base_profile or DEFAULT_SWEBENCH_BASE_PROFILE)
        self.base_templates: dict[str, str] = self._load_base_templates()

    def _load_base_templates(self) -> dict[str, str]:
        templates: dict[str, str] = {}
        for template_id, rel_path in MUTABLE_TEMPLATE_SOURCE_PATHS.items():
            full_path = self.repo_root / rel_path
            if not full_path.is_file():
                raise FileNotFoundError(
                    f"Mutable prompt template {template_id} not found at {full_path}"
                )
            templates[template_id] = full_path.read_text(encoding="utf-8")
        return templates

    def create_baseline_candidate(self) -> Harness2Candidate:
        """Construct the unmodified baseline candidate."""
        system_prompt = str(self.base_profile["systemPrompt"])
        instructions = tuple(str(i) for i in self.base_profile["instructions"])
        cid = compute_candidate_id(system_prompt, instructions, {})
        return Harness2Candidate(
            candidate_id=cid,
            base_profile_id=str(self.base_profile["id"]),
            system_prompt=system_prompt,
            instructions=instructions,
            template_overrides={},
            parent_candidate_id=None,
            scope="composed",
            hypothesis="Baseline unmodified Prompt Bundle and SWE-bench AgentProfile.",
        )

    def resolve_effective_templates(self, candidate: Harness2Candidate) -> dict[str, str]:
        """Return all 5 mutable templates with candidate overrides applied."""
        merged = dict(self.base_templates)
        for tid, content in candidate.template_overrides.items():
            if tid not in MUTABLE_TEMPLATE_SOURCE_PATHS:
                raise ValueError(f"Template {tid!r} is not in MUTABLE_TEMPLATE_SOURCE_PATHS")
            merged[tid] = content
        return merged

    def materialize_tree(self, candidate: Harness2Candidate, target_dir: Path) -> Path:
        """Write a candidate's effective templates and profile into a modular directory tree."""
        target_dir = target_dir.resolve()
        bundle_dir = target_dir / "prompt-bundle"
        profile_dir = target_dir / "profile"
        bundle_dir.mkdir(parents=True, exist_ok=True)
        profile_dir.mkdir(parents=True, exist_ok=True)

        effective_templates = self.resolve_effective_templates(candidate)
        for tid, content in sorted(effective_templates.items()):
            (bundle_dir / f"{tid}.njk").write_text(content, encoding="utf-8")

        (profile_dir / "systemPrompt.md").write_text(candidate.system_prompt, encoding="utf-8")
        (profile_dir / "instructions.json").write_text(
            json.dumps(list(candidate.instructions), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return target_dir

    def read_tree_as_candidate(
        self,
        tree_dir: Path,
        *,
        parent_candidate_id: str | None = None,
        scope: EditScope = "composed",
        hypothesis: str = "",
        target_fault_codes: tuple[str, ...] = (),
    ) -> Harness2Candidate:
        """Read a materialized workspace directory back into a canonical Harness2Candidate."""
        bundle_dir = tree_dir / "prompt-bundle"
        profile_dir = tree_dir / "profile"

        system_prompt = (profile_dir / "systemPrompt.md").read_text(encoding="utf-8").strip()
        raw_instructions = json.loads((profile_dir / "instructions.json").read_text(encoding="utf-8"))
        if not isinstance(raw_instructions, list) or not raw_instructions:
            raise ValueError("profile/instructions.json must be a non-empty string list")
        instructions = tuple(str(item).strip() for item in raw_instructions if str(item).strip())

        overrides: dict[str, str] = {}
        for tid, base_content in sorted(self.base_templates.items()):
            tpl_file = bundle_dir / f"{tid}.njk"
            if tpl_file.is_file():
                current_content = tpl_file.read_text(encoding="utf-8")
                if current_content != base_content:
                    overrides[tid] = current_content

        cid = compute_candidate_id(system_prompt, instructions, overrides)
        return Harness2Candidate(
            candidate_id=cid,
            base_profile_id=str(self.base_profile["id"]),
            system_prompt=system_prompt,
            instructions=instructions,
            template_overrides=overrides,
            parent_candidate_id=parent_candidate_id,
            scope=scope,
            hypothesis=hypothesis,
            target_fault_codes=target_fault_codes,
        )

    def build_candidate_from_edits(
        self,
        parent: Harness2Candidate,
        *,
        system_prompt: str | None = None,
        instructions: list[str] | tuple[str, ...] | None = None,
        template_edits: dict[str, str] | None = None,
        scope: EditScope = "composed",
        hypothesis: str = "",
        target_fault_codes: tuple[str, ...] = (),
    ) -> Harness2Candidate:
        """Apply incremental template and/or profile edits on top of a parent candidate."""
        next_system_prompt = (
            system_prompt.strip()
            if isinstance(system_prompt, str) and system_prompt.strip()
            else parent.system_prompt
        )
        next_instructions = (
            tuple(str(i).strip() for i in instructions if str(i).strip())
            if instructions
            else parent.instructions
        )
        merged_overrides = dict(parent.template_overrides)
        for tid, new_content in (template_edits or {}).items():
            if tid not in MUTABLE_TEMPLATE_SOURCE_PATHS:
                raise ValueError(
                    f"Attempted to edit locked or unknown template {tid!r}; "
                    f"allowed: {sorted(MUTABLE_TEMPLATE_SOURCE_PATHS)}"
                )
            if not isinstance(new_content, str) or not new_content.strip():
                raise ValueError(f"Template {tid!r} override must be a non-empty string")
            if new_content == self.base_templates[tid]:
                merged_overrides.pop(tid, None)
            else:
                merged_overrides[tid] = new_content

        cid = compute_candidate_id(next_system_prompt, next_instructions, merged_overrides)
        return Harness2Candidate(
            candidate_id=cid,
            base_profile_id=parent.base_profile_id,
            system_prompt=next_system_prompt,
            instructions=next_instructions,
            template_overrides=dict(sorted(merged_overrides.items())),
            parent_candidate_id=parent.candidate_id,
            scope=scope,
            hypothesis=hypothesis,
            target_fault_codes=target_fault_codes,
        )
