# LazyGoal GEPA Adapter

This Python package contains the official `gepa==0.1.4` adapter and its lifecycle inspection tools. The production Prompt Evaluation execution path is currently unavailable: `lazygoal eval prompt` returns an unsupported error, and GEPA `start`, `resume`, and internal `worker` commands do not launch execution.

## Requirements

- Python 3.10–3.14
- [`uv`](https://docs.astral.sh/uv/)
- LazyGoal's Node.js dependencies for repository tests

## Deterministic tests

Run the adapter tests without Docker, provider credentials, or live model calls:

```sh
npm run test:gepa-adapter
```

The tests are also part of the root `npm test` regression. They use a fake LazyGoal CLI and fake reflection model to verify adapter protocol, candidate mapping, and result handling. They do not invoke a live Prompt Evaluation Worker.

## Available command groups

`lazygoal gepa preflight`, `status`, `stop`, `report`, and `wait` remain available for inspection or management of existing lifecycle records. They do not start an optimization run. The separate `lazygoal gepa reflect`, `resolve-models`, `inspect-tua`, and `audit-tua-candidate` helper commands remain routed through the benchmarks CLI. Independent benchmark scoring remains available through `lazygoal grade ...`.

There is no supported command for starting or resuming a real GEPA run while Prompt Evaluation execution is unavailable.
