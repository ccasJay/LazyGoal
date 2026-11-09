# 模型目录语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LlmModelCatalog | 目录查询契约：在线发现、静态补全、排序与过滤。 | [模型目录](../README.md) | [模块说明](./overview.md) |
| LlmModelDescriptor | 结构化模型描述：容量、能力和来源标识。 | [模型目录](../README.md) | [实现](../src/model-catalog.ts) |
| ModelCatalogError | 脱敏目录错误与分类；鉴权/权限/协议/取消不兜底。 | [模型目录](../README.md) | [契约与错误](../src/contracts.ts) |
| ProviderModelFetcher | 在线拉取契约；不执行降级或排序。 | [模型目录](../README.md) | [实现](../src/provider-fetchers.ts) |
| 可选择性判断 | 字符/Token 预算、strict 分支，以及 OpenCode Go 在线文本、工具调用和容量能力的校验。 | [模型目录](../README.md) | [实现](../src/model-catalog.ts) |
| OpenCode Go 在线元数据 | 提供文本、工具、模态、容量、推理和工具选择能力；在线可见不代表上游账户允许请求。 | [模型目录](../README.md) | [Fetcher](../src/provider-fetchers.ts) |
| OpenCode Go 执行登记 | 仅为已知启动配置缺少在线目录上下文时提供协议与能力回退。 | [模型目录](../README.md) | [执行登记](../src/model-catalog.ts) |
