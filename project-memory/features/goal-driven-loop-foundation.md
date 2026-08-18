---
feature: goal-driven-loop-foundation
status: active
summary: "纯状态转换、Step 计数与不可逆终态边界"
source_spec: specs/goal-driven-loop-foundation/
distilled_at: 2026-08-16
reviewed_at: 2026-08-18
tags: [transition, state-machine, step-count, terminal-state]
authorities: [docs/architecture/runtime.md, packages/runtime/src/transition.ts]
---

# Goal-Driven Loop Foundation

## Purpose

- `transition` 是 Run 生命周期状态计算的唯一领域边界；它将输入转换为新状态或稳定错误，不承担执行编排与持久化。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — 状态转换保持同步、纯函数和无 I/O；合法转换返回新状态，非法转换返回原状态与错误。 [S1, S2, S3, S4]
- D2 — `stepCount` 只记录已经完成的 Decision 或 Action 周期；启动、恢复、暂存 Action、批准和恢复处理本身不消耗 Step。 [S3, S4, S5, S6]
- D3 — `completed`、`failed` 和 `cancelled` 是不可逆终态，进入后拒绝进一步输入。 [S1, S2, S3, S4]

## Guardrails

- 状态转换不得生成时间、标识，不得访问 Store，也不得自行调用 Executor、Tool 或下一轮循环。 [S2, S3]
- 非法 Action、Observation 或生命周期组合必须保留原状态，并产生可识别的稳定错误。 [S3, S4, S5, S6]

## Revisit When

- Run 状态集合、Step 的完成语义、Action/Observation 生命周期或终态策略发生变化时。
- `transition` 开始承担状态计算之外的副作用时。

## Sources

- S1: `specs/goal-driven-loop-foundation/requirements.md`
- S2: `specs/goal-driven-loop-foundation/design.md`
- S3: `packages/runtime/src/transition.ts`
- S4: `packages/runtime/test/transition.test.ts`
- S5: `specs/action-observation-loop/requirements.md`
- S6: `specs/action-observation-loop/design.md`
