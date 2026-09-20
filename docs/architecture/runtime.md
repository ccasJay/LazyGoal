# Runtime 模块

## 摘要

Runtime 是控制平面：拥有 Goal/Run/Step 状态、Goal 级 Plan Mode 与 GoalPlan、统一推进循环、Trajectory、结构化 Working Memory 和持久化 Port。它不构造 Prompt、不解析供应商格式，也不读取文件系统。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Task、Run、Action/Observation 和交互等待契约 | I/O 和模型调用 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 校验输入与协议、冻结 Profile、创建并保存 Goal、启动 Coordinator | 恢复已有 Goal |
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) | 统一推进、Plan Mode 入口、waiting resume、completed continue、Run/ Todo 绑定、提交等待点并委派 Scheduler | 直接执行 Tool |
| [Runner](../../packages/runtime/src/runner.ts) | 模型决策校验、只读 Tool、Tool 授权、Action/Observation、Evidence 和 Run 转换 | 供应商协议和 UI |
| [WorkingMemorySession](../../packages/runtime/src/working-memory-session.ts) | 按 Snapshot 边界重建临时 Working Memory，校验 Patch/Evidence | 保存 Memory 内容到 Snapshot |
| [TrajectoryCheckpointCommitter](../../packages/runtime/src/trajectory-checkpoint-committer.ts) | 统一事实、Patch、Snapshot 和提交 marker 的顺序 | 业务分支和模型调用 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新 Goal Snapshot | 历史查询和文件格式 |
| [Trajectory](../../packages/runtime/src/trajectory.ts) | 追加事实事件、提交 marker 和只读恢复查询 | 改写 Runtime State |
| [Tool contracts](../../packages/runtime/src/tool.ts) | Tool 描述、输入 Contract、执行闭包、可选流能力、Registry 和 Policy 边界 | 具体 Tool 业务逻辑 |
| [Context Retrieval](../../packages/runtime/src/context-retrieval.ts) | 校验历史查询、归一化 bounded result 和相关 Trajectory 事实 | 读取当前 Workspace/Environment |

## 状态与推进

Goal workflow 只有 `phase: "executing"`。Goal 是可持续恢复的会话聚合，保存 `mode`、Plan Mode 下的 GoalPlan、完整 messages 和 `completedRuns`；Run 是一次执行边界，Step 是 Run 内已提交的一次推进。Goal 创建时可以没有 `workflow.task`；这表示模型尚未提出或用户尚未批准任务。批准后 Task 固定在 workflow 中。Run 独立保存 `status`、`stepCount`、最新 Step、`pendingAction`、`pendingInteraction`、Context Epoch、Trajectory 提交边界、Working Memory revision 和可选 `todoId`。

`/plan` 只通过 Coordinator 在安全边界把 Goal 切换为 Plan Mode 并 materialize GoalPlan。Plan Mode 下一个执行 Run 只绑定一个 Todo；Todo 完成与当前 Run 的完成证据在同一 Checkpoint 中提交。普通模式不会 materialize GoalPlan。

waiting 输入调用 `resume` 并保留当前 Run；completed 输入调用 `continue`，在追加用户消息前归档上一 Run、保存新 Run，再交给现有 Scheduler。`continue` 不判断自然语言语义，也不会因为存在 pending Todo 自动启动下一 Run。

统一 Runner 根据模型决策推进：

- 未批准任务：允许 `ask_user`、`task_proposal`、历史 Context Lookup 和 `isReadOnly` Tool；副作用 Tool 不会进入可执行分支。
- 已批准任务：允许普通 Tool、Context Lookup、`complete`、`wait`、`fail` 和执行期 `ask_user`。
- 只读 Tool 与副作用 Tool 统一沿用 Tool Registry、Action ID、Policy、Trajectory 和 Observation 提交路径；任务批准前只开放只读 Tool，且每次完成的 `observe_action` 都计入 Step。
- `task_proposal` 进入 `task_approval` 等待点；反馈移除当前提案并重新请求；批准把提案复制为最终 Task。
- `ask_user` 进入带 request ID、模式和问题列表的等待点；答案先写入真实消息与回答事实，再恢复 Runner。

每次下游模型或 Tool 调用前，Runtime 先保存所需事实和 Snapshot。完成声明必须引用已提交的 Tool/Observation Evidence；用户回答本身不能成为完成证据。运行时错误、协议错误、身份不匹配和旧 Snapshot 均 fail-closed。

Runner 和 GoalCoordinator 可通过 [`@lazygoal/execution-stream`](./execution-stream.md) 发布旁路事件。`step_started` 在 Executor 调用前发出，Tool 生命周期由 Runner 发出，事实提交成功后发出 Trajectory 事件和 `step_committed`；发布异常被隔离，不改变 Runtime 状态或提交顺序。实时事件不是恢复来源，恢复仍读取 Snapshot/Trajectory。

## 恢复与持久化

Trajectory 是恢复事实源，Snapshot 的 `committedThroughSequence` 是当前 Run 的可见边界，`memoryRevision` 是 accepted Memory Patch 链头。每个 `(goalId, runId)` 有独立的 Trajectory 序号；跨 Run 历史查询必须携带完整 Run 身份。`completedRuns` 的消息区间和提交边界只描述历史，不改变当前 Run 的 Evidence 所有权。`WorkingMemorySession` 只沿可达 revision 链重放已提交 Patch，并拒绝跨 Goal/Run、断链、循环、越界或不匹配的事实。

`pendingInteraction` 保存问卷/任务提案的完整请求、模式和关联 ID；恢复时必须验证 Goal、Run、request ID 与当前等待状态。`pendingAction` 按 Tool 的 replay policy 分为安全重放或 `outcome_unknown` 人工确认。当前开发期协议不迁移旧字段；Storage 对旧阶段和旧事件显式拒绝。

## 关键错误边界

- AgentDecision 无法通过当前 Wire/Canonical Contract、Evidence 或当前 task 门控时，返回 `INVALID_AGENT_DECISION`，不执行副作用。
- Tool 未授权、未注册、输入不合法或 Policy 拒绝时，不调用 Tool，并追加相应稳定结果。
- Snapshot、Trajectory 或协议校验失败时，不继续模型/Tool 调用；保存失败保留最近已成功快照。
- Context Lookup 只允许历史 Conversation、执行事实或决策理由；结果保留来源 Run 边界，旧 Run 的命中不能成为当前 Run 的完成 Evidence；当前环境必须重新调用 Tool。

## 当前限制

Runtime 当前只保存每个 Goal 的最新完整 Snapshot，不提供历史快照查询、跨进程租约或 Outbox 双写。Coordinator 实例内的 continue 闸门只保证单进程同一 Goal 串行；TUI/Benchmark 通过 Composition Root 注入 Store、Trajectory、Tool、Agent 和 LLM 适配器。Headless Root 仍以单次 Run 返回，后续 Run 必须由持久化 Goal 的显式 continue 触发。
