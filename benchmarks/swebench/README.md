# SWE-bench baseline

Run a fixed SWE-bench Verified manifest through LazyGoal, export one patch per
instance, and grade the saved predictions with the official harness. Each instance
gets one attempt and an isolated container. There are no automatic retries or
grading feedback during inference.

## Prepare the environment

Run the following commands from the repository root. You need Python 3.10 or later,
the repository's Node dependencies, and a running Docker daemon accessible to both
the Docker CLI and the Python Docker SDK. This baseline uses official `linux/amd64`
images; ARM hosts require working Docker emulation. Each inference container is
limited to 2 CPUs, 4 GiB RAM and 256 processes. Image downloads require additional
disk space; see the [official Docker guidance](https://www.swebench.com/SWE-bench/guides/docker_setup/).

```bash
python3 -m venv .lazygoal/swebench-venv
.lazygoal/swebench-venv/bin/python -m pip install -r benchmarks/swebench/python/requirements.txt
docker info
.lazygoal/swebench-venv/bin/python -B benchmarks/swebench/python/bridge.py preflight
```

The integration requires `swebench==4.1.0`; another version fails preflight. The
bridge uses this release's dataset and harness interfaces. It does not follow the
upstream `main` branch. If the CLI and Python SDK use different Docker endpoints,
set `DOCKER_HOST` to the daemon both should use.

## Run one complete task

Set your OpenAI-compatible provider configuration in the shell:

```bash
export LLM_API_KEY='<your-key>'
export LLM_BASE_URL='<your-compatible-api-url>'
export LLM_MODEL='<your-model>'
export LLM_STRUCTURED_OUTPUT_MODE='strict'
```

Use `prompt_only` if the provider does not support strict structured output.
This command reads process environment variables; it does not load ALFWorld's
environment file or a repository `.env` file.

```bash
node bin/lazygoal.cjs eval swebench \
  --manifest benchmarks/swebench/manifests/single.json \
  --python .lazygoal/swebench-venv/bin/python \
  --output .lazygoal/benchmarks/swebench-runs/astropy-12907
```

The output directory must not already exist. Omit `--output` to allocate a unique
directory automatically. Progress goes to stderr; stdout contains a JSON summary.
The [single-task manifest](./manifests/single.json) runs
`astropy__astropy-12907`, including LazyGoal inference, patch export and official
grading. The [five-task smoke manifest](./manifests/smoke.json) remains available
for integration debugging. Both manifests fix the dataset revision, instance
order, step limit, task timeout and grading timeout; neither is a representative
sample of the full Verified dataset.

Task time includes image preparation and inference. Shell calls default to 30
seconds and allow at most 120 seconds; their output is truncated explicitly to
16,000 bytes per stream. The agent can read, search, edit and test through
`swebench_shell`; shell state resets each call, while filesystem changes persist.
Agent containers have no network or host mounts. Dependencies come from the
official instance image. The image ID used for each attempt is recorded; compare
these IDs when comparing runs because the upstream `latest` image tag is mutable.

## Inspect the result

| Artifact in the output directory | Meaning |
| --- | --- |
| `manifest.json` | Fixed task selection and budgets |
| `dataset.json` | Original selected dataset records, kept outside agent containers |
| `<instance_id>.patch` | Final diff against the original base commit, including new files |
| `predictions.jsonl` | Official prediction format; model identifier `lazygoal`, actual model in `report.json` |
| `report.json` | Configuration, per-attempt Runtime state, image ID, patch hash, usage, timing and official result |
| `runtime/` | Goal Snapshots, committed Trajectories and Diagnostic Traces using existing Storage codecs |
| `harness.log` | Output from the official evaluator |
| `logs/run_evaluation/<run_id>/lazygoal/<instance_id>/` | Official per-instance reports and test logs |

`resolvedRate` uses the entire manifest as its denominator, including environment
failures and unstarted tasks. `runStatus` and `stopReason` are separate from
`gradingStatus`: reaching the step limit still exports and grades the current
patch, and the model claiming completion cannot override official test failures.
`empty_patch`, `not_submitted` and `grading_error` distinguish empty diffs, export
or setup failures, and missing official grades. A grading error is not assumed to
be an infrastructure error; inspect the official logs for patch or test failures.

Usage sums only reported provider tokens; `missingUsageCalls` counts calls with
missing usage, including failed calls. The complete per-call diagnostic data is
available in the Trace. `durationMs` sums task preparation, inference and cleanup;
it does not include dataset download or official grading.

Exit code `0` means the evaluation completed, even if some patches were unresolved;
`1` means configuration, execution, cleanup or grading failed; `2` means invalid
CLI arguments; `130` means interruption. Interrupted runs keep existing artifacts
and leave ungraded exported patches `pending`. This version does not resume agent
containers from Goal Snapshots. Start a new output directory for a new attempt.

To grade saved predictions independently, use the same pinned Python environment
and an unused run ID. This does not rerun LazyGoal or update its `report.json`:

```bash
.lazygoal/swebench-venv/bin/python -m swebench.harness.run_evaluation \
  --dataset_name .lazygoal/benchmarks/swebench-runs/astropy-12907/dataset.json \
  --predictions_path .lazygoal/benchmarks/swebench-runs/astropy-12907/predictions.jsonl \
  --run_id astropy-12907-regrade-1 --max_workers 1 --cache_level instance
```

Do not expose `dataset.json`, reference patches or grading test material to the
agent. Official result caching uses run IDs; reuse can score an old patch.
See the [official evaluation guide](https://www.swebench.com/SWE-bench/guides/evaluation/)
for prediction format and scoring details; command and log paths above target the
pinned 4.1.0 release.

## Deterministic checks

```bash
npm --prefix benchmarks run typecheck
npm --prefix benchmarks test
npm --prefix benchmarks run swebench:test-python
```

TypeScript integration tests use the real Headless Root and Storage with fake LLM,
Docker and Python process boundaries. Python unit tests require only the standard
library. These checks do not establish a real SWE-bench score; that requires the
container and model run above.
