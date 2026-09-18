# Runtime 模块

## 摘要

Runtime 是控制平面：拥有 Goal/Run 状态、统一推进循环、Trajectory、结构化 Working Memory 和持久化 Port。它不构造 Prompt、不解析供应商格式，也不读取文件系统。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Task、Run、Action/Observation 和交互等待契约 | I/O 和模型调用 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 校验输入与协议、冻结 Profile、创建并保存 Goal、启动 Coordinator | 恢复已有 Goal |
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) | 统一推进、用户回答/任务批准/反馈恢复、提交等待点并委派 Scheduler | 直接执行 Tool |
| [Runner](../../packages/runtime/src/runner.ts) | 模型决策校验、只读探查、Tool 授权、Action/Observation、Evidence 和 Run 转换 | 供应商协议和 UI |
| [WorkingMemorySession](../../packages/runtime/src/working-memory-session.ts) | 按 Snapshot 边界重建临时 Working Memory，校验 Patch/Evidence | 保存 Memory 内容到 Snapshot |
| [TrajectoryCheckpointCommitter](../../packages/runtime/src/trajectory-checkpoint-committer.ts) | 统一事实、Patch、Snapshot 和提交 marker 的顺序 | 业务分支和模型调用 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新 Goal Snapshot | 历史查询和文件格式 |
| [Trajectory](../../packages/runtime/src/trajectory.ts) | 追加事实事件、提交 marker 和只读恢复查询 | 改写 Runtime State |
| [Tool contracts](../../packages/runtime/src/tool.ts) | Tool 描述、输入 Contract、执行闭包、Registry 和 Policy 边界 | 具体 Tool 业务逻辑 |
| [Context Retrieval](../../packages/runtime/src/context-retrieval.ts) | 校验历史查询、归一化 bounded result 和相关 Trajectory 事实 | 读取当前 Workspace/Environment |

## 状态与推进

Goal workflow 只有 `phase: "executing"`。Goal 创建时可以没有 `workflow.task`；这表示模型尚未提出或用户尚未批准任务。批准后 Task 固定在 workflow 中。Run 独立保存 `status`、`stepCount`、最新 Step、`pendingAction`、`pendingInteraction`、Context Epoch、Trajectory 提交边界和 Working Memory revision。

统一 Runner 根据模型决策推进：

- 未批准任务：允许 `ask_user`、`task_proposal`、历史 Context Lookup 和 `isReadOnly` Tool；副作用 Tool 不会进入可执行分支。
- 已批准任务：允许普通 Tool、Context Lookup、`complete`、`wait`、`fail` 和执行期 `ask_user`。
- 只读探查仍沿用 Tool Registry、Action ID、Tool Observation 和 Trajectory 提交路径，但不创建普通执行 Step，也不绕过 Runtime 授权。
- `task_proposal` 进入 `task_approval` 等待点；反馈移除当前提案并重新请求；批准把提案复制为最终 Task。
- `ask_user` 进入带 request ID、模式和问题列表的等待点；答案先写入真实消息与回答事实，再恢复 Runner。

每次下游模型或 Tool 调用前，Runtime 先保存所需事实和 Snapshot。完成声明必须引用已提交的 Tool/Observation Evidence；用户回答本身不能成为完成证据。运行时错误、协议错误、身份不匹配和旧 Snapshot 均 fail-closed。

## 恢复与持久化

Trajectory 是恢复事实源，Snapshot 的 `committedThroughSequence` 是可见边界，`memoryRevision` 是 accepted Memory Patch 链头。`WorkingMemorySession` 只沿可达 revision 链重放已提交 Patch，并拒绝跨 Goal/Run、断链、循环、越界或不匹配的事实。

`pendingInteraction` 保存问卷/任务提案的完整请求、模式和关联 ID；恢复时必须验证 Goal、Run、request ID 与当前等待状态。`pendingAction` 按 Tool 的 replay policy 分为安全重放或 `outcome_unknown` 人工确认。当前开发期协议不迁移旧字段；Storage 对旧阶段和旧事件显式拒绝。

## 关键错误边界

- AgentDecision 无法通过当前 Wire/Canonical Contract、Evidence 或当前 task 门控时，返回 `INVALID_AGENT_DECISION`，不执行副作用。
- Tool 未授权、未注册、输入不合法或 Policy 拒绝时，不调用 Tool，并追加相应稳定结果。
- Snapshot、Trajectory 或协议校验失败时，不继续模型/Tool 调用；保存失败保留最近已成功快照。
- Context Lookup 只允许历史 Conversation、执行事实或决策理由；当前环境必须重新调用 Tool。

## 当前限制

Runtime 当前只保存每个 Goal 的最新完整 Snapshot，不提供历史快照查询、跨进程租约或 Outbox 双写。TUI/Benchmark 通过 Composition Root 注入 Store、Trajectory、Tool、Agent 和 LLM 适配器。
