"""Lossless conversion of GEPA candidate components into LazyGoal prompts."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Mapping

from .errors import CandidateValidationError, ProfileValidationError
from .protocol import GEPARunRequest, parse_run_request

_INSTRUCTION_COMPONENT = re.compile(r"instruction_(\d{3})\Z")
_SHA256_HEX = re.compile(r"[0-9a-f]{64}\Z")
_GIT_REVISION = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")


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


@dataclass(frozen=True)
class AgentProfileSnapshot:
    """In-memory representation of a validated Agent Profile."""

    schema_version: int
    id: str
    name: str
    description: str
    system_prompt: str
    instructions: tuple[str, ...]
    tool_ids: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "systemPrompt": self.system_prompt,
            "instructions": list(self.instructions),
            "toolIds": list(self.tool_ids),
        }


def load_agent_profile(path: Path | str) -> tuple[AgentProfileSnapshot, str]:
    """Load, strictly validate an Agent Profile, and return (snapshot, frozenDigest)."""

    profile_path = Path(path).resolve()
    if not profile_path.is_file():
        raise ProfileValidationError(f"Profile file not found: {profile_path}")

    try:
        raw_bytes = profile_path.read_bytes()
    except OSError as error:
        raise ProfileValidationError(
            f"Could not read profile file: {profile_path}"
        ) from error

    frozen_digest = hashlib.sha256(raw_bytes).hexdigest()

    try:
        data: Any = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProfileValidationError(
            f"Profile file is not valid UTF-8 JSON: {profile_path}"
        ) from error

    if not isinstance(data, dict) or not all(isinstance(k, str) for k in data):
        raise ProfileValidationError("Agent Profile must be an object")

    required_keys = {
        "schemaVersion",
        "id",
        "name",
        "description",
        "systemPrompt",
        "instructions",
        "toolIds",
    }
    actual_keys = set(data)
    missing = sorted(required_keys - actual_keys)
    unknown = sorted(actual_keys - required_keys)
    if missing:
        raise ProfileValidationError(
            f"Profile missing required fields: {', '.join(missing)}"
        )
    if unknown:
        raise ProfileValidationError(
            f"Profile contains unknown fields: {', '.join(unknown)}"
        )

    schema_version = data["schemaVersion"]
    if (
        not isinstance(schema_version, int)
        or isinstance(schema_version, bool)
        or schema_version != 1
    ):
        raise ProfileValidationError(
            f"schemaVersion must be 1, got {schema_version!r}"
        )

    profile_id = data["id"]
    if not isinstance(profile_id, str) or not profile_id.strip():
        raise ProfileValidationError("id must be a non-empty string")

    name = data["name"]
    if not isinstance(name, str) or not name.strip():
        raise ProfileValidationError("name must be a non-empty string")

    description = data["description"]
    if not isinstance(description, str) or not description.strip():
        raise ProfileValidationError("description must be a non-empty string")

    system_prompt = data["systemPrompt"]
    if not isinstance(system_prompt, str) or not system_prompt.strip():
        raise ProfileValidationError("systemPrompt must be a non-empty string")

    instructions_raw = data["instructions"]
    if not isinstance(instructions_raw, list) or len(instructions_raw) == 0:
        raise ProfileValidationError("instructions must be a non-empty list")
    for index, item in enumerate(instructions_raw):
        if not isinstance(item, str) or not item.strip():
            raise ProfileValidationError(
                f"Instruction item {index} must be a non-empty string"
            )

    tool_ids_raw = data["toolIds"]
    if not isinstance(tool_ids_raw, list) or not all(
        isinstance(t, str) for t in tool_ids_raw
    ):
        raise ProfileValidationError("toolIds must be a list of strings")

    snapshot = AgentProfileSnapshot(
        schema_version=schema_version,
        id=profile_id,
        name=name,
        description=description,
        system_prompt=system_prompt,
        instructions=tuple(instructions_raw),
        tool_ids=tuple(tool_ids_raw),
    )
    return snapshot, frozen_digest


def extract_seed_candidate(profile: AgentProfileSnapshot) -> dict[str, str]:
    """Convert AgentProfileSnapshot into fixed contiguous GEPA candidate components."""

    candidate: dict[str, str] = {
        "system_prompt": profile.system_prompt,
    }
    for index, instruction in enumerate(profile.instructions):
        candidate[f"instruction_{index:03d}"] = instruction

    # Verify against CandidateCodec contract immediately
    CandidateCodec().decode(candidate)
    return candidate


@dataclass(frozen=True)
class ModelIdentity:
    """Safe model identity without API keys or credentials."""

    profile_name: str
    model_id: str
    provider: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "profileName": self.profile_name,
            "modelId": self.model_id,
        }
        if self.provider is not None:
            data["provider"] = self.provider
        return data


@dataclass(frozen=True)
class TargetProfileSnapshot:
    """Frozen target profile locator and digest."""

    profile_id: str
    profile_path: str
    frozen_digest: str
    profile: AgentProfileSnapshot

    def to_dict(self) -> dict[str, Any]:
        return {
            "profileId": self.profile_id,
            "profilePath": self.profile_path,
            "frozenDigest": self.frozen_digest,
            "snapshot": self.profile.to_dict(),
        }


@dataclass(frozen=True)
class FrozenRunManifest:
    """Immutable safe run manifest written to run.json."""

    protocol: Literal["gepa-run@1"]
    run_id: str
    created_at: str
    gepa_version: str
    request: GEPARunRequest
    target_profile: TargetProfileSnapshot
    seed_candidate: dict[str, str]
    seed_candidate_id: str
    working_model: ModelIdentity
    reflection_model: ModelIdentity
    tua_dataset_inspection: dict[str, Any] | None = None
    preflight_input_digest: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data = {
            "protocol": self.protocol,
            "runId": self.run_id,
            "createdAt": self.created_at,
            "gepaVersion": self.gepa_version,
            "request": self.request.to_dict(),
            "targetProfile": self.target_profile.to_dict(),
            "seedCandidate": dict(self.seed_candidate),
            "seedCandidateId": self.seed_candidate_id,
            "models": {
                "working": self.working_model.to_dict(),
                "reflection": self.reflection_model.to_dict(),
            },
        }
        if self.tua_dataset_inspection is not None:
            data["tuaDatasetInspection"] = self.tua_dataset_inspection
        if self.preflight_input_digest is not None:
            data["preflightInputDigest"] = self.preflight_input_digest
        return data


def _validate_tua_dataset_inspection(
    value: Any,
    request: GEPARunRequest,
) -> dict[str, Any] | None:
    if request.tua_dataset is None:
        if value is not None:
            raise ProfileValidationError(
                "tuaDatasetInspection is only valid for a TUA GEPA run"
            )
        return None
    if not isinstance(value, dict) or set(value) != {
        "sourceRevision",
        "datasetDigest",
        "workingTreeDirty",
        "changedPaths",
        "tasks",
        "partitions",
    }:
        raise ProfileValidationError("TUA run manifest requires a valid tuaDatasetInspection")
    if not isinstance(value["sourceRevision"], str) or not _GIT_REVISION.fullmatch(
        value["sourceRevision"]
    ):
        raise ProfileValidationError("tuaDatasetInspection.sourceRevision is invalid")
    if not isinstance(value["datasetDigest"], str) or not _SHA256_HEX.fullmatch(
        value["datasetDigest"]
    ):
        raise ProfileValidationError("tuaDatasetInspection.datasetDigest is invalid")
    if not isinstance(value["workingTreeDirty"], bool):
        raise ProfileValidationError("tuaDatasetInspection.workingTreeDirty must be boolean")
    changed_paths = value["changedPaths"]
    if not isinstance(changed_paths, list) or not all(
        isinstance(path, str) and path for path in changed_paths
    ):
        raise ProfileValidationError("tuaDatasetInspection.changedPaths must be a string array")
    if value["workingTreeDirty"] != bool(changed_paths):
        raise ProfileValidationError("TUA dataset dirty state does not match changed paths")

    expected_partitions = {
        "train": list(request.tua_dataset.train_task_ids),
        "validation": list(request.tua_dataset.validation_task_ids),
        "holdout": list(request.tua_dataset.holdout_task_ids),
    }
    tasks = value["tasks"]
    partitions = value["partitions"]
    if not isinstance(tasks, dict) or set(tasks) != {
        task_id for task_ids in expected_partitions.values() for task_id in task_ids
    }:
        raise ProfileValidationError("TUA dataset inspection tasks do not match the request")
    if not isinstance(partitions, dict) or set(partitions) != set(expected_partitions):
        raise ProfileValidationError("TUA dataset inspection partitions are invalid")

    snapshot_keys = {
        "taskId",
        "taskFamily",
        "networkMode",
        "agentTimeoutSec",
        "verifierTimeoutSec",
        "resourceDigest",
        "imageDigest",
    }
    for task_id, task in tasks.items():
        if not isinstance(task, dict) or set(task) != snapshot_keys:
            raise ProfileValidationError(f"TUA task inspection {task_id!r} has invalid fields")
        if task["taskId"] != task_id:
            raise ProfileValidationError(f"TUA task inspection identity mismatch for {task_id!r}")
        if not isinstance(task["taskFamily"], str) or not task["taskFamily"].strip():
            raise ProfileValidationError(f"TUA task {task_id!r} has no task family")
        if not isinstance(task["networkMode"], str) or task["networkMode"] not in {
            "none",
            "public",
        }:
            raise ProfileValidationError(f"TUA task {task_id!r} has invalid network mode")
        for field in ("agentTimeoutSec", "verifierTimeoutSec"):
            if not isinstance(task[field], int) or isinstance(task[field], bool) or task[field] <= 0:
                raise ProfileValidationError(f"TUA task {task_id!r} has invalid {field}")
        if not isinstance(task["resourceDigest"], str) or not _SHA256_HEX.fullmatch(
            task["resourceDigest"]
        ):
            raise ProfileValidationError(f"TUA task {task_id!r} has invalid resource digest")
        if not isinstance(task["imageDigest"], str) or not re.fullmatch(
            r"sha256:[0-9a-f]{64}", task["imageDigest"]
        ):
            raise ProfileValidationError(f"TUA task {task_id!r} has invalid image digest")

    for partition_name, expected_ids in expected_partitions.items():
        partition = partitions[partition_name]
        if not isinstance(partition, dict) or set(partition) != {
            "taskIds",
            "taskFamilies",
            "networkTasks",
        }:
            raise ProfileValidationError(f"TUA {partition_name} partition summary is invalid")
        if partition["taskIds"] != expected_ids:
            raise ProfileValidationError(f"TUA {partition_name} IDs do not match the request")
        expected_families = sorted({tasks[task_id]["taskFamily"] for task_id in expected_ids})
        if partition["taskFamilies"] != expected_families:
            raise ProfileValidationError(f"TUA {partition_name} task families are inconsistent")
        expected_network_tasks = [
            task_id for task_id in expected_ids
            if tasks[task_id]["networkMode"] == "public"
        ]
        if partition["networkTasks"] != expected_network_tasks:
            raise ProfileValidationError(f"TUA {partition_name} network tasks are inconsistent")

    train_families = set(partitions["train"]["taskFamilies"])
    for partition_name in ("validation", "holdout"):
        if not train_families.issubset(set(partitions[partition_name]["taskFamilies"])):
            raise ProfileValidationError(
                f"TUA {partition_name} partition does not cover training task families"
            )
    return value


def parse_frozen_run_manifest(data: Any) -> FrozenRunManifest:
    """Parse and validate a dictionary as FrozenRunManifest."""

    if not isinstance(data, dict) or not all(isinstance(k, str) for k in data):
        raise ProfileValidationError("Run manifest must be an object")

    protocol = data.get("protocol")
    if protocol != "gepa-run@1":
        raise ProfileValidationError(f"Unsupported manifest protocol: {protocol!r}")

    run_id = data.get("runId")
    if not isinstance(run_id, str) or not run_id.strip():
        raise ProfileValidationError("runId must be a non-empty string")

    created_at = data.get("createdAt")
    if not isinstance(created_at, str) or not created_at.strip():
        raise ProfileValidationError("createdAt must be a non-empty string")

    gepa_version = data.get("gepaVersion")
    if not isinstance(gepa_version, str) or not gepa_version.strip():
        raise ProfileValidationError("gepaVersion must be a non-empty string")

    request = parse_run_request(data.get("request"))
    tua_dataset_inspection = _validate_tua_dataset_inspection(
        data.get("tuaDatasetInspection"), request
    )
    preflight_input_digest = data.get("preflightInputDigest")
    if preflight_input_digest is not None and (
        not isinstance(preflight_input_digest, str)
        or not _SHA256_HEX.fullmatch(preflight_input_digest)
    ):
        raise ProfileValidationError("preflightInputDigest must be a SHA-256 digest")
    if request.tua_dataset is not None and preflight_input_digest is None:
        raise ProfileValidationError("TUA run manifest requires preflightInputDigest")

    target_profile_raw = data.get("targetProfile")
    if not isinstance(target_profile_raw, dict):
        raise ProfileValidationError("targetProfile must be an object")

    snapshot_raw = target_profile_raw.get("snapshot")
    if not isinstance(snapshot_raw, dict):
        raise ProfileValidationError("targetProfile.snapshot must be an object")

    snapshot = AgentProfileSnapshot(
        schema_version=snapshot_raw["schemaVersion"],
        id=snapshot_raw["id"],
        name=snapshot_raw["name"],
        description=snapshot_raw["description"],
        system_prompt=snapshot_raw["systemPrompt"],
        instructions=tuple(snapshot_raw["instructions"]),
        tool_ids=tuple(snapshot_raw["toolIds"]),
    )
    target_profile = TargetProfileSnapshot(
        profile_id=target_profile_raw["profileId"],
        profile_path=target_profile_raw["profilePath"],
        frozen_digest=target_profile_raw["frozenDigest"],
        profile=snapshot,
    )

    seed_candidate = data.get("seedCandidate")
    if not isinstance(seed_candidate, dict):
        raise ProfileValidationError("seedCandidate must be an object")

    seed_candidate_id = data.get("seedCandidateId")
    if not isinstance(seed_candidate_id, str) or not seed_candidate_id.strip():
        raise ProfileValidationError("seedCandidateId must be a non-empty string")

    models_raw = data.get("models")
    if not isinstance(models_raw, dict):
        raise ProfileValidationError("models must be an object")

    working_raw = models_raw.get("working")
    reflection_raw = models_raw.get("reflection")
    if not isinstance(working_raw, dict) or not isinstance(reflection_raw, dict):
        raise ProfileValidationError("models.working and models.reflection must be objects")

    working_model = ModelIdentity(
        profile_name=working_raw["profileName"],
        model_id=working_raw["modelId"],
        provider=working_raw.get("provider"),
    )
    reflection_model = ModelIdentity(
        profile_name=reflection_raw["profileName"],
        model_id=reflection_raw["modelId"],
        provider=reflection_raw.get("provider"),
    )

    return FrozenRunManifest(
        protocol="gepa-run@1",
        run_id=run_id,
        created_at=created_at,
        gepa_version=gepa_version,
        request=request,
        target_profile=target_profile,
        seed_candidate=seed_candidate,
        seed_candidate_id=seed_candidate_id,
        working_model=working_model,
        reflection_model=reflection_model,
        tua_dataset_inspection=tua_dataset_inspection,
        preflight_input_digest=preflight_input_digest,
    )


def read_frozen_run_manifest(path: Path | str) -> FrozenRunManifest:
    """Read and parse run.json manifest file."""

    manifest_path = Path(path).resolve()
    if not manifest_path.is_file():
        raise ProfileValidationError(f"Manifest file not found: {manifest_path}")

    try:
        content = manifest_path.read_text(encoding="utf-8")
        data = json.loads(content)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ProfileValidationError(
            f"Could not read manifest file as JSON: {manifest_path}"
        ) from error

    return parse_frozen_run_manifest(data)
