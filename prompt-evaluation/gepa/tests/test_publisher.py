"""Unit tests for摘要保护的 GEPA Profile publisher."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from lazygoal_gepa.candidate import AgentProfileSnapshot, load_agent_profile
from lazygoal_gepa.publisher import ProfilePublisher


class ProfilePublisherTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.target = self.root / "profiles" / "default.json"
        self.artifacts = self.root / "run" / "artifacts"
        self.base_data = {
            "schemaVersion": 1,
            "id": "default",
            "name": "Default agent",
            "description": "Test profile",
            "systemPrompt": "base system",
            "instructions": ["first", "second"],
            "toolIds": ["read_file", "write_file"],
        }
        self.target.parent.mkdir(parents=True)
        self.target.write_text(
            json.dumps(self.base_data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        self.base_profile, self.frozen_digest = load_agent_profile(self.target)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _publisher(self) -> ProfilePublisher:
        return ProfilePublisher(
            target_path=self.target,
            frozen_digest=self.frozen_digest,
            base_profile=self.base_profile,
            artifacts_dir=self.artifacts,
        )

    @staticmethod
    def _candidate(system: str = "optimized system") -> dict[str, str]:
        # Deliberately use an arbitrary mapping order: numeric suffixes own order.
        return {
            "instruction_001": "optimized second",
            "system_prompt": system,
            "instruction_000": "optimized first",
        }

    def test_published_writes_complete_profile_and_preserves_permissions(self) -> None:
        self.target.chmod(0o640)
        original_mode = stat.S_IMODE(self.target.stat().st_mode)

        result = self._publisher().publish(self._candidate())

        self.assertEqual(result.status, "published")
        self.assertIsNone(result.error_code)
        self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), original_mode)
        published = json.loads(self.target.read_text(encoding="utf-8"))
        self.assertEqual(published["schemaVersion"], 1)
        self.assertEqual(published["id"], "default")
        self.assertEqual(published["name"], self.base_data["name"])
        self.assertEqual(published["description"], self.base_data["description"])
        self.assertEqual(published["toolIds"], self.base_data["toolIds"])
        self.assertEqual(published["systemPrompt"], "optimized system")
        self.assertEqual(
            published["instructions"], ["optimized first", "optimized second"]
        )
        self.assertTrue(result.best_profile_path is not None)
        artifact = json.loads(result.best_profile_path.read_text(encoding="utf-8"))
        self.assertEqual(artifact, published)

    def test_unchanged_still_saves_auditable_best_artifact(self) -> None:
        result = self._publisher().publish(
            {
                "system_prompt": self.base_profile.system_prompt,
                "instruction_001": self.base_profile.instructions[1],
                "instruction_000": self.base_profile.instructions[0],
            }
        )

        self.assertEqual(result.status, "unchanged")
        self.assertEqual(result.publication_status, "unchanged")
        self.assertTrue(result.best_profile_path.is_file())
        self.assertEqual(
            result.to_dict()["bestProfilePath"], str(result.best_profile_path)
        )

    def test_conflict_keeps_target_and_best_artifact(self) -> None:
        original = self.target.read_bytes()
        self.target.write_bytes(original + b"\n")

        result = self._publisher().publish(self._candidate())

        self.assertEqual(result.status, "conflict")
        self.assertEqual(result.publication_status, "blocked")
        self.assertEqual(result.error_code, "publish_conflict")
        self.assertEqual(self.target.read_bytes(), original + b"\n")
        self.assertTrue(result.best_profile_path.is_file())

    def test_invalid_candidate_does_not_touch_target_or_claim_artifact(self) -> None:
        original = self.target.read_bytes()

        result = self._publisher().publish(
            {"system_prompt": "valid", "instruction_001": "gap"}
        )

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "publish_failed")
        self.assertIsNone(result.best_profile_path)
        self.assertEqual(self.target.read_bytes(), original)
        self.assertFalse(self.artifacts.exists())

    def test_target_write_failure_does_not_replace_current_profile(self) -> None:
        original = self.target.read_bytes()
        real_replace = os.replace
        calls = 0

        def fail_target_replace(source: str | os.PathLike[str], target: str | os.PathLike[str]) -> None:
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated target write failure")
            real_replace(source, target)

        with patch("lazygoal_gepa.publisher.os.replace", side_effect=fail_target_replace):
            result = self._publisher().publish(self._candidate())

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.error_code, "publish_failed")
        self.assertEqual(self.target.read_bytes(), original)
        self.assertTrue(result.best_profile_path.is_file())

    def test_publication_errors_are_bounded_and_redacted(self) -> None:
        original = self.target.read_bytes()
        real_replace = os.replace
        calls = 0

        def fail_target_replace(source, target) -> None:
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("api_key=provider-secret " + ("vendor response " * 1_000))
            real_replace(source, target)

        with patch("lazygoal_gepa.publisher.os.replace", side_effect=fail_target_replace):
            result = self._publisher().publish(self._candidate())

        self.assertEqual(result.status, "failed")
        self.assertIsNotNone(result.error_message)
        assert result.error_message is not None
        self.assertLessEqual(len(result.error_message), 4_096)
        self.assertNotIn("provider-secret", result.error_message)
        self.assertEqual(self.target.read_bytes(), original)

    def test_report_summary_excludes_prompt_text(self) -> None:
        result = self._publisher().publish(self._candidate())

        report = result.to_dict()
        rendered = json.dumps(report, ensure_ascii=False)
        self.assertNotIn("optimized system", rendered)
        self.assertNotIn("optimized first", rendered)
        self.assertNotIn("optimized second", rendered)
        self.assertEqual(report["status"], "published")


if __name__ == "__main__":
    unittest.main()
