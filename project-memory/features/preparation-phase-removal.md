---
feature: preparation-phase-removal
status: active
summary: "统一 executing 生命周期、可恢复交互与单一 TUI 时间线"
source_spec: specs/preparation-phase-removal/
distilled_at: 2026-09-18
reviewed_at: 2026-09-18
tags: [lifecycle, interaction, ask-user, task-approval, plan-probe, evidence, persistence, tui]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, docs/architecture/tui.md, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/contracts/src/model-output/factory.ts, packages/storage/src/goal-snapshot-codec.ts, packages/tui/src/session-controller.ts]
supersedes: [project-memory/features/goal-preparation-workflow.md, project-memory/features/preparation-runtime-flow.md]
---

# Preparation Phase Removal

## Purpose

- Preparation 的提问、只读探查、任务提案和批准边界已经收敛到单一 `executing` Goal 生命周期；任务批准前可以没有最终 task，但不能执行副作用 Tool。 [S1, S2, S4, S5, S6, S7, S8]
- TUI 以一个可恢复 Session 时间线承载用户消息、ask_user、任务提案、Tool Observation、步骤和流式 transcript；屏幕只投影 Controller 快照。 [S1, S2, S3, S6, S10, S11, S12]

## Durable Decisions

- D1 — `GoalWorkflowState` 只保留 `phase: "executing"`；task 在批准前缺省，`pendingInteraction` 以互斥的 ask_user 或 task_approval 保存等待点，交互和批准前只读探查不增加执行 Step。 [S1, S2, S4, S5, S13]
- D2 — 模型请求按 task 是否已批准动态生成统一 AgentDecision Contract：未批准时只允许 ask_user、task_proposal、历史 lookup 和只读 Tool；批准后才允许普通 Tool、complete、wait、fail 及执行期 ask_user。最终 Tool 授权仍由 Runtime 再校验。 [S1, S2, S4, S6, S7, S8]
- D3 — ask_user 输入由 Runtime 校验并分配 request ID、问题/选项 ID 和 plan/execution 模式；完整答案保存为结构化事实和真实消息后才恢复模型，用户回答不得成为完成证据。 [S1, S2, S5, S8, S11, S16]
- D4 — planProbe 复用 Registry、Tool Observation、Action ID 和 Trajectory 提交边界；探查成功或失败都可审计但不写入普通 Step，任务批准后回到既有 Action approval、replay 和 Step 规则。 [S1, S2, S6, S13, S17]
- D5 — Snapshot 是交互恢复权威，Trajectory committed boundary 控制可见事实；保存、协议解析、身份关联或旧 Preparation 数据校验失败时 fail-closed，不迁移、不猜测、不继续模型或 Tool。 [S1, S2, S4, S9, S14, S15]
- D6 — `SessionController` 是唯一累计时间线所有者，`SessionScreen` 通过 ActiveDrawer 渲染 AskUserPanel、TaskProposalPanel、Action/Blocked/Terminal 面板；流式切换先 flush 当前活动流再追加新项目。 [S1, S2, S3, S6, S10, S12, S17]

## Guardrails

- 任务批准前任何非只读 Tool 都必须在执行前拒绝；YOLO 只影响 Action approval，不自动回答 ask_user。 [S1, S2, S4, S6, S7, S13]
- 用户回答、任务提案、模型自述和历史 Lookup 不是当前外部事实；Evidence Gate 只接受已提交且属于当前 Goal/Run 的允许 Tool/Observation 事件。 [S1, S2, S4, S8, S16, S18]
- TUI 不复制或修改 Runtime 状态；旧 Preparation Snapshot/Event 和不完整提交边界不能通过恢复路径进入当前协议。 [S1, S2, S6, S9, S10, S14]

## Revisit When

- Goal 再次引入独立生命周期、第二套交互等待或多 Goal 并发推进时。
- Tool 授权、Evidence 允许来源、Snapshot/Trajectory 提交边界或当前统一 AgentDecision 分支发生变化时。
- TUI 需要跨进程后台会话、不同于当前 Session 的第二条可推进时间线，或真实 LLM 手工验收发现自动化证据未覆盖的交互差异时。

## Sources

- S1: `specs/preparation-phase-removal/requirements.md`
- S2: `specs/preparation-phase-removal/design.md`
- S3: `specs/preparation-phase-removal/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `packages/runtime/src/domain.ts`
- S6: `packages/runtime/src/runner.ts`
- S7: `packages/contracts/src/model-output/factory.ts`
- S8: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S9: `packages/storage/src/goal-snapshot-codec.ts`
- S10: `packages/tui/src/session-controller.ts`
- S11: `packages/tui/src/ask-user-panel.tsx`
- S12: `packages/tui/src/session-screen.tsx`
- S13: `packages/runtime/test/runner-plan-probe.test.ts`
- S14: `packages/storage/test/goal-snapshot-interaction.test.ts`
- S15: `packages/storage/test/goal-store.test.ts`
- S16: `packages/runtime/src/evidence-gate.ts`
- S17: `packages/tui/test/session-controller-timeline.test.ts`
- S18: `packages/runtime/test/evidence-gate.test.ts`
