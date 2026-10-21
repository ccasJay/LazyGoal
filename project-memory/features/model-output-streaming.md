---
feature: model-output-streaming
status: active
summary: 以供应商无关的有序内容块统一模型响应表达，并让流式观察服从响应整体成功才可执行的边界
source_spec: specs/model-output-streaming/
distilled_at: 2026-10-21
reviewed_at: 2026-10-21
tags: [llm, streaming, content-blocks, adapter, protocol, visibility, backpressure, tool-calling]
authorities: [packages/llm-core/src/types.ts, packages/llm-core/src/content-blocks.ts, packages/llm-core/src/content-block-stream.ts, packages/model-call/src/model-call.ts, packages/llm-openai/src/openai-compatible.ts, packages/llm-google/src/gemini.ts, packages/llm-pi-ai/src/pi-ai.ts, packages/execution-stream/src/policy.ts]
---

# 模型输出流与有序内容块

## Purpose

- 用 `text`、`tool_call`、`reasoning` 三种有序内容块表达一次模型响应，使生成增量、完整结果与调用记录共享同一内容来源。 [S1, S2, S3]
- 流式观察只改变可见过程，不改变执行时机：整个响应成功结束后，完整结果才交给既有阶段解码、Runtime 校验、审批与执行路径。 [S1, S2, S5]

## Durable Decisions

- D1 — `LLMResponse.blocks` 是正文、工具调用与公开 reasoning 的唯一权威；消费者只经 `llm-core` 的纯读投影派生视图，不再保存可独立赋值的平行正文与工具列表字段。 [S1, S2, S3, S4, S11]
- D2 — 块身份与生命周期由无 I/O 追踪器判定：索引从 0 连续，顺序为开始→增量→封口，封口后不可再写；`incremental` 与 `whole` 两种交付方式显式声明，工具身份允许在封口时才齐备。 [S1, S2, S3, S9]
- D3 — 成功响应只能来自唯一 `completed` 事件，且必须与已封口块逐项一致；缺失、重复、未封口或内容失配一律按协议错误失败，采集器不用部分 JSON、空对象或先前结果补齐。 [S1, S2, S5, S9]
- D4 — 三个 Adapter 按各自协议真实能力映射流：OpenAI 用 Chat Completions 流累计正文、工具索引与分片参数并收齐用量尾部；Gemini 用 generateContentStream 分离 Part、thought 与签名，函数参数整块交付；pi-ai 保留真实块索引与 thinking，无原始参数字节时才用稳定序列化。 [S1, S2, S6, S7, S8]
- D5 — 无 `stream` 能力的宿主 Adapter 仍返回同一块契约并按整块方式观察；已选择的流路径失败时不回退 `generate`、不发起第二次请求，Adapter 与采集器都不自行重试、换协议或降级模型。 [S1, S2, S5]
- D6 — `modelCallId` 是调用与块的唯一观察身份，贯穿输入记录、指标、诊断与实时事件；它不替代供应商工具调用 ID 或 Runtime `actionId`，重试与下一阶段一律使用新身份。 [S1, S2, S5, S9]
- D7 — 可见性由块类型与格式决定：普通正文 public、结构化 JSON 与工具参数 diagnostic、reasoning restricted；公共完成事件只带安全摘要，不附整份响应。 [S1, S2, S5, S10]

## Guardrails

- 完整工具块到达不等于可执行：响应整体成功结束前不得创建待审批 Action、暂存 Action 或执行工具；失败后本次调用工具效果为零，不产生伪造 Observation 或成功完成证据。 [S1, S2, S5, S13]
- 取消、长度截断、内容过滤与异常 EOF 一律按失败处理，即使已出现完整文本或工具块也不得接受为成功；缺失用量不以 0 或估算值替代。 [S1, S2, S5, S6, S7]
- 观察通道是旁路：发布失败、订阅断开或慢订阅者背压不得改变模型响应、执行结果与持久化边界，也不生成用户 Interrupt。 [S1, S2, S5, S10, S12]

## Revisit When

- 需要在块封口后、响应整体成功之前触发审批或工具执行时。
- 引入 Gemini Interactions、OpenAI Responses 或新供应商协议时。
- 需要持久化分片历史或提供跨重启 exactly-once 的分片回放时。
- 公共会话消息协议与内容块 UI 落地后，需要重新划分可见性与投影边界时。

## Sources

- S1: `specs/model-output-streaming/spec.md`
- S2: `specs/model-output-streaming/plan.md`
- S3: `packages/llm-core/src/types.ts`
- S4: `packages/llm-core/src/content-blocks.ts`
- S5: `packages/model-call/src/model-call.ts`
- S6: `packages/llm-openai/src/openai-compatible.ts`
- S7: `packages/llm-google/src/gemini.ts`
- S8: `packages/llm-pi-ai/src/pi-ai.ts`
- S9: `packages/llm-core/src/content-block-stream.ts`
- S10: `packages/execution-stream/src/policy.ts`
- S11: `packages/llm-core/test/content-blocks.test.ts`
- S12: `packages/browser/test/browser-stream.test.ts`
- S13: `packages/runtime/test/model-stream-execution-boundary.test.ts`
