from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from lazygoal_harness2.trajectory_reader import (
    build_contrastive_trajectory_view,
    format_full_trajectories_for_prompt,
    load_evaluation_trajectories,
    redact_secrets,
)


class TestTrajectoryReader(unittest.TestCase):
    def test_loads_full_committed_jsonl_events_and_builds_contrastive_view(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            b_traj_dir = root / "baseline_traj"
            p_traj_dir = root / "probe_traj"
            b_traj_dir.mkdir()
            p_traj_dir.mkdir()

            (b_traj_dir / "goal-1.jsonl").write_text(
                "\n".join(
                    [
                        json.dumps(
                            {
                                "goalId": "goal-1",
                                "runId": "run-1",
                                "sequence": 1,
                                "payload": {
                                    "type": "model_repair_feedback_recorded",
                                    "feedback": {
                                        "origin": "decision_semantics",
                                        "code": "INVALID_AGENT_DECISION",
                                    },
                                },
                            }
                        ),
                        json.dumps(
                            {
                                "goalId": "goal-1",
                                "runId": "run-1",
                                "sequence": 2,
                                "payload": {
                                    "type": "tool_finished",
                                    "toolId": "bash",
                                    "output": "token=sk-1234567890abcdefghijklmnop",
                                },
                            }
                        ),
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            (p_traj_dir / "goal-1.jsonl").write_text(
                json.dumps(
                    {
                        "goalId": "goal-1",
                        "runId": "run-1",
                        "sequence": 1,
                        "payload": {"type": "model_response_received", "stage": "decide"},
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            b_res_path = root / "baseline_result.json"
            p_res_path = root / "probe_result.json"

            b_res_path.write_text(
                json.dumps(
                    {
                        "evaluationId": "eval-base",
                        "candidate": {"id": "cand-base"},
                        "tasks": [
                            {
                                "taskId": "astropy__astropy-12907",
                                "status": "failed",
                                "metricScore": 0.45,
                                "artifactLocator": {"trajectory": str(b_traj_dir)},
                                "domainResult": {
                                    "patchBytes": 120,
                                    "runtimeHealth": {
                                        "zeroFaultPass": False,
                                        "runtimeScore": 0.45,
                                        "callErrorRate": 0.5,
                                        "repairCount": 1,
                                        "stageRejectionCount": 0,
                                        "toolFaultCount": 0,
                                        "terminalFaultCount": 0,
                                        "hasNonEmptyPatch": True,
                                        "hasVerificationBashCall": True,
                                        "faults": [
                                            {
                                                "sequence": 1,
                                                "category": "repair",
                                                "code": "INVALID_AGENT_DECISION",
                                                "origin": "decision_semantics",
                                                "message": "Missing run stage",
                                            }
                                        ],
                                    },
                                },
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            p_res_path.write_text(
                json.dumps(
                    {
                        "evaluationId": "eval-probe",
                        "candidate": {"id": "cand-probe"},
                        "tasks": [
                            {
                                "taskId": "astropy__astropy-12907",
                                "status": "passed",
                                "metricScore": 1.0,
                                "artifactLocator": {"trajectory": str(p_traj_dir)},
                                "domainResult": {
                                    "patchBytes": 120,
                                    "runtimeHealth": {
                                        "zeroFaultPass": True,
                                        "runtimeScore": 1.0,
                                        "callErrorRate": 0.0,
                                        "repairCount": 0,
                                        "stageRejectionCount": 0,
                                        "toolFaultCount": 0,
                                        "terminalFaultCount": 0,
                                        "hasNonEmptyPatch": True,
                                        "hasVerificationBashCall": True,
                                        "faults": [],
                                    },
                                },
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            base_summary = load_evaluation_trajectories(b_res_path)
            probe_summary = load_evaluation_trajectories(p_res_path)

            task_base = base_summary.tasks["astropy__astropy-12907"]
            self.assertEqual(len(task_base.committed_events), 2)
            # Verify secret redaction in trajectory event
            self.assertIn(
                "sk-[REDACTED]",
                json.dumps(task_base.committed_events[1]),
            )

            prompt_text = format_full_trajectories_for_prompt(base_summary)
            self.assertIn("INVALID_AGENT_DECISION", prompt_text)
            self.assertIn("Committed Trajectory Events (2 total)", prompt_text)

            comparisons = build_contrastive_trajectory_view(base_summary, probe_summary)
            self.assertEqual(len(comparisons), 1)
            self.assertAlmostEqual(comparisons[0].score_delta, 0.55)
            self.assertEqual(comparisons[0].fault_delta, -1)
            self.assertEqual(comparisons[0].resolved_fault_codes, ("INVALID_AGENT_DECISION",))
            self.assertEqual(comparisons[0].introduced_fault_codes, ())

    def test_redact_secrets_masks_tokens(self) -> None:
        raw = "Authorization: Bearer abcdef1234567890ghijkl and sk-1234567890abcdef1234"
        masked = redact_secrets(raw)
        self.assertIn("Bearer [REDACTED]", masked)
        self.assertIn("sk-[REDACTED]", masked)


if __name__ == "__main__":
    unittest.main()
