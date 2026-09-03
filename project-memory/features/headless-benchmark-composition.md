---
feature: headless-benchmark-composition
status: active
summary: "提供无头单任务基准组合根，解耦环境适配与通用 Goal 生命周期"
source_spec: specs/headless-benchmark-composition/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [benchmark, headless, composition-root, architecture, runner]
authorities: [docs/architecture/README.md, benchmarks/src/headless-composition-root.ts, benchmarks/src/file-persistence-adapter.ts]
---

# Headless Benchmark Composition Root

## Purpose

- 为各基准评测提供不依赖 TUI 的单任务通用执行入口与 LazyGoal 持久化支持，使评测适配器仅需提供环境会话和 Tool Registry 即可复用完整 Goal 生命周期。 [S1, S2]

## Durable Decisions

- D1 — 通用 Headless 组合根独立编排单个任务的完整生命周期（Preparation、Planning、Approval、Executing），不引入人工 TUI 交互或交互式 stdin 阻塞。 [S1, S2, S3]
- D2 — Benchmark Adapter 职责高度可替换且与领域解耦，通用运行入口不解析任何特定基准环境的评分规则或专有协议字段。 [S1, S2, S3]
- D3 — 每个任务必须使用独立隔离的环境会话、Tool Registry 与持久化状态，杜绝跨任务隐藏状态污染。 [S1, S2, S3, S5]
- D4 — 严格复用现有 Runtime/Agent 边界与持久化语义，Snapshot、Action/Observation 和 Trajectory 提交边界行为与标准 Goal 保持一致。 [S1, S2, S4]

## Guardrails

- 未显式启用基准入口时，普通 LazyGoal CLI、TUI 和核心单元测试严禁加载任何 benchmark adapter。 [S1, S2, S3]
- 任务到达终态或中断时必须通过 adapter 可靠释放环境资源，环境关闭故障不得掩盖为执行成功。 [S1, S2, S3, S5]

## Revisit When

- 需要支持分布式评测或多任务并发评测调度时。
- 引入具备跨任务断点续评需求的新基准套件时。

## Sources

- S1: `specs/headless-benchmark-composition/requirements.md`
- S2: `specs/headless-benchmark-composition/design.md`
- S3: `benchmarks/src/headless-composition-root.ts`
- S4: `benchmarks/src/file-persistence-adapter.ts`
- S5: `benchmarks/test/headless-composition-root.test.ts`
