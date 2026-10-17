# OpenAI 适配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| OpenAICompatible | 原生 OpenAI/OpenAI-compatible Chat Completions 适配器；固定实际输出模式。 | [OpenAI 适配](../README.md) | [模块说明](./overview.md) |
| OpenAICompatibleConfig | 显式连接配置：API Key、端点、模型、固定模式与可选输出上限。 | [OpenAI 适配](../README.md) | [实现](../src/openai-compatible.ts) |
| 原生续接身份 | provider/端点/模型/协议组成的回放身份；`reasoning_content` 随身份回传。 | [OpenAI 适配](../README.md) | [实现](../src/openai-compatible.ts) |
| OpenAI 用量提取 | Chat Completions `usage` 到归一化用量的包内转换；缺失不补零。 | [OpenAI 适配](../README.md) | [用量提取](../src/usage.ts) |
