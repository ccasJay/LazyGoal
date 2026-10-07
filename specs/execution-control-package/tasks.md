# 执行控制协议拆包任务

- [ ] //TODO 1. 拆出共享取消协议并迁移现有调用链

  - 实现目标：建立 `@lazygoal/execution-control` 的单一取消类型来源，迁移 Runtime、Agent、LLM、Tools、Browser、Benchmark 与测试／smoke 的现有取消导入；移除已迁出符号的旧导出和实现，更新所需依赖规则。
  - 成功判据：已中止信号在模型、Agent、Tool 和 Runner 边界仍被识别并阻止后续调用；中止不新增业务失败或 Goal 快照，所有调用方使用同一错误类。
  - 验证方式：`npx tsc --noEmit`；`npx tsx --test packages/runtime/test/execution-control.test.ts packages/agent/test/execution-control.test.ts packages/llm/test/execution-control.test.ts packages/tools/test/bash.test.ts`；针对新包公共原语补充测试（待实现）。
  - _Requirements: [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2)_

- [ ] //TODO 2. 拆出暂时性模型故障协议并封闭 LLM 依赖边界

  - 实现目标：将暂时性模型故障类型迁入共享包，保持 Runtime 的尝试摘要与耗尽错误归属；让 LLM 的 `JsonValue` 取自 `contracts`，迁移剩余调用方，并在依赖规则中禁止 `llm → runtime`。
  - 成功判据：LLM 生产源码无 Runtime 导入，反向导入被边界检查拒绝；已识别故障仍按现有上限和退避重试，取消、非暂时错误与结构化纠错保持原行为。
  - 验证方式：`npx tsc --noEmit`、`npm run check:dependencies`、`node --test scripts/check-dependencies.test.mjs`；`npx tsx --test packages/llm/test/model-request-failure.test.ts packages/runtime/test/runner.test.ts packages/agent/test/llm-step-executor.test.ts`；反向导入负向测试（待实现）。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1) | LLM 所有生产导入均不指向 Runtime。 | `npm run check:dependencies`、源码导入检查与 `npx tsc --noEmit`。 |
| [1.2](./requirements.md#req-1-2) | 在 LLM 源码中构造反向导入会得到边界违规。 | `scripts/check-dependencies.test.mjs` 的负向用例（待实现）。 |
| [1.3](./requirements.md#req-1-3) | Runtime 与适配器取得同一错误类；旧路径没有第二份实现或转发导出。 | 新包公共入口测试（待实现）、跨包 `instanceof` 测试、导出检查。 |
| [2.1](./requirements.md#req-2-1) | 在各调用阶段中止后，不继续模型或 Tool 调用，错误仍被识别为中止。 | Runtime、Agent、LLM、Tools 取消测试及跨层集成测试。 |
| [2.2](./requirements.md#req-2-2) | 中止不产生新的业务失败提交；进程退出语义保持不变。 | Runtime 取消／恢复测试与现有退出路径测试。 |
| [3.1](./requirements.md#req-3-1) | 已分类的暂时故障有界重试、退避可中止，稳定摘要被记录；原始 Provider 异常不进入模型输入。 | LLM 故障分类、Runner 重试及 Agent 输入测试。 |
| [3.2](./requirements.md#req-3-2) | 输出校验失败仍先提交有界反馈，再在原阶段纠正；反馈无原始输出。 | Runner 阶段纠错与 Agent 测试。 |
| [3.3](./requirements.md#req-3-3) | 鉴权、配置、存储与未知错误不自动重试，也不作为原始异常发给模型。 | LLM/Runner 失败路径测试。 |
| 跨包集成与仓库约束 | 全部确定性回归通过；仓库布局和当前架构文档与已实现依赖方向一致。 | `npm test`；检查 `AGENTS.md`、`docs/architecture/README.md`、`docs/architecture/runtime.md`、`docs/architecture/llm.md`。 |

### Latest Result

未执行。实施后按 `delivery-loop.md` 记录逐项证据、整体状态、时效、时间及被测代码状态。
