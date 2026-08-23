# Implementation Plan

- [x] //TODO 1. 建立中立 ContextUnit 协议与 Conversation Adapter

  - 在 `packages/agent` 新增带完整中文契约 TSDoc 和示例的 `ContextUnit`、`ContextUnitAdapter`，实现 Conversation 分组、字符计数与按原顺序展开
  - 保留 `TODO(trajectory-context-adapter)` 注释，并确保协议不依赖 Runtime、Storage 或 Trajectory 类型
  - 添加 Adapter 单元测试，覆盖空会话、前导 assistant、连续 user、多 assistant、顺序和输入不可变
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.5](./requirements.md#req-1-5), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1)_

- [x] //TODO 2. 实现异步丢弃式 ContextCompactor

  - 在 `packages/agent` 声明异步 `ContextCompactor` 契约、默认预算常量和 `DropOldestContextCompactor`，校验正安全整数预算并支持 `AbortSignal`
  - 实现连续新单元后缀选择，并保留 `TODO(model-context-summary)` 注释，不生成摘要或修改输入
  - 添加精确边界、停止跳选、最新单元超限、确定性、异步返回和非法构造预算测试
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.3](./requirements.md#req-2-3), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 3. 将裁剪接入异步请求构造与两个 LLM Executor

  - 将 `buildPreparationRequest`、`buildStepRequest` 改为 Projector → Adapter → await Compactor → Renderer，并只在新 View 中替换 Conversation
  - 扩展两个 Executor 的依赖与中止检查，注入同一 Compactor、透传 `AbortSignal`，裁剪失败或中止时禁止调用业务 `LLMAdapter`
  - 更新三个 phase 的请求与 Executor 测试，验证 system、PromptContext、Authorized Tools、Working Context 和 `pendingAction` 不受裁剪影响，默认流程不增加 LLM 调用
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 4. 在 Composition Root 解析预算并共享注入默认 Compactor

  - 在 TUI 配置边界新增默认值/环境覆盖解析与 `ConversationBudgetConfigurationError`，在任何工作区、Profile、Store 或 Goal 操作前完成校验
  - Composition Root 创建一次 `DropOldestContextCompactor` 并注入 Preparation 与 Step Executor，同时导出必要的公共类型和常量
  - 扩展 CLI 自动化测试，覆盖默认、空白、合法覆盖、零、负数、小数、指数、非数字和超安全整数，以及非法配置无文件副作用
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 5. 补齐持久化恢复与执行协议回归验证

  - 更新受异步 Builder 和 Executor 依赖影响的现有测试与 smoke test，保持严格 PreparationResult/AgentDecision 解析行为
  - 增加保存恢复与跨进程自动化测试，确认 Snapshot v5 仍保存完整消息且每轮从完整历史确定性重新裁剪
  - 回归 Action 审批、中断、Observation、wait/resume、终态、Step 计数、Tool 授权和 Action 重放，并运行类型、依赖边界及相关 package 测试
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5), [5.4](./requirements.md#req-5-4), [5.5](./requirements.md#req-5-5)_
