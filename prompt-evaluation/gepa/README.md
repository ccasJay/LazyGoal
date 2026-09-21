# LazyGoal GEPA Adapter

This Python package connects the official `gepa==0.1.4` optimizer to LazyGoal's
public `prompt-evaluation@1` CLI protocol. GEPA owns candidate search and
reflection; LazyGoal owns agent execution, sandboxing, persistence, and domain
scoring.

## Requirements

- Python 3.10–3.14
- [`uv`](https://docs.astral.sh/uv/)
- LazyGoal's Node.js dependencies

The package accepts only ALFWorld or GAIA single-task Manifests. A candidate is
one non-empty `system_prompt` plus contiguous, non-empty
`instruction_000...instruction_NNN` components.

## Deterministic tests

Run the adapter tests without Docker, network access, model calls, or provider
credentials:

```sh
npm run test:gepa-adapter
```

These tests are also part of the root `npm test` regression. They exercise the
official GEPA optimizer against a fake LazyGoal CLI and fake reflection model.

## Explicit real dual-model lifecycle smoke

The lifecycle smoke is intentionally excluded from default tests. It invokes
the public `lazygoal gepa` control plane in this order: read-only `preflight`,
confirmed `start`, read-only `status` polling, and terminal `report`. The run
uses the Working LM configured by the LazyGoal Home `default` Profile and the
independent Reflection LM configured by `[gepa].reflection_profile`. It may run
Docker/benchmark resources, make real provider calls, and update the default
Agent Profile.

The command refuses to start without an explicit confirmation flag. Run
`lazygoal gepa preflight` separately when you want to review the resolved models,
budget, dataset, and target Profile before confirming the smoke:

```sh
npm run smoke:gepa-lifecycle -- \
  --request path/to/gepa-run.json \
  --workspace-root . \
  --yes
```

`--request` must be a current `gepa-run@1` request; the smoke does not discover
or invent datasets. Use `--runs-directory` to isolate run artifacts and
`--lazygoal-executable` to select another `lazygoal` entrypoint. The old
`smoke:gepa-adapter` script remains an alias for this explicit lifecycle smoke;
neither script is part of the default regression.

The smoke prints only the preflight summary and stable run/report fields. It
does not print credentials, raw provider responses, thinking, or full
Diagnostic Trace content. A successful optimization and a successful Profile
publication remain separate lifecycle facts; a publication conflict must be
reported as `publish_blocked` with the best Profile artifact retained.

The smoke is an explicit integration check of the repository-level
`bin/lazygoal.cjs` routing, detached worker, official checkpoint lifecycle,
reporting, and guarded publication. It is not a substitute for the deterministic
default regression.

## Python API

```python
from pathlib import Path

from lazygoal_gepa import (
    LazyGoalEvaluationExample,
    LazyGoalGEPAAdapter,
    LazyGoalGEPAConfig,
)

adapter = LazyGoalGEPAAdapter(
    LazyGoalGEPAConfig(
        benchmark_id="alfworld",
        base_profile_id="alfworld-profile",
        model_config_id="default",
        model_id="configured-model",
        output_directory=Path("~/.lazygoal/workspaces/<workspace-id>/gepa/runs"),
        lazygoal_executable=Path("bin/lazygoal.cjs"),
    )
)
batch = [
    LazyGoalEvaluationExample(
        sample_id="sample-1",
        benchmark_id="alfworld",
        task_id="task-1",
        manifest_path=Path("one-task-manifest.json"),
    )
]
result = adapter.evaluate(
    batch,
    {
        "system_prompt": "Solve the task.",
        "instruction_000": "Use only authorized tools.",
    },
    capture_traces=True,
)
```
