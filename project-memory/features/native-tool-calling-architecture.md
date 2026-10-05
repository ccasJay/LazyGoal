---
feature: native-tool-calling-architecture
status: active
summary: "每次 Decide 调用以原生双通道和单次往返生成约束决策，并按当前 Run 可见工具集投影 Schema"
source_spec: specs/native-tool-calling-architecture/
distilled_at: 2026-09-21
reviewed_at: 2026-10-04
tags: [agent, llm, tool-calling, dual-channel, 1-rtt, system-tools, function-calling]
authorities: [docs/architecture/llm.md, docs/architecture/agent.md, docs/architecture/contracts.md, packages/llm/src/core/types.ts, packages/contracts/src/model-output/system-tools.ts, packages/agent/src/llm-step-executor.ts, packages/runtime/src/tool-discovery.ts, packages/runtime/src/runner.ts, packages/agent/src/model-inference-projector.ts]
supersedes: [project-memory/features/two-stage-decision-pipeline.md]
---

# Native Tool Calling Architecture

## Purpose

- 将模型交互从顶层单一 JSON 封包转为原生双通道：每次模型请求在单个网络往返内同时取得自由文本与强类型工具决策，并优先使用供应商原生 Function Calling。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — LLMResponse 分离自由文本 content 与结构化 toolCalls；自然语言推演不受动作参数语法约束，动作参数由底层契约校验。 [S1, S2, S6, S8]
- D2 — 完成任务、等待用户、失败、上下文查找及工具发现等非业务控制使用系统函数；工具发现是 Decide 专用决策，结果仅影响后续模型请求中的可见 Schema。 [S1, S2, S7, S9, S10, S11]
- D3 — 每次 Decide 请求仍要求且只接受一个工具决策；其业务工具 Schema 来自 Runtime 提供的当前 Run 可见集合。发现控制用于初始轻量请求，匹配工具从后续请求开始进入 Prompt 与原生声明，二者使用同一集合。 [S1, S2, S5, S8, S9, S10, S12, S13, S14, S15]
- D4 — OpenAI 使用原生 tools 与 strict 参数约束，Gemini 使用官方 functionDeclarations 与 toolConfig；由供应商适配器投影同一系统决策与业务工具定义。 [S1, S2, S4, S6, S8]
- D5 — strict、prompt_only 与 two_stage 结构化输出仍可供适配器选择；具备原生双通道的 Provider 由 Function Calling 约束动作参数。 [S1, S2, S4, S8]

## Guardrails

- 每次 Decide 必须得到且只得到一个可解码工具决策；缺少调用时以协议错误处理，不猜测动作。 [S1, S2, S3, S6, S8]
- 系统函数和业务工具输入都必须通过 Contract AST 解码；工具发现的可见性状态来自 Runtime，不由模型直接写入。 [S1, S2, S7, S9, S10, S12, S13]

## Revisit When

- Provider 支持并发或异步多工具调用且 Runtime 状态机也支持并发 Action 时。
- 引入无 Function Calling 的模型协议或调整 Run 级按需 Schema 发现生命周期时。

## Sources

- S1: `specs/native-tool-calling-architecture/requirements.md`
- S2: `specs/native-tool-calling-architecture/design.md`
- S3: `specs/native-tool-calling-architecture/tasks.md`
- S4: `docs/architecture/llm.md`
- S5: `docs/architecture/agent.md`
- S6: `packages/llm/src/core/types.ts`
- S7: `packages/contracts/src/model-output/system-tools.ts`
- S8: `packages/agent/src/llm-step-executor.ts`
- S9: `specs/on-demand-tool-schemas/requirements.md`
- S10: `specs/on-demand-tool-schemas/design.md`
- S11: `docs/architecture/contracts.md`
- S12: `packages/runtime/src/runner.ts`
- S13: `packages/agent/src/model-inference-projector.ts`
- S14: `packages/runtime/test/tool-discovery.test.ts`
- S15: `packages/agent/test/prompt.test.ts`
