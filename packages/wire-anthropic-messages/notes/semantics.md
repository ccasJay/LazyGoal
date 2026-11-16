# Anthropic Messages 线格式语义表

本表只概括本模块负责的概念；字段、事件顺序与错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 请求构造 | 把中性请求与历史消息编码为 Messages 请求体，`max_tokens` 必填。 | [Anthropic Messages 线格式](../README.md) | [请求构造](../src/request.ts) |
| 原生续接块 | thinking（含签名）、redacted_thinking、tool_use 与 text 的有序回放载荷。 | [Anthropic Messages 线格式](../README.md) | [请求构造](../src/request.ts)、[模型对话契约](../../model-contracts/src/model-conversation.ts) |
| 事件映射 | 把 SSE 事件转换为块开始、增量、完成与唯一 `completed`。 | [Anthropic Messages 线格式](../README.md) | [事件映射](../src/events.ts) |
| 签名约束 | thinking 块结束前必须收齐签名，否则拒绝。 | [Anthropic Messages 线格式](../README.md) | [事件映射](../src/events.ts) |
| 终态校验 | 只接受 `end_turn`／`tool_use`／`stop_sequence`，拒绝截断与拒绝终态。 | [Anthropic Messages 线格式](../README.md) | [事件映射](../src/events.ts) |
| 用量合并 | `message_start` 与 `message_delta` 的上报按字段合并，缺失不补零。 | [Anthropic Messages 线格式](../README.md) | [事件映射](../src/events.ts) |
| 协议错误 | 不完整响应与模型拒绝的稳定分类；通用传输分类归 `llm-core`。 | [Anthropic Messages 线格式](../README.md) | [错误分类](../src/errors.ts) |
| SSE 分帧 | 字节流到 `ServerSentEvent` 的增量切分，归 `llm-core`。 | [LLM 核心契约](../../llm-core/README.md) | [SSE 分帧](../../llm-core/src/sse.ts) |
