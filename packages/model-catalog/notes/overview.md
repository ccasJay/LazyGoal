# 模型目录

本包只对注入的供应商目录来源执行合并、排序、可选性与降级判定，不构造生成 Adapter、不拥有端点与凭据、不缓存真相。

## 职责

- [契约与错误](../src/contracts.ts)：`ModelCatalogErrorKind`（`cancelled`/`authentication`/`permission`/`timeout`/`unavailable`/`unsupported`/`protocol`）、脱敏的 `ModelCatalogError`、`RawFetchedModel`、`CatalogModel` 与 `CatalogSource`。目录来源由适配器声明，包含协议标识、静态模型事实与可选 `discover`。
- [LlmModelCatalog](../src/model-catalog.ts)：`createLlmModelCatalog({ sources, isProtocolImplemented })` 由组合根注入目录来源与协议可用性。查询按 `config.provider` 选择来源：在线结果决定可用集合，静态事实补全缺失字段；`timeout`、`unavailable`、`unsupported` 与未提供 `discover` 时回退静态目录或配置模型；`authentication`、`permission`、`protocol` 与 `cancelled` 直接抛出。
- [determineSelectability](../src/model-catalog.ts)：只依据协议是否实现、文本生成、工具调用、容量元数据与 Token 预算标记可选择性；不读取用户配置的输出模式。

## 依赖与限制

本包只依赖 `llm-core` 的类型契约，不 import 任何 `wire-*`、`llm-adapters` 或供应商 SDK；在线端点、认证、分页与静态目录事实归适配器。目录不发起生成请求、不缓存模型列表、不跨实例共享可变注册表。
