# Goal-driven Workflow Prompt 实施计划

- [x] //TODO 1. 建立 version-aware Preparation ToolDefinition 输入边界

  - 提取 Runtime 授权 ToolDefinition 解析逻辑，扩展 `PreparationExecutor` 与 GoalCoordinator，使 active planning 接收冻结 Profile 与 ToolRegistry 的已注册交集。
  - 调整 `LLMPreparationExecutor` 和请求构造，仅让 v2 planning 投影调用方提供的 Tools，v1 与 gathering_context 保持空 Tools；补齐新增或扩展公共接口的中文契约级 TSDoc。
  - 增加 Runtime/Agent 单元测试，覆盖授权过滤、复制隔离、v1 空输入、解析失败无 LLM/消息/保存副作用。
  - _Requirements: [1.2](./requirements.md#req-1-2), [7.1](./requirements.md#req-7-1)_

- [ ] //TODO 2. 注册兼容 v1 的 v2 Global Prompt Bundle 骨架

  - 新增逐字一致的 `global-overview@2` 资产与 v2 Manifest，复用不可变 Profile/Authorized Tools 模板，并让默认 Renderer 同时注册 v1/v2；暂不切换新 Goal 的当前版本。
  - 保持全部 v1 资产与完整渲染字符不变，继续对未知版本在 Adapter 调用前失败且不回退。
  - 更新 Bundle/Renderer 自动化测试，覆盖版本隔离、指令优先级、事实输入边界、字符级确定性与 supported versions。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 3. 实现最小必要追问的 gathering_context v2 Protocol

  - 新增设计稿逐字内容的 `gathering-context@2` 资产并接入 v2 Manifest，保持现有严格 JSON 分支不变。
  - 增加字符级与关键行为命题测试，覆盖充分上下文、重大缺口、安全推断、单一聚焦问题和 Phase 禁止分支。
  - _Requirements: [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 4. 实现可执行任务契约的 planning v2 Protocol

  - 新增设计稿逐字内容的 `planning@2` 资产并接入 v2 Manifest，保持 `task_proposal` Schema 不变。
  - 增加字符级与关键行为命题测试，覆盖 objective 边界、可验证 criteria、非臆测实现、完整 approvalRequest 和 Phase 禁止分支。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5)_

- [ ] //TODO 5. 锁定 planning 与 Runtime 证据能力闭环

  - 增加 v2 planning 请求测试，证明 Prompt 接收实际 Authorized ToolDefinition，并以其可产生的 Observation 约束 completionCriteria。
  - 覆盖用户明确要求但 Runtime 无法取得的外部证据，断言 Prompt 要求在 criteria 与 approvalRequest 中显式保留依赖。
  - _Requirements: [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 6. 实现证据驱动 Action 闭环的 executing v2 Protocol

  - 新增设计稿逐字内容的 `agent-decision@2` 资产并接入 v2 Manifest，保持四分支 `AgentDecision` Schema 不变。
  - 增加字符级与关键行为命题测试，覆盖最小有效 Action、Observation 驱动、风险相称验证、Authorized Tool 限制和失败后的恢复路径。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [5.5](./requirements.md#req-5-5)_

- [ ] //TODO 7. 锁定逐项证据账本与终止决策契约

  - 扩充 executing Prompt 契约测试，证明 checkpoint 要逐项覆盖 completion criterion 的证据状态，并保留累计进度、关键证据和剩余工作。
  - 覆盖 `complete`、`wait`、`fail` 的适用条件及“存在可执行下一步时不得提前终止”的关键命题。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [6.5](./requirements.md#req-6-5)_

- [ ] //TODO 8. 激活 v2 并完成 Composition Root 与回归验证

  - 将 `CURRENT_PROMPT_BUNDLE_VERSION` 和默认 Manifest 切换为 v2，向 GoalCoordinator 与 Runner 注入同一 ToolRegistry，保持 Snapshot v5 不变。
  - 增加入口与恢复集成测试，覆盖新 Goal 冻结 v2、v2 三 Phase 路由、v2 planning/executing 能力一致及 v1 Goal 原字符恢复。
  - 运行相关 workspace 测试、完整测试套件、TypeScript 类型检查、依赖边界检查与 `git diff --check`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [7.1](./requirements.md#req-7-1)_
