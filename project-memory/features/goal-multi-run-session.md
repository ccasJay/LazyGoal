---
feature: goal-multi-run-session
status: superseded
summary: "为 Goal 引入持久化 Plan Mode、稳定 Todo 计划与多 Run 会话生命周期，通过 Coordinator 续写分流与原子证据提交保障跨 Run 安全隔离"
source_spec: specs/goal-multi-run-session/
distilled_at: 2026-09-19
reviewed_at: 2026-09-23
tags: [runtime, coordinator, goal-plan, multi-run, session, slash-command, tui, storage]
authorities: [docs/architecture/runtime.md, docs/architecture/storage.md, docs/architecture/tui.md, packages/runtime/src/goal-plan.ts, packages/runtime/src/goal-coordinator.ts, packages/runtime/src/runner.ts, packages/storage/src/goal-snapshot.ts, packages/storage/src/goal-snapshot-codec.ts, packages/tui/src/session-controller.ts, packages/tui/src/plan-panel.tsx]
status_reason: "Run 模式、GoalPlan 所有权、Todo 与 Run 关系及普通模式投影已由 mode-driven-task-proposal 的当前契约完整替代"
superseded_by: [project-memory/features/mode-driven-task-proposal.md]
---

# Goal 计划模式与多 Run 会话

## Purpose

- 将 Goal 提升为可持续恢复的结构化会话容器，支持无参数 `/plan` 进入 Plan Mode 并持久化 GoalPlan；一个 Todo 绑定一个 Run 进行执行推进，Run 完成后通过 `continue` 自动归档旧 Run 并创建新 Run，实现多 Run 会话的安全隔离与长程恢复。 [S1, S2, S3]

## Durable Decisions

- D1 — Runtime 独占 Plan Mode 后端控制权与持久化：`/plan` Slash Command 仅在安全状态边界产生 Effect，由 Coordinator/Launcher 写入 Goal Snapshot；普通模式不创建、不更新也不投影 GoalPlan；Agent 与 UI 不能自行切换模式，重启后严格从快照恢复模式。 [S1, S2, S5, S8, S9, S16]
- D2 — GoalPlan 结构化计划真相与 Working Memory 分离：GoalPlan 持有 Runtime 分配的稳定 ID（Cursor 风格）及状态（`pending`, `in_progress`, `completed`, `cancelled`），通过独立的 `system_update_goal_plan` 系统工具进行原子 patch 与 revision 校验；普通 Working Memory 的内部 plan 继续由当前 Run 轨迹派生，两者物理与语义解耦。 [S1, S2, S4, S10, S11]
- D3 — 一个 Todo 对应一个执行 Run 且当前 Evidence 原子勾选：Plan Mode 下规划 Run 无 `todoId`（负责计划更新与等待），执行 Run 由 `continue` 绑定唯一 Todo 并置为 `in_progress`；完成时由 Evidence Gate 严格校验当前 Run 证据后在同一 Checkpoint 原子将 Run 与 Todo 置为 `completed`；失败/取消不产生 completed Todo。 [S1, S2, S6, S7, S14, S15]
- D4 — 会话分流与串行调度边界（`resume` vs `continue`）：当前 Run 处于 `waiting` 状态时，用户补充信息恢复当前 Run（`resume`）；处于 `completed` 终态时，用户新指令触发 `continue`，先将已完成 Run 归档至 `completedRuns` 并追加用户消息，再分配新 Run ID 提交快照并调度 Runner；普通模式多 Run 不隐式 materialize GoalPlan。 [S1, S2, S5, S12, S14]
- D5 — Trajectory 序号按 Run 独立与历史来源严格隔离：每个 `(goalId, runId)` 独立分配 sequence，新 Run 从 sequence 0 开始；跨 Run 查询与 TUI 步骤去重使用 `(goalId, runId, sequence)` 复合身份；旧 Run 的历史 Lookup 结果绝不能成为当前 Run 的完成证据。 [S1, S2, S5, S7, S8]
- D6 — TUI PlanPanel 单向投影与 Run 身份去重：`SessionScreen` 仅在 Plan Mode 下从最新 Goal Snapshot 投影 `PlanPanel` 并标注当前 Run 负责的 Todo；普通模式隐藏该面板；终态保留“Start the next Run”输入；旧 Run 的迟到通知按 Run 身份丢弃，防止回退当前计划或覆盖新 Run 时间线。 [S1, S2, S12, S13]

## Guardrails

- 严禁允许模型、聊天文本或 UI 本地状态绕过 `/plan` 自动激活 Plan Mode 或修改 GoalPlan。 [S1, S2, S4, S5]
- 严禁在未绑定 Todo 的规划 Run 中直接调用 `system_complete_task` 宣称完成任务。 [S1, S2, S6]
- 严禁将旧 Run 的历史 Lookup 事实或未提交尾部推断为当前 Run 的完成 Evidence。 [S1, S2, S7]
- 严禁在 Plan Mode 自动串行执行剩余的 pending Todo，新 Run 必须由显式用户指令触发。 [S1, S2, S5]
- 严禁在 Snapshot 或 Trajectory 损坏、跨 Goal 污染或不支持版本时静默容错，必须 fail-closed。 [S1, S2, S8, S9]

## Revisit When

- 引入退出 Plan Mode（如 `/exit-plan` 或返回普通模式）的命令与状态机设计时。
- 引入 Todo 之间复杂的 DAG 依赖关系或并行 Run 调度机制时。
- 引入跨进程协同修改同一 Goal 会话与分布式事务锁时。

## Sources

- S1: `specs/goal-multi-run-session/requirements.md`
- S2: `specs/goal-multi-run-session/design.md`
- S3: `specs/goal-multi-run-session/tasks.md`
- S4: `packages/runtime/src/goal-plan.ts`
- S5: `packages/runtime/src/goal-coordinator.ts`
- S6: `packages/runtime/src/runner.ts`
- S7: `packages/runtime/src/evidence-gate.ts`
- S8: `packages/storage/src/goal-snapshot-codec.ts`
- S9: `packages/storage/src/goal-snapshot.ts`
- S10: `packages/contracts/src/model-output/canonical.ts`
- S11: `packages/contracts/src/model-output/system-tools.ts`
- S12: `packages/tui/src/session-controller.ts`
- S13: `packages/tui/src/plan-panel.tsx`
- S14: `packages/runtime/test/goal-multi-run-session.test.ts`
- S15: `packages/runtime/test/goal-plan.test.ts`
- S16: `packages/storage/test/goal-snapshot-current.test.ts`
