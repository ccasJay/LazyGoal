# Implementation Plan

- [ ] //TODO 1. 系统决策动作函数化与 Contract AST 映射
  - 实现目标：在 `@lazygoal/contracts` 中定义全阶段系统函数（`system_complete_task`、`system_wait_for_input`、`system_fail_goal`、`system_ask_clarification`、`system_context_ready`、`system_propose_task_plan`、`system_probe_action`、`system_context_lookup`），支持从阶段契约导出原生 Function Calling 参数 Schema 并通过 AST 严格反序列化
  - 成功判据：内置函数参数生成合规 JSON Schema，非法参数输入返回带精确定位路径的 ContractValidationError，合法输入确定性解码为领域动作对象
  - 验证方式：`npx tsx --test packages/contracts/test/system-tools.test.ts`（待实现）
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 2. LLM 双通道交互协议与多厂商原生 Function Calling 适配
  - 实现目标：重构 `LLMRequest` 与 `LLMResponse` 引入 `tools`、`toolChoice: "required"` 与 `toolCalls`，在 OpenAICompatible、Gemini 与 PiAi 适配器中实现厂商原生 Function Calling 映射与思考文本无损捕获
  - 成功判据：OpenAI 挂载 `tools` 与 `strict: true`，Gemini 挂载 `functionDeclarations` 与 `ANY` 模式；单次调用同时返回自然语言思考文本与符合定义的工具调用，原生思考模型无损捕获且不产生重复推演
  - 验证方式：`npx tsx --test packages/llm/test/native-tool-calling.test.ts`（待实现）与既有 LLM 测试
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 3. Agent 单步执行器归一与 1 RTT 执行流重构
  - 实现目标：重构 `LLMStepExecutor` 与 `LLMPreparationExecutor`，彻底删除两阶段执行器，统一在单次网络往返（1 RTT）内完成思考接收、工具参数解码与 `AgentDecision` / `PreparationResult` 领域映射
  - 成功判据：单步推进严格发起且仅发起 1 次模型调用；模型缺失工具调用时抛出确定性协议异常；合法工具调用直接完成校验并流转至 Coordinator
  - 验证方式：`npx tsx --test packages/agent/test/native-step-executor.test.ts`（待实现）
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4)_

- [ ] //TODO 4. 思考流实时接入 TUI Transcript 与 Trajectory 审计入轨
  - 实现目标：将模型文本通道输出的思考内容直接接入 TUI 流式 Transcript 控制器进行终端渲染，并将完整思考文本持久化为 Trajectory 决策事件属性
  - 成功判据：TUI 在单步推进中流畅显示思维推演过程，随后弹出动作审批抽屉；轨迹事件正确保留 `thought` 字段且快照回放完全兼容历史数据
  - 验证方式：`npx tsx --test packages/tui/test/transcript-thinking-flow.test.ts`（待实现）与 `npx tsx --test packages/runtime/test/trajectory.test.ts`
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 5. 废除 structured_output_mode 显式配置与模式分支去重
  - 实现目标：从 `config.toml`、CLI 解析、环境校验与 Goal 快照 Schema 中彻底移除 `structured_output_mode` 枚举与依赖，清理多余模式判断分支
  - 成功判据：省略该配置项即可成功加载并运行；旧快照不包含该字段或包含历史值均能平滑加载，不再抛出模式不匹配错误
  - 验证方式：`npx tsx --test packages/llm/test/config-loader.test.ts` 与 `npx tsx --test packages/storage/test/goal-snapshot-current.test.ts`
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 6. 端到端集成验证与 Benchmark 回归测试
  - 实现目标：在无头基准环境与全量回归套件中验证 1 RTT 原生双通道调用的稳定执行与吞吐表现
  - 成功判据：仓库全部 1120+ 项单元与集成测试绿灯通过；ALFWorld 与 SWE-bench 无头评测在原生工具调用下正确运行且单步请求数减半
  - 验证方式：`npm test` 全量回归与基准轻量烟测
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1), [5.1](./requirements.md#req-5-1)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) - [1.4](./requirements.md#req-1-4) | 单步同时声明文本与工具通道，1 次调用完成思考与动作解码；缺失动作抛出协议异常 | 适配器与执行器单测（待实现） |
| [2.1](./requirements.md#req-2-1) - [2.4](./requirements.md#req-2-4) | 执行阶段与准备阶段所有状态决策映射为系统工具，AST 确定性校验与解码 | 契约单元测试（待实现） |
| [3.1](./requirements.md#req-3-1) - [3.4](./requirements.md#req-3-4) | OpenAI 与 Gemini 分别通过官方原生 tools 与 functionDeclarations 正确完成调用 | Provider 契约集成测试（待实现） |
| [4.1](./requirements.md#req-4-1) - [4.3](./requirements.md#req-4-3) | 思考文本实时上屏并在 Trajectory 中持久化，支持兼容回放 | TUI 与轨迹回放测试（待实现） |
| [5.1](./requirements.md#req-5-1) - [5.3](./requirements.md#req-5-3) | 移除 structured_output_mode 显式配置，开箱即用无报错 | 配置解析与快照测试 |
| 整体回归 | 全量 1120+ 项单元测试全部绿灯通过，ALFWorld / SWE-bench 评测管道稳定 | `npm test` 全量回归 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
