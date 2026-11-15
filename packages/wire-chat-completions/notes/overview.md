# Chat Completions 线格式模块说明

## 职责

把 OpenAI Chat Completions 协议转换为 `llm-core` 的中性请求与响应契约。本包不持有端点、凭据与供应商分支：适配器提供完整 URL与请求头，能力开关由模型事实决定。

## 数据流

1. `buildChatCompletionsRequest` / `buildChatCompletionsStreamRequest` 把 `LLMRequest` 与历史消息编码为请求体；
2. `generateChatCompletions` 用 `fetch` 发起非流式调用，校验 HTTP 状态后归一化为 `LLMResponse`；
3. `streamChatCompletions` 消费响应体，经 `llm-core` 的 SSE 分帧器逐条映射为 `LLMStreamEvent`，并由 `ChatCompletionsStreamAssembler` 校验终态、组装完成块与唯一 `completed`；
4. 协议特有失败（截断、内容过滤、缺失终态、拒绝、缺少调用身份、非法内容）在这里以稳定分类拒绝；通用传输分类复用 `llm-core`。

## 能力开关

- `nativeStructuredOutput=false`：不发送 `response_format`，正文在可提取时用 `llm-core` 的文本转 JSON 提取与修复归一化；
- `supportsRequiredToolChoice=false`：`tool_choice: "required"` 降级为 `"auto"`；
- `replayReasoningExtensions=true`：把 reasoning 扩展写入续接载荷，供同一供应商回放；
- `toolCallIds`：缺失供应商调用身份时的分配或拒绝策略，由适配器按供应商事实选择。

## 生命周期与错误

流未收齐可接受终态时不产生 `completed`；已发布分片只用于观察。错误不接受重试或协议降级，调用方按 `llm-core` 的通用分类决定退避与恢复。

## 限制

只实现 Chat Completions；多模态 Part 与非文本正文明确拒绝。SSE 分帧在 `llm-core`，本包只消费其事件。
