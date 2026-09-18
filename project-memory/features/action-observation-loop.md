---
feature: action-observation-loop
status: active
summary: "AgentDecision、Action/Observation 协议与可恢复执行边界"
source_spec: specs/action-observation-loop/
distilled_at: 2026-08-25
reviewed_at: 2026-09-18
tags: [action, observation, replay, approval, recovery]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, packages/runtime/src/runner.ts]
---

# Action/Observation Loop

## Purpose

- 批准后的统一 executing 循环使用严格的 AgentDecision → Action → Observation 边界；批准前的 ask_user/task_proposal 仍由同一 Runner/Coordinator 交互路径保存和恢复。 [S1, S2, S3, S4, S8, S9]

## Durable Decisions

- D1 — 已批准任务的执行段保留 tool_call、complete、wait 和 fail 四个 Action/终态分支；task 未批准时的 ask_user/task_proposal 不执行副作用 Tool，并在同一统一协议内进入 pendingInteraction。 [S1, S2, S3, S4, S8, S9]
- D2 — Action 使用 `pendingAction`、`replayPolicy` 和瞬时授权表达执行前意图、恢复分流与用户批准；恢复安全 Tool 时保留原 `actionId`。 [S1, S2, S3, S6]
- D3 — Tool 的领域失败作为 Observation 交给下一轮 Agent 判断；协议、越权和基础设施错误作为稳定执行失败终止当前 Run。 [S1, S2, S5]

## Guardrails

- Runner 必须按冻结 Profile、Registry、当前 task gate 和输入协议确认授权后才允许 Action 进入执行；不得把未授权或非法输入交给 Tool。 [S2, S3, S4, S8, S9]
- `manual` Tool 恢复时必须进入 `outcome_unknown` 等待；安全重放、批准和拒绝不得为同一 Action 重复计 Step。 [S2, S5, S6, S7]

## Revisit When

- AgentDecision 分支、Observation 类型、Action 审批或 replayPolicy 发生变化时。
- Runtime 开始持久化完整 Action/Observation 轨迹或引入跨外部系统的 exactly-once 保证时。

## Sources

- S1: `specs/action-observation-loop/requirements.md`
- S2: `specs/action-observation-loop/design.md`
- S3: `packages/runtime/src/runner.ts`
- S4: `packages/agent/src/model-output.ts`
- S5: `packages/runtime/test/runner.test.ts`
- S6: `packages/storage/test/action-observation-recovery.test.ts`
- S7: `packages/tools/test/read-file.test.ts`
- S8: `specs/preparation-phase-removal/requirements.md`
- S9: `docs/architecture/contracts.md`
