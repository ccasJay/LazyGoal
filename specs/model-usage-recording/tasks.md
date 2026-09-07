# 模型用量记录 实施计划

- [ ] //TODO 1. Adapter 提取归一化 usage

  - 实现目标:`openai-compatible.ts` 从 `response.usage`(含 `prompt_tokens_details` 缓存字段)提取,`gemini.ts` 按其 SDK 响应用量结构映射,统一写入 `providerMetadata.usage: { inputTokens, outputTokens, cachedInputTokens? }`;非有限非负数与缺失 usage 整体缺省;失败/中止路径无响应不产生 usage
  - 成功判据:构造带/不带 usage 的响应对象断言归一化与缺省;现有 llm 测试全部通过
  - 验证方式:待实现用例加入 `packages/llm/test/`
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [ ] //TODO 2. trace 落盘验证

  - 实现目标:确认 `recordLlmResponse` 透传 `providerMetadata.usage` 进 `model_response` trace 记录(预期零代码改动,补用例锁定行为);sink 异常不影响执行结果的既有语义回归
  - 成功判据:带 usage 的响应 trace payload 含归一化字段,缺失时不含;trace 相关现有测试通过
  - 验证方式:待实现用例加入 `packages/agent/test/`
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2)_

- [ ] //TODO 3. HeadlessCompositionRoot 用量累计

  - 实现目标:`benchmarks/src/headless-composition-root.ts` 在每次 executor 调用后读取响应 `providerMetadata.usage` 累计 run 级状态(inputTokens/outputTokens 求和、无 usage 计 missingCalls、非安全整数防护),run 结束并入返回的 model 事实
  - 成功判据:模拟多次调用(部分带 usage、部分缺失)断言累计值与 missingCalls;模型 fail/异常路径不累计
  - 验证方式:待实现用例加入 `benchmarks/test/`
  - _Requirements: [1.3](./requirements.md#req-1-3)_

- [ ] //TODO 4. ALFWorld 报告用量字段

  - 实现目标:`report.ts` 的 `EpisodeModelFacts` 新增可选 `usage` 并经 `createEpisodeAttempt` 透传到 attempt;`aggregateEvaluationReport` 顶层只对已存在用量求和;旧形态 facts(无 usage)记全量缺失
  - 成功判据:报告 JSON 每尝试含聚合用量或缺失计数;缺失不产生 0 值;现有报告测试回归
  - 验证方式:待实现用例加入 `benchmarks/alfworld/test/`
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [ ] //TODO 5. TSDoc 更新与全量回归

  - 实现目标:更新 `LLMResponse.providerMetadata` TSDoc(usage 归一化形态与缺失语义)、`EpisodeModelFacts` 用量字段契约;运行 llm/agent/benchmarks 相关全部测试
  - 成功判据:TSDoc 与实现一致;相关测试目录全部通过
  - 验证方式:`npx tsx --test packages/llm/test/*.test.ts packages/agent/test/*.test.ts benchmarks/alfworld/test/*.test.ts benchmarks/test/*.test.ts`(llm smoke 不在默认回归,单独人工执行)
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.2](./requirements.md#req-2-2)_

## Feature Verification

风险依据:[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 响应带 usage 时 providerMetadata 含归一化 token 数与缓存字段 | Adapter 单测(待实现,TODO 1) |
| [1.2](./requirements.md#req-1-2) | usage 缺失时字段缺省,无 0 值 | Adapter 单测(待实现,TODO 1) |
| [1.3](./requirements.md#req-1-3) | 失败/中止调用不记用量 | 累计单测异常路径(待实现,TODO 3) |
| [2.1](./requirements.md#req-2-1) | trace 逐调用含 usage,结构不变 | trace 用例(待实现,TODO 2) |
| [2.2](./requirements.md#req-2-2) | trace 写失败不影响执行结果 | 现有 trace 异常用例回归(TODO 2) |
| [3.1](./requirements.md#req-3-1) | 报告每尝试含聚合用量与缺失计数 | 报告单测(待实现,TODO 4) |
| [3.2](./requirements.md#req-3-2) | 缺失调用不贡献 0,保留缺失计数 | 报告单测缺失路径(待实现,TODO 4) |
| [3.3](./requirements.md#req-3-3) | 重试尝试独立聚合 | 报告单测多尝试用例(待实现,TODO 4) |
| 真实环境复核 | CLIProxyAPI 一次调用后 trace 的 usage 与 curl 实测形态一致 | 人工检查 `llm:agent-smoke` 的 trace 文件(Feature Verification 时执行;curl 已于 2026-09-07 验证 proxy 转发 usage) |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。
