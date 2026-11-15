# Chat Completions 线格式语义表

本表只概括本模块负责的概念；字段、事件顺序与错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 请求构造 | 把中性请求与历史消息编码为 Chat Completions 请求体，只发送本次显式声明的字段。 | [Chat Completions 线格式](../README.md) | [请求构造](../src/request.ts) |
| 流式请求 | 在请求体上追加 `stream` 与可选 `stream_options.include_usage`。 | [Chat Completions 线格式](../README.md) | [请求构造](../src/request.ts) |
| 事件映射 | 把 SSE 数据帧转换为块开始、增量、完成与唯一 `completed`。 | [Chat Completions 线格式](../README.md) | [事件映射](../src/events.ts) |
| 终态校验 | 只接受请求声明的 `stop`／`tool_calls`，拒绝截断、过滤、空流与重复终态。 | [Chat Completions 线格式](../README.md) | [事件映射](../src/events.ts) |
| 调用身份策略 | 供应商未返回调用 ID 时按适配器策略分配或拒绝。 | [Chat Completions 线格式](../README.md) | [事件映射](../src/events.ts) |
| 协议错误 | 不完整响应与模型拒绝的稳定分类；通用传输分类归 `llm-core`。 | [Chat Completions 线格式](../README.md) | [错误分类](../src/errors.ts) |
| 文本转 JSON 兜底 | 供应商无原生结构约束时，用 `llm-core` 的提取与修复归一化正文。 | [LLM 核心契约](../../llm-core/README.md) | [事件映射](../src/events.ts) |
| SSE 分帧 | 字节流到 `ServerSentEvent` 的增量切分，归 `llm-core`。 | [LLM 核心契约](../../llm-core/README.md) | [SSE 分帧](../../llm-core/src/sse.ts) |
