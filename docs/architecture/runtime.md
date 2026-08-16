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
| [Scheduler](../../packages/runtime/src/scheduler.ts) | 按 RunRef 发起执行 | 拥有 Goal 数据 |
| [Tool contracts](../../packages/runtime/src/tool.ts) | Tool 描述、输入校验、重放声明、Registry 与 Policy 边界 | 具体 Tool 执行与 Goal 持久化 |

## 生命周期与保存顺序

Goal v3 将创建后冻结的 intent、Profile、executionPolicy 放在 `definition`，将 workflow、真实 messages 和 Run 放在 `state`。Run 可保存有界的 `checkpoint`、最近 `lastStep` 与当前 `pendingAction`；Action/Observation 不进入真实消息历史。新 Goal 从 `gathering_context/active` 与 `created/0` 开始；Preparation 不消费 Step，只有拥有最终 task 的 `executing` workflow 可进入 Runner。

Launcher 在 Profile lookup 和 runId 生成前校验 intent 与 maxSteps，保存初始 Goal 成功后才调用 Coordinator。它返回 Coordinator 的等待点或终态，不直接调用 Scheduler。

Coordinator 对 active Preparation 每轮调用一次 Executor。`question` 保存为真实 assistant 消息并进入 `waiting_input`；`context_ready` 先保存 `planning/active`，再继续生成 task proposal；proposal 与完整批准文本一起保存为 `waiting_approval`。每个继续点都以保存成功为前提。executing Goal 委派给 Scheduler，并在调度结束后重新恢复最新 Goal。

Coordinator 的 `resume` 接受分阶段 user action：gathering message 保存原文回答并恢复 active；planning message 移除当前 proposal、保存反馈并重新规划；approve 不追加消息，将 proposal 固定为最终 task；executing blocked message 追加原文输入并把 Run 恢复为 running。以上状态均先保存再继续自动推进。

当前 Runner 主流程仍为 `created → running → continue* → waiting | completed | failed`，`cancelled` 也是终态；旧 StepResult 会以 `legacy` 记录兼容保存。StepExecutor 生成 AgentDecision 后，Runner 会向它传入冻结 Profile 中已注册的 ToolDefinition，并对返回值做运行时严格校验。`tool_call` 按 Profile 授权、Registry 查找、输入校验和 Policy 顺序检查；越权、缺失、非法输入、协议损坏和边界基础设施异常写入 `execution_error` 并保持 Step 不变，不追加 assistant 消息，也不会调用 Tool。合法 Action 在自动 Action/Observation 循环接入前仍以 `TOOL_EXECUTION_ERROR` 停止。Transition 已提供下一阶段需要的纯状态转换边界：`stage_action` 只写入 checkpoint/pendingAction，`observe_action` 与 `reject_action` 写入最近 Action/Observation 并各计一个 Step，`decision` 写入非 Tool 终止决策并计一个 Step，`execution_error` 进入 failed 但不计 Step；取消会清理 pendingAction。完整 Action 持久化、Tool 执行和 Observation 循环仍由后续 Spec TODO 实现。当前终止兼容路径依次执行：Executor 返回 AgentDecision → Runner 校验并转换终止分支为旧 StepResult → Transition 写入最新 `legacy` Step → GoalStore 保存。

Runner 从 Goal 冻结的 executionPolicy 读取累计上限：正数达到后写入 `max_steps_exceeded`，不覆盖最近 Step、不追加消息；`0` 不限制连续 Step 数量。

TODO 3 已建立 Runtime 的 Tool 扩展边界与内存 `ToolRegistry`，TODO 4/5 使 Agent
接收已注册的授权 ToolDefinition 并生成/校验严格 AgentDecision；并由
[`packages/tools`](../../packages/tools/src/index.ts) 提供只读 `ReadFileTool`。它会
拒绝绝对路径、`..` 路径段和解析后越出 workspaceRoot 的符号链接；合法读取返回
`success`，文件不存在等领域问题返回 `failure`。当前 Runner、Agent 与 Coordinator
已完成 Action 的授权与前置校验，但尚未完成该 Tool 的持久化执行编排；Policy 的
审批等待和自动 Action/Observation 循环仍由后续 TODO 实现。

## 错误与不变量

- Goal 不存在或 `runId` 不匹配：返回 `RUN_NOT_FOUND`，不执行、不保存。
- Goal 没有匹配等待点、文本为空或 action 不匹配：返回 `GOAL_NOT_WAITING` 或 `INVALID_GOAL_INPUT`，无副作用。
- PreparationResult 与当前 phase 不匹配：返回 `INVALID_PHASE_RESULT`，不追加消息、不保存。
- Adapter 等非协议 Executor 异常：兼容转换为一次持久化的 `fail` Step；AgentDecision 协议错误、Tool 越权/缺失/输入错误与边界基础设施异常：保存稳定 `execution_error`，不消费 Step。
- Transition 非法组合：返回原状态与 `INVALID_TRANSITION`，不抛异常、不修改输入状态。
- Action 状态不变量：pendingAction 必须与当前 Action 生命周期匹配；Observation/rejection 必须匹配 actionId；Action 暂存、取消和执行错误不消费 Step，只有完整 Observation、拒绝或终止决策消费一次 Step。
- Tool 边界不变量：Profile 白名单先于 Registry 和输入校验；Registry 中的 Tool ID 必须唯一；Tool 执行前必须完成输入校验和 Policy 评估；`ReadFileTool` 只允许 workspaceRoot 内的相对文件路径，且不读取越界符号链接目标。
- Store I/O 或协议错误：原样向调用方传播。
- GoalStore 按 `schemaVersion` 严格解码；v3 校验 workflow/Run 与 pending Action 不变量，合法 v1/v2 只读迁移为 v3，旧 `lastStep` 仅在迁移结果中包装为 `legacy`，未知版本或损坏快照报协议错误。
- `JsonFileGoalStore` 恢复 v1/v2 时不改写文件；下一次显式保存才以 v3 原子替换。并发写入仍是最后替换者覆盖。

## 当前限制与背景

一个 Goal 只有一个当前 Run；`InlineScheduler` 没有队列、租约或自动重启扫描。当前不提供并发恢复保护、消息裁剪或上下文压缩。当前演进设计见 [Goal Preparation Workflow Spec](../../specs/goal-preparation-workflow/design.md)。
