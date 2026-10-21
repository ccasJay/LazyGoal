# 模型目录

本包独立查询当前 Provider 的可用模型并补全能力，不构造生成 Adapter、不拥有模型 Binding 或 Goal 状态。

## 职责

OpenCode Go 在线返回的目录外模型，只有模型 ID 同时命中独立执行登记才可选择；在线可见本身不证明协议已受支持。当前登记 `minimax-m3.1-flash-free` 的 OpenAI Completions 协议、上下文与输出容量及推理能力。在线未知 ID 仍展示但不可选，执行登记也不会在在线列表缺少该 ID 时自行生成条目；协议不按模型名称推断。

- [契约与错误](../src/contracts.ts)：`ModelCatalogErrorKind`（`cancelled`/`authentication`/`permission`/`timeout`/`unavailable`/`unsupported`/`protocol`）、脱敏的 `ModelCatalogError`、`RawFetchedModel` 与 `ProviderModelFetcher`。鉴权、权限、非法协议与取消禁止兜底；网络故障、超时或端点不支持允许静态目录/配置兜底。
- [LlmModelCatalog](../src/model-catalog.ts)：`createLlmModelCatalog()` 默认组合在线 Fetcher，直接构造时省略 Fetcher 走既有离线路径。查询合并在线结果、pi-ai 静态目录与按模型 ID 查询的执行登记：去重、排序、补齐展示名/容量/能力与 `availabilitySource`/`metadataSource`，并按 [determineSelectability](../src/model-catalog.ts)（字符或 Token 预算、strict 分支、OpenCode Go 执行登记）标记可选择性。目录不构造生成模型、不访问真实供应商以外的端点、不缓存真相。
- [DefaultProviderModelFetcher](../src/provider-fetchers.ts)：适配 OpenAI、Google、Anthropic、OpenRouter、DeepSeek、`openai-compatible` 与 OpenCode Go 的官方/配置端点与专属鉴权头；Google (`pageToken`) 与 Anthropic (`has_more`/`last_id`) 支持安全完整分页，拒绝不递进或循环 cursor；所有请求共享 5000ms 期限并响应外部取消，异常严格脱敏，不复制 API Key、Authorization 头或敏感响应正文。

## 依赖与限制

本包只依赖 `llm-core` 的共享配置/错误契约与锁定版本 `@earendil-works/pi-ai` 静态目录；不导入生成适配包、不通过 `llm` 门面取得目录、不发出生请求。不增加缓存、后台刷新或跨实例共享可变注册表；模型切换与 Binding 发布仍由宿主协调。
