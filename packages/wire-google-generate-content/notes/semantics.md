# Google GenerateContent 线格式语义表

本表只概括本模块负责的概念；字段、事件顺序与错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 请求构造 | 把中性请求与历史消息编码为 `contents`／`systemInstruction`／`generationConfig`。 | [Google GenerateContent 线格式](../README.md) | [请求构造](../src/request.ts) |
| 本地投影 | 枚举补类型、nullable、对象联合扁平化为字段并集；不上线 `additionalProperties`。 | [Google GenerateContent 线格式](../README.md) | [Schema 投影](../src/schema.ts) |
| 线格式 Schema | 把投影结果大写化为 Google 词表，并折叠双分支 `anyOf` 的 null。 | [Google GenerateContent 线格式](../README.md) | [Schema 投影](../src/schema.ts) |
| 空值哨兵 | 用 `__lazygoal_null__`／`__lazygoal_absent__` 表达 strict 输出中的 null 与缺省。 | [Google GenerateContent 线格式](../README.md) | [Schema 投影](../src/schema.ts) |
| 逆向还原 | 按显示 Schema 还原 null、剔除跨分支字段并恢复紧凑 completion evidence。 | [Google GenerateContent 线格式](../README.md) | [Schema 投影](../src/schema.ts) |
| chunk 映射 | 把 SSE chunk 的 Part 转换为块开始、增量、完成与唯一 `completed`。 | [Google GenerateContent 线格式](../README.md) | [事件映射](../src/events.ts) |
| 终态校验 | 只接受 `STOP`，拒绝 `MAX_TOKENS`、安全阻断与未知结束原因。 | [Google GenerateContent 线格式](../README.md) | [事件映射](../src/events.ts) |
| 协议错误 | 不完整响应的稳定分类；通用传输分类归 `llm-core`。 | [Google GenerateContent 线格式](../README.md) | [错误分类](../src/errors.ts) |
| SSE 分帧 | 字节流到 `ServerSentEvent` 的增量切分，归 `llm-core`。 | [LLM 核心契约](../../llm-core/README.md) | [SSE 分帧](../../llm-core/src/sse.ts) |
