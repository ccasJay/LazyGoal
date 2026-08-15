# Runtime 模块

## 摘要

Runtime 是 Agent 的控制平面：拥有 Goal/Run 领域状态、状态机、启动和恢复流程，以及最新快照持久化。它不构造 Prompt，也不知道模型供应商。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal、Run、StepResult、RunRef | I/O 和模型调用 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 冻结 Profile、创建 Goal、先保存后调度 | 执行 Step |
| [Runner](../../packages/runtime/src/runner.ts) | 恢复、转换、追加消息、逐步保存 | 解析模型协议 |
| [Transition](../../packages/runtime/src/transition.ts) | 纯函数式 Run 状态转换 | 持久化 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新完整 Goal | 历史与事件查询 |
| [Scheduler](../../packages/runtime/src/scheduler.ts) | 按 RunRef 发起执行 | 拥有 Goal 数据 |

## 生命周期与保存顺序

`created → running → continue* → waiting/resume | completed | failed`，`cancelled` 也是终态。每个 Step 依次执行：Executor 返回结果 → Transition 推进 Run → 追加消息 → GoalStore 保存。保存失败时停止，不执行下一 Step；`stepCount` 跨恢复累计，`maxSteps` 不会因 resume 重置。

## 错误与不变量

- Goal 不存在或 `runId` 不匹配：返回 `RUN_NOT_FOUND`，不执行、不保存。
- 非 waiting Run 调用 resume：返回 `RUN_NOT_WAITING`。
- Executor 异常：转换为一次持久化的 `fail` Step。
- Store I/O 或协议错误：原样向调用方传播。
- `JsonFileGoalStore` 使用单文件最新快照；并发写入是最后替换者覆盖。

## 当前限制与背景

一个 Goal 只有一个当前 Run；`InlineScheduler` 没有队列、租约或自动重启扫描。持久化设计背景见 [Goal Session Spec](../../specs/goal-session-persistence/design.md)。

