# LLM 模块

## 摘要

LLM 模块只负责供应商通信。统一的 `LLMAdapter.generate` 接收有序消息并返回原始文本，使 Agent 无需依赖具体 SDK。

## 负责 / 不负责

- 负责：统一消息类型、供应商角色映射、鉴权配置和单次生成调用。
- 不负责：Prompt 业务语义、StepResult 解析、重试、Run 状态与持久化。

| 实现 | 映射规则 |
| --- | --- |
| [OpenAICompatible](../../packages/llm/src/openai-compatible.ts) | system/user/assistant 映射到 Chat Completions，可配置 `baseURL` |
| [Gemini](../../packages/llm/src/gemini.ts) | system 合并为 `systemInstruction`，assistant 映射为 model |

公共契约位于 [adapter.ts](../../packages/llm/src/core/adapter.ts) 和 [types.ts](../../packages/llm/src/core/types.ts)。

## 调用与错误

Adapter 必须保持消息顺序和角色语义，不解析 StepResult。响应缺少文本时当前实现返回空字符串，随后由 Agent 协议校验拒绝；网络、鉴权、限流和供应商错误原样传播。`generate` 接收可选 `ExecutionControl`：OpenAICompatible 将 signal 传给 Chat Completions，所有 Adapter 在请求前后对齐中止语义，不把 `ExecutionAbortedError` 转成业务失败。

真实连通性可运行 `npm run llm:agent-smoke`，读取 `.env` 中的 `LLM_API_KEY`、`LLM_BASE_URL` 和 `LLM_MODEL`。该命令会产生真实请求和费用，不属于自动化测试。

## 当前限制

统一协议只有 system/user/assistant 文本消息，不支持 Tool、流式输出、多模态、结构化供应商响应或统一重试策略。新增 Adapter 时必须实现相同 `LLMAdapter` 契约。
