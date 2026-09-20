from __future__ import annotations

import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from typing import Any

from lazygoal_gepa.candidate import (
    AgentProfileSnapshot,
    FrozenRunManifest,
    ModelIdentity,
    TargetProfileSnapshot,
    load_agent_profile,
)
from lazygoal_gepa.errors import (
    ProfileValidationError,
    RunStoreError,
)
from lazygoal_gepa.protocol import (
    GEPA_RUN_PROTOCOL,
    GEPAExampleRequest,
    GEPARunRequest,
    parse_run_request,
    read_run_request,
)
from lazygoal_gepa.store import RunStore


class EmpiricalStoreAndProfileAdversarialTests(unittest.TestCase):
    """Milestone 2 Empirical Challenger 2 Adversarial Stress Suite."""

    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name).resolve()
        self.runs_dir = self.root / "runs"
        self.store = RunStore(self.runs_dir)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _valid_profile_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "id": "default",
            "name": "Challenger Baseline Agent",
            "description": "Baseline agent for empirical stress challenge",
            "systemPrompt": "You are LazyGoal agent.",
            "instructions": [
                "Execute tasks deterministically.",
                "Adhere to strictly bounded memory constraints.",
            ],
            "toolIds": ["read_file", "write_file", "run_command"],
        }

    def _write_profile(self, data: dict[str, Any], filename: str = "default.json") -> Path:
        path = self.root / filename
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return path

    def _create_and_init_manifest(self, run_id: str = "run_adv_001") -> tuple[Path, FrozenRunManifest]:
        profile_data = self._valid_profile_dict()
        profile_path = self._write_profile(profile_data, f"profile_{run_id}.json")
        snapshot, digest = load_agent_profile(profile_path)

        req = GEPARunRequest(
            protocol=GEPA_RUN_PROTOCOL,
            benchmark="alfworld",
            trainset=(
                GEPAExampleRequest(
                    sample_id="sample_01",
                    task_id="task_01",
                    manifest_path=str(self.root / "m.json"),
                ),
            ),
            max_metric_calls=25,
        )
        target = TargetProfileSnapshot(
            profile_id="default",
            profile_path=str(profile_path),
            frozen_digest=digest,
            profile=snapshot,
        )
        manifest = FrozenRunManifest(
            protocol=GEPA_RUN_PROTOCOL,
            run_id=run_id,
            created_at="2026-09-20T12:00:00Z",
            gepa_version="0.1.4",
            request=req,
            target_profile=target,
            seed_candidate={
                "system_prompt": snapshot.system_prompt,
                "instruction_000": snapshot.instructions[0],
                "instruction_001": snapshot.instructions[1],
            },
            seed_candidate_id="0123456789abcdef" * 4,
            working_model=ModelIdentity("default", "gpt-4o"),
            reflection_model=ModelIdentity("gepa-reflection", "claude-3-5-sonnet"),
        )
        run_dir = self.store.initialize_run(manifest)
        return run_dir, manifest

    # =========================================================================
    # 1. Truncated / Corrupted state.json Recognition
    # =========================================================================

    def test_truncated_state_json_raises_corrupted(self) -> None:
        run_dir, _ = self._create_and_init_manifest("run_trunc")
        state_path = run_dir / "state.json"
        full_content = state_path.read_text(encoding="utf-8")

        # Stress test multiple truncation points
        truncation_points = [
            0,                     # 0 bytes (empty file)
            1,                     # single byte "{"
            len(full_content) // 4,
            len(full_content) // 2,
            len(full_content) - 2, # truncated just before closing brace
        ]
        for cut in truncation_points:
            with self.subTest(cut_bytes=cut):
                state_path.write_text(full_content[:cut], encoding="utf-8")
                with self.assertRaises(RunStoreError) as cm:
                    self.store.read_state("run_trunc")
                self.assertEqual(cm.exception.code, "corrupted")

    def test_invalid_syntax_and_non_utf8_state_raises_corrupted(self) -> None:
        run_dir, _ = self._create_and_init_manifest("run_syntax")
        state_path = run_dir / "state.json"

        # Invalid JSON syntax
        syntax_cases = [
            "{invalid json format}",
            "NaN",
            "undefined",
            '{"runId": "run_syntax", "metricCalls": 0,}',  # trailing comma
            '{"runId": "run_syntax"\n"metricCalls": 0}',   # missing comma
        ]
        for content in syntax_cases:
            with self.subTest(syntax=content):
                state_path.write_text(content, encoding="utf-8")
                with self.assertRaises(RunStoreError) as cm:
                    self.store.read_state("run_syntax")
                self.assertEqual(cm.exception.code, "corrupted")

        # Non-UTF-8 bytes
        state_path.write_bytes(b"\x80\xff\xfe\x00\xaa\xbb")
        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("run_syntax")
        self.assertEqual(cm.exception.code, "corrupted")

    def test_non_object_root_state_raises_corrupted(self) -> None:
        run_dir, _ = self._create_and_init_manifest("run_non_obj")
        state_path = run_dir / "state.json"

        non_objects = [
            "[]",
            '"just a string"',
            "12345",
            "true",
            "null",
        ]
        for val in non_objects:
            with self.subTest(root_type=val):
                state_path.write_text(val, encoding="utf-8")
                with self.assertRaises(RunStoreError) as cm:
                    self.store.read_state("run_non_obj")
                self.assertEqual(cm.exception.code, "corrupted")

    def test_missing_required_fields_in_state_raises_corrupted(self) -> None:
        run_dir, _ = self._create_and_init_manifest("run_missing_fields")
        state_path = run_dir / "state.json"
        base_state = json.loads(state_path.read_text(encoding="utf-8"))

        required_fields = list(base_state.keys())
        self.assertTrue(len(required_fields) >= 10)

        for field in required_fields:
            with self.subTest(missing_field=field):
                corrupted_state = copy.deepcopy(base_state)
                del corrupted_state[field]
                state_path.write_text(json.dumps(corrupted_state), encoding="utf-8")
                with self.assertRaises(RunStoreError) as cm:
                    self.store.read_state("run_missing_fields")
                self.assertEqual(cm.exception.code, "corrupted")
                self.assertIn(field, str(cm.exception))

    def test_invalid_field_types_in_state_raises_corrupted(self) -> None:
        run_dir, _ = self._create_and_init_manifest("run_invalid_types")
        state_path = run_dir / "state.json"
        base_state = json.loads(state_path.read_text(encoding="utf-8"))

        invalid_type_mutations = [
            ("lifecycleStatus", "unknown_status"),
            ("lifecycleStatus", 123),
            ("publicationStatus", "invalid_pub_status"),
            ("stopRequested", "true"),      # string instead of bool
            ("stopRequested", 1),           # int instead of bool
            ("metricCalls", "0"),           # string instead of int
            ("metricCalls", 1.5),           # float instead of int
            ("metricCalls", True),          # bool should not be accepted as int!
            ("maxMetricCalls", False),      # bool should not be accepted as int!
            ("candidateCount", None),       # None instead of int
            ("bestScore", "not_a_number"),  # string instead of float/null
            ("bestCandidateId", 12345),     # int instead of str/null
        ]

        for field, invalid_val in invalid_type_mutations:
            with self.subTest(field=field, invalid_val=invalid_val):
                corrupted_state = copy.deepcopy(base_state)
                corrupted_state[field] = invalid_val
                state_path.write_text(json.dumps(corrupted_state), encoding="utf-8")
                with self.assertRaises(RunStoreError) as cm:
                    self.store.read_state("run_invalid_types")
                self.assertEqual(cm.exception.code, "corrupted")

    # =========================================================================
    # 2. Uninitialized Run Directory Recognition
    # =========================================================================

    def test_nonexistent_run_directory_raises_unformed(self) -> None:
        # Run directory does not exist at all on disk
        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("completely_missing_run")
        self.assertEqual(cm.exception.code, "unformed")

        with self.assertRaises(RunStoreError) as cm:
            self.store.read_manifest("completely_missing_run")
        self.assertEqual(cm.exception.code, "unformed")

    def test_empty_or_partial_run_directory_raises_unformed(self) -> None:
        run_dir = self.store.get_run_dir("run_partial")
        run_dir.mkdir(parents=True, exist_ok=True)

        # 1. Completely empty directory
        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("run_partial")
        self.assertEqual(cm.exception.code, "unformed")

        with self.assertRaises(RunStoreError) as cm:
            self.store.read_manifest("run_partial")
        self.assertEqual(cm.exception.code, "unformed")

        # 2. Directory with gepa/ subfolder only
        (run_dir / "gepa").mkdir()
        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("run_partial")
        self.assertEqual(cm.exception.code, "unformed")

        # 3. Directory with state.json only (manifest missing)
        (run_dir / "state.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(RunStoreError) as cm:
            self.store.read_manifest("run_partial")
        self.assertEqual(cm.exception.code, "unformed")

        # 4. Directory with run.json only (state.json missing)
        (run_dir / "state.json").unlink()
        (run_dir / "run.json").write_text("{}", encoding="utf-8")
        with self.assertRaises(RunStoreError) as cm:
            self.store.read_state("run_partial")
        self.assertEqual(cm.exception.code, "unformed")

    # =========================================================================
    # 3. Agent Profile Binary Sensitivity (1 byte / whitespace sensitivity)
    # =========================================================================

    def test_profile_frozen_digest_exact_match(self) -> None:
        profile_data = self._valid_profile_dict()
        profile_path = self._write_profile(profile_data, "profile_exact.json")
        raw_bytes = profile_path.read_bytes()
        expected_sha = hashlib.sha256(raw_bytes).hexdigest()

        snapshot, digest = load_agent_profile(profile_path)
        self.assertEqual(digest, expected_sha)
        self.assertEqual(snapshot.id, "default")

    def test_profile_trailing_newline_modifications_change_digest(self) -> None:
        profile_data = self._valid_profile_dict()
        profile_path = self._write_profile(profile_data, "profile_nl.json")
        raw_bytes = profile_path.read_bytes()
        _, baseline_digest = load_agent_profile(profile_path)

        # 1. Append LF '\n'
        profile_path.write_bytes(raw_bytes + b"\n")
        _, digest_lf = load_agent_profile(profile_path)
        self.assertNotEqual(baseline_digest, digest_lf)
        self.assertEqual(digest_lf, hashlib.sha256(raw_bytes + b"\n").hexdigest())

        # 2. Append CRLF '\r\n'
        profile_path.write_bytes(raw_bytes + b"\r\n")
        _, digest_crlf = load_agent_profile(profile_path)
        self.assertNotEqual(baseline_digest, digest_crlf)
        self.assertNotEqual(digest_lf, digest_crlf)
        self.assertEqual(digest_crlf, hashlib.sha256(raw_bytes + b"\r\n").hexdigest())

        # 3. Append trailing space
        profile_path.write_bytes(raw_bytes + b" ")
        _, digest_space = load_agent_profile(profile_path)
        self.assertNotEqual(baseline_digest, digest_space)

    def test_profile_semantic_preserving_formatting_change_breaks_digest(self) -> None:
        """Adding a space inside JSON preserves parsed semantics but MUST change frozenDigest."""
        profile_data = self._valid_profile_dict()
        content = json.dumps(profile_data, indent=2)
        profile_path = self.root / "profile_spaces.json"
        profile_path.write_text(content, encoding="utf-8")
        s1, d1 = load_agent_profile(profile_path)

        # Insert one extra space between "schemaVersion": and 1
        mutated_content = content.replace('"schemaVersion": 1', '"schemaVersion":  1')
        self.assertNotEqual(content, mutated_content)
        profile_path.write_text(mutated_content, encoding="utf-8")
        s2, d2 = load_agent_profile(profile_path)

        # Semantics are identical
        self.assertEqual(s1.to_dict(), s2.to_dict())
        # But frozenDigest MUST be different
        self.assertNotEqual(d1, d2)
        self.assertEqual(d2, hashlib.sha256(mutated_content.encode("utf-8")).hexdigest())

    def test_single_byte_mutation_breaks_digest(self) -> None:
        profile_data = self._valid_profile_dict()
        profile_path = self._write_profile(profile_data, "profile_bit.json")
        raw_bytes = bytearray(profile_path.read_bytes())
        _, baseline_digest = load_agent_profile(profile_path)

        # Mutate single byte in description
        desc_idx = raw_bytes.find(b"Baseline")
        self.assertTrue(desc_idx > 0)
        raw_bytes[desc_idx] = ord("b")  # 'B' -> 'b'
        profile_path.write_bytes(raw_bytes)

        _, mutated_digest = load_agent_profile(profile_path)
        self.assertNotEqual(baseline_digest, mutated_digest)

    def test_utf8_bom_injection_raises_or_changes_digest(self) -> None:
        profile_data = self._valid_profile_dict()
        profile_path = self._write_profile(profile_data, "profile_bom.json")
        raw_bytes = profile_path.read_bytes()

        # Prepend UTF-8 BOM
        profile_path.write_bytes(b"\xef\xbb\xbf" + raw_bytes)
        # In Python json.loads, UTF-8 BOM causes JSONDecodeError -> ProfileValidationError
        with self.assertRaises(ProfileValidationError):
            load_agent_profile(profile_path)

    # =========================================================================
    # 4. Relative Path Resolution across Different CWDs
    # =========================================================================

    def test_relative_paths_resolved_to_absolute_under_various_cwds(self) -> None:
        orig_cwd = os.getcwd()

        dir_a = self.root / "workspace_a"
        dir_b = self.root / "workspace_b"
        dir_c = self.root / "workspace_c"
        for d in (dir_a, dir_b, dir_c):
            d.mkdir(parents=True, exist_ok=True)

        manifest_file = dir_a / "manifest.json"
        manifest_file.write_text(
            json.dumps({"benchmark": "alfworld", "tasks": [{"taskId": "task_rel"}]}),
            encoding="utf-8",
        )

        # Write request.json in dir_a with relative manifest path "./manifest.json"
        request_file_a = dir_a / "request.json"
        request_file_a.write_text(
            json.dumps(
                {
                    "protocol": GEPA_RUN_PROTOCOL,
                    "benchmark": "alfworld",
                    "trainset": [
                        {
                            "sampleId": "s1",
                            "taskId": "task_rel",
                            "manifestPath": "./manifest.json",
                        }
                    ],
                    "maxMetricCalls": 10,
                }
            ),
            encoding="utf-8",
        )

        try:
            # Test 1: Calling read_run_request while cwd is dir_a
            os.chdir(dir_a)
            req1 = read_run_request(request_file_a, check_manifests=True)
            self.assertTrue(Path(req1.trainset[0].manifest_path).is_absolute())
            self.assertEqual(req1.trainset[0].manifest_path, str(manifest_file.resolve()))

            # Test 2: Calling read_run_request while cwd is completely different (dir_b)
            os.chdir(dir_b)
            req2 = read_run_request(request_file_a, check_manifests=True)
            self.assertTrue(Path(req2.trainset[0].manifest_path).is_absolute())
            # MUST resolve relative to request.json's location (dir_a), NOT current dir_b!
            self.assertEqual(req2.trainset[0].manifest_path, str(manifest_file.resolve()))

            # Test 3: Calling read_run_request while cwd is dir_c
            os.chdir(dir_c)
            req3 = read_run_request(request_file_a, check_manifests=True)
            self.assertTrue(Path(req3.trainset[0].manifest_path).is_absolute())
            self.assertEqual(req3.trainset[0].manifest_path, str(manifest_file.resolve()))

            # Test 4: Nested relative path with ../
            sub_dir = dir_a / "sub1" / "sub2"
            sub_dir.mkdir(parents=True, exist_ok=True)
            request_file_nested = sub_dir / "request_nested.json"
            request_file_nested.write_text(
                json.dumps(
                    {
                        "protocol": GEPA_RUN_PROTOCOL,
                        "benchmark": "alfworld",
                        "trainset": [
                            {
                                "sampleId": "s1",
                                "taskId": "task_rel",
                                "manifestPath": "../../manifest.json",
                            }
                        ],
                        "maxMetricCalls": 10,
                    }
                ),
                encoding="utf-8",
            )
            os.chdir(dir_b)
            req_nested = read_run_request(request_file_nested, check_manifests=True)
            self.assertTrue(Path(req_nested.trainset[0].manifest_path).is_absolute())
            self.assertEqual(req_nested.trainset[0].manifest_path, str(manifest_file.resolve()))
            self.assertNotIn("..", req_nested.trainset[0].manifest_path)

        finally:
            os.chdir(orig_cwd)

    def test_run_store_with_relative_runs_dir_normalizes_to_absolute(self) -> None:
        orig_cwd = os.getcwd()
        try:
            os.chdir(self.root)
            relative_store = RunStore("./relative_runs")
            self.assertTrue(relative_store.runs_dir.is_absolute())
            self.assertEqual(relative_store.runs_dir, (self.root / "relative_runs").resolve())

            run_dir = relative_store.get_run_dir("run_001")
            self.assertTrue(run_dir.is_absolute())
            self.assertEqual(run_dir, (self.root / "relative_runs" / "run_001").resolve())
        finally:
            os.chdir(orig_cwd)


if __name__ == "__main__":
    unittest.main()
