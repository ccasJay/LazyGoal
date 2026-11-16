---
feature: web-manual-goal-continuation
status: active
summary: Web 侧手动 Goal 在 Run 终态结算后可经普通消息或获授权续接指令在同一 Goal 中启动下一 Run，续接资格随持久化创建来源跨重启稳定
source_spec: specs/web-manual-goal-continuation/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [goal-continuation, trigger-admission, terminal-state, manual-goal, idempotency, authorization, session-input]
authorities: [apps/goal-server/src/runtime/trigger-admission.ts, apps/goal-server/src/runtime/worker-scheduler.ts, packages/runtime/src/goal-coordinator.ts, packages/web-contracts/src/wire.ts, apps/goal-server/test/goal-continuation.integration.test.ts]
---

# Web 手动 Goal 的终态续接

## Purpose

- 手动创建的 Goal 在当前 Run 结算（`completed`、`failed` 或 `cancelled`）后，用户可发送普通消息或提交续接指令在同一 Goal 中启动下一 Run，保留历史与原生授权边界。 [S1, S2]
- Supervisor 自主准入派发的 Goal 不接收 Web 普通续聊，但仍可在当前 Run 终态结算后通过经认证和授权的续接指令 Trigger 继续执行。 [S1]

## Durable Decisions

- D1 — 提交与推进分离：Supervisor 调度器按 Goal 串行受理续接，核对终态快照与上一 Worker 的结算，再使用 Coordinator 续接领域逻辑提交下一 Run；后继 Run 按受理顺序排队，保持 FIFO 与每个 Goal 单执行名额。 [S1, S2, S3, S4]
- D2 — 两个入口共用后继 Run 提交逻辑：Web 命令按 `inputId` 与绑定预期终态 `runId` 提交，后端核对资格后转换为 `instruction.continue`；Trigger 直接提交沿用 Trigger 协议去重。 [S1, S2, S5]
- D3 — 最新已结算终态至多一个续接被受理：两条不同身份输入争用同一终态时至多一个被受理，直接重复提交 Trigger ID 仍按 Trigger 协议拒绝。 [S2]
- D4 — 资格随 Goal 来源稳定：手动创建来源在创建时持久化为宿主持久元数据，读自 Goal 原始 `triggerContext.triggerId`；切换 Worker、重启 Web 或更新浏览器会话不改变续接资格。 [S1]
- D5 — 续接 Trigger 以固定名称提交，模型读取指令正文，历史可追溯原 Trigger；续接不扩大 Goal 的既有工具或工作区权限。 [S1]
- D6 — 回执可在消息持久受理后返回，模型执行结果由新 Run 的状态和事件报告。 [S1, S2]

## Guardrails

- 来源校验授予已有 Goal 的执行资格，来源记录不得事后猜测或补写。 [S1]
- 不恢复运行中排队、Steer 或自动重试；已有审批、交互回答、停止和检查点恢复按各自权限与状态规则处理。 [S1]

## Revisit When

- 恢复运行中排队、Steer 或自动重试时。
- 派发 Goal 的来源校验或续接资格规则变化时。

## Sources

- S1: `specs/web-manual-goal-continuation/spec.md`
- S2: `apps/goal-server/src/runtime/trigger-admission.ts`
- S3: `apps/goal-server/src/runtime/worker-scheduler.ts`
- S4: `packages/runtime/src/goal-coordinator.ts`
- S5: `packages/web-contracts/src/wire.ts`
