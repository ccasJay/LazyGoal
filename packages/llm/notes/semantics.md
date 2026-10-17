# 模型默认装配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| createLlmAdapter | 按实际输出模式选择默认 Adapter；`two_stage` 解析为供应商对应的 Decide 模式。 | [模型默认装配](../README.md) | [模块说明](./overview.md) |
| LlmStageAdapters | 同一模型的 Think/Decide 不可变阶段对。 | [模型默认装配](../README.md) | [默认装配](../src/default-adapters.ts) |
| createReflectionLlmAdapter | 反思调用使用原生优先规则，其余复用默认适配。 | [模型默认装配](../README.md) | [模块说明](./overview.md) |
