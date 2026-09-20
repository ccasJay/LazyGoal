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

## Explicit ALFWorld smoke

The smoke command is intentionally excluded from default tests. It evaluates
the repository's one-task ALFWorld smoke Manifest through the Python adapter and
the real `lazygoal eval prompt` CLI, then reads the authoritative
`result.json`. It requires Docker, prepared ALFWorld data, the ALFWorld Profile,
and valid `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_API_KEY` environment variables.
It makes real provider calls and may incur charges.

```sh
npm run smoke:gepa-adapter
```

Defaults can be replaced with `--manifest`, `--profile`,
`--output-directory`, `--lazygoal-executable`, `--model-config-id`, and
`--model-id`. Adapter-owned files stay below the configured output directory.
Captured process logs are bounded and redact inherited environment values whose
names indicate keys, tokens, passwords, credentials, or secrets. Reflection
data includes only bounded result projections and artifact paths; it never
loads the full LazyGoal Diagnostic Trace.

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
        output_directory=Path(".lazygoal/gepa"),
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
