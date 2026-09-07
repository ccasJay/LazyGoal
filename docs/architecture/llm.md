# LLM 模块

## 摘要

LLM 模块只负责供应商通信。统一的 `LLMAdapter.generate` 接收有序消息并返回原始文本及可选的供应商 metadata，使 Agent 无需依赖具体 SDK；metadata 仅供独立 Diagnostic Trace 使用。Adapter 构造时显式固定结构化输出模式（`strict` 或 `prompt_only`），按模式决定是否映射原生 JSON Schema 参数。

## 负责 / 不负责

- 负责：统一消息类型、供应商角色映射、鉴权配置、固定结构化输出模式校验与原生 Schema 映射、单次生成调用和非敏感 Provider metadata 透传。
- 不负责：Prompt 业务语义、AgentDecision 解析、重试、Run 状态与持久化。

| 实现 | 映射规则 |
| --- | --- |
| [OpenAICompatible](../../packages/llm/src/openai-compatible.ts) | system/user/assistant 映射到 Chat Completions，可配置 `baseURL`；strict 模式映射 `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }` |
| [Gemini](../../packages/llm/src/gemini.ts) | system 合并为 `systemInstruction`，assistant 映射为 model；strict 模式映射 `responseJsonSchema` 与 `responseMimeType: "application/json"` |

公共契约位于 [adapter.ts](../../packages/llm/src/core/adapter.ts) 和 [types.ts](../../packages/llm/src/core/types.ts)。

## 调用与错误

Adapter 必须保持消息顺序和角色语义，不解析 AgentDecision。实例构造时显式固定 `structuredOutputMode: "strict" | "prompt_only"`：`strict` 模式要求请求必须携带 `structuredOutput`，`prompt_only` 模式要求请求不得携带 `structuredOutput`；模式与请求不一致时在发起网络请求前快速抛出 `TypeError` 失败。响应缺少文本时当前实现返回空字符串，随后由 Agent 协议校验拒绝；网络、鉴权、限流、SDK 拒绝和供应商错误原样传播，不进行重试或模式降级。`generate` 接收可选 `ExecutionControl`：OpenAICompatible 将 signal 传给 Chat Completions，所有 Adapter 在请求前后对齐中止语义，不把 `ExecutionAbortedError` 转成业务失败。OpenAI 的 request ID、model、created 和 finish reason，以及 Gemini 的 model 会作为 metadata 返回；Agent 再负责脱敏和限长后写入 Trace。

真实连通性可运行 `npm run llm:agent-smoke`，读取 `.env` 中的 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 和 `LLM_STRUCTURED_OUTPUT_MODE`。该命令会产生真实请求和费用，不属于自动化测试。

## 当前限制

统一协议只有 system/user/assistant 文本消息与可选的共用 `structuredOutput` JSON Schema；不支持原生 Provider Tool Calling、流式输出、多模态或统一重试策略；Provider metadata 不进入 Runtime 状态或 Domain Event。新增 Adapter 时必须实现相同 `LLMAdapter` 契约并提供明确的 `structuredOutputMode`。
