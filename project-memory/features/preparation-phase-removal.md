---
feature: preparation-phase-removal
status: active
summary: "统一 executing 生命周期、普通读取 Step、可恢复交互与单一 TUI 时间线"
source_spec: specs/preparation-phase-removal/
distilled_at: 2026-09-18
reviewed_at: 2026-09-19
tags: [lifecycle, interaction, ask-user, task-approval, ordinary-step, action-observation, evidence, persistence, tui]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, docs/architecture/tui.md, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/agent/src/trajectory-execution-unit-adapter.ts, packages/agent/src/step-prompt/agent-decision@1.njk, packages/contracts/src/model-output/factory.ts, packages/storage/src/goal-snapshot-codec.ts, packages/tui/src/session-controller.ts]
supersedes: [project-memory/features/goal-preparation-workflow.md, project-memory/features/preparation-runtime-flow.md]
---

# Preparation Phase Removal

## Purpose

- Preparation 的提问、普通只读读取、任务提案和批准边界已经收敛到单一 `executing` Goal 生命周期；任务批准前可以没有最终 task，但不能执行副作用 Tool；每次已提交的只读 Tool Observation 都是普通 Step。 [S1, S2, S4, S5, S6, S7, S8, S19, S20]
- TUI 以一个可恢复 Session 时间线承载用户消息、ask_user、任务提案、Tool Observation、步骤和流式 transcript；屏幕只投影 Controller 快照与已提交的普通 Step。 [S1, S2, S3, S6, S10, S11, S12, S17, S21, S26]

## Durable Decisions

- D1 — `GoalWorkflowState` 只保留 `phase: "executing"`；task 在批准前缺省，`pendingInteraction` 以互斥的 ask_user 或 task_approval 保存等待点；交互不消费执行 Step，批准前的只读 Tool 通过普通 Action/Observation 完成并在 Observation 提交时增加一个 Step。 [S1, S2, S4, S5, S6, S13, S19, S20, S22]
- D2 — 模型请求按 task 是否已批准动态生成统一 AgentDecision Contract：未批准时只允许 ask_user、task_proposal、历史 lookup 和只读 Tool；批准后才允许普通 Tool、complete、wait、fail 及执行期 ask_user。最终 Tool 授权仍由 Runtime 再校验。 [S1, S2, S4, S6, S7, S8, S19, S20, S25]
- D3 — ask_user 输入由 Runtime 校验并分配 request ID、问题/选项 ID 和 plan/execution 模式；完整答案保存为结构化事实和真实消息后才恢复模型，用户回答不得成为完成证据。 [S1, S2, S5, S8, S11, S16, S19, S20]
- D4 — 所有环境读取都使用普通 `tool_call`、Action/Observation、`stage_action`、Tool 生命周期和 `observe_action` 提交；读取成功或失败都形成普通 Step。`planProbe`、`observe_probe`、`probeCount`、Probe 进度事件和无 `action_staged` 的旧执行单元不属于当前协议，旧数据 fail-closed。 [S1, S2, S6, S13, S19, S20, S23, S24]
- D5 — Snapshot 是交互恢复权威，Trajectory committed boundary 控制可见事实；保存、协议解析、身份关联或旧 Preparation/Probe 数据校验失败时 fail-closed，不迁移、不猜测、不继续模型或 Tool。 [S1, S2, S4, S9, S14, S15, S19, S20]
- D6 — `SessionController` 是唯一累计时间线所有者，`SessionScreen` 通过统一活动抽屉渲染 AskUserPanel、TaskProposalPanel、Action/Blocked/Terminal 面板；普通只读 Tool 的提交结果与副作用 Tool 一样从 Goal Snapshot/Step 投影，TUI 不维护 Probe 专用事件或活动状态。 [S1, S2, S3, S6, S10, S12, S17, S21, S26]
- D7 — `executionPolicy.maxSteps` 统一依据 `stepCount` 限制所有已完成的 executing Step，包括任务批准前的只读 Tool；不维护独立 Probe 计数或扫描路径。 [S2, S3, S4, S6, S13, S19, S20, S21, S22]

## Guardrails

- 任务批准前任何非只读 Tool 都必须在执行前拒绝；只读 Tool 仍需通过冻结 Profile、Registry、输入契约和 Tool Policy，且必须先持久化 `action_staged` 再调用 Tool。 [S1, S2, S4, S6, S7, S13, S19, S20]
- 用户回答、任务提案、模型自述和历史 Lookup 不是当前外部事实；Evidence Gate 只接受已提交且属于当前 Goal/Run 的允许 Tool/Observation 事件。 [S1, S2, S4, S8, S16, S18, S19, S20]
- TUI 不复制或修改 Runtime 状态；旧 Preparation/Probe Snapshot/Event、跨身份事件和不完整提交边界不能通过恢复或上下文组装路径进入当前协议。 [S1, S2, S6, S9, S10, S14, S15, S23, S24]
- System Prompt 只引导模型选择最小下一步并等待 Observation；Prompt 不替代 Runtime 对任务门控、授权、证据、持久化和恢复的硬校验。 [S2, S8, S19, S20, S25]

## Revisit When

- Goal 再次引入独立生命周期、第二套交互等待或多 Goal 并发推进时。
- Tool 授权、Evidence 允许来源、Snapshot/Trajectory 提交边界、普通 Step 计数或当前统一 AgentDecision 分支发生变化时。
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
- S13: `packages/runtime/test/runner-pretask-read.test.ts`
- S14: `packages/storage/test/goal-snapshot-interaction.test.ts`
- S15: `packages/storage/test/goal-store.test.ts`
- S16: `packages/runtime/src/evidence-gate.ts`
- S17: `packages/tui/test/session-controller-timeline.test.ts`
- S18: `packages/runtime/test/evidence-gate.test.ts`
- S19: `specs/unified-agent-step-flow/requirements.md`
- S20: `specs/unified-agent-step-flow/design.md`
- S21: `specs/unified-agent-step-flow/tasks.md`
- S22: `packages/runtime/test/goal-workflow.test.ts`
- S23: `packages/agent/src/trajectory-execution-unit-adapter.ts`
- S24: `packages/agent/test/trajectory-model-context-assembler.test.ts`
- S25: `packages/agent/test/prompt.test.ts`
- S26: `packages/tui/test/prompt-bundle-integration.test.ts`
