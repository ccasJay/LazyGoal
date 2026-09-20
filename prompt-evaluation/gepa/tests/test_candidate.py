from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from lazygoal_gepa import (
    CandidateCodec,
    CandidateValidationError,
    ConfigurationError,
    InvocationDirectoryManager,
    LazyGoalEvaluationExample,
)


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
                {"system_prompt": "system"}
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
                {"system_prompt": "system"}
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
                {"system_prompt": "system"}
            ).candidate_id

            with self.assertRaisesRegex(ConfigurationError, "Generated invocation ID"):
                manager.create_invocation(candidate_id)


if __name__ == "__main__":
    unittest.main()
