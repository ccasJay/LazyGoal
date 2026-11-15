# 供应商适配层模块说明

## 职责

集中供应商专属事实，避免线格式与目录算法出现供应商分支：

- [目录来源](../src/catalog-sources.ts)：为 OpenAI、DeepSeek、OpenRouter、OpenCode Go、Anthropic、Google 与 `openai-compatible` 声明 `CatalogSource`。静态模型元数据来自锁定版本 pi-ai 目录；在线发现委托同一适配器拥有的 fetcher。
- [在线发现](../src/catalog-fetchers.ts)：按供应商拼装端点与认证头，处理 Google `pageToken`、Anthropic cursor 分页、共享超时与取消，并把失败映射为脱敏的 `ModelCatalogError`。
- [开放注册表](../src/registry.ts)：供应商标识为开放字符串，声明协议、目录来源与执行工厂；未注册标识在解析时以 `LLMConfigurationError` 拒绝并列出已知供应商。
- [OpenAI 适配器](../src/openai.ts)：声明官方端点、Bearer 认证、目录来源与 Chat Completions 执行工厂；请求构造与事件映射归线格式包。
- [DeepSeek 适配器](../src/deepseek.ts) 与 [OpenRouter 适配器](../src/openrouter.ts)：复用同一 Chat Completions 线格式，差异只在固定端点、认证头与是否发送原生结构约束。
- [OpenCode Go 适配器](../src/opencode-go.ts)：固定端点、LazyGoal User-Agent 与稳定会话头；模型不支持时把 `required` 工具选择降级为 `auto`，本期统一走 Chat Completions。
- [Chat Completions 适配器](../src/chat-completions-adapter.ts)：把线格式连接接入 `LLMAdapter`，供应商差异只体现在连接事实。

## 数据流

`model-catalog` 只消费 `CatalogSource`：在线结果决定可用集合，静态事实补全元数据；本包不执行排序或可选性判定，也不构造生成响应。

## 依赖与限制

本包依赖 `llm-core`、`model-catalog`、`wire-chat-completions`、`execution-control` 的类型契约与锁定版本 `@earendil-works/pi-ai` 静态目录。当前仍保留 Anthropic 与 Google 的静态目录与发现，执行实现由既有包提供。
