# 模型目录语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LlmModelCatalog | 目录查询契约：消费注入来源，执行合并、排序、可选性与降级判定。 | [模型目录](../README.md) | [模块说明](./overview.md) |
| CatalogSource | 适配器声明的供应商目录来源：协议、静态模型事实与可选在线发现。 | [模型目录](../README.md) | [契约与错误](../src/contracts.ts) |
| CatalogModel | 适配器静态登记的目录元数据；不含端点与凭据。 | [模型目录](../README.md) | [契约与错误](../src/contracts.ts) |
| RawFetchedModel | 在线发现的原始模型元数据；由适配器解析并脱敏。 | [模型目录](../README.md) | [契约与错误](../src/contracts.ts) |
| LlmModelDescriptor | 模型描述：供应商、协议、容量、能力与来源标识；类型归 `llm-core`。 | [LLM 核心契约](../../llm-core/README.md) | [模型描述](../../llm-core/src/model-descriptor.ts) |
| ModelCatalogError | 脱敏目录错误与分类；鉴权/权限/协议/取消不兜底。 | [模型目录](../README.md) | [契约与错误](../src/contracts.ts) |
| 可选择性判断 | 协议实现、文本生成、工具调用、容量与 Token 预算条件。 | [模型目录](../README.md) | [实现](../src/model-catalog.ts) |
| 目录降级 | 超时、不可用、不支持发现时回退静态目录或配置模型。 | [模型目录](../README.md) | [实现](../src/model-catalog.ts) |
