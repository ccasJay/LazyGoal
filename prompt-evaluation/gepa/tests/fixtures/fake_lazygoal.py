#!/usr/bin/env python3
import json
import os
import sys
import time
from pathlib import Path


def main():
    mode = os.environ.get("LAZYGOAL_GEPA_FAKE_MODE", "passed")
    if sys.argv[1:3] == ["gepa", "inspect-tua"]:
        request_path = Path(sys.argv[4])
        request = json.loads(request_path.read_text(encoding="utf-8"))
        partitions = {
            "train": request["trainTaskIds"],
            "validation": request["validationTaskIds"],
            "holdout": request["holdoutTaskIds"],
        }
        task_ids = [
            task_id
            for partition_ids in partitions.values()
            for task_id in partition_ids
        ]
        tasks = {
            task_id: {
                "taskId": task_id,
                "taskFamily": "document",
                "networkMode": "none",
                "agentTimeoutSec": 600,
                "verifierTimeoutSec": 600,
                "resourceDigest": "d" * 64,
                "imageDigest": "sha256:" + "e" * 64,
            }
            for task_id in task_ids
        }
        inspection = {
            "sourceRevision": "b" * 40,
            "datasetDigest": "c" * 64,
            "workingTreeDirty": False,
            "changedPaths": [],
            "tasks": tasks,
            "partitions": {
                name: {
                    "taskIds": task_ids,
                    "taskFamilies": ["document"],
                    "networkTasks": [],
                }
                for name, task_ids in partitions.items()
            },
        }
        print(json.dumps(inspection))
        return 0
    if mode == "invalid_request":
        sys.stderr.write("fixture rejected request\n")
        return 2
    if mode == "overflow":
        sys.stdout.write("x" * 4096)
        return 0

    request_path = Path(sys.argv[4])
    request = json.loads(request_path.read_text(encoding="utf-8"))
    if mode == "echo_secret":
        sys.stderr.write(os.environ["FAKE_PROVIDER_SECRET"] + "\n")
    manifest = json.loads(
        Path(request["benchmark"]["manifestPath"]).read_text(encoding="utf-8")
    )
    task_id = manifest["tasks"][0]["taskId"]
    counter_path = os.environ.get("LAZYGOAL_GEPA_FAKE_COUNTER")
    if counter_path:
        path = Path(counter_path)
        current = int(path.read_text(encoding="utf-8")) if path.exists() else 0
        path.write_text(str(current + 1), encoding="utf-8")
    delay_seconds = os.environ.get("LAZYGOAL_GEPA_FAKE_DELAY_SECONDS")
    if delay_seconds:
        time.sleep(float(delay_seconds))
    if mode == "sleep":
        time.sleep(60)
    evaluation_id = "fixture-evaluation"
    timestamp = "2026-09-20T00:00:00.000Z"
    output_directory = Path(request["outputDirectory"])
    result_path = (
        output_directory / "evaluations" / evaluation_id / "result.json"
    )
    if mode == "escape_path":
        result_path = request_path.parent.parent / "escaped-result.json"

    result_status = "completed"
    task_status = "failed" if mode == "failed" else "passed"
    if mode == "status_by_task":
        task_status = "passed" if task_id.endswith("pass") else "failed"
    elif mode == "tua_sensitive":
        task_status = "failed"
    elif mode == "score_if_improved":
        component_texts = [request["candidate"]["systemPrompt"]]
        component_texts.extend(request["candidate"]["instructions"])
        task_status = (
            "passed"
            if any("improved" in text for text in component_texts)
            else "failed"
        )
    exit_code = 0
    if mode in ("infrastructure", "metric_score_infrastructure"):
        result_status = "infrastructure_error"
        task_status = "infrastructure_error"
        exit_code = 1
    elif mode == "cancelled":
        result_status = "cancelled"
        task_status = "cancelled"
        exit_code = 130
    elif mode == "exit_mismatch":
        exit_code = 1

    authoritative = task_status in ("passed", "failed")
    metric_score = None
    if request["benchmark"]["id"] == "tua-bench" and authoritative:
        metric_score = 1.0 if task_status == "passed" else 0.35
    if mode == "tua_sensitive":
        domain_result = {
            "taskFamily": "document",
            "passed": False,
            "reward": 0.35,
            "verifierOutput": "PRIVATE_VERIFIER_OUTPUT_MARKER",
            "answer": "PRIVATE_ANSWER_MARKER",
            "holdoutTaskIds": ["PRIVATE_HOLDOUT_TASK_MARKER"],
        }
    elif mode == "large_domain":
        domain_result = {
            "success": task_status == "passed",
            "detail": "x" * 5000,
            "items": list(range(80)),
        }
    else:
        domain_result = {"success": task_status == "passed"}
    result = {
        "protocol": "prompt-evaluation@1",
        "evaluationId": evaluation_id,
        "status": result_status,
        "benchmarkId": request["benchmark"]["id"],
        "manifestPath": request["benchmark"]["manifestPath"],
        "candidateId": request["candidate"]["id"],
        "baseProfileId": request["candidate"]["baseProfileId"],
        "promptSha256": "a" * 64,
        "promptSummary": {
            "systemPromptCharacters": len(request["candidate"]["systemPrompt"]),
            "instructionCount": len(request["candidate"]["instructions"]),
            "instructionCharacters": sum(
                len(value) for value in request["candidate"]["instructions"]
            ),
        },
        "modelConfigId": request["model"]["configId"],
        "modelId": request["model"]["modelId"],
        "generatedAt": timestamp,
        "tasks": [
            {
                "taskId": "other-task" if mode == "task_mismatch" else task_id,
                "status": task_status,
                "domainResult": domain_result if authoritative else None,
                **(
                    {
                        "metricScore": 0.0
                        if mode == "zero_metric_score"
                        else 0.35
                        if mode in ("metric_score", "tua_sensitive")
                        else metric_score
                    }
                    if (
                        (
                            mode in ("metric_score", "zero_metric_score", "tua_sensitive")
                            or request["benchmark"]["id"] == "tua-bench"
                        )
                        and authoritative
                    )
                    else {}
                ),
                "attemptPath": (
                    "/tmp/PRIVATE_HOLDOUT_TASK_MARKER/attempt.json"
                    if mode == "tua_sensitive"
                    else str(output_directory / "attempt.json")
                )
                if authoritative
                else None,
                "artifactLocator": (
                    {
                        "goalSnapshot": "PRIVATE_HOLDOUT_SNAPSHOT_MARKER",
                        "trajectory": "PRIVATE_HOLDOUT_TRAJECTORY_MARKER",
                        "diagnosticTrace": "PRIVATE_HOLDOUT_TRACE_MARKER",
                    }
                    if mode == "tua_sensitive"
                    else None
                ),
                "errors": [
                    {
                        "stage": (
                            "agent" if mode == "tua_sensitive" else "fixture"
                        ),
                        "message": (
                            "PRIVATE_VERIFIER_OUTPUT_MARKER PRIVATE_ANSWER_MARKER"
                            if mode == "tua_sensitive"
                            else "infrastructure failed"
                        ),
                        "code": (
                            "PRIVATE_PRIVATE_PATH_MARKER"
                            if mode == "tua_sensitive"
                            else "FIXTURE_FAILURE"
                        ),
                    }
                ]
                if task_status == "infrastructure_error" or mode == "tua_sensitive"
                else [],
            }
        ],
    }
    if mode == "unknown_result_field":
        result["unexpected"] = True
    elif mode == "invalid_metric_score":
        result["tasks"][0]["metricScore"] = "0.5"
    elif mode == "nonfinite_metric_score":
        result["tasks"][0]["metricScore"] = float("inf")
    elif mode == "metric_score_infrastructure":
        result["tasks"][0]["metricScore"] = 0.5

    result_path.parent.mkdir(parents=True, exist_ok=True)
    if mode == "corrupt_result":
        result_path.write_text("{", encoding="utf-8")
    else:
        result_path.write_text(json.dumps(result) + "\n", encoding="utf-8")

    accepted = {
        "protocol": "prompt-evaluation@1",
        "evaluationId": evaluation_id,
        "type": "progress",
        "authoritative": False,
        "taskId": None,
        "stage": "accepted",
        "timestamp": timestamp,
    }
    terminal = {
        "protocol": "prompt-evaluation@1",
        "evaluationId": evaluation_id,
        "type": "terminal",
        "authoritative": False,
        "taskId": None,
        "stage": result_status,
        "timestamp": timestamp,
        "resultPath": str(result_path.resolve()),
    }

    if mode == "bad_json":
        sys.stdout.write("{\n")
        return exit_code
    print(json.dumps(accepted))
    if mode == "missing_terminal":
        return exit_code
    print(json.dumps(terminal))
    if mode == "multiple_terminal":
        print(json.dumps(terminal))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
