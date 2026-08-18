---
feature: minimal-run-loop
status: active
summary: "Runner 生命周期所有权、累计预算与持久化顺序"
source_spec: specs/minimal-run-loop/
distilled_at: 2026-08-16
reviewed_at: 2026-08-18
tags: [runner, execution-loop, max-steps, persistence-order]
authorities: [docs/architecture/runtime.md, packages/runtime/src/runner.ts]
---

# Minimal Run Loop

## Purpose

- Runner 拥有 Executing 阶段的推进循环，在冻结的执行策略、状态转换和快照持久化边界内协调 Decision 与 Action。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — `maxSteps` 是 Goal 冻结执行策略中的累计预算；恢复不会重置 `stepCount`，值为 `0` 时表示不设置 Step 上限。 [S1, S2, S3, S4]
- D2 — Runner 必须在下一个外部副作用前保存最新完整状态；Action 周期先保存 `pendingAction`，执行后再保存 Observation。 [S3, S4, S5, S6]
- D3 — Runner 只通过领域转换推进状态，不在自身维护第二套生命周期状态或步数。 [S1, S2, S3, S4]

## Guardrails

- 达到正数 `maxSteps` 后不得再发起新的模型决策或 Tool 调用。 [S1, S3, S4]
- `pendingAction` 保存失败时不得调用 Tool；Observation 保存失败时不得伪造回滚已经发生的外部结果。 [S3, S4, S5, S6]
- Runner 不负责 Preparation、Profile 选择、Provider 创建或持久化协议解码。 [S2, S3]

## Revisit When

- Step 预算从累计计数改为其他资源预算时。
- Action 的暂存、批准、执行或 Observation 持久化顺序改变时。
- Executing 生命周期的所有权从 Runner 迁移时。

## Sources

- S1: `specs/minimal-run-loop/requirements.md`
- S2: `specs/minimal-run-loop/design.md`
- S3: `packages/runtime/src/runner.ts`
- S4: `packages/runtime/test/runner.test.ts`
- S5: `specs/action-observation-loop/requirements.md`
- S6: `specs/action-observation-loop/design.md`
