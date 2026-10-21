# Gemini 适配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Gemini | 原生 Google Gen AI Gemini 适配器；固定实际输出模式。 | [Gemini 适配](../README.md) | [模块说明](./overview.md) |
| GeminiConfig | 显式连接配置：API Key、完整 API 前缀、模型、固定模式与可选输出上限。 | [Gemini 适配](../README.md) | [实现](../src/gemini.ts) |
| strict Schema 投影与哨兵 | 联合打平、nullable 与 absent 哨兵编码及响应逆向投影。 | [Gemini 适配](../README.md) | [实现](../src/gemini.ts) |
| 原生 Parts 与签名续接 | 按顺序保存与回放 Gemini 原始 Parts、签名及函数调用 ID。 | [Gemini 适配](../README.md) | [实现](../src/gemini.ts) |
| Gemini 用量提取 | `usageMetadata` 到归一化用量的包内转换；缺失不补零。 | [Gemini 适配](../README.md) | [用量提取](../src/usage.ts) |
| generateContent 流 | 真实 Part 增量与整块交付；strict 投影完成后才交付规范块，截断与阻断明确拒绝。 | [Gemini 适配](../README.md) | [实现](../src/gemini.ts) |
