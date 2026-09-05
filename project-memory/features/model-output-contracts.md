---
feature: model-output-contracts
status: active
summary: "基于 Contract AST 统一构建模型输出 Wire 契约、Shape Guide 与共用 Schema，消除 Zod 依赖并支持固定结构化输出模式"
source_spec: specs/model-output-contracts/
distilled_at: 2026-09-05
reviewed_at: 2026-09-05
tags: [agent, contracts, model-output, structured-output, request-plan, wire-envelope, llm-adapter]
authorities: [docs/architecture/agent.md, docs/architecture/llm.md, packages/contracts/src/model-output/wire.ts, packages/contracts/src/model-output/factory.ts, packages/agent/src/model-output.ts, packages/agent/src/prompt.ts, packages/llm/src/core/adapter.ts, packages/llm/src/openai-compatible.ts, packages/llm/src/gemini.ts, packages/tui/src/cli.tsx, benchmarks/alfworld/src/cli.ts]
---

# Model Output Contracts

## Purpose

- 在模型输出层全面消除 Zod 生产依赖，基于 `@lazygoal/contracts` 提供统一的 Wire 契约、Shape Guide 和原生 JSON Schema Bundle，支持 LLM Adapter 固定结构化输出模式（strict / prompt_only），并保持 Runtime canonical 边界绝对隔离。 [S1, S2]

## Durable Decisions

- D1 — 统一 Wire 响应结构与 `result` Envelope：模型输出必须使用外层 `{ result: ... }` envelope 包裹，内部可选字段定义为必填可空（如 `memoryPatch: MemoryPatch | null`），以兼容严格模式与 prompt-only 模式共用一份 JSON Schema。 [S1, S3]
- D2 — 成对绑定的请求计划与阶段独占分支：`buildPreparationRequest` 与 `buildStepRequest` 成对返回 `LLMRequest` 与 `ModelOutputContractBundle`，严格按阶段限制允许分支（gathering 只允许 question/context_ready；planning 只允许 task_proposal；executing 允许 Tool/complete 等；预算超限时单向切换为独占 context_checkpoint Bundle）。 [S1, S5]
- D3 — 双模式对齐与 Token 预算感知：`prompt_only` 模式下将 Shape Guide 注入动态控制消息末尾并计入 `TokenBudgetPlanner`；`strict` 模式下不注入 Guide，直接向 `LLMRequest` 挂载原生 JSON Schema。 [S1, S5]
- D4 — LLM Adapter 固定模式与原生 Schema 映射：Adapter 在构造时显式固定 `structuredOutputMode: "strict" | "prompt_only"`，网络请求前校验模式一致性；`OpenAICompatible` 映射为 `response_format.json_schema`，`Gemini` 映射为 `responseJsonSchema` 与 `responseMimeType`，SDK 拒绝直接抛出，严禁隐式降级重试。 [S1, S6, S7]
- D5 — TUI 与 Benchmark 配置显式化：`LLM_STRUCTURED_OUTPUT_MODE` 成为 TUI 与 ALFWorld CLI 的必填环境变量，只接受 `strict` 或 `prompt_only`，在产生 Store 或 Goal 副作用前快速失败。 [S1, S8]
- D6 — Runtime Canonical 协议隔离：模型 wire 响应在解码后立即将外层 `result` 解包并剔除占位 `null`，进入 Runtime 的 canonical Goal Snapshot、Trajectory 与 Diagnostic Trace 绝不包含 wire envelope 或占位 `null`。 [S1, S4, S10]

## Guardrails

- Agent 模块严禁引入 Zod 生产依赖。 [S1, S2, S4]
- 解码失败必须抛出带有 issue path 的 `LLMResponseProtocolError`（`INVALID_LLM_RESPONSE`），严禁自动重试、自动修复或静默降级模式。 [S1, S4, S9]
- LLM Adapter 严禁在 SDK 报错时回退到非结构化模式请求。 [S1, S6, S7]

## Revisit When

- 引入流式响应或 Tool Calling 原生 API 时。
- 协议支持新的阶段分支（例如执行期反思或多步骤计划）时。
- 引入新的模型供应商 Adapter（如 Anthropic 原生支持）时。

## Sources

- S1: `specs/model-output-contracts/requirements.md`
- S2: `specs/model-output-contracts/design.md`
- S3: `packages/contracts/src/model-output/wire.ts`
- S4: `packages/agent/src/model-output.ts`
- S5: `packages/agent/src/prompt.ts`
- S6: `packages/llm/src/openai-compatible.ts`
- S7: `packages/llm/src/gemini.ts`
- S8: `packages/tui/src/cli.tsx`
- S9: `packages/agent/test/model-output.test.ts`
- S10: `packages/tui/test/prompt-bundle-integration.test.ts`
