"""TUA candidate leakage audit through the benchmark-owned TypeScript boundary."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .candidate import LazyGoalPrompt
from .errors import PromptEvaluationInfrastructureError
from .store import atomic_write_json

_CANDIDATE_ID = re.compile(r"[0-9a-f]{64}\Z")
_COMPONENT = re.compile(r"(?:system_prompt|instruction_[0-9]{3})\Z")
_MATCH_KINDS = frozenset(
    {"task_id", "private_filename", "expected_answer", "verifier_content"}
)
_MAX_OUTPUT_BYTES = 64 * 1024


class CandidateAuditor(Protocol):
    """Audit one complete candidate before it enters benchmark evaluation."""

    def audit(self, prompt: LazyGoalPrompt) -> dict[str, Any]:
        """Persist a safe audit result and return its current JSON projection."""


@dataclass(frozen=True)
class TuaCandidateLeakAuditor:
    """Run the TUA-owned literal audit for only the GEPA train/validation tasks."""

    repo_root: Path
    task_ids: tuple[str, ...]
    executable: Path
    workspace_root: Path
    audit_directory: Path

    def __post_init__(self) -> None:
        if not self.task_ids or len(set(self.task_ids)) != len(self.task_ids):
            raise ValueError("TUA candidate audit task IDs must be non-empty and unique")
        if any(not task_id or task_id.strip() != task_id for task_id in self.task_ids):
            raise ValueError("TUA candidate audit task IDs must be non-empty normalized strings")

    def audit(self, prompt: LazyGoalPrompt) -> dict[str, Any]:
        if not _CANDIDATE_ID.fullmatch(prompt.candidate_id):
            raise PromptEvaluationInfrastructureError("TUA candidate audit identity is invalid")
        self.audit_directory.mkdir(parents=True, exist_ok=True)
        payload = {
            "repoRoot": str(self.repo_root),
            "taskIds": list(self.task_ids),
            "candidateId": prompt.candidate_id,
            "systemPrompt": prompt.system_prompt,
            "instructions": list(prompt.instructions),
        }
        try:
            with tempfile.TemporaryDirectory(prefix="lazygoal-tua-audit-") as temporary:
                request_path = Path(temporary) / "request.json"
                request_path.write_text(
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8",
                )
                process = subprocess.run(
                    [
                        str(self.executable),
                        "gepa",
                        "audit-tua-candidate",
                        "--request",
                        str(request_path),
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    cwd=str(self.workspace_root),
                    timeout=60,
                    check=False,
                )
        except Exception as error:
            raise PromptEvaluationInfrastructureError(
                "TUA candidate audit command could not be completed"
            ) from error

        if process.returncode != 0 or len(process.stdout) > _MAX_OUTPUT_BYTES:
            raise PromptEvaluationInfrastructureError("TUA candidate audit command failed")
        try:
            value: Any = json.loads(process.stdout.decode("utf-8", errors="strict"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PromptEvaluationInfrastructureError(
                "TUA candidate audit returned invalid JSON"
            ) from error
        result = _parse_audit_result(value, prompt.candidate_id, self.task_ids)
        atomic_write_json(
            self.audit_directory / f"{prompt.candidate_id}.json",
            result,
        )
        return result


def _parse_audit_result(
    value: Any,
    candidate_id: str,
    task_ids: tuple[str, ...],
) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != {
        "candidateId",
        "auditedTaskIds",
        "findings",
        "positiveConclusionBlocked",
    }:
        raise PromptEvaluationInfrastructureError("TUA candidate audit result has invalid fields")
    if value["candidateId"] != candidate_id or value["auditedTaskIds"] != list(task_ids):
        raise PromptEvaluationInfrastructureError("TUA candidate audit identity does not match the run")
    findings = value["findings"]
    if not isinstance(findings, list):
        raise PromptEvaluationInfrastructureError("TUA candidate audit findings are invalid")
    for finding in findings:
        if not isinstance(finding, dict) or set(finding) != {"taskId", "component", "matchKind"}:
            raise PromptEvaluationInfrastructureError("TUA candidate audit finding has invalid fields")
        if (
            finding["taskId"] not in task_ids
            or not isinstance(finding["component"], str)
            or not _COMPONENT.fullmatch(finding["component"])
            or not isinstance(finding["matchKind"], str)
            or finding["matchKind"] not in _MATCH_KINDS
        ):
            raise PromptEvaluationInfrastructureError("TUA candidate audit finding is invalid")
    blocked = bool(findings)
    if value["positiveConclusionBlocked"] is not blocked:
        raise PromptEvaluationInfrastructureError("TUA candidate audit conclusion flag is inconsistent")
    return {
        "candidateId": candidate_id,
        "auditedTaskIds": list(task_ids),
        "findings": findings,
        "positiveConclusionBlocked": blocked,
    }
