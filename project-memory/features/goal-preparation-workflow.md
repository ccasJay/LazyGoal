---
feature: goal-preparation-workflow
status: active
summary: "Preparation 阶段所有权、真实消息与显式批准边界"
source_spec: specs/goal-preparation-workflow/
distilled_at: 2026-08-16
reviewed_at: 2026-08-18
tags: [coordinator, preparation, working-context, approval]
authorities: [docs/architecture/runtime.md, packages/runtime/src/goal-coordinator.ts, docs/architecture/agent.md]
---

# Goal Preparation Workflow

## Purpose

- Goal Coordinator 拥有 Preparation 阶段和外部用户输入边界，在上下文收集、任务规划、显式批准与 Executing 之间推进 Goal。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — Preparation 阶段按上下文收集、规划与任务批准单向推进；未经显式批准不得进入 Executing。 [S1, S2, S3, S4]
- D2 — Goal 只持久化真实会话消息；Working Context 是从当前状态派生的请求上下文，不进入消息历史或快照。 [S1, S2, S5, S6]
- D3 — 结构化批准是控制输入，不得伪装成用户消息；Coordinator 必须校验输入与当前等待动作匹配。 [S2, S3, S4]
- D4 — 每次继续调用 Preparation Executor 或把 Goal 交给 Runner 前，必须先保存已经完成的状态转换。 [S2, S3, S4]

## Guardrails

- Preparation 不消费执行 Step，Runner 只接收已进入 Executing 的 Goal。 [S1, S2, S3, S4]
- 非法阶段输入、失配的批准或等待动作不得产生持久化和下游调用副作用。 [S2, S3, S4]
- 旧协议快照的迁移保持只读，直到后续正常保存；不得把某个历史协议版本写成永久终点。 [S2, S3, S4]

## Revisit When

- Preparation 阶段、批准模型或用户输入所有权变化时。
- Working Context 开始持久化，或真实消息与控制输入的边界变化时。
- Coordinator 与 Runner 的交接事务边界变化时。

## Sources

- S1: `specs/goal-preparation-workflow/requirements.md`
- S2: `specs/goal-preparation-workflow/design.md`
- S3: `packages/runtime/src/goal-coordinator.ts`
- S4: `packages/runtime/test/goal-coordinator.test.ts`
- S5: `packages/agent/src/prompt.ts`
- S6: `packages/agent/test/prompt.test.ts`
