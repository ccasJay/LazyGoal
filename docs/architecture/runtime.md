# Runtime 模块

## 摘要

Runtime 是控制平面：拥有 Goal/Run/Step 状态、Run 模式与 GoalPlan、统一推进循环、Trajectory、结构化 Working Memory 和持久化 Port。它不构造 Prompt、不解析供应商格式或直接读写项目文件；文件授权身份解析只读取路径元数据，不读取文件内容。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Run 模式与获批 Task、Action/Observation 和交互等待契约 | I/O 和模型调用 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 校验输入与协议、冻结 Profile、创建并保存 Goal、启动 Coordinator | 恢复已有 Goal |
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) | 统一推进、Run 模式选择、waiting resume、Tool Grant 审批/撤销、completed continue、提交等待点并委派 Scheduler | 直接执行 Tool |
| [Runner](../../packages/runtime/src/runner.ts) | 模型决策校验、只读 Tool、Tool 授权、Action/Observation、Evidence 和 Run 转换 | 供应商协议和 UI |
| [WorkingMemorySession](../../packages/runtime/src/working-memory-session.ts) | 按 Snapshot 边界重建临时 Working Memory，校验 Patch/Evidence | 保存 Memory 内容到 Snapshot |
| [TrajectoryCheckpointCommitter](../../packages/runtime/src/trajectory-checkpoint-committer.ts) | 统一事实、Patch、Snapshot 和提交 marker 的顺序 | 业务分支和模型调用 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新 Goal Snapshot | 历史查询和文件格式 |
| [Model Call Metrics](../../packages/runtime/src/model-call-metrics.ts) | 模型调用开始/结束事实、用量覆盖标记及追加/读取 Port | Goal 恢复状态、指标汇总与诊断 Trace |
| [Trajectory](../../packages/runtime/src/trajectory.ts) | 追加事实事件、提交 marker 和只读恢复查询 | 改写 Runtime State |
| [Tool contracts](../../packages/runtime/src/tool.ts) | Tool 描述、输入 Contract、执行闭包、可选流能力、Registry 和 Policy 边界 | 具体 Tool 业务逻辑 |
| [Tool Grant](../../packages/runtime/src/tool-grant.ts) | 将已验证的 Tool 输入映射为按操作匹配的持续授权身份，并定义授权 Store Port | 执行 Tool 或绕过 Profile、输入、Policy 校验 |
| [Context Retrieval](../../packages/runtime/src/context-retrieval.ts) | 校验历史查询、归一化 bounded result 和相关 Trajectory 事实 | 读取当前 Workspace/Environment |

## 状态与推进

Goal workflow 只有 `phase: "executing"`。Goal 是可持续恢复的会话聚合，保存完整 messages、独立 GoalPlan、可选的一次性 `nextRunMode` 和 `completedRuns`；Run 是一次执行边界，保存自己的 `mode`、可选 `approvedTask`、`status`、`stepCount`、最新 Step、等待点、Context Epoch、Trajectory 提交边界和 Working Memory revision。GoalPlan Todo 不绑定 Run；同一 Run 可依次更新多个 Todo，结束时未完成项保留原状态。

无参数 `/plan` 通过 Coordinator 为尚未提交 `run_started` 的当前 Run 选择 Plan 模式；当前 Run 已完成或失败时，它将 Plan 作为下一 Run 的一次性选择持久化。新 Run 缺省使用普通模式并消费待用选择。模式只属于 Run，GoalPlan 可在任意模式下存在并继续读取。

waiting 输入调用 `resume` 并保留当前 Run；completed 或 failed 输入调用 `continue`，在追加用户消息前归档上一 Run 的终态、保存新 Run，再交给现有 Scheduler。失败 Run 不会原地恢复；只有用户提交新输入才会创建后续 Run。cancelled Run 不接收普通输入；未完成 Todo 不会自动推进。

统一 Runner 按当前 Run 模式和获批任务推进：

- 普通 Run 直接以当前用户请求为目标，不等待任务提案；完成声明按当前 Run 已提交的 Tool/Observation Evidence 校验。
- Plan Run 未批准时，Prompt 要求先提交 `task_proposal`，但 Runtime 不以 `isReadOnly` 或未批准状态增加业务 Tool 门控；现有 Profile、Tool Policy 和 Action 审批仍决定 Tool 权限。该 Run 在获批前不能完成。
- 提案进入持久化的 `task_approval` 等待点后停止模型和 Tool 调用；反馈使旧提案失效并重新请求，批准后将任务保存在当前 Run 的 `approvedTask`。
- 获批 Plan Run 可调用已授权业务 Tool，并按获批任务的完成条件校验证据。GoalPlan 写入由 Run 模式能力授权；计划状态本身不授予业务 Tool 权限。
- 各模式中的 Tool 调用统一沿用 Tool Registry、Action ID、Policy、Trajectory 和 Observation 提交路径。
- Policy 要求人工审批的 Action 可获准一次、当前 Goal 或当前 workspace。Goal/workspace Grant 按完整 `bash` 输入或文件目标路径匹配，并且始终在 Profile、输入与 Policy 校验之后查询；YOLO 自动批准不生成持续 Grant。
- `ask_user` 进入带 request ID、模式和问题列表的等待点；答案先写入真实消息与回答事实，再恢复 Runner。
- 阶段化 Executor 在单个 Step 内由 Runner 管理 Decide/Think 循环。每次 `request_think` 先和 Decide frame 提交；Think 输出和 Think frame 另存为已提交事实后，Runner 才再次 Decide。Think 不增加 `stepCount`，不执行 Tool；只有最终有效 `AgentDecision` 进入既有转换、授权和证据校验。

每次下游模型或 Tool 调用前，Runtime 先保存所需事实和 Snapshot。完成声明必须引用已提交的 Tool/Observation Evidence；用户回答本身不能成为完成证据。运行时错误、协议错误、身份不匹配和旧 Snapshot 均 fail-closed。

Runner 和 GoalCoordinator 可通过 [`@lazygoal/execution-stream`](./execution-stream.md) 发布旁路事件。`step_started` 在 Executor 调用前发出，阶段事实与上下文 frame 在进入下一模型阶段前先提交，Tool 生命周期由 Runner 发出；事实提交成功后发出 Trajectory 事件和 `step_committed`。发布异常被隔离，不改变 Runtime 状态或提交顺序。实时事件不是恢复来源，恢复仍读取 Snapshot/Trajectory。

模型调用指标使用独立 `MetricsStore` 与覆盖标记 Port：开始/结束事实不进入 Goal、Trajectory 或恢复状态。调用用量和计时由 Agent 在模型边界记录，查询投影由 `session-metrics` 根据最新 Goal Snapshot 与指标事实归约；指标写入失败不得改变 Goal 执行结果。

## 恢复与持久化

Trajectory 是恢复事实源，Snapshot 的 `committedThroughSequence` 是当前 Run 的可见边界，`memoryRevision` 是 accepted Memory Patch 链头。模型成功响应后可随共享提交器保存 `model_context_frame`，记录请求阶段、Epoch、Conversation 插入位置，以及实际发送的 Section 文本和对应结构化投影；该 frame 不写入 Goal Conversation，也不替代其他 Trajectory 事实。恢复查询只接受 Snapshot 边界内、Goal/Run/阶段/Epoch/Conversation 起点匹配且 Section 身份仍与当前注册表一致的 frame；未知或身份不匹配的 Section 不能成为比较基线。每个 `(goalId, runId)` 有独立的 Trajectory 序号；跨 Run 历史查询必须携带完整 Run 身份。`completedRuns` 记录已归档 completed 或 failed Run 的终态、消息区间和提交边界，不改变当前 Run 的 Evidence 所有权。`WorkingMemorySession` 只沿可达 revision 链重放已提交 Patch，并拒绝跨 Goal/Run、断链、循环、越界或不匹配的事实。

`pendingInteraction` 保存问卷或任务提案的完整请求、模式和关联 ID；获批任务保存在当前 Run，恢复时必须验证 Goal、Run、request ID 与等待状态一致。`pendingAction` 按 Tool 的 replay policy 分为安全重放或 `outcome_unknown` 人工确认，并在 Action 获批后记录授权期限与可选 Grant ID。Goal/workspace Grant 先以来源 `(goalId, runId, actionId)` 写为 pending，再提交批准事实和 Snapshot，之后才激活并调度；若激活中断，`advance` 必须核验快照身份、授权范围和重新派生的操作匹配器后再恢复激活。pending Grant 从不放行新 Action；撤销立即影响后续查询。`pendingThink` 只保存当前未完成 Step 的恢复指针，Think 文本与请求从 Snapshot 边界内的 Trajectory 事实读取；恢复校验输入摘要、执行单元、Step 序号及 Think 事实父链，已提交输出只交给下一次 Decide。无指针或未提交 tail 中的 Think 输出不会进入恢复历史，输入或链身份失配会 fail-closed。最终业务决策提交时清除该指针。当前开发期协议不迁移旧字段；Storage 对旧阶段和旧事件显式拒绝。

## 关键错误边界

- AgentDecision 无法通过当前 Wire/Canonical Contract、Evidence 或 Run 模式能力校验时，返回 `INVALID_AGENT_DECISION`，不执行由该决策请求的副作用。
- Tool 未授权、未注册、输入不合法或 Policy 拒绝时，不调用 Tool，并追加相应稳定结果。
- Snapshot、Trajectory 或协议校验失败时，不继续模型/Tool 调用；保存失败保留最近已成功快照。
- Context Lookup 只允许历史 Conversation、执行事实或决策理由；结果保留来源 Run 边界，旧 Run 的命中不能成为当前 Run 的完成 Evidence；当前环境必须重新调用 Tool。

## 当前限制

Runtime 当前只保存每个 Goal 的最新完整 Snapshot，不提供历史快照查询、跨进程租约或 Outbox 双写。Coordinator 实例内的 continue 闸门只保证单进程同一 Goal 串行；TUI/Benchmark 通过 Composition Root 注入 Store、Trajectory、Tool、Agent 和 LLM 适配器。Headless Root 仍以单次 Run 返回，后续 Run 必须由持久化 Goal 的显式 continue 触发。
