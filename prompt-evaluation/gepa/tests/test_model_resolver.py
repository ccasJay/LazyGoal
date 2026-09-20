"""Tests for the credential-free TypeScript model identity bridge client."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from lazygoal_gepa.errors import ConfigurationError
from lazygoal_gepa.model_resolver import resolve_model_identities


class ModelResolverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.executable_count = 0

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _executable(self, body: str) -> Path:
        self.executable_count += 1
        executable = self.root / f"resolver-{self.executable_count}"
        executable.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
        executable.chmod(0o755)
        return executable

    def test_resolves_exact_safe_identity_schema(self) -> None:
        executable = self._executable(
            "printf '%s\\n' "
            "'{\"working\":{\"profileName\":\"default\","
            "\"provider\":\"openai\",\"modelId\":\"gpt-working\"},"
            "\"reflection\":{\"profileName\":\"gepa-reflection\","
            "\"provider\":\"google\",\"modelId\":\"gemini-reflect\"}}'"
        )

        working, reflection = resolve_model_identities(self.root, executable)

        self.assertEqual(working.profile_name, "default")
        self.assertEqual(working.provider, "openai")
        self.assertEqual(reflection.model_id, "gemini-reflect")

    def test_rejects_failure_malformed_and_extra_fields(self) -> None:
        cases = (
            self._executable("printf '%s\\n' '{\"error\":\"bad config\"}' >&2; exit 2"),
            self._executable("printf '%s\\n' 'not-json'"),
            self._executable(
                "printf '%s\\n' "
                "'{\"working\":{\"profileName\":\"default\",\"provider\":\"openai\","
                "\"modelId\":\"m\",\"apiKey\":\"secret\"},"
                "\"reflection\":{\"profileName\":\"r\",\"provider\":\"openai\",\"modelId\":\"m2\"}}'"
            ),
        )
        for executable in cases:
            with self.subTest(executable=executable):
                with self.assertRaises(ConfigurationError):
                    resolve_model_identities(self.root, executable)


if __name__ == "__main__":
    unittest.main()
