---
feature: action-observation-loop
status: active
summary: "Runner 的可恢复 Action/Observation 执行与授权边界"
source_spec: specs/action-observation-loop/
distilled_at: 2026-08-25
reviewed_at: 2026-09-23
tags: [action, observation, replay, approval, recovery]
authorities: [docs/architecture/runtime.md, packages/runtime/src/runner.ts, packages/runtime/src/goal-coordinator.ts, packages/runtime/test/runner-pretask-read.test.ts]
---

# Action/Observation Loop

## Purpose

- Runner 对普通 Run 与获批 Plan Run 使用同一可恢复的 Action/Observation 执行边界；Plan Run 的任务提案等待由同一 Runtime 交互路径保存和恢复。 [S1, S2, S3, S6]

## Durable Decisions

- D1 — Tool 请求按冻结 Profile、Registry、输入契约和 Tool Policy 校验；经允许的 Action 先持久化再执行，需要人工审批的 Action 先等待审批。普通 Run 不因缺少任务提案而被拒绝；task_proposal 只在 Plan Run 的未批准状态可提交。 [S1, S3, S6, S7]
- D2 — Action 使用 pendingAction、replayPolicy 和瞬时授权表达执行前意图、恢复分流与用户批准；恢复安全 Tool 时保留原 actionId。 [S1, S2, S3, S4]
- D3 — Tool 领域失败作为 Observation 交给下一轮 Agent 判断；协议、越权和基础设施错误作为稳定执行失败终止当前 Run。 [S1, S3, S5]

## Guardrails

- Prompt 要求 Plan Run 先提出任务，不构成 Tool 权限闸门；Tool 是否执行仍由 Profile、Registry、输入协议、Tool Policy 和 Action 审批决定。 [S3, S6, S7]
- manual Tool 恢复时必须进入 outcome_unknown 等待；安全重放、批准和拒绝不得为同一 Action 重复计 Step。 [S2, S5, S4]

## Revisit When

- AgentDecision 分支、Observation 类型、Action 审批或 replayPolicy 发生变化时。
- Runtime 开始持久化完整 Action/Observation 轨迹或引入跨外部系统的 exactly-once 保证时。

## Sources

- S1: `specs/action-observation-loop/requirements.md`
- S2: `specs/action-observation-loop/design.md`
- S3: `packages/runtime/src/runner.ts`
- S4: `packages/storage/test/action-observation-recovery.test.ts`
- S5: `packages/runtime/test/runner.test.ts`
- S6: `specs/mode-driven-task-proposal/requirements.md`
- S7: `packages/runtime/test/runner-pretask-read.test.ts`
