"""Lossless conversion of GEPA candidate components into LazyGoal prompts."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from typing import Mapping

from .errors import CandidateValidationError

_INSTRUCTION_COMPONENT = re.compile(r"instruction_(\d{3})\Z")


@dataclass(frozen=True)
class LazyGoalPrompt:
    """Validated Prompt Evaluation candidate and its stable content identity."""

    system_prompt: str
    instructions: tuple[str, ...]
    candidate_id: str

    def to_request_candidate(self) -> dict[str, object]:
        """Return the protocol-shaped prompt without changing component text."""

        return {
            "systemPrompt": self.system_prompt,
            "instructions": list(self.instructions),
        }


class CandidateCodec:
    """Validate GEPA component names and preserve their text byte-for-byte."""

    def decode(self, candidate: Mapping[str, str]) -> LazyGoalPrompt:
        if not isinstance(candidate, Mapping):
            raise CandidateValidationError("Candidate must be a component mapping")
        if "system_prompt" not in candidate:
            raise CandidateValidationError("Candidate component system_prompt is required")

        unknown_components: list[str] = []
        indexed_instructions: dict[int, str] = {}
        for component_name, component_text in candidate.items():
            if not isinstance(component_name, str):
                raise CandidateValidationError(
                    "Candidate component names must be strings"
                )
            if not isinstance(component_text, str):
                raise CandidateValidationError(
                    f"Candidate component {component_name!r} must be a string"
                )
            if not component_text.strip():
                raise CandidateValidationError(
                    f"Candidate component {component_name!r} must be non-empty"
                )
            if component_name == "system_prompt":
                continue
            match = _INSTRUCTION_COMPONENT.fullmatch(component_name)
            if match is None:
                unknown_components.append(component_name)
                continue
            indexed_instructions[int(match.group(1))] = component_text

        if unknown_components:
            rendered = ", ".join(repr(name) for name in sorted(unknown_components))
            raise CandidateValidationError(
                f"Unknown candidate components: {rendered}"
            )

        if not indexed_instructions:
            raise CandidateValidationError(
                "Candidate component instruction_000 is required"
            )

        expected_indices = list(range(len(indexed_instructions)))
        actual_indices = sorted(indexed_instructions)
        if actual_indices != expected_indices:
            first_missing = next(
                index
                for index in range(max(actual_indices, default=-1) + 1)
                if index not in indexed_instructions
            )
            raise CandidateValidationError(
                "Instruction components must be contiguous from instruction_000; "
                f"missing instruction_{first_missing:03d}"
            )

        instructions = tuple(
            indexed_instructions[index] for index in expected_indices
        )
        system_prompt = candidate["system_prompt"]
        try:
            candidate_id = _fingerprint(system_prompt, instructions)
        except UnicodeEncodeError as error:
            raise CandidateValidationError(
                "Candidate components must contain valid UTF-8 text"
            ) from error
        return LazyGoalPrompt(system_prompt, instructions, candidate_id)


def _fingerprint(system_prompt: str, instructions: tuple[str, ...]) -> str:
    canonical = json.dumps(
        {
            "systemPrompt": system_prompt,
            "instructions": list(instructions),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
