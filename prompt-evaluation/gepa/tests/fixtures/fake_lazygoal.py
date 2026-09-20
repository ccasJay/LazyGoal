#!/usr/bin/env python3
import json
import os
import sys
import time
from pathlib import Path


def main():
    mode = os.environ.get("LAZYGOAL_GEPA_FAKE_MODE", "passed")
    if mode == "invalid_request":
        sys.stderr.write("fixture rejected request\n")
        return 2
    if mode == "overflow":
        sys.stdout.write("x" * 4096)
        return 0

    request_path = Path(sys.argv[4])
    request = json.loads(request_path.read_text(encoding="utf-8"))
    manifest = json.loads(
        Path(request["benchmark"]["manifestPath"]).read_text(encoding="utf-8")
    )
    task_id = manifest["tasks"][0]["taskId"]
    counter_path = os.environ.get("LAZYGOAL_GEPA_FAKE_COUNTER")
    if counter_path:
        path = Path(counter_path)
        current = int(path.read_text(encoding="utf-8")) if path.exists() else 0
        path.write_text(str(current + 1), encoding="utf-8")
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
    exit_code = 0
    if mode == "infrastructure":
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
                "domainResult": {"success": task_status == "passed"}
                if authoritative
                else None,
                "attemptPath": str(output_directory / "attempt.json")
                if authoritative
                else None,
                "artifactLocator": None,
                "errors": [
                    {
                        "stage": "fixture",
                        "message": "infrastructure failed",
                        "code": "FIXTURE_FAILURE",
                    }
                ]
                if task_status == "infrastructure_error"
                else [],
            }
        ],
    }
    if mode == "unknown_result_field":
        result["unexpected"] = True

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
