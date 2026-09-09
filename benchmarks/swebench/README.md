# SWE-bench ACP container evaluation

Run a fixed SWE-bench Verified manifest through the ACP Worker, export one patch
per instance, and grade the saved predictions with the official harness. Each
instance gets one attempt and an isolated container. There are no automatic
retries or grading feedback during inference.

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

Set the provider configuration required by the selected LLM Adapter in the shell:

```bash
export LLM_API_KEY='<your-key>'
export LLM_BASE_URL='<your-compatible-api-url>'
export LLM_MODEL='<your-model>'
export LLM_STRUCTURED_OUTPUT_MODE='strict'
```

Use `prompt_only` if the provider does not support strict structured output. The
host keeps provider credentials; the Worker receives only model responses through
the LLM RPC channel.
This command reads process environment variables; it does not load ALFWorld's
environment file or a repository `.env` file.

```bash
node bin/lazygoal.cjs eval swebench \
  --manifest benchmarks/swebench/manifests/single.json \
  --python .lazygoal/swebench-venv/bin/python \
  --output .lazygoal/benchmarks/swebench-runs/astropy-12907
```

The output directory must not already exist. Omit `--output` to allocate a unique
directory automatically. The command builds or reuses the pinned linux/amd64
Worker and Node runtime before solving tasks. Progress goes to stderr; stdout
contains a JSON summary.
The [single-task manifest](./manifests/single.json) runs
`astropy__astropy-12907`, including LazyGoal inference, patch export and official
grading. The [five-task smoke manifest](./manifests/smoke.json) remains available
for integration debugging. Both manifests fix the dataset revision, instance
order, step limit, task timeout and grading timeout; neither is a representative
sample of the full Verified dataset.

To exercise the injected Worker with a deterministic host model, run the explicit
Docker smoke command:

```bash
npm run swebench:worker-smoke --prefix benchmarks
```

It uses the fixed single-task manifest and official image, checks the linux/amd64
Node and Conda preflight, drives both ACP and LLM channels, and verifies a file
change in the exported patch. It requires Docker and the pinned SWE-bench Python
environment; it is not part of the default regression.

Task time includes image preparation and inference. The container has no network
or host mounts. The ACP profile exposes only `read_file`, `write_file`,
`edit_file`, `grep`, and `bash`, all rooted at `/testbed`; dependencies come from
the official instance image. ACP and LLM frames share one ordered Mux but remain
separate channels. The image ID used for each attempt is recorded; compare these
IDs when comparing runs because the upstream `latest` image tag is mutable.

## Inspect the result

| Artifact in the output directory | Meaning |
| --- | --- |
| `manifest.json` | Fixed task selection and budgets |
| `dataset.json` | Original selected dataset records, kept outside agent containers |
| `<instance_id>.patch` | Final diff against the original base commit, including new files |
| `predictions.jsonl` | Official prediction format; model identifier `lazygoal`, actual model in `report.json` |
| `report.json` | ACP container identity, Worker/Node identity, per-attempt Goal/Run state, image ID, patch hash, usage, timing, failure stages and official result |
| `runtime/` | Host-readable Goal Snapshots, committed Trajectories and Diagnostic Traces copied before container deletion |
| `harness.log` | Output from the official evaluator |
| `logs/run_evaluation/<run_id>/lazygoal/<instance_id>/` | Official per-instance reports and test logs |

`resolvedRate` uses the entire manifest as its denominator, including environment
failures and unstarted tasks. `runStatus` and ACP `stopReason` are separate from
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
CLI arguments; `130` means interruption. The Supervisor propagates timeout and
SIGINT/SIGTERM to ACP, model, Runtime and Tool execution, then uses a bounded
artifact grace period before removing the task container. Interrupted runs keep
existing artifacts and leave ungraded exported patches `pending`. This version
does not resume agent containers from Goal Snapshots. Start a new output directory
for a new attempt.

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
