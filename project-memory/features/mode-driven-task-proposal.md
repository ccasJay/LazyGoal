---
feature: mode-driven-task-proposal
status: active
summary: "按 Run 选择任务提案审批模式并独立持久化 GoalPlan，支持多 Todo 与恢复"
source_spec: specs/mode-driven-task-proposal/
distilled_at: 2026-09-23
reviewed_at: 2026-09-23
tags: [runtime, run-mode, task-proposal, goal-plan, todo, recovery, tui, benchmark]
authorities: [docs/architecture/runtime.md, docs/architecture/tui.md, packages/runtime/src/domain.ts, packages/runtime/src/goal-coordinator.ts, packages/runtime/src/run-mode-capabilities.ts, packages/runtime/src/runner.ts, packages/contracts/src/model-output/factory.ts, packages/storage/src/goal-snapshot-codec.ts, packages/tui/src/session-controller.ts, benchmarks/src/headless-composition-root.ts]
supersedes: [project-memory/features/goal-multi-run-session.md]
---

# Run 模式、任务提案与独立 GoalPlan

## Purpose

- 让每个 Run 独立选择直接执行或提案审批；GoalPlan 作为可选的 Goal 级计划跨 Run 保留，Todo 进度、任务审批和 Run 完成各自按已提交事实推进。 [S1, S2, S3]

## Durable Decisions

- D1 — Run.mode 保存当前 Run 的 normal 或 plan 模式；无参数 /plan 在 run_started 提交前选择当前 Run，已完成 Run 上则把 plan 保存为 Goal.nextRunMode 并只消费一次。模式选择与启动按 Snapshot/Trajectory 提交顺序线性化，启动后拒绝切换；后续 Run 默认 normal，且不继承 approvedTask。 [S1, S2, S4, S5, S9]
- D2 — 普通 Run 直接以用户请求执行，不生成任务提案等待。Plan Run 的 Prompt 引导 Agent 先提案；Runtime 不因 approvedTask 缺失或 Tool 的 isReadOnly 值而额外屏蔽业务 Tool，Profile、Tool Policy 与 Action 审批仍生效。任务提案提交为当前 Run 的 pendingInteraction 后，模型和 Tool 必须等待用户批准或反馈。 [S1, S2, S8, S21, S12]
- D3 — GoalPlan 是可选 Goal 状态，不随 /plan 自动创建；获授权模式首次成功更新时创建，当前 Run 能力决定写权，普通 Run 可读取已提交计划。稳定 Todo ID、revision 和合法状态变化通过原子 patch 校验；计划不属于任务提案审批对象，也不授予业务 Tool 权限。 [S1, S2, S6, S7, S8, S10]
- D4 — Todo 不与 Run 一对一绑定；一个 Run 可顺序推进多个 Todo。完成 Todo 必须引用当前 Run 已提交 Observation；Run 依据自身任务和适用证据校验完成，不自动完成、取消 Todo 或启动后继 Run。 [S1, S2, S8, S10, S13]
- D5 — waiting Run 的有效回答、提案批准或反馈恢复同一 Run；completed Run 上的新任务通过 continue 归档前一 Run 并创建新 Run。nextRunMode 仅影响下一次创建，当前批准任务不跨 Run 继承。 [S1, S2, S5, S11, S12]
- D6 — Trajectory 事实与 Step 身份按 Goal/Run 隔离；旧 Run Lookup 和未提交尾部不能成为当前 Run 的完成证据。 [S2, S13, S14, S20]
- D7 — TUI 的审批面板由当前 Run 的 pendingInteraction 投影；PlanPanel 始终从 Goal Snapshot 展示已提交 GoalPlan，不受当前 Run 模式影响。SessionController 丢弃会回退较新审批、计划或时间线的迟到通知。 [S1, S2, S15, S16, S17, S18, S19]

## Guardrails

- 只能通过 Runtime 接受的 /plan 命令改变当前或下一 Run 模式；模型、聊天文本和 UI 本地状态不能改变模式或直接写 GoalPlan。 [S1, S2, S5]
- Plan Prompt 的先提案要求不是审批前无副作用保证；提案等待点提交后必须停止后续模型和 Tool 调用。 [S1, S2, S8, S12, S21]
- 不因剩余 pending Todo 自动启动 Run；不可用旧 Run、用户回答、提案文本或未提交尾部关闭当前 Run 的证据缺口。 [S1, S2, S10, S13, S14]
- Snapshot、Trajectory 或 Goal/Run 身份校验失败时停在最后有效提交边界；不迁移旧开发协议或推测审批结果。 [S1, S2, S14]

## Revisit When

- 引入新的 Run 模式、GoalPlan 与 Run 的显式依赖、Todo DAG/并行调度或跨进程并发时。
- 修改 /plan 的持久化截止点、任务审批等待/恢复、完成证据或 TUI 提交态投影时。

## Sources

- S1: `specs/mode-driven-task-proposal/requirements.md`
- S2: `specs/mode-driven-task-proposal/design.md`
- S3: `specs/mode-driven-task-proposal/tasks.md`
- S4: `packages/runtime/src/domain.ts`
- S5: `packages/runtime/src/goal-coordinator.ts`
- S6: `packages/runtime/src/run-mode-capabilities.ts`
- S7: `packages/runtime/src/goal-plan.ts`
- S8: `packages/runtime/src/runner.ts`
- S9: `packages/runtime/test/goal-plan-mode.test.ts`
- S10: `packages/runtime/test/goal-plan-run.test.ts`
- S11: `packages/runtime/test/goal-coordinator.test.ts`
- S12: `packages/runtime/test/goal-coordinator-task-interaction.test.ts`
- S13: `packages/runtime/src/evidence-gate.ts`
- S14: `packages/storage/src/goal-snapshot-codec.ts`
- S15: `docs/architecture/runtime.md`
- S16: `docs/architecture/tui.md`
- S17: `packages/tui/src/session-controller.ts`
- S18: `packages/tui/src/plan-panel.tsx`
- S19: `packages/tui/test/session-screen.test.tsx`
- S20: `packages/runtime/test/goal-multi-run-session.test.ts`
- S21: `packages/contracts/src/model-output/factory.ts`
