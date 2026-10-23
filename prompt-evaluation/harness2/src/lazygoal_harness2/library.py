"""Persistent Improvement Library for Harness2 Invariant and Domain edits."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .models import EditScope


@dataclass
class ImprovementEntry:
    """A reusable improvement unit tracked across Harness2 Probe and Compose cycles."""

    entry_id: str
    scope: EditScope
    hypothesis: str
    target_fault_codes: tuple[str, ...]
    template_edits: dict[str, str] = field(default_factory=dict)
    system_prompt_edit: str | None = None
    instructions_edit: tuple[str, ...] | None = None
    trials: int = 0
    total_score_delta: float = 0.0
    total_fault_delta: int = 0

    @property
    def avg_score_delta(self) -> float:
        return self.total_score_delta / max(1, self.trials)

    @property
    def avg_fault_delta(self) -> float:
        return self.total_fault_delta / max(1, self.trials)

    def record_probe(self, score_delta: float, fault_delta: int) -> None:
        self.trials += 1
        self.total_score_delta = round(self.total_score_delta + score_delta, 6)
        self.total_fault_delta += fault_delta

    def to_dict(self) -> dict[str, Any]:
        return {
            "entryId": self.entry_id,
            "scope": self.scope,
            "hypothesis": self.hypothesis,
            "targetFaultCodes": list(self.target_fault_codes),
            "templateEdits": dict(sorted(self.template_edits.items())),
            "systemPromptEdit": self.system_prompt_edit,
            "instructionsEdit": list(self.instructions_edit) if self.instructions_edit else None,
            "trials": self.trials,
            "totalScoreDelta": round(self.total_score_delta, 6),
            "totalFaultDelta": self.total_fault_delta,
            "avgScoreDelta": round(self.avg_score_delta, 6),
            "avgFaultDelta": round(self.avg_fault_delta, 4),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ImprovementEntry:
        raw_inst = data.get("instructionsEdit")
        return cls(
            entry_id=str(data["entryId"]),
            scope=data.get("scope", "invariant"),
            hypothesis=str(data.get("hypothesis", "")),
            target_fault_codes=tuple(str(c) for c in data.get("targetFaultCodes", [])),
            template_edits={
                str(k): str(v) for k, v in sorted((data.get("templateEdits") or {}).items())
            },
            system_prompt_edit=data.get("systemPromptEdit"),
            instructions_edit=tuple(str(x) for x in raw_inst) if isinstance(raw_inst, list) else None,
            trials=int(data.get("trials", 0)),
            total_score_delta=float(data.get("totalScoreDelta", 0.0)),
            total_fault_delta=int(data.get("totalFaultDelta", 0)),
        )


class ImprovementLibrary:
    """Durable store of verified Invariant (cross-task) and Domain (benchmark-specific) edits."""

    def __init__(self, storage_path: Path) -> None:
        self.storage_path = storage_path.resolve()
        self._entries: dict[str, ImprovementEntry] = {}
        if self.storage_path.is_file():
            self.load()

    def __len__(self) -> int:
        return len(self._entries)

    def entries(self) -> list[ImprovementEntry]:
        return sorted(
            self._entries.values(),
            key=lambda e: (e.avg_score_delta, -e.avg_fault_delta, e.trials),
            reverse=True,
        )

    def upsert(self, entry: ImprovementEntry) -> None:
        self._entries[entry.entry_id] = entry
        self.save()

    def top_positive(
        self,
        *,
        scope: EditScope | None = None,
        limit: int = 5,
    ) -> list[ImprovementEntry]:
        """Return entries that achieved a positive score gain or strictly reduced faults."""
        candidates = [
            e
            for e in self.entries()
            if (scope is None or e.scope == scope)
            and (e.avg_score_delta > 0.0 or e.avg_fault_delta < 0.0)
        ]
        return candidates[:limit]

    def load(self) -> None:
        if not self.storage_path.is_file():
            return
        raw = json.loads(self.storage_path.read_text(encoding="utf-8"))
        items = raw.get("entries", []) if isinstance(raw, dict) else []
        self._entries = {
            str(item["entryId"]): ImprovementEntry.from_dict(item)
            for item in items
            if isinstance(item, dict) and "entryId" in item
        }

    def save(self) -> None:
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schemaVersion": 1,
            "entries": [entry.to_dict() for entry in self.entries()],
        }
        tmp_path = self.storage_path.with_suffix(".tmp")
        tmp_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        tmp_path.replace(self.storage_path)
