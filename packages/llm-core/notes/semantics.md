# LLM 核心契约语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LLMAdapter | 供应商无关调用接口；实例固定实际输出模式。 | [LLM 核心契约](../README.md) | [模块说明](./overview.md) |
| LLMRequest / LLMResponse / LLMStreamEvent | 请求、以有序完整块为权威的响应与流事件契约。 | [LLM 核心契约](../README.md) | [请求与响应契约](../src/types.ts) |
| LLMContentBlock | `text`／`reasoning`／`tool_call` 完整块；正文格式与工具参数来源。 | [LLM 核心契约](../README.md) | [块类型](../src/types.ts) |
| 内容块读投影 | 按块顺序派生正文、reasoning 与工具调用，不持有第二份状态。 | [LLM 核心契约](../README.md) | [content-blocks](../src/content-blocks.ts) |
| 内容块流协议 | 响应开始、块开始／增量／完整结束与唯一成功完成；whole 交付不伪造分片。 | [LLM 核心契约](../README.md) | [content-block-stream](../src/content-block-stream.ts) |
| LLMConfig / LLMConfigurationError | 共享连接配置与唯一配置错误构造器；读取归 Config。 | [LLM 核心契约](../README.md) | [配置契约](../src/llm-config.ts) |
| LLMExecutionApi | 供应商无关配置中的协议族标识；当前用于服务端目录确认可执行的 OpenCode Go 在线文本模型。 | [LLM 核心契约](../README.md) | [配置契约](../src/llm-config.ts) |
| NormalizedUsage / readNormalizedUsage | 归一化用量形态与安全读取；缺失不补零。 | [LLM 核心契约](../README.md) | [用量契约](../src/usage.ts) |
| 暂时故障分类 | 把结构化识别的限流、5xx、连接与超时映射为 execution-control 身份。 | [LLM 核心契约](../README.md) | [故障分类](../src/model-request-failure.ts) |
| 窗口拒绝分类 | 把供应商明确以超窗拒绝的请求映射为 `ContextWindowRejectedError`；不匹配的 4xx 不归入。 | [LLM 核心契约](../README.md) | [故障分类](../src/model-request-failure.ts) |
