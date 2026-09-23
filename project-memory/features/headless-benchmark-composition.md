---
feature: headless-benchmark-composition
status: active
summary: "以普通 Run 执行单任务基准并隔离环境与通用 Goal 生命周期"
source_spec: specs/headless-benchmark-composition/
distilled_at: 2026-09-03
reviewed_at: 2026-09-23
tags: [benchmark, headless, composition-root, architecture, runner]
authorities: [docs/architecture/README.md, docs/architecture/benchmarks.md, benchmarks/src/headless-composition-root.ts, benchmarks/src/tui-benchmark-runner.ts, benchmarks/src/file-persistence-adapter.ts]
---

# Headless Benchmark Composition Root

## Purpose

- 为各基准评测提供不依赖 TUI 的单任务通用执行入口与 LazyGoal 持久化支持，使评测适配器仅需提供环境会话和 Tool Registry 即可复用完整 Goal 生命周期。 [S1, S2, S5, S6]

## Durable Decisions

- D1 — Headless 与 TUI Benchmark 启动普通 Run，不生成或自动批准任务提案；objective 和 completionCriteria 进入 Agent 执行上下文，不转换为 approvedTask 或 Runtime 完成门槛。Run 完成仍须符合当前 Run 的 Observation Evidence，最终成功由 Benchmark 环境评分决定。 [S3, S4, S5, S6, S7, S8]
- D2 — Benchmark Adapter 可替换且与 Goal 领域解耦；通用运行入口不解析某个环境的评分规则或专有协议字段。 [S1, S2, S5, S7]
- D3 — 每个任务使用独立环境会话、Tool Registry 和持久化状态，杜绝跨任务隐藏状态污染。 [S1, S2, S5, S7]
- D4 — 严格复用现有 Runtime/Agent 边界与持久化语义，Snapshot、Action/Observation 和 Trajectory 提交边界行为与标准 Goal 保持一致。 [S1, S2, S5, S7]

## Guardrails

- 未显式启用基准入口时，普通 CLI/TUI 和核心测试不加载 Benchmark Adapter。 [S1, S2, S7]
- 任务终态或中断时必须可靠释放环境资源；环境关闭故障不得掩盖执行失败。 [S1, S2, S7]

## Revisit When

- 需要支持分布式评测或多任务并发评测调度时。
- 引入具备跨任务断点续评需求的新基准套件时。
- Benchmark 任务描述或外部评分开始创建 Runtime task approval 时。

## Sources

- S1: `specs/headless-benchmark-composition/requirements.md`
- S2: `specs/headless-benchmark-composition/design.md`
- S3: `specs/mode-driven-task-proposal/requirements.md`
- S4: `specs/mode-driven-task-proposal/design.md`
- S5: `benchmarks/src/headless-composition-root.ts`
- S6: `benchmarks/src/tui-benchmark-runner.ts`
- S7: `benchmarks/test/headless-composition-root.test.ts`
- S8: `benchmarks/test/tui-benchmark-runner.test.ts`
