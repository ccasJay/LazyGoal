# Implementation Plan

- [x] //TODO 1. 建立 Goal 聚合数据模型并完成启动边界迁移

  - 在 Runtime Domain 中定义 `GoalMetadata`、`GoalTask`、`GoalMessage`、完整 `Goal`、精简后的 `RunState` 与 `RunRef`，并提供确定性的初始聚合创建函数。
  - 更新 Launcher 与公共导出，使其冻结 Profile、保留初始 messages、生成独立 `runId`，并返回 `goalId` 与现有执行结果。
  - 增加 Domain 与 Launcher 测试，覆盖身份独立性、完整字段和 JSON round-trip，并保持 Transition 行为测试可用。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 2. 实现 Goal 快照 Schema 与内存 GoalStore

  - 为 Runtime 增加 Zod 4 直接依赖，定义严格的 `GoalSnapshotSchema`、`GoalStore` 和 `InMemoryGoalStore`，保存与恢复时执行校验及克隆隔离。
  - 替换现有 `RunStore` 公共边界，使同一 `goalId` 的保存只覆盖最新完整 Goal，未找到时返回 `undefined`。
  - 增加 Schema 与内存 Store 测试，覆盖最新快照、Profile/messages 顺序、额外字段拒绝和无恢复副作用。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 3. 迁移 Runner 与 Scheduler 以推进完整 Goal

  - 将 `StepExecutor` 扩展为返回 `StepExecutionResult`，让 Runner 通过 `RunRef` 加载 Goal、校验 `runId`、推进 `goal.run`、追加 messages 并保存完整聚合。
  - 更新 `RunScheduler` 与 `InlineScheduler` 转发 `RunRef`，保留现有同步执行、等待、终态、步数上限和非法转换语义。
  - 更新 Runtime 单元测试，验证 `goalId`/`runId` 校验、状态转换回归以及下一 Step 前已成功保存最新 Goal。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 4. 验证恢复后的 Run 生命周期与持久化顺序

  - 使用 `InMemoryGoalStore` 构造已保存的 `created`、`running`、`waiting` 和终态 Goal，验证 Runner 从恢复点继续、显式 resume 和终态短路。
  - 覆盖恢复后的累计 `stepCount`、`maxSteps`、Executor 异常与保存失败，确认已完成 Step 不会重放且保存失败后不继续执行。
  - 保持现有 Runtime 回归测试全部通过。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [6.1](./requirements.md#req-6-1)_

- [x] //TODO 5. 让 LLM Step 使用并追加 Goal messages

  - 修改 Prompt Builder 与 `LLMStepExecutor` 接收完整 Goal，将冻结 Profile、已有 messages 和本轮 Run 上下文构造成模型请求。
  - 合法响应返回既有 `StepResult` 以及本轮 user/assistant messages；Tool、协议错误和 Adapter 异常继续保持现有错误语义。
  - 更新 Agent 测试，验证恢复历史的顺序、追加内容、输入不变性及 Runner 保存后的完整 Goal。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 6. 实现可跨实例恢复的 JsonFileGoalStore

  - 新增可配置目录的 `JsonFileGoalStore`，使用 `goalId` 的 `base64url` 文件名，并通过同目录临时文件、刷新和替换保存一个最新 JSON 快照。
  - 恢复时执行 JSON 解析、严格 Schema 校验和文件内 `goalId` 核对；文件不存在只返回 `undefined`。
  - 在临时目录测试首次保存、覆盖、新 Store 实例恢复、路径安全、完整字段与只返回最新快照。
  - _Requirements: [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 7. 完成持久化协议与文件系统错误边界

  - 实现带稳定 `INVALID_GOAL_SNAPSHOT` code 的 `GoalSnapshotProtocolError`，统一表达非法 JSON、Schema 不匹配和快照 ID 不一致。
  - 保持其他文件系统错误原样传播，并在写入或替换失败时清理临时文件且阻止 Runner 后续执行。
  - 增加损坏快照、ID 不匹配、读写失败和未伪造成功结果的自动化测试。
  - _Requirements: [1.4](./requirements.md#req-1-4), [3.4](./requirements.md#req-3-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 8. 增加跨进程恢复与全链路回归验证

  - 使用独立 `tsx` 子进程在同一临时目录分别保存和恢复 Goal，比较 metadata、任务、Profile、messages 与 Run 状态。
  - 以恢复出的 Goal 驱动 Runner 继续执行，验证 `runId`、累计步数、waiting/resume 和最新快照持久化。
  - 执行 TypeScript 检查、Runtime 与 Agent 全量测试，确保不访问网络、真实 LLM 或真实 Tool。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.2](./requirements.md#req-4-2), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_
