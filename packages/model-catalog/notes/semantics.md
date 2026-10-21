# 模型目录语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LlmModelCatalog | 目录查询契约：在线发现、静态补全、排序与过滤。 | [模型目录](../README.md) | [模块说明](./overview.md) |
| LlmModelDescriptor | 结构化模型描述：容量、能力和来源标识。 | [模型目录](../README.md) | [实现](../src/model-catalog.ts) |
| ModelCatalogError | 脱敏目录错误与分类；鉴权/权限/协议/取消不兜底。 | [模型目录](../README.md) | [契约与错误](../src/contracts.ts) |
| ProviderModelFetcher | 在线拉取契约；不执行降级或排序。 | [模型目录](../README.md) | [实现](../src/provider-fetchers.ts) |
| 可选择性判断 | 字符/Token 预算、strict 分支及 OpenCode Go 适配器目录支持下的可选性。 | [模型目录](../README.md) | [实现](../src/model-catalog.ts) |
