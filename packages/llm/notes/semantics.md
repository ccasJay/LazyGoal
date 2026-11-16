# 模型默认装配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| createLlmAdapter | 按供应商注册表选择请求驱动 Adapter；Anthropic 与 Google 保留既有实现。 | [模型默认装配](../README.md) | [模块说明](./overview.md) |
| LlmStageAdapters | 同一模型的 Think/Decide 不可变阶段对；已注册供应商共用同一实例。 | [模型默认装配](../README.md) | [默认装配](../src/default-adapters.ts) |
| createReflectionLlmAdapter | 反思调用复用注册表适配器，Google 使用原生实现，Anthropic 回退 pi-ai。 | [模型默认装配](../README.md) | [模块说明](./overview.md) |
