# 模型适配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LLMAdapter | 供应商无关调用接口；契约归 llm-core，本包实现供应商通信。 | [LLM 核心契约](../../llm-core/README.md) | [模块说明](../../llm-core/notes/overview.md) |
| LlmModelCatalog | 模型发现与能力目录。 | [模型适配](../README.md) | [模块说明](./overview.md) |
| ProviderModelConnection | 在线模型发现需要的连接参数，不要求默认模型与容量。 | [模型适配](../README.md) | [Provider Fetcher](../src/provider-fetchers.ts) |
| Tool choice | 模型调用工具的输出约束，由 Adapter 按模型 API 映射；不授予工具执行权限。 | [模型适配](../README.md) | [模块说明](./overview.md) |
| 模型正文与思考 | text 是正文；pi-ai thinking 只走受限实时通道，不拼入协议解析输入。 | [模型适配](../README.md) | [响应契约](../../llm-core/src/types.ts) |
