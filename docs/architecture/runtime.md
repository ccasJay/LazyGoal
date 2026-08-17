# Runtime 模块

## 摘要

Runtime 是 Agent 的控制平面：拥有 Goal/Run 领域状态、状态机、启动和恢复流程，以及最新快照持久化。它不构造 Prompt，也不知道模型供应商。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Preparation、Run、Action/Observation 数据契约 | I/O 和模型调用 |
| [PreparationExecutor](../../packages/runtime/src/preparation-executor.ts) | 定义准备阶段单轮结构化决策边界 | 阶段推进、消息追加与持久化 |
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) | 推进 Preparation、恢复全部输入、持久化等待点、委派 executing Goal | Step 执行 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 校验输入、冻结 Profile、创建并保存 Goal、调用 Coordinator | 恢复已有 Goal |
| [Runner](../../packages/runtime/src/runner.ts) | executing Run 循环、AgentDecision 运行时校验、Tool 授权边界、转换与逐步保存 | 外部输入恢复与模型供应商协议 |
| [Transition](../../packages/runtime/src/transition.ts) | 纯函数式 Run 状态转换 | 持久化 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新完整 Goal | 历史与事件查询 |
| [GoalCatalog](../../packages/runtime/src/goal-store.ts) | 扫描并排序可恢复 Goal 摘要 | 写入快照或返回历史版本 |
| [Scheduler](../../packages/runtime/src/scheduler.ts) | 按 RunRef 发起执行 | 拥有 Goal 数据 |
| [Tool contracts](../../packages/runtime/src/tool.ts) | Tool 描述、输入校验、重放声明、Registry 与 Policy 边界 | 具体 Tool 执行与 Goal 持久化 |
| [ExecutionControl](../../packages/runtime/src/execution-control.ts) | 在一次调用链内传播 AbortSignal，并将中止规范化为控制流错误 | 改写 Goal 状态或决定进程退出 |

## 生命周期与保存顺序

Goal v3 将创建后冻结的 intent、Profile、executionPolicy 放在 `definition`，将 workflow、真实 messages 和 Run 放在 `state`。Run 可保存有界的 `checkpoint`、最近 `lastStep` 与当前 `pendingAction`；Action/Observation 不进入真实消息历史。新 Goal 从 `gathering_context/active` 与 `created/0` 开始；Preparation 不消费 Step，只有拥有最终 task 的 `executing` workflow 可进入 Runner。

Launcher 在 Profile lookup 和 runId 生成前校验 intent 与 maxSteps，保存初始 Goal 成功后才调用 Coordinator。它返回 Coordinator 的等待点或终态，不直接调用 Scheduler。

`JsonFileGoalStore` 同时实现 `GoalCatalog`。`listResumable` 只扫描目录中的正式 `.json`
普通文件，严格解码完整 Goal 快照并忽略 `.tmp`；不存在的目录视为空目录，损坏快照或
文件系统错误会阻止本次查询。它过滤 `completed`、`failed`、`cancelled` 三个终态，使用
原子替换后文件的 `mtime` 倒序排列，并以 `goalId` 升序稳定打破平局，返回包含 intent、
workflow phase、Run 状态、runId 和更新时间的摘要。

Coordinator 对 active Preparation 每轮调用一次 Executor。`question` 保存为真实 assistant 消息并进入 `waiting_input`；`context_ready` 先保存 `planning/active`，再继续生成 task proposal；proposal 与完整批准文本一起保存为 `waiting_approval`。每个继续点都以保存成功为前提。executing Goal 委派给 Scheduler，并在调度结束后重新恢复最新 Goal。

Coordinator 的 `resume` 接受分阶段 user action：gathering message 保存原文回答并恢复 active；planning message 移除当前 proposal、保存反馈并重新规划；approve 不追加消息，将 proposal 固定为最终 task；executing blocked message 追加原文输入并把 Run 恢复为 running；`approve_action` 匹配 `awaiting_approval` 或 `outcome_unknown` 的 pendingAction，保存为 `approved` 后透传一次性 `authorizedActionId`；`reject_action` 保存 rejected Observation 后继续推进。以上状态均先保存再继续自动推进。

当前 Runner 主流程为 `created → running → (Action/Observation)* → waiting | completed | failed`，`cancelled` 也是终态；旧 StepResult 会以 `legacy` 记录兼容保存。StepExecutor 生成 AgentDecision 后，Runner 会向它传入冻结 Profile 中已注册的 ToolDefinition，并对返回值做运行时严格校验。`tool_call` 按 Profile 授权、Registry 查找、输入校验和 Policy 顺序检查；自动允许时先用 `stage_action` 保存 checkpoint/pendingAction，再调用 Tool，最后用 `observe_action` 同时保存最近 Action/Observation、清除 pendingAction 并计一个 Step；需要批准时保存 `awaiting_approval` 并进入 waiting，获得匹配的瞬时授权后才执行同一 Action。进程恢复时，safe Tool 沿用原 `actionId` 自动重放，manual Tool 通过 `recover_action` 转为 `outcome_unknown` waiting。领域 failure Observation 继续下一轮；协议、越权、缺失、非法输入和基础设施异常写入 `execution_error`，Tool 抛错时保留 `outcome_unknown`，不伪造 Observation 或 assistant 消息。终止 AgentDecision 使用 `decision` 转换并保存 checkpoint、最近结果和规范化 assistant 消息。每个保存点成功后才会进入下一步。

Launcher、Coordinator、Scheduler、Runner、Preparation/Step Executor、LLM Adapter 和 Tool
共享可选的 `ExecutionControl`。各层在外部调用前、异步返回后以及状态转换或保存前
调用 `throwIfAborted`；中止原样传播 `ExecutionAbortedError`，不生成失败 Step、
`execution_error`、`cancelled` 或新的领域快照。已经进入的 Store 保存仍由存储边界决定
是否完成。

Runner 从 Goal 冻结的 executionPolicy 读取累计上限：正数达到后写入 `max_steps_exceeded`，不覆盖最近 Step、不追加消息；`0` 不限制连续 Step 数量。

TODO 3 已建立 Runtime 的 Tool 扩展边界与内存 `ToolRegistry`，TODO 4–8 使 Agent
接收已注册的授权 ToolDefinition、生成/校验严格 AgentDecision 并自动执行允许的
Action；并由
[`packages/tools`](../../packages/tools/src/index.ts) 提供只读 `ReadFileTool`。它会
拒绝绝对路径、`..` 路径段和解析后越出 workspaceRoot 的符号链接；合法读取返回
`success`，文件不存在等领域问题返回 `failure`。当前 Runner、Agent 与 Coordinator
已完成自动允许/审批 Action 的授权、持久化执行编排、拒绝 Observation、瞬时授权和
safe/manual 中断恢复；跨进程重放依赖 JsonFileGoalStore，仍没有并发租约或 exactly-once
保证。

## 错误与不变量

- Goal 不存在或 `runId` 不匹配：返回 `RUN_NOT_FOUND`，不执行、不保存。
- Goal 没有匹配等待点、文本为空或 action 不匹配：返回 `GOAL_NOT_WAITING` 或 `INVALID_GOAL_INPUT`，无副作用。
- 未携带或携带错误 `authorizedActionId` 调度已批准 Action：返回 `ACTION_NOT_AUTHORIZED`，不调用 Tool。
- PreparationResult 与当前 phase 不匹配：返回 `INVALID_PHASE_RESULT`，不追加消息、不保存。
- Adapter 等非协议 Executor 异常：兼容转换为一次持久化的 `fail` Step；AgentDecision 协议错误、Tool 越权/缺失/输入错误与边界基础设施异常：保存稳定 `execution_error`，不消费 Step。Tool 抛错发生在 pendingAction 保存后时标记 `outcome_unknown`。
- Transition 非法组合：返回原状态与 `INVALID_TRANSITION`，不抛异常、不修改输入状态。
- Action 状态不变量：pendingAction 必须与当前 Action 生命周期匹配；Observation/rejection 必须匹配 actionId；Action 暂存、取消和执行错误不消费 Step，只有完整 Observation、拒绝或终止决策消费一次 Step。
- Tool 边界不变量：Profile 白名单先于 Registry 和输入校验；Registry 中的 Tool ID 必须唯一；首次执行 Tool 前必须完成输入校验和 Policy 评估，已批准且携带匹配瞬时授权的 Action 只重新校验 Tool 与输入；`ReadFileTool` 只允许 workspaceRoot 内的相对文件路径，且不读取越界符号链接目标。
- Store I/O 或协议错误：原样向调用方传播。
- `AbortSignal` 已中止：传播独立的 `ExecutionAbortedError`，不落盘控制流产生的失败状态；LLM/Tool 边界负责将供应商中止对齐为该错误。
- GoalStore 按 `schemaVersion` 严格解码；v3 校验 workflow/Run 与 pending Action 不变量，合法 v1/v2 只读迁移为 v3，旧 `lastStep` 仅在迁移结果中包装为 `legacy`，未知版本或损坏快照报协议错误。
- GoalCatalog 只接受正式 `.json` 快照；目录扫描中的任一正式快照损坏都会报告协议错误，不会静默跳过；`.tmp` 和非普通文件不参与候选项。
- `JsonFileGoalStore` 恢复 v1/v2 时不改写文件；下一次显式保存才以 v3 原子替换。并发写入仍是最后替换者覆盖。

## 当前限制与背景

一个 Goal 只有一个当前 Run；`InlineScheduler` 没有队列、租约或自动重启扫描。当前不提供并发恢复保护、消息裁剪或上下文压缩；Tool 外部系统仍不承诺 exactly-once。当前演进设计见 [Goal Preparation Workflow Spec](../../specs/goal-preparation-workflow/design.md)。
