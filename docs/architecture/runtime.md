# Runtime 模块

## 摘要

Runtime 是 Agent 的控制平面：拥有 Goal/Run 领域状态、状态机、启动和恢复流程，以及最新快照持久化。它不构造 Prompt，也不知道模型供应商。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Preparation、Run、StepResult | I/O 和模型调用 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 冻结 Profile、创建 Goal、先保存后调度 | 执行 Step |
| [Runner](../../packages/runtime/src/runner.ts) | 恢复、转换、追加消息、逐步保存 | 解析模型协议 |
| [Transition](../../packages/runtime/src/transition.ts) | 纯函数式 Run 状态转换 | 持久化 |
| [GoalStore](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新完整 Goal | 历史与事件查询 |
| [Scheduler](../../packages/runtime/src/scheduler.ts) | 按 RunRef 发起执行 | 拥有 Goal 数据 |

## 生命周期与保存顺序

Goal v2 将创建后冻结的 intent、Profile、executionPolicy 放在 `definition`，将 workflow、真实 messages 和 Run 放在 `state`。新 Goal 从 `gathering_context/active` 与 `created/0` 开始；Preparation 不消费 Step，只有拥有最终 task 的 `executing` workflow 可进入 Runner。

Run 主流程为 `created → running → continue* → waiting/resume | completed | failed`，`cancelled` 也是终态。每个 Step 依次执行：Executor 返回结果 → Transition 写入最新 `lastStep` → 追加消息 → GoalStore 保存。上限终止使用独立 `stopReason`，不会覆盖最近 Step 事实。

## 错误与不变量

- Goal 不存在或 `runId` 不匹配：返回 `RUN_NOT_FOUND`，不执行、不保存。
- 非 waiting Run 调用 resume：返回 `RUN_NOT_WAITING`。
- Executor 异常：转换为一次持久化的 `fail` Step。
- Store I/O 或协议错误：原样向调用方传播。
- GoalStore 按 `schemaVersion` 严格解码；v2 校验 workflow/Run 不变量，合法 v1 只读迁移为 v2，未知版本或损坏快照报协议错误。
- `JsonFileGoalStore` 恢复 v1 时不改写文件；下一次显式保存才以 v2 原子替换。并发写入仍是最后替换者覆盖。

## 当前限制与背景

一个 Goal 只有一个当前 Run；`InlineScheduler` 没有队列、租约或自动重启扫描。旧 Launcher 暂时通过 deprecated 输入创建已准备的 executing Goal；Preparation 推进尚未接入。当前演进设计见 [Goal Preparation Workflow Spec](../../specs/goal-preparation-workflow/design.md)。
