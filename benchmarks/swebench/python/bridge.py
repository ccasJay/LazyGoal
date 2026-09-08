"""Pinned official dataset/harness boundary. Never mount this directory in an agent container."""

import contextlib
import importlib.metadata
import json
from pathlib import Path
import subprocess
import sys

VERSION = "4.1.0"


def check_version():
    actual = importlib.metadata.version("swebench")
    if actual != VERSION:
        raise RuntimeError(f"Expected swebench=={VERSION}, found {actual}")


def select_instances(dataset, ids):
    selected = {row["instance_id"]: dict(row) for row in dataset if row["instance_id"] in ids}
    missing = set(ids) - selected.keys()
    if missing:
        raise ValueError(f"Instances missing from pinned dataset: {sorted(missing)}")
    return [selected[instance_id] for instance_id in ids]


def prepare(manifest_path, output):
    from datasets import load_dataset
    from swebench.harness.test_spec.test_spec import make_test_spec

    manifest = json.loads(Path(manifest_path).read_text())
    dataset = load_dataset(manifest["dataset"], split="test", revision=manifest["revision"])
    rows = select_instances(dataset, manifest["instanceIds"])
    Path(output, "dataset.json").write_text(json.dumps(rows))
    tasks = []
    for row in rows:
        spec = make_test_spec(row, namespace="swebench", arch="x86_64")
        tasks.append({key: row[key] for key in ("instance_id", "repo", "base_commit", "problem_statement")}
                     | {"image": spec.instance_image_key})
    return {"harnessVersion": VERSION, "tasks": tasks}


def read_grades(output, run_id, predictions):
    results = []
    for prediction in predictions:
        instance_id = prediction["instance_id"]
        folder = Path(output, "logs/run_evaluation", run_id,
                      prediction["model_name_or_path"].replace("/", "__"), instance_id)
        report = folder / "report.json"
        result = {"instanceId": instance_id, "logDirectory": str(folder)}
        if not prediction["model_patch"]:
            result["status"] = "empty_patch"
        elif not report.exists():
            result["status"] = "grading_error"
        else:
            data = json.loads(report.read_text())
            resolved = data[instance_id]["resolved"]
            if type(resolved) is not bool:
                raise ValueError(f"Invalid official resolved field: {report}")
            result["status"] = "resolved" if resolved else "unresolved"
        results.append(result)
    return results


def grade(output, run_id, timeout):
    predictions_path = Path(output, "predictions.jsonl")
    predictions = [json.loads(line) for line in predictions_path.read_text().splitlines() if line.strip()]
    with Path(output, "harness.log").open("w") as log:
        completed = subprocess.run([
            sys.executable, "-m", "swebench.harness.run_evaluation",
            "--dataset_name", str(Path(output, "dataset.json")),
            "--predictions_path", str(predictions_path), "--run_id", run_id,
            "--max_workers", "1", "--timeout", timeout,
            "--namespace", "swebench", "--cache_level", "instance",
        ], cwd=output, stdout=log, stderr=subprocess.STDOUT, check=False)
    return {"exitCode": completed.returncode, "results": read_grades(output, run_id, predictions)}


def main():
    check_version()
    with contextlib.redirect_stdout(sys.stderr):
        action, *args = sys.argv[1:]
        if action == "preflight":
            import docker
            docker.from_env().ping()
            result = {"harnessVersion": VERSION}
        elif action == "prepare":
            result = prepare(*args)
        elif action == "grade":
            result = grade(*args)
        else:
            raise ValueError(f"Unknown action: {action}")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
