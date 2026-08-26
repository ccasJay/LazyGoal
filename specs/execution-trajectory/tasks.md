# Implementation Plan

- [x] //TODO 1. 定义 Runtime 的 Trajectory 与 Diagnostic Trace 契约

  - 在 `packages/runtime/src/trajectory.ts` 新增 Domain Event payload、事件 Envelope、`TrajectorySink`、`TrajectoryStore`、`DiagnosticTraceSink` 和只读分类/投影边界，并从 Runtime 公共入口导出。
  - 实现事件 draft 校验、不可变返回值、稳定错误码和 no-op recorder；为新增公共接口补充中文契约 TSDoc 与最小 `@example`。
  - 增加 Runtime 单元测试，覆盖事实 payload 不携带派生状态、事件 metadata 校验和诊断通道分离。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1), [8.1](./requirements.md#req-8-1)_

- [x] //TODO 2. 将 Domain Event 接入 GoalCoordinator 与 Runner 生命周期

  - 为 `RunState` 和 Snapshot 内部状态增加 `committedThroughSequence`，由 Runtime 在一次执行单元开始时生成并贯穿 decision、Action、Tool、Observation 和提交事件。
  - 在 Preparation、Executing、Action 审批/拒绝/恢复和终态转换处按设计顺序追加 Domain Event；保存 Snapshot 前更新提交边界，保存成功后追加 `state_committed`。
  - 增加 Runner/Coordinator 集成测试，验证正常事件顺序、`executionUnitId`/`actionId` 关联以及事件发生后才产生对应外部效果。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1), [3.5](./requirements.md#req-3-5)_

- [x] //TODO 3. 实现 Domain Event 追加失败和不完整 Tool 周期处理

  - 在 Runner/Coordinator 中接入 fail-closed 追加语义：前置事实写入失败时停止后续状态转换或 Tool 调用，不产生新的 Snapshot 提交。
  - 覆盖 Tool 中止、抛错、无返回结果、Observation 追加失败和 `state_committed` marker 追加失败，保持既有 pending Action 恢复边界并将不可回滚缺口写入 Diagnostic Trace。
  - 使用可注入失败 Sink 增加单元测试，确认不伪造 `tool_finished`/成功 Observation，且已有事实不会被回写或删除。
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 4. 扩展 Goal Snapshot Codec 到提交边界协议

  - 在 `packages/storage` 增加 Snapshot v6 DTO、Schema、Codec 编解码和 `committedThroughSequence` 跨字段校验；v5 快照读取映射为 `0`，不修改原文件，v1 至 v4 继续拒绝。
  - 更新 Runtime/Storage 类型导出与快照构造 fixture，保持 `GoalStore` 原子替换、旧 Action/Observation 和 Profile 冻结语义。
  - 增加编解码、旧快照兼容、边界保存和 marker 缺失测试。
  - _Requirements: [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.3](./requirements.md#req-4-3), [7.1](./requirements.md#req-7-1), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 5. 实现 JsonFileTrajectoryStore 与提交边界查询

  - 在 `packages/storage` 实现 `.lazygoal/trajectories/<goal>/<run>.jsonl` 的安全路径、串行追加、事件序列分配、严格读取和范围查询。
  - 提供基于 Goal Snapshot `committedThroughSequence` 的 committed/uncommitted tail 分类，不以 `state_committed` marker 推导边界；缺少轨迹文件时返回空结果。
  - 增加 JSONL、单调序列、非法事件、安全路径、空文件和 tail 分类测试。
  - _Requirements: [2.3](./requirements.md#req-2-3), [3.2](./requirements.md#req-3-2), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 6. 接入 Diagnostic Trace 和 Agent 调用诊断

  - 为 `LLMStepExecutor`、`LLMPreparationExecutor` 和 Composition Root 注入可选 `TraceSink`，记录模型请求/响应、Provider metadata、耗时和异常，并应用脱敏与大小策略。
  - 保证模型原始内容只进入 Diagnostic Trace，不进入 Domain Event；TraceSink 缺失或写入失败不改变 Snapshot、Trajectory 和现有最终报告输出。
  - 增加 Agent、TUI Composition Root 和 CLI 兼容测试，覆盖 Trace 故障隔离及现有机器可读报告边界。
  - _Requirements: [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 7. 接入 Trajectory 只读消费者与 Context Adapter

  - 在 TUI/Report 读取入口暴露按 Goal、Run 和 sequence 查询的不可变 Domain Events，并展示执行单元、Action、Tool、Observation 关联及未提交 tail。
  - 在 `packages/agent` 增加 `TrajectoryContextUnitAdapter`，将事件投影为 `ContextUnit`，不修改 Runtime、Snapshot 或原始事件，也不自动注入当前 Prompt。
  - 增加消费者投影和 Adapter 单元测试，验证读写职责分离与稳定顺序。
  - _Requirements: [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 8. 固化未来 Outbox 边界并完成全量回归

  - 在 Trajectory 契约或相关实现处保留 `TODO(trajectory-durable-outbox)`，明确当前不实现异步 Outbox、事件重试、exactly-once 或 Trajectory replay 恢复。
  - 增加跨 Runtime、Storage、Agent、TUI 的集成回归，确认缺失 Trajectory 的旧 Goal、no-op recorder、Snapshot 恢复、Action replay 和最终报告均保持兼容。
  - 运行各 package typecheck、单元/集成测试、依赖边界检查和 `git diff --check`，修复本特性引入的回归。
  - _Requirements: [4.4](./requirements.md#req-4-4), [7.1](./requirements.md#req-7-1), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_
