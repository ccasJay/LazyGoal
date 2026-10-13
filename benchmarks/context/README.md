# Context Benchmark

自动采集真实恢复边界、人工冻结用例，并在独立 Docker 容器中比较恢复续接与从头执行。

阅读 [使用说明](./notes/usage.md)、[模块说明](./notes/overview.md)、[语义表](./notes/semantics.md)。

## SWE-bench task source

Import a pinned task package before capturing either recovery mode:

```sh
lazygoal eval context import --manifest benchmarks/swebench/manifests/single.json --output /absolute/path/import --python /absolute/path/venv/bin/python
```

The output contains public task/scenario files and a separate host-only `private/` grading package. A capture/run config uses the existing `scenarios`, `frozenCases`, and explicit `roles`, plus `source: { "kind": "swebench", "privateDirectory": "/absolute/path/import/private", "python": "/absolute/path/venv/bin/python" }`. Run through the top-level CLI composition; direct imports between benchmark modules are forbidden.

A captured source case starts with an empty `annotations.json`. Review its original facts and add `constraint`, `decision`, `superseded_decision`, or `obligation` records with `text` and resolvable `sources`, then use the existing hash approval/freeze command. An unreviewed case cannot run. Frozen filesystem archives remain authoritative even when local Docker image caches are absent.

Reports keep official engineering grades separate from Context mechanism and semantic scores. An unresolved patch can still have correct Context recovery. Infrastructure smoke fixtures are explicitly marked and never represent real model quality. See [semantics](notes/semantics.md) and [overview](notes/overview.md).
