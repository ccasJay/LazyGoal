# Implementation Plan

- [x] //TODO 1. 分离 AgentProfile 的 Runtime 契约与 Storage Adapter

  - 在 Runtime 保留 `AgentProfile`、`AgentProfileStore` 与 Registry 契约，在新建的 `@lazygoal/storage` 中实现 Profile 文件 DTO、Schema、错误与 JSON Store
  - 迁移 Launcher、TUI 与测试调用方，覆盖合法配置、缺失/损坏配置和未注册 Tool 不创建 Snapshot 的行为
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 2. 将 Goal 持久化实现迁移到 Storage package

  - 在 Runtime 仅保留 `GoalStore`、`GoalCatalog` 与 Checkpoint Gate Port/Decorator，把 Snapshot 类型、Schema、错误、Catalog 和内存/文件 Store 迁入 `@lazygoal/storage`
  - 更新 package 公开入口与 TUI Composition Root，并用现有 Store 测试确保迁移阶段行为连续
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 3. 建立纯 Runtime Goal 与严格 v3 Snapshot Codec

  - 从 Runtime `Goal` 移除 Snapshot metadata，并为 Storage v3 声明独立 DTO、Schema 与 `GoalSnapshotCodec`
  - 实现 Runtime↔Snapshot 的深复制转换，只接受非 Legacy v3，使用协议错误拒绝 v1、v2 与 Legacy v3 且不写回原文件
  - 添加 Codec round-trip、对象隔离、旧版本拒绝与 Runtime State 完整性测试
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 4. 让所有 Goal Store 通过 Codec 保存和恢复

  - 使内存与 JSON Store 在 `save` 时 encode、在 `restore` 时 decode，并保持严格字段与跨字段不变量校验
  - 迁移并补充非法结构、未知版本、原子替换、临时文件清理、文件系统错误和跨进程恢复测试
  - _Requirements: [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 5. 删除 Legacy 执行协议并统一当前 AgentDecision 路径

  - 删除 Runtime 与 Agent 中的 `StepResult`、`LegacyStepExecutor`、`legacy StepRecord`、旧 `RunInput.step`、overload 和旧响应 Schema 导出
  - 简化 Runner 为单一 `AgentDecision` 路径，并按 Design 规范化非协议 Executor 异常，同时保持协议错误与取消传播
  - 更新 Transition、Runner 与 Coordinator 测试，验证等价输入的状态、Step 计数、终态原因和阶段所有权
  - _Requirements: [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5), [7.1](./requirements.md#req-7-1)_

- [ ] //TODO 6. 实现独立 ModelInferenceView 与 Runtime Projector

  - 在 Agent 声明不导入 Runtime 的 Profile、Conversation、Working Context、Step、Pending Action 与 Tool View DTO
  - 实现逐字段复制的 Projector，按阶段投影完整推理输入并排除 Snapshot、迁移数据和瞬时执行资源
  - 添加字段覆盖、对象隔离、状态不变和跨 View 泄漏测试
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

- [ ] //TODO 7. 通过 LLM View 渲染请求并解析领域输入

  - 实现只依赖 View DTO 与 LLM 类型的纯 Renderer，并让 Preparation/Step Builder 组合 Projector 与 Renderer
  - 保留严格响应解析后显式构造 `PreparationResult` 或 `AgentDecision` 的边界，移除模型类型向 Runtime 的隐式透传
  - 为每个 phase 添加字符级请求 fixture 与 Executor 测试，固定消息角色、内容、顺序和单次 Adapter 调用
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.5](./requirements.md#req-4-5)_

- [ ] //TODO 8. 收紧 package 依赖并完成应用组合

  - 更新 TUI/CLI 组合，使具体 Store 仅从 Storage 导入，Runtime 不反向加载 Storage 或 Agent
  - 添加自动化依赖边界检查，验证 View DTO/Renderer、Storage DTO/Schema 及转换模块的允许依赖方向
  - 扩展 TUI 集成测试，覆盖启动、创建、恢复和继续 Goal 的既有可见结果与错误
  - _Requirements: [1.3](./requirements.md#req-1-3), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 9. 验证 Action/Observation 持久化与恢复回归

  - 用自动化集成测试覆盖 Preparation、批准、Executing、Tool 决策和终态的完整链路
  - 断言 `pendingAction` 保存、Tool 执行、Observation 保存的顺序，以及中断后的原 `actionId`、safe/manual 重放和瞬时授权行为
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_
