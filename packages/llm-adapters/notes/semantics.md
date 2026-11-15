# 供应商适配层语义表

本表只概括本模块负责的概念；字段与错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| CatalogSource | 供应商目录来源：协议、静态模型与可选在线发现。 | [供应商适配层](../README.md) | [目录来源](../src/catalog-sources.ts) |
| 静态目录 | pi-ai 锁定目录中的模型名称、容量与模态事实。 | [供应商适配层](../README.md) | [目录来源](../src/catalog-sources.ts) |
| 在线发现 | 各供应商端点、认证与分页；失败映射为脱敏目录错误。 | [供应商适配层](../README.md) | [在线发现](../src/catalog-fetchers.ts) |
| 目录降级 | 目录算法在允许的故障下回退静态或配置来源。 | [模型目录](../../model-catalog/README.md) | [目录算法](../../model-catalog/src/model-catalog.ts) |
| OpenCode Go 执行登记 | 已知模型的容量与能力回退；协议本期统一为 Chat Completions。 | [供应商适配层](../README.md) | [目录来源](../src/catalog-sources.ts) |
| 执行适配器 | 以线格式实现供应商调用的入口；OpenAI、DeepSeek、OpenRouter 与 OpenCode Go 已接入。 | [供应商适配层](../README.md) | [开放注册表](../src/default-registry.ts) |
| 开放注册表 | 供应商标识、协议、目录来源与执行工厂的开放声明。 | [供应商适配层](../README.md) | [注册表](../src/registry.ts) |
| 会话头 | 为支持的供应商在请求上附加稳定会话标识；缺失会话身份时不发送。 | [Chat Completions 线格式](../../wire-chat-completions/README.md) | [请求头](../../wire-chat-completions/src/client.ts) |
