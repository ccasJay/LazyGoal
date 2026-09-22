---
feature: model-usage-recording
status: active
summary: "模型 Token 用量归一化提取、Diagnostic Trace 落盘与按任务评测报告独立聚合，确立缺失用量的显式计数语义"
source_spec: specs/model-usage-recording/
distilled_at: 2026-09-21
reviewed_at: 2026-09-21
tags: [llm, usage, token, diagnostic-trace, benchmarks, reporting]
authorities: [docs/architecture/benchmarks.md, docs/architecture/llm.md, packages/llm/src/core/types.ts, benchmarks/src/headless-composition-root.ts, packages/agent/src/llm-diagnostic-trace.ts]
---

# Model Usage Recording

## Purpose

- 提取并归一化每次模型调用的实际 Token 用量，通过 Diagnostic Trace 落盘并在评测报告中按尝试独立聚合，使基准成功率与实际模型成本可精确对照。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 供应商用量归一化契约：在 Adapter 响应处将供应商用量统一归一化为 `providerMetadata.usage: { inputTokens, outputTokens, cachedInputTokens? }`，非负有限数方可记录，缺失时字段缺省。 [S1, S2, S5, S6]
- D2 — 用量随 Diagnostic Trace 零改动落盘：提取的用量随既有 `model_response` trace 记录落盘；脱敏规则保护用量数字字段不被凭据正则误杀；Trace 失败不影响执行结果。 [S1, S2, S5, S8]
- D3 — 执行路径 run 级内存累计：`HeadlessCompositionRoot` 在单次 `run()` 内累计用量与缺失调用，用量不进入 Domain Event、Goal Snapshot 或模型上下文。 [S1, S2, S4, S7]
- D4 — 诚实缺失语义：未提供用量的调用显式增加 `missingCalls` 计数，不向 Token 总数贡献任何值（包括 0），报告仅对已存在数值求和。 [S1, S2, S4, S7]

## Guardrails

- 严禁以 0 或估算值替代未返回的真实 Token 用量。 [S1, S2, S6, S7]
- 用量数据属于审计与评测事实，不得作为改变 Runtime 领域状态转换或恢复逻辑的事实源。 [S1, S2, S4, S7]

## Revisit When

- 引入基于 Token 消耗的硬性运行时预算耗尽与检查点保存机制时。
- 供应商普遍提供跨步骤细粒度缓存折扣或推理 Token 明细账单时。

## Sources

- S1: `specs/model-usage-recording/requirements.md`
- S2: `specs/model-usage-recording/design.md`
- S3: `specs/model-usage-recording/tasks.md`
- S4: `docs/architecture/benchmarks.md`
- S5: `docs/architecture/llm.md`
- S6: `packages/llm/src/core/types.ts`
- S7: `benchmarks/src/headless-composition-root.ts`
- S8: `packages/agent/src/llm-diagnostic-trace.ts`
