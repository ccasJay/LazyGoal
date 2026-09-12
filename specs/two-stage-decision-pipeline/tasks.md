# Implementation Plan

- [x] //TODO 1. 扩展 Trajectory 事件载荷与可观测性支持思考链

  - 实现目标：在 `packages/runtime/src/trajectory.ts` 的事件类型中支持记录思考链（CoT），并确保存储持久化与 TUI 检查器能正确解析与展示。
  - 成功判据：携带思考链的决策事件能正常持久化和还原；历史未携带思考链的事件优雅缺省，TUI 渲染无异常。
  - 验证方式：待实现的 `packages/runtime/test/trajectory-thought.test.ts` 单元测试与 TUI Inspector 渲染测试。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 2. 扩展输出模式配置与思考文本 Token 预算防护

  - 实现目标：在 `packages/llm/src/config.ts` 中增加 `two_stage` 结构化输出模式，并在 Agent 提示词装配层实现思考文本的 Token 预算计算与安全截断。
  - 成功判据：`LLM_STRUCTURED_OUTPUT_MODE=two_stage` 正常解析；超长思考文本在注入第二阶段前被有界截断并保留截断标记；既有 `strict` 和 `prompt_only` 模式解析行为保持不变。
  - 验证方式：待实现的配置单元测试与提示词预算裁剪单测。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 3. 实现 Agent 执行阶段同模型两阶段调度流水线

  - 实现目标：在 `packages/agent` 中实现两阶段决策执行器，在单个决策步内串行执行无约束自由思考请求（捕获 CoT）与挂载 strict Schema 的强结构化决策提取，并严密传递取消信号与错误。
  - 成功判据：模拟 LLM 成功完成 Stage 1 思考捕获与 Stage 2 结构化提取；返回类型安全的 `AgentDecision`；取消信号在任一阶段触发均能立即抛出 `ExecutionAbortedError`。
  - 验证方式：待实现的 `packages/agent/test/two-stage-executor.test.ts` 单元测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4)_

- [ ] //TODO 4. 适配 Preparation 阶段并完成全量回归验证

  - 实现目标：将两阶段调度扩展至 `gathering_context` 与 `planning` 阶段，确保准备阶段动作符合对应分支契约，并在运行时层完成全链路贯通。
  - 成功判据：准备阶段在 `two_stage` 模式下先思考后输出合规分支动作；运行现有的全量回归测试套件全部通过。
  - 验证方式：待实现的 preparation 两阶段单测，并运行 `npm test` 验证全量回归。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2) | 执行阶段单步决策自动串联自由思考与严格抽取两次调用 | `packages/agent/test/two-stage-executor.test.ts`（待实现） |
| [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4) | 第二阶段输出合规决策动作；异常与取消信号立即终止 | `packages/agent/test/two-stage-executor.test.ts`（待实现） |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2) | 准备阶段在两阶段模式下生成符合阶段分支的动作 | 准备阶段两阶段单元测试（待实现） |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3) | 思考链记录入轨并在 TUI 中展示，无思考链时优雅缺省 | `packages/runtime/test/trajectory-thought.test.ts`（待实现） |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2) | 思考文本计入预算，超长时执行安全截断并打上标记 | 预算裁剪单元测试（待实现） |
| [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2) | 显式配置 two_stage 激活流水线，单阶段配置完全兼容 | 配置测试与既有集成测试（待实现） |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
