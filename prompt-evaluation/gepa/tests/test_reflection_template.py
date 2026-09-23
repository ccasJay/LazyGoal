"""Tests for custom reflection prompt templates, Jinja2 rendering, and anti-cheating invariants."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from lazygoal_gepa.controller import LifecycleController
from lazygoal_gepa.errors import GEPARunProtocolError, ReflectionTemplateError
from lazygoal_gepa.prompt_template import (
    BUILTIN_PROMPTS_DIR,
    load_and_render_reflection_prompt_template,
    resolve_reflection_prompt_template_path,
)
from lazygoal_gepa.protocol import GEPARunRequest, parse_run_request


class TestReflectionTemplate(unittest.TestCase):
    def test_builtin_templates_exist(self) -> None:
        """Builtin prompts directory contains gaia and general reflection templates."""
        gaia_path = BUILTIN_PROMPTS_DIR / "gaia-reflection@1.njk"
        general_path = BUILTIN_PROMPTS_DIR / "general-reflection@1.njk"

        self.assertTrue(gaia_path.is_file(), f"Missing {gaia_path}")
        self.assertTrue(general_path.is_file(), f"Missing {general_path}")

    def test_resolve_template_path_builtin(self) -> None:
        """Templates can be resolved with or without .njk suffix."""
        path1 = resolve_reflection_prompt_template_path("gaia-reflection@1.njk")
        path2 = resolve_reflection_prompt_template_path("gaia-reflection@1")
        self.assertEqual(path1, path2)
        self.assertTrue(path1.is_file())

        path_gen = resolve_reflection_prompt_template_path("general-reflection@1")
        self.assertTrue(path_gen.is_file())

    def test_resolve_template_path_missing_raises(self) -> None:
        """Missing template reference raises ReflectionTemplateError."""
        with self.assertRaisesRegex(ReflectionTemplateError, "could not be resolved"):
            resolve_reflection_prompt_template_path("non_existent_template_foo_bar")

    def test_render_gaia_reflection_template_contains_core_invariants(self) -> None:
        """Rendered gaia-reflection template preserves required GEPA placeholders and enforces anti-cheating."""
        rendered = load_and_render_reflection_prompt_template(
            "gaia-reflection@1",
            benchmark="gaia",
        )

        # 1. GEPA required placeholders
        self.assertIn("<curr_param>", rendered)
        self.assertIn("<side_info>", rendered)

        # 2. Context rendering
        self.assertIn("gaia", rendered)

        # 3. Error-driven guidance
        self.assertIn("TASK_TIMEOUT", rendered)
        self.assertIn("submit_answer", rendered)
        self.assertIn("/workspace/answer.json", rendered)

        # 4. Anti-cheating & generalization rules
        self.assertIn("ABSOLUTELY NO HARDCODING ANSWERS", rendered)
        self.assertIn("NO OVERFITTING", rendered)
        self.assertIn("TOOL CONTRACT ADHERENCE", rendered)

    def test_render_general_reflection_template_contains_core_invariants(self) -> None:
        """Rendered general-reflection template preserves required GEPA placeholders and enforces anti-cheating."""
        rendered = load_and_render_reflection_prompt_template(
            "general-reflection@1",
            benchmark="swebench",
        )

        self.assertIn("<curr_param>", rendered)
        self.assertIn("<side_info>", rendered)
        self.assertIn("swebench", rendered)
        self.assertIn("ABSOLUTELY NO HARDCODING ANSWERS", rendered)
        self.assertIn("NO OVERFITTING", rendered)

    def test_render_template_missing_curr_param_raises(self) -> None:
        """Template missing <curr_param> raises ReflectionTemplateError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            bad_template = Path(tmp_dir) / "bad_curr.njk"
            bad_template.write_text("Hello <side_info>", encoding="utf-8")

            with self.assertRaisesRegex(ReflectionTemplateError, "missing the required '<curr_param>'"):
                load_and_render_reflection_prompt_template(str(bad_template), benchmark="gaia")

    def test_render_template_missing_side_info_raises(self) -> None:
        """Template missing <side_info> raises ReflectionTemplateError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            bad_template = Path(tmp_dir) / "bad_side.njk"
            bad_template.write_text("Hello <curr_param>", encoding="utf-8")

            with self.assertRaisesRegex(ReflectionTemplateError, "missing the required '<side_info>'"):
                load_and_render_reflection_prompt_template(str(bad_template), benchmark="gaia")

    def test_protocol_parsing_with_reflection_prompt_template(self) -> None:
        """parse_run_request accepts and preserves reflectionPromptTemplate."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            manifest_path = Path(tmp_dir) / "manifest.json"
            manifest_path.write_text("{}", encoding="utf-8")

            data = {
                "protocol": "gepa-run@1",
                "benchmark": "gaia",
                "maxMetricCalls": 5,
                "reflectionPromptTemplate": "gaia-reflection@1",
                "trainset": [
                    {
                        "sampleId": "s1",
                        "taskId": "t1",
                        "manifestPath": str(manifest_path),
                    }
                ],
            }

            req = parse_run_request(data)
            self.assertEqual(req.reflection_prompt_template, "gaia-reflection@1")

            as_dict = req.to_dict()
            self.assertEqual(as_dict["reflectionPromptTemplate"], "gaia-reflection@1")

    def test_protocol_parsing_empty_reflection_prompt_template_raises(self) -> None:
        """Empty or non-string reflectionPromptTemplate is rejected."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            manifest_path = Path(tmp_dir) / "manifest.json"
            manifest_path.write_text("{}", encoding="utf-8")

            data = {
                "protocol": "gepa-run@1",
                "benchmark": "gaia",
                "maxMetricCalls": 5,
                "reflectionPromptTemplate": "   ",
                "trainset": [
                    {
                        "sampleId": "s1",
                        "taskId": "t1",
                        "manifestPath": str(manifest_path),
                    }
                ],
            }

            with self.assertRaisesRegex(GEPARunProtocolError, "reflectionPromptTemplate must be a non-empty string"):
                parse_run_request(data)

    def test_preflight_validates_custom_reflection_template(self) -> None:
        """preflight verifies template existence and placeholder validity."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            profile_path = tmp_path / "profile.json"
            profile_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "id": "gaia-base",
                        "name": "gaia-test",
                        "description": "test agent profile",
                        "systemPrompt": "You are a test agent.",
                        "instructions": ["Search carefully.", "Submit answers."],
                        "toolIds": ["read_file", "web_search", "web_fetch", "submit_answer"],
                    }
                ),
                encoding="utf-8",
            )

            manifest_file = tmp_path / "manifest.json"
            manifest_file.write_text(
                json.dumps(
                    {
                        "protocol": "benchmark-task-manifest@1",
                        "benchmark": "gaia",
                        "tasks": [{"taskId": "t1"}],
                    }
                ),
                encoding="utf-8",
            )

            valid_req = {
                "protocol": "gepa-run@1",
                "benchmark": "gaia",
                "maxMetricCalls": 5,
                "reflectionPromptTemplate": "gaia-reflection@1",
                "trainset": [
                    {
                        "sampleId": "s1",
                        "taskId": "t1",
                        "manifestPath": str(manifest_file),
                    }
                ],
            }
            req_path = tmp_path / "req.json"
            req_path.write_text(json.dumps(valid_req), encoding="utf-8")

            controller = LifecycleController(
                runs_dir=tmp_path / "runs",
                profile_path=profile_path,
            )
            with patch.object(
                controller,
                "_models",
                return_value=(
                    MagicMock(to_dict=lambda: {"model": "working"}),
                    MagicMock(to_dict=lambda: {"model": "reflection"}),
                ),
            ):
                result = controller.preflight(req_path)
                self.assertTrue(result["valid"])
                self.assertEqual(result["reflectionPromptTemplate"], "gaia-reflection@1")

            # Preflight fails if template is invalid
            invalid_req = dict(valid_req)
            invalid_req["reflectionPromptTemplate"] = "completely_broken_template_name"
            invalid_req_path = tmp_path / "invalid_req.json"
            invalid_req_path.write_text(json.dumps(invalid_req), encoding="utf-8")

            with patch.object(
                controller,
                "_models",
                return_value=(
                    MagicMock(to_dict=lambda: {"model": "working"}),
                    MagicMock(to_dict=lambda: {"model": "reflection"}),
                ),
            ):
                with self.assertRaisesRegex(ReflectionTemplateError, "could not be resolved"):
                    controller.preflight(invalid_req_path)

    def test_worker_orchestration_passes_rendered_template(self) -> None:
        """Worker renders reflection template and passes it to gepa.optimize."""
        from lazygoal_gepa.candidate import (
            AgentProfileSnapshot,
            FrozenRunManifest,
            ModelIdentity,
            TargetProfileSnapshot,
        )
        from lazygoal_gepa.compatibility import EXPECTED_GEPA_VERSION
        from lazygoal_gepa.store import RunStore
        from lazygoal_gepa.worker import run_gepa_worker

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            run_dir = tmp_path / "run_test_001"
            run_dir.mkdir(parents=True, exist_ok=True)
            store = RunStore(tmp_path)

            manifest_file = tmp_path / "task_manifest.json"
            manifest_file.write_text(
                json.dumps(
                    {
                        "protocol": "benchmark-task-manifest@1",
                        "benchmark": "gaia",
                        "tasks": [{"taskId": "t1"}],
                    }
                ),
                encoding="utf-8",
            )

            req = parse_run_request(
                {
                    "protocol": "gepa-run@1",
                    "benchmark": "gaia",
                    "maxMetricCalls": 3,
                    "reflectionPromptTemplate": "gaia-reflection@1",
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "t1",
                            "manifestPath": str(manifest_file),
                        }
                    ],
                }
            )

            snapshot = AgentProfileSnapshot(
                schema_version=1,
                id="p1",
                name="test-agent",
                description="test",
                system_prompt="sys",
                instructions=("inst1",),
                tool_ids=("submit_answer",),
            )
            profile_bytes = json.dumps(snapshot.to_dict()).encode("utf-8")
            profile_path = tmp_path / "profile.json"
            profile_path.write_bytes(profile_bytes)
            import hashlib
            frozen_digest = hashlib.sha256(profile_bytes).hexdigest()

            manifest = FrozenRunManifest(
                protocol="gepa-run@1",
                run_id="run_test_001",
                created_at="2026-09-23T10:00:00Z",
                gepa_version=EXPECTED_GEPA_VERSION,
                request=req,
                target_profile=TargetProfileSnapshot(
                    profile_id="p1",
                    profile_path=str(profile_path),
                    frozen_digest=frozen_digest,
                    profile=snapshot,
                ),
                seed_candidate_id="c1",
                seed_candidate={"system_prompt": "sys", "instruction_000": "inst1"},
                working_model=ModelIdentity("agent", "m1"),
                reflection_model=ModelIdentity("refl", "m2"),
            )
            run_dir = store.initialize_run(manifest)

            with patch("lazygoal_gepa.worker.gepa.optimize") as mock_optimize, \
                 patch("lazygoal_gepa.worker.resolve_lazygoal_executable", return_value=Path("/bin/echo")), \
                 patch("lazygoal_gepa.worker.generate_and_save_run_report"):
                mock_result = MagicMock()
                mock_result.best_candidate = {"system_prompt": "sys", "instruction_000": "inst1"}
                mock_result.best_idx = 0
                mock_result.val_aggregate_scores = [1.0]
                mock_result.total_metric_calls = 3
                mock_result.candidates = [{"system_prompt": "sys", "instruction_000": "inst1"}]
                mock_optimize.return_value = mock_result

                exit_code = run_gepa_worker(run_dir, workspace_root=tmp_path)
                self.assertEqual(exit_code, 0)
                self.assertTrue(mock_optimize.called)

                _, kwargs = mock_optimize.call_args
                self.assertIn("reflection_prompt_template", kwargs)
                passed_template = kwargs["reflection_prompt_template"]
                self.assertIsInstance(passed_template, str)
                self.assertIn("<curr_param>", passed_template)
                self.assertIn("<side_info>", passed_template)
                self.assertIn("ABSOLUTELY NO HARDCODING ANSWERS", passed_template)


if __name__ == "__main__":
    unittest.main()
