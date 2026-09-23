---
feature: preparation-phase-removal
status: active
summary: "统一 executing 生命周期、Run 级任务审批、普通读取 Step 与可恢复交互"
source_spec: specs/preparation-phase-removal/
distilled_at: 2026-09-18
reviewed_at: 2026-09-23
tags: [lifecycle, interaction, ask-user, task-approval, ordinary-step, action-observation, evidence, persistence, tui]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, docs/architecture/tui.md, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/runtime/src/run-mode-capabilities.ts, packages/agent/src/trajectory-execution-unit-adapter.ts, packages/agent/src/step-prompt/agent-decision@1.njk, packages/contracts/src/model-output/factory.ts, packages/storage/src/goal-snapshot-codec.ts, packages/tui/src/session-controller.ts]
supersedes: [project-memory/features/goal-preparation-workflow.md, project-memory/features/preparation-runtime-flow.md]
---

# Preparation Phase Removal

## Purpose

- Preparation 的提问与只读读取、可选任务提案审批和 TUI 会话均位于单一 executing Goal 生命周期；Goal 保存 Run 等候点、独立计划与可恢复事实时间线。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — Goal 生命周期保持 phase: executing；模式和获批任务属于当前 Run，任务提案只是 Plan Run 的可选审批交互。普通 Run 可直接推进用户请求；普通只读环境读取使用普通 Action/Observation Step。 [S1, S2, S4, S6, S7, S13, S14]
- D2 — pendingInteraction 是当前 Run 等待 ask_user 或 task_approval 的持久化状态；proposal 在批准前不进入 approvedTask，批准或反馈必须匹配当前 Goal、Run、request ID；提案进入等待点后先提交再停止模型与 Tool 调用。 [S1, S2, S6, S7, S13]
- D3 — ask_user 请求由 Runtime 分配 request ID、问题和选项 ID 及 plan/execution 模式；完整回答先保存为结构化事实和真实消息，再恢复模型，回答不是 Tool Observation。 [S1, S2, S6, S8, S13]
- D4 — 普通只读 Tool 和其他业务 Tool 都使用普通 tool_call、Action/Observation、stage_action 与 observe_action；读取成功或失败都形成普通 Step，旧 planProbe、observe_probe、probeCount 和专用进度事件不是当前协议。 [S2, S4, S6, S7, S12, S16]
- D5 — Snapshot 是交互恢复权威，Trajectory committed boundary 控制可见事实；保存、协议解析、身份关联或旧 Preparation/Probe 数据校验失败时 fail-closed，不迁移、不猜测、不继续模型或 Tool。 [S1, S2, S4, S9, S13]
- D6 — SessionController 是唯一累计时间线所有者；TaskProposalPanel 由当前 Run.pendingInteraction 驱动，PlanPanel 从 Goal Snapshot 展示已提交 GoalPlan，且不受 Run 模式影响。 [S1, S2, S5, S10, S11, S17]
- D7 — executionPolicy.maxSteps 按 stepCount 限制所有已完成 executing Step，包括 Plan Run 获批前及普通 Run 的只读 Tool；读取消耗同一预算。 [S2, S4, S7, S12]

## Guardrails

- Prompt 对 Plan Run 的先提案顺序只是行为指导；等待提案批准后不得继续模型或 Tool 调用。业务 Tool 授权和 Action 审批仍由 Runtime 的既有授权路径决定。 [S1, S2, S6, S7, S8]
- 用户回答、任务提案、模型自述和历史 Lookup 不能替代当前 Run 已提交的 Tool/Observation 事实。 [S1, S2, S7, S15]
- TUI 不复制或修改 Runtime 状态；跨身份、旧 Run 或未提交尾部不能通过恢复或上下文组装进入当前会话。 [S2, S4, S5, S9, S10, S17]
- System Prompt 不替代 Runtime 对等待点、Tool 授权、Evidence 和持久化恢复的校验。 [S1, S2, S7, S8, S15]

## Revisit When

- Goal 再次引入独立 lifecycle 阶段、第二套交互等待或多 Goal 并发推进时。
- Run 模式、ask_user/task_approval 等候点、Snapshot/Trajectory 提交边界或普通 Step 计数发生变化时。
- TUI 需要跨进程后台会话、第二条可推进时间线，或真实 LLM 验收暴露自动化测试未覆盖的交互差异时。

## Sources

- S1: `specs/mode-driven-task-proposal/requirements.md`
- S2: `specs/mode-driven-task-proposal/design.md`
- S3: `specs/mode-driven-task-proposal/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `docs/architecture/tui.md`
- S6: `packages/runtime/src/domain.ts`
- S7: `packages/runtime/src/runner.ts`
- S8: `packages/contracts/src/model-output/factory.ts`
- S9: `packages/storage/src/goal-snapshot-codec.ts`
- S10: `packages/tui/src/session-controller.ts`
- S11: `packages/tui/src/session-screen.tsx`
- S12: `packages/runtime/test/runner-pretask-read.test.ts`
- S13: `packages/runtime/test/goal-coordinator-task-interaction.test.ts`
- S14: `packages/runtime/test/goal-plan-mode.test.ts`
- S15: `packages/runtime/src/evidence-gate.ts`
- S16: `packages/runtime/test/goal-plan-run.test.ts`
- S17: `packages/tui/test/session-controller-timeline.test.ts`
