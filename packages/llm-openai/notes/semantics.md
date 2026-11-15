# OpenAI 适配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| OpenAICompatible | 原生 OpenAI/OpenAI-compatible Chat Completions 适配器；按请求字段构造生成参数。 | [OpenAI 适配](../README.md) | [模块说明](./overview.md) |
| OpenAICompatibleConfig | 显式连接配置：API Key、端点、模型与可选输出上限，不固定生成模式。 | [OpenAI 适配](../README.md) | [实现](../src/openai-compatible.ts) |
| OpenAI-compatible 原生回放 | 使用共享块派生正文、调用与 `reasoning_content`；要求 provider/端点/模型/协议身份一致。 | [OpenAI 适配](../README.md) | [实现](../src/openai-compatible.ts) |
| OpenAI 用量提取 | Chat Completions `usage` 到归一化用量的包内转换；缺失不补零。 | [OpenAI 适配](../README.md) | [用量提取](../src/usage.ts) |
| Chat Completions 流 | 真实分片归一化为有序块事件；截断、过滤与异常结束明确拒绝，不降级重发。 | [OpenAI 适配](../README.md) | [实现](../src/openai-compatible.ts) |
