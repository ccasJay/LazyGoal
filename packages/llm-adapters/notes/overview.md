# 供应商适配层模块说明

## 职责

集中供应商专属事实，避免线格式与目录算法出现供应商分支：

- [目录来源](../src/catalog-sources.ts)：为 OpenAI、DeepSeek、OpenRouter、OpenCode Go、Anthropic、Google 与 `openai-compatible` 声明 `CatalogSource`。静态模型元数据来自锁定版本 pi-ai 目录；在线发现委托同一适配器拥有的 fetcher。
- [在线发现](../src/catalog-fetchers.ts)：按供应商拼装端点与认证头，处理 Google `pageToken`、Anthropic cursor 分页、共享超时与取消，并把失败映射为脱敏的 `ModelCatalogError`。
- [OpenCode Go 执行登记](../src/catalog-sources.ts)：为已知启动配置提供容量与能力回退；执行协议在本期统一为 Chat Completions。

## 数据流

`model-catalog` 只消费 `CatalogSource`：在线结果决定可用集合，静态事实补全元数据；本包不执行排序或可选性判定，也不构造生成响应。

## 依赖与限制

本包依赖 `llm-core`、`model-catalog` 的类型契约与锁定版本 `@earendil-works/pi-ai` 静态目录。当前仍保留 Anthropic 与 Google 的静态目录与发现，执行实现由既有包提供；Chat Completions 执行适配器随选择表接入。
