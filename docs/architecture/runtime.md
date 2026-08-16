# Runtime 模块

## 摘要

Runtime 是 Agent 的控制平面：拥有 Goal/Run 领域状态、状态机、启动和恢复流程，以及最新快照持久化。它不构造 Prompt，也不知道模型供应商。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Preparation、Run、StepResult | I/O 和模型调用 |
| [PreparationExecutor](../../packages/runtime/src/preparation-executor.ts) | 定义准备阶段单轮结构化决策边界 | 阶段推进、消息追加与持久化 |
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) | 推进 Preparation、恢复全部输入、持久化等待点、委派 executing Goal | Step 执行 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 校验输入、冻结 Profile、创建并保存 Goal、调用 Coordinator | 恢复已有 Goal |
| [Runner](../../packages/runtime/src/runner.ts) | executing Run 循环、转换、规范化消息、逐步保存 | 外部输入恢复与模型协议解析 |
| [Transition](../../packages/runtime/src/transition.ts) | 纯函数式 Run 状态转换 | 持久化 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新完整 Goal | 历史与事件查询 |
| [Scheduler](../../packages/runtime/src/scheduler.ts) | 按 RunRef 发起执行 | 拥有 Goal 数据 |

## 生命周期与保存顺序

Goal v2 将创建后冻结的 intent、Profile、executionPolicy 放在 `definition`，将 workflow、真实 messages 和 Run 放在 `state`。新 Goal 从 `gathering_context/active` 与 `created/0` 开始；Preparation 不消费 Step，只有拥有最终 task 的 `executing` workflow 可进入 Runner。

Launcher 在 Profile lookup 和 runId 生成前校验 intent 与 maxSteps，保存初始 Goal 成功后才调用 Coordinator。它返回 Coordinator 的等待点或终态，不直接调用 Scheduler。

Coordinator 对 active Preparation 每轮调用一次 Executor。`question` 保存为真实 assistant 消息并进入 `waiting_input`；`context_ready` 先保存 `planning/active`，再继续生成 task proposal；proposal 与完整批准文本一起保存为 `waiting_approval`。每个继续点都以保存成功为前提。executing Goal 委派给 Scheduler，并在调度结束后重新恢复最新 Goal。

Coordinator 的 `resume` 接受分阶段 user action：gathering message 保存原文回答并恢复 active；planning message 移除当前 proposal、保存反馈并重新规划；approve 不追加消息，将 proposal 固定为最终 task；executing blocked message 追加原文输入并把 Run 恢复为 running。以上状态均先保存再继续自动推进。

Run 主流程为 `created → running → continue* → waiting | completed | failed`，`cancelled` 也是终态。每个 Step 依次执行：Executor 返回 StepResult → Transition 写入最新 `lastStep` → Runner 为成功的 `wait/complete/fail` 生成规范化 assistant 消息 → GoalStore 保存；`continue` 保存后立即进入下一轮。Executor 异常转为无消息的 fail Step。

Runner 从 Goal 冻结的 executionPolicy 读取累计上限：正数达到后写入 `max_steps_exceeded`，不覆盖最近 Step、不追加消息；`0` 不限制连续 Step 数量。

## 错误与不变量

- Goal 不存在或 `runId` 不匹配：返回 `RUN_NOT_FOUND`，不执行、不保存。
- Goal 没有匹配等待点、文本为空或 action 不匹配：返回 `GOAL_NOT_WAITING` 或 `INVALID_GOAL_INPUT`，无副作用。
- PreparationResult 与当前 phase 不匹配：返回 `INVALID_PHASE_RESULT`，不追加消息、不保存。
- Executor 异常：转换为一次持久化的 `fail` Step。
- Store I/O 或协议错误：原样向调用方传播。
- GoalStore 按 `schemaVersion` 严格解码；v2 校验 workflow/Run 不变量，合法 v1 只读迁移为 v2，未知版本或损坏快照报协议错误。
- `JsonFileGoalStore` 恢复 v1 时不改写文件；下一次显式保存才以 v2 原子替换。并发写入仍是最后替换者覆盖。

## 当前限制与背景

一个 Goal 只有一个当前 Run；`InlineScheduler` 没有队列、租约或自动重启扫描。当前不提供并发恢复保护、消息裁剪或上下文压缩。当前演进设计见 [Goal Preparation Workflow Spec](../../specs/goal-preparation-workflow/design.md)。
