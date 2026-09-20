from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from lazygoal_gepa import (
    CandidateCodec,
    CandidateValidationError,
    ConfigurationError,
    InvocationDirectoryManager,
    LazyGoalEvaluationExample,
)
from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    extract_seed_candidate,
    load_agent_profile,
    parse_frozen_run_manifest,
    read_frozen_run_manifest,
)
from lazygoal_gepa.errors import ProfileValidationError
from lazygoal_gepa.protocol import GEPAExampleRequest, GEPARunRequest


class CandidateCodecTests(unittest.TestCase):
    def setUp(self) -> None:
        self.codec = CandidateCodec()

    def test_preserves_component_text_and_orders_instructions(self) -> None:
        candidate = {
            "instruction_001": "  second\n",
            "system_prompt": " system \n",
            "instruction_000": "first\t",
        }

        prompt = self.codec.decode(candidate)

        self.assertEqual(prompt.system_prompt, " system \n")
        self.assertEqual(prompt.instructions, ("first\t", "  second\n"))
        self.assertEqual(
            prompt.to_request_candidate(),
            {
                "systemPrompt": " system \n",
                "instructions": ["first\t", "  second\n"],
            },
        )

    def test_fingerprint_is_stable_across_mapping_order(self) -> None:
        first = self.codec.decode(
            {"system_prompt": "system", "instruction_000": "instruction"}
        )
        second = self.codec.decode(
            {"instruction_000": "instruction", "system_prompt": "system"}
        )

        self.assertEqual(first.candidate_id, second.candidate_id)
        self.assertEqual(len(first.candidate_id), 64)

    def test_rejects_missing_unknown_gapped_or_non_string_components(self) -> None:
        cases = (
            ({}, "system_prompt is required"),
            ({"system_prompt": "system"}, "instruction_000 is required"),
            (
                {"system_prompt": " ", "instruction_000": "text"},
                "system_prompt.*must be non-empty",
            ),
            (
                {"system_prompt": "system", "instruction_000": "\n"},
                "instruction_000.*must be non-empty",
            ),
            ({"system_prompt": "system", "other": "text"}, "Unknown candidate"),
            (
                {"system_prompt": "system", "instruction_001": "text"},
                "contiguous",
            ),
            ({"system_prompt": 1}, "system_prompt.*must be a string"),
            (
                {"system_prompt": "system", "instruction_1000": "text"},
                "Unknown candidate",
            ),
        )
        for candidate, expected_message in cases:
            with self.subTest(candidate=candidate):
                with self.assertRaisesRegex(
                    CandidateValidationError,
                    expected_message,
                ):
                    self.codec.decode(candidate)


class InvocationDirectoryTests(unittest.TestCase):
    def test_same_candidate_uses_independent_invocation_directories(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            ids = iter(("invocation1", "invocation2"))
            manager = InvocationDirectoryManager(
                Path(temporary_directory),
                id_factory=lambda: next(ids),
            )
            candidate_id = CandidateCodec().decode(
                {"system_prompt": "system", "instruction_000": "instruction"}
            ).candidate_id

            first = manager.create_invocation(candidate_id)
            second = manager.create_invocation(candidate_id)

            self.assertNotEqual(first.directory, second.directory)
            self.assertTrue(first.directory.is_dir())
            self.assertTrue(second.directory.is_dir())

    def test_sample_ids_cannot_escape_invocation_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            manager = InvocationDirectoryManager(root, id_factory=lambda: "run1")
            candidate_id = CandidateCodec().decode(
                {"system_prompt": "system", "instruction_000": "instruction"}
            ).candidate_id
            invocation = manager.create_invocation(candidate_id)
            example = LazyGoalEvaluationExample(
                sample_id="../../outside",
                benchmark_id="alfworld",
                task_id="task/../../../outside",
                manifest_path=root / "manifest.json",
            )

            sample_directory = manager.create_sample_directory(invocation, example)

            self.assertEqual(sample_directory.parent, invocation.directory)
            self.assertNotIn("outside", sample_directory.name)
            self.assertTrue(sample_directory.is_dir())

    def test_rejects_unsafe_generated_invocation_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            manager = InvocationDirectoryManager(
                Path(temporary_directory),
                id_factory=lambda: "../outside",
            )
            candidate_id = CandidateCodec().decode(
                {"system_prompt": "system", "instruction_000": "instruction"}
            ).candidate_id

            with self.assertRaisesRegex(ConfigurationError, "Generated invocation ID"):
                manager.create_invocation(candidate_id)


class ProfileSeedCandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _write_profile(self, data: dict[str, Any], filename: str = "default.json") -> Path:
        profile_path = self.root / filename
        profile_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return profile_path

    def _valid_profile_data(self) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "id": "default",
            "name": "Default Agent",
            "description": "General assistant",
            "systemPrompt": "You are LazyGoal.",
            "instructions": ["Use tools carefully.", "Be concise."],
            "toolIds": ["read_file", "write_file"],
        }

    def test_profile_to_seed_candidate_conversion(self) -> None:
        path = self._write_profile(self._valid_profile_data())
        snapshot, digest = load_agent_profile(path)

        self.assertEqual(snapshot.id, "default")
        self.assertEqual(snapshot.system_prompt, "You are LazyGoal.")
        self.assertEqual(snapshot.instructions, ("Use tools carefully.", "Be concise."))
        self.assertEqual(len(digest), 64)

        seed = extract_seed_candidate(snapshot)
        expected = {
            "system_prompt": "You are LazyGoal.",
            "instruction_000": "Use tools carefully.",
            "instruction_001": "Be concise.",
        }
        self.assertEqual(seed, expected)

    def test_reject_empty_or_whitespace_instruction(self) -> None:
        cases = (
            [],
            [""],
            ["   "],
            ["\t\n"],
            ["valid", "   "],
        )
        for instructions in cases:
            with self.subTest(instructions=instructions):
                data = self._valid_profile_data()
                data["instructions"] = instructions
                path = self._write_profile(data)
                with self.assertRaises(ProfileValidationError):
                    load_agent_profile(path)

    def test_reject_empty_or_whitespace_system_prompt(self) -> None:
        cases = ("", "   ", "\n\t")
        for prompt in cases:
            with self.subTest(prompt=prompt):
                data = self._valid_profile_data()
                data["systemPrompt"] = prompt
                path = self._write_profile(data)
                with self.assertRaises(ProfileValidationError):
                    load_agent_profile(path)

    def test_reject_corrupted_profile_json(self) -> None:
        # File not found
        with self.assertRaises(ProfileValidationError):
            load_agent_profile(self.root / "non_existent.json")

        # Corrupted JSON syntax
        bad_json = self.root / "bad.json"
        bad_json.write_text("{not valid json", encoding="utf-8")
        with self.assertRaises(ProfileValidationError):
            load_agent_profile(bad_json)

        # Missing required field
        data = self._valid_profile_data()
        del data["systemPrompt"]
        path = self._write_profile(data)
        with self.assertRaises(ProfileValidationError):
            load_agent_profile(path)

        # Unknown field
        data = self._valid_profile_data()
        data["unknownField"] = "bad"
        path = self._write_profile(data)
        with self.assertRaises(ProfileValidationError):
            load_agent_profile(path)

        # ID not default
        data = self._valid_profile_data()
        data["id"] = "custom"
        path = self._write_profile(data)
        with self.assertRaises(ProfileValidationError):
            load_agent_profile(path)

    def test_binary_sha256_exactness_and_whitespace_sensitivity(self) -> None:
        path = self._write_profile(self._valid_profile_data())
        raw_bytes = path.read_bytes()
        expected_hash = hashlib.sha256(raw_bytes).hexdigest()

        _, digest = load_agent_profile(path)
        self.assertEqual(digest, expected_hash)

        # Append a newline / space
        path.write_bytes(raw_bytes + b"\n")
        _, new_digest = load_agent_profile(path)
        self.assertNotEqual(digest, new_digest)
        self.assertEqual(new_digest, hashlib.sha256(raw_bytes + b"\n").hexdigest())

    def test_candidate_fingerprint_order_invariance(self) -> None:
        codec = CandidateCodec()
        cand1 = {
            "system_prompt": "You are an assistant.",
            "instruction_000": "First instruction.",
            "instruction_001": "Second instruction.",
        }
        cand2 = {
            "instruction_001": "Second instruction.",
            "system_prompt": "You are an assistant.",
            "instruction_000": "First instruction.",
        }
        p1 = codec.decode(cand1)
        p2 = codec.decode(cand2)
        self.assertEqual(p1.candidate_id, p2.candidate_id)

        cand_altered = dict(cand1)
        cand_altered["instruction_001"] = "Second instruction altered."
        p_altered = codec.decode(cand_altered)
        self.assertNotEqual(p1.candidate_id, p_altered.candidate_id)

    def test_profile_roundtrip_preserves_frozen_fields(self) -> None:
        path = self._write_profile(self._valid_profile_data())
        snapshot, digest = load_agent_profile(path)
        seed = extract_seed_candidate(snapshot)
        prompt = CandidateCodec().decode(seed)

        req_candidate = prompt.to_request_candidate()
        self.assertEqual(req_candidate["systemPrompt"], snapshot.system_prompt)
        self.assertEqual(req_candidate["instructions"], list(snapshot.instructions))

        # Test FrozenRunManifest assembly and parsing
        req = GEPARunRequest(
            protocol="gepa-run@1",
            benchmark="alfworld",
            trainset=(
                GEPAExampleRequest(
                    sample_id="s1",
                    task_id="t1",
                    manifest_path="/abs/manifest.json",
                ),
            ),
            max_metric_calls=10,
        )
        target = TargetProfileSnapshot(
            profile_id=snapshot.id,
            profile_path=str(path),
            frozen_digest=digest,
            profile=snapshot,
        )
        manifest = FrozenRunManifest(
            protocol="gepa-run@1",
            run_id="run_123",
            created_at="2026-09-20T12:00:00Z",
            gepa_version="0.1.4",
            request=req,
            target_profile=target,
            seed_candidate=seed,
            seed_candidate_id=prompt.candidate_id,
            working_model=ModelIdentity("default", "gpt-4o"),
            reflection_model=ModelIdentity("gepa-reflection", "claude-3-5-sonnet"),
        )
        manifest_dict = manifest.to_dict()
        parsed = parse_frozen_run_manifest(manifest_dict)
        self.assertEqual(parsed.run_id, "run_123")
        self.assertEqual(parsed.target_profile.frozen_digest, digest)
        self.assertEqual(parsed.working_model.model_id, "gpt-4o")
        self.assertEqual(parsed.reflection_model.model_id, "claude-3-5-sonnet")


if __name__ == "__main__":
    unittest.main()
