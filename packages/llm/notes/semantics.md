# 模型默认装配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| createLlmAdapter | 按供应商注册表选择 Adapter，分发前校验声明协议已有 wire 实现。 | [模型默认装配](../README.md) | [模块说明](./overview.md) |
| LlmStageAdapters | 同一模型的 Think/Decide 不可变阶段对；两侧共用同一实例。 | [模型默认装配](../README.md) | [默认装配](../src/default-adapters.ts) |
| createReflectionLlmAdapter | 反思调用复用注册表适配器，不发起网络目录校验。 | [模型默认装配](../README.md) | [模块说明](./overview.md) |
| 协议分发 | 模型声明的线格式协议决定 Adapter；未实现的协议明确失败并列出已实现协议。 | [模型默认装配](../README.md) | [默认装配](../src/default-adapters.ts)、[供应商适配层](../../llm-adapters/notes/overview.md) |
